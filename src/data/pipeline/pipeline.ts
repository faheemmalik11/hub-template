import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { fetchAllRows, searchTokens, searchWasDropped } from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import type { PipelineHealth, PipelineRun, RunRequest, VerarbeitungsLog } from "@/lib/data/types";

// Pipeline-Lauf-Heartbeat fürs Health-Panel (Briefing Betrieb/Monitoring: running / last run / errors).
// Liest pipeline_runs (Migration 0013 im Pipeline-Repo). refetchInterval hält die Anzeige live.
export function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipeline_health"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PipelineHealth> => {
      const { data, error } = await sb
        .from(TABLE.pipelineRuns)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const runs = (data ?? []) as PipelineRun[];
      const lastRun = runs[0] ?? null;
      const running = runs.some((r) => r.status === "running" && !r.finished_at);
      const errorCount = lastRun?.error_count ?? 0;
      return { lastRun, running, errorCount, runs };
    },
  });
}

// ----------------------------------------------------------------- "Jetzt ausfuehren" ---
// The pipeline runs from a schedule every two hours. A request row asks it to read one channel
// now instead, and the pipeline writes the outcome back on the same row. See the book-keeping
// repo, planning/docs/run-now-from-the-hub.md.

function stillOpen(requests: Record<string, RunRequest> | undefined): boolean {
  return Object.values(requests ?? {}).some(
    (request) => request.status === "pending" || request.status === "running",
  );
}

/**
 * Whether this client may ask for a run at all: run.run_now_enabled, saved with the client's other
 * settings in the admin panel. Read through run_now_enabled(), because the settings row also holds
 * encrypted credentials and this app may never select it. Upload is not governed by it: putting a
 * document in is the request, always.
 */
export function useRunNowEnabled() {
  return useQuery({
    queryKey: ["run_now_enabled"],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sb.rpc("run_now_enabled");
      if (!error) return Boolean(data);
      // A database that migration 0013 has not reached yet still keeps the switch in its own table.
      const legacy = await sb.from(TABLE.pipelineSettings).select("run_now_enabled").maybeSingle();
      // Neither there means a client the pipeline has not been set up for, which reads as off.
      if (legacy.error) return false;
      return Boolean(legacy.data?.run_now_enabled);
    },
  });
}

/** The newest request per channel, so each source card can show what its last press did. */
export function useRunRequests() {
  return useQuery({
    queryKey: ["pipeline_run_requests"],
    queryFn: async (): Promise<Record<string, RunRequest>> => {
      const { data, error } = await sb
        .from(TABLE.pipelineRunRequests)
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(20);
      // The table arrives with the pipeline's own migration. Until it is applied, no button
      // should appear and nothing should be shouted about it.
      if (error) return {};
      const newestPerChannel: Record<string, RunRequest> = {};
      for (const request of (data ?? []) as RunRequest[]) {
        newestPerChannel[request.channel] ??= request;
      }
      return newestPerChannel;
    },
    // Only while something is still open. A finished request never changes again, and an idle
    // Postfach screen must not poll a table nobody is writing to.
    refetchInterval: (query) => (stillOpen(query.state.data) ? 3_000 : false),
  });
}

/**
 * Ask for one channel to be read now: its usual folders, or the ones somebody picked (P3).
 * A second identical ask returns the request already waiting.
 */
export function useAskForARun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channel,
      folders,
    }: {
      channel: string;
      folders?: { id: string; name: string }[];
    }): Promise<RunRequest> => {
      // Folder arguments only when folders were picked. The ask_for_a_run from before migration
      // 0012 knows no such parameter, and PostgREST refuses a call naming one, so sending them on
      // every press would break the usual run on any client not yet migrated.
      const args: Record<string, unknown> = { wanted_channel: channel };
      if (folders && folders.length > 0) {
        args.wanted_folders = folders.map((folder) => folder.id);
        args.wanted_folder_names = folders.map((folder) => folder.name);
      }
      const { data, error } = await sb.rpc("ask_for_a_run", args);
      if (error) throw error;
      return data as RunRequest;
    },
    // Shows "Angefragt" at once, rather than up to three seconds later.
    onSuccess: (request) => {
      queryClient.setQueryData(
        ["pipeline_run_requests"],
        (before: Record<string, RunRequest> | undefined) => ({
          ...(before ?? {}),
          [request.channel]: request,
        }),
      );
    },
  });
}

// The old useVerarbeitungsLog() (flat `.limit(500)`, filtered in the browser) was removed when the
// Protokoll screen moved to server-side filtering + pagination — see useVerarbeitungsLogPage below.
// It is deliberately NOT kept as a convenience read: the 500 cap silently hid the oldest entries and
// skewed the status counts, and processing_log only grows.

/** Shared filter shape for the Protokoll screen's two reads, so they can never drift apart. */
export type VerarbeitungsLogFilter = {
  search?: string;
  status?: string;
  /** Inclusive ISO date bounds on processed_at. Both optional. */
  von?: string | null;
  bis?: string | null;
};

/**
 * Applies search, status and date filters identically to any processing_log query.
 *
 * Factored out because the list and the counts MUST filter the same way — when they did not, the
 * chips described a different set of rows than the table below them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLogFilter<T extends { or: any; eq: any; gte: any; lte: any }>(
  query: T,
  { search, status, von, bis }: VerarbeitungsLogFilter,
): T {
  // Every token must match, each across subject/sender/reason. Chained .or() calls are ANDed.
  for (const token of searchTokens(search ?? "")) {
    query = query.or(`subject.ilike.%${token}%,sender.ilike.%${token}%,reason.ilike.%${token}%`);
  }
  if (status) query = query.eq("status", status);
  // processed_at is a timestamp, so the upper bound has to cover the whole day.
  if (von) query = query.gte("processed_at", `${von}T00:00:00`);
  if (bis) query = query.lte("processed_at", `${bis}T23:59:59.999`);
  return query;
}

// Filtered + paginated processing log. Replaces the old useVerarbeitungsLog() for the Protokoll screen,
// which fetched a flat `.limit(500)` and filtered in the browser: no pagination, and once the log passes
// 500 rows that cap silently hides the oldest entries AND skews the status counts. processing_log grows
// by one row per processed mail forever, so it has to be paged on the server.
export function useVerarbeitungsLogPage(
  filter: VerarbeitungsLogFilter & { page: number; pageSize: number },
) {
  const { search, status, von, bis, page, pageSize } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: [
      "verarbeitungs_log_page",
      tokens.join("\u0000"),
      dropped,
      status ?? "",
      von ?? "",
      bis ?? "",
      page,
      pageSize,
    ],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: VerarbeitungsLog[]; total: number }> => {
      // The user typed only filter delimiters. Nothing can match that, and returning the unfiltered
      // table (which is what the old code did) is the one answer that is definitely wrong.
      if (dropped) return { rows: [], total: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const query = applyLogFilter(
        supabase.from(TABLE.processingLog).select("*", { count: "exact" }),
        { search, status, von, bis },
      );
      const { data, error, count } = await query
        // id breaks processed_at ties — an ingest run writes many rows within the same instant.
        .order("processed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as VerarbeitungsLog[], total: count ?? 0 };
    },
  });
}

/**
 * Per-status counts for the header chips, over the WHOLE log and deliberately ignoring the status
 * filter, so the chips keep working as toggles showing what is available.
 *
 * Paged through fetchAllRows rather than read in one request. The previous version did a bare
 * `select("status")` with no bound, which PostgREST silently truncates at its Max Rows setting — so
 * past that cap the chips quietly described only the newest 1000 rows. That was not hypothetical:
 * measured live on the this client database, the list reported 1170 entries via an exact count while the
 * chips summed to exactly 1000. Only `status` is selected, so even a large log is a couple of cheap
 * round trips.
 */
export function useVerarbeitungsLogStatusCounts(filter: VerarbeitungsLogFilter = {}) {
  const { search, von, bis } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: [
      "verarbeitungs_log_status_counts",
      tokens.join("\u0000"),
      dropped,
      von ?? "",
      bis ?? "",
    ],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, number>> => {
      if (dropped) return {};
      const rows = await fetchAllRows<{ status: string | null }>((from, to, withCount) =>
        applyLogFilter(
          supabase
            .from(TABLE.processingLog)
            .select("status", withCount ? { count: "exact" } : undefined),
          // The status filter is deliberately NOT passed: the chips must keep showing every status.
          { search, von, bis },
        )
          .order("processed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      );
      const counts: Record<string, number> = {};
      for (const r of rows) {
        if (r.status) counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      return counts;
    },
  });
}

/** One row of the generic change_history audit trail. */
export type ChangeHistoryEntry = {
  id: string;
  /** The timestamp column is `at`, NOT `created_at` — verified against the live payload. */
  at: string | null;
  actor: string | null;
  type: string | null;
  table_name: string | null;
  record_id: string | null;
  text: string | null;
  data: Record<string, unknown> | null;
};

/**
 * The app's change history, paged on the server.
 *
 * Audit issue #10: change_history holds role changes, restores, purges and deletions with their
 * reasons, is readable by every authenticated user, and had NO screen anywhere — the only place any
 * of it surfaced was per-record inside an invoice's own history. Anyone looking for "who changed
 * what" came to Protokoll first and found mail processing. This backs the screen's second tab.
 *
 * Paged and bounded from the start, deliberately: this is the same growing-forever shape that made
 * the status chips wrong (see useVerarbeitungsLogStatusCounts), so it is never read unbounded.
 */
export function useChangeHistoryPage(filter: { search?: string; page: number; pageSize: number }) {
  const { search, page, pageSize } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: ["change_history_page", tokens.join("\u0000"), dropped, page, pageSize],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ChangeHistoryEntry[]; total: number }> => {
      if (dropped) return { rows: [], total: 0 };
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      // `sb` (the untyped cast), not `supabase`: change_history is not in the generated Database
      // type, same as every other write path in this file. See CLAUDE.md on the empty generated type.
      let query = sb.from(TABLE.changeHistory).select("*", { count: "exact" });
      for (const token of tokens) {
        query = query.or(
          `actor.ilike.%${token}%,type.ilike.%${token}%,table_name.ilike.%${token}%,text.ilike.%${token}%`,
        );
      }
      const { data, error, count } = await query
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ChangeHistoryEntry[], total: count ?? 0 };
    },
  });
}

export function useVerarbeitungsLogFuerBeleg(belegId: string) {
  return useQuery({
    queryKey: ["verarbeitungs_log", "beleg", belegId],
    enabled: !!belegId,
    staleTime: STALE,
    queryFn: async (): Promise<VerarbeitungsLog[]> => {
      const { data, error } = await supabase
        .from(TABLE.processingLog)
        .select("*")
        .eq("document_id", belegId)
        .order("processed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VerarbeitungsLog[];
    },
  });
}
