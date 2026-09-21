import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, pflichtGrund } from "@/data/shared";
import { datevBlockReason } from "@/lib/datev/attachment-rules";
import { triggerDatevHandover } from "@/lib/api/datev-handover.functions";
import type { DatevAttachmentFile } from "@/lib/datev/attachment-rules";
import type {
  DatevCompanyStatus,
  DatevDirection,
  DatevHandoverBatch,
  DatevOutgoingInvoice,
  DatevReadyInvoice,
  DatevRoute,
  DatevSendableDirection,
} from "@/lib/data/types";

// ---- DATEV handover (Briefing Screen 9; migration 0038) ----

// Never carries the real address — the DB grants `authenticated` SELECT on every datev_routes
// column except `address` (see the migration), so selecting "*" here still cannot return it.
export function useDatevRoutes() {
  return useQuery({
    queryKey: ["datev_routes"],
    staleTime: STALE,
    queryFn: async (): Promise<DatevRoute[]> => {
      const { data, error } = await sb
        .from(TABLE.handoverRoutes)
        .select("id, company_id, direction, is_enabled, note, updated_by, created_at, updated_at")
        .order("company_id");
      if (error) throw error;
      return (data ?? []) as DatevRoute[];
    },
  });
}

// Blind write: sets/replaces the address without ever reading a current value back into the UI
// (the DB would refuse a SELECT of it anyway).
//
// The old `sameForBothDirections` flag is gone. It wrote one address into both the 'incoming' and
// 'outgoing' rows in a single call, on the assumption that a company with a "combined" address just
// had the same value entered twice. That stopped being true: DATEV issues a distinct
// @uploadmail.datev.de address per document category, all three differ per company, and the admin
// screen now edits all three in one dialog anyway (useSaveDatevRoutes below), so copying one value
// across directions would only ever be a way to send documents to the wrong inbox.
export type DatevRouteInput = {
  company_id: string;
  direction: DatevDirection;
  address: string;
  is_enabled?: boolean;
  note?: string | null;
};

/**
 * One direction's worth of the combined per-company editor.
 *
 * `address` is undefined when the operator left that field blank, which is NOT the same as clearing
 * it: the stored value can never be read back to prefill the input (blind write, migration 0038),
 * so a blank field can only mean "leave whatever is there alone". Writing "" would replace a
 * working upload address with an empty string, which the column would happily accept.
 */
export type DatevRouteEntry = {
  direction: DatevDirection;
  /** Set only when the operator typed a new address for this direction. */
  address?: string;
  is_enabled: boolean;
  note: string | null;
  /** The existing row's id, when there is one. Required to change status without an address. */
  existingId?: string;
};

// Both writes go through security-definer RPCs (migration 0038's set_datev_route /
// update_datev_route_status), not a direct table upsert/update. Column-level grants alone cannot
// support the upsert `authenticated` needs here: Postgres's `INSERT ... ON CONFLICT DO UPDATE`
// additionally requires SELECT privilege internally to resolve the conflict target, which would
// mean granting the very SELECT on `address` this table exists to withhold. The RPC runs with the
// function owner's privileges regardless of caller, sidestepping that entirely.
export function useSetDatevRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DatevRouteInput) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("set_datev_route", {
        p_company_id: input.company_id,
        p_direction: input.direction,
        p_address: input.address,
        p_is_enabled: input.is_enabled ?? true,
        p_note: input.note ?? null,
        p_updated_by: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

/**
 * Saves every direction of one company's DATEV configuration in a single action.
 *
 * WHY THIS EXISTS RATHER THAN N CALLS FROM THE DIALOG. There are three addresses per company and
 * one Save button; looping in the component would fire three independent mutations, three toasts,
 * and three cache invalidations, and a failure on the second would leave the operator looking at a
 * half-saved company with no single thing to retry. One mutation, one result.
 *
 * WHICH RPC PER ENTRY, AND WHY IT MATTERS. `set_datev_route` always writes the address column, so
 * it is only safe to call for a direction the operator actually typed into. A direction whose field
 * was left blank but whose switch or note changed goes through `update_datev_route_status`, which
 * touches neither the address nor anything else. An entry with no typed address and no existing row
 * has nothing to write at all and is skipped -- otherwise saving the dialog would create empty
 * routes for the two directions the operator did not fill in.
 *
 * Sequential, not Promise.all: these are three writes to the same company and a deterministic order
 * makes a partial failure legible in the logs. Three round trips on an admin screen used a handful
 * of times is not worth the parallelism.
 */
export function useSaveDatevRoutes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; entries: DatevRouteEntry[] }) => {
      const actor = await actorEmail();
      for (const entry of args.entries) {
        const address = entry.address?.trim();
        if (address) {
          const { error } = await sb.rpc("set_datev_route", {
            p_company_id: args.company_id,
            p_direction: entry.direction,
            p_address: address,
            p_is_enabled: entry.is_enabled,
            p_note: entry.note,
            p_updated_by: actor,
          });
          if (error) throw error;
        } else if (entry.existingId) {
          const { error } = await sb.rpc("update_datev_route_status", {
            p_id: entry.existingId,
            p_is_enabled: entry.is_enabled,
            p_note: entry.note,
            p_updated_by: actor,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

// Both fields are required (not partial) on purpose: the RPC always sets both, so a caller that
// only means to flip is_enabled must still pass the current note along or it gets silently wiped.
export function useUpdateDatevRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      changes: { is_enabled: boolean; note: string | null };
    }) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("update_datev_route_status", {
        p_id: args.id,
        p_is_enabled: args.changes.is_enabled,
        p_note: args.changes.note,
        p_updated_by: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

/**
 * The whole handover queue, every company, in one pass.
 *
 * WHY ONE HOOK FOR ALL COMPANIES INSTEAD OF ONE PER CARD. The screen used to mount
 * `useDatevReadiness(company.id)` inside each company's card, so N companies meant N independent
 * queries each with its own loading state, and the page filled in raggedly. Worse, none of them
 * could answer a question the screen needed to ask across companies ("is anything anywhere waiting
 * to go out?"), so the page never had a total. This runs once and hands back a per-company map;
 * the preview dialog reads the SAME cached rows rather than re-fetching what the card already has,
 * which is why opening it is instant.
 *
 * "READY" IS PAID, NOT PAID-AND-RECONCILED. The original rule (briefing / migration 0038) also
 * required a confirmed bank match via `is_invoice_reconciled`, and that gate was removed on
 * 2026-09-01 at the client's instruction. It was not idle: measured against the live database that
 * day, 62 invoices were `bezahlt` and unsent and NONE passed it — 60 had no bank-match row at all
 * and the other 2 only unconfirmed suggestions — because marking an invoice paid advances its
 * workflow on its own while a bank match counts only once somebody confirms it. The gate made the
 * handover unusable in practice, so payment is now the whole test.
 *
 * WHAT THAT COSTS, stated so nobody has to rediscover it: an invoice marked paid in error is now
 * one click from an irreversible email to the tax advisor, with no bank record required to back the
 * claim that it was paid. `handed_over_at` is still the stop that prevents sending twice.
 *
 * The send function applies the SAME rule (`triggerDatevHandover`) — these two must never diverge,
 * or the screen promises receipts the send will not deliver.
 *
 * `blocked` is the other half of the prediction: a receipt that satisfies the rule but whose stored
 * original DATEV will not take. See `@/lib/datev/attachment-rules`.
 */
export function useDatevHandoverStatus() {
  return useQuery({
    queryKey: ["datev_handover_status"],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, DatevCompanyStatus>> => {
      const { data: candidates, error: candidatesError } = await sb
        .from(TABLE.documents)
        .select("id, company_id, issuer, invoice_number, document_date, amount_gross")
        .eq("workflow_status", "paid")
        .is("handed_over_at", null)
        .is("deleted_at", null)
        .order("document_date", { ascending: true });
      if (candidatesError) throw candidatesError;

      type Candidate = {
        id: string;
        company_id: string;
        issuer: string | null;
        invoice_number: string | null;
        document_date: string | null;
        amount_gross: number | null;
      };
      const rows = (candidates ?? []) as Candidate[];

      // Every paid candidate is a candidate. The per-invoice `is_invoice_reconciled` round trip that
      // used to filter this list is gone with the rule it enforced — which also means this query no
      // longer fires one RPC per invoice, so a queue of hundreds is a single request now.
      const eligible = rows;

      // One `original` file row per candidate, WITHOUT the `content` column: the bytes are the whole
      // invoice and fetching them to render a preview list would pull the entire queue's PDFs into
      // the browser to display six words per row. `storage_path` and `size_bytes` are what let the
      // rule judge presence and size without them — see `@/lib/datev/attachment-rules`.
      const files = new Map<
        string,
        {
          mime: string | null;
          filename: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }
      >();
      // Chunked because these ids go into the request URL — a queue of a few hundred receipts would
      // otherwise build a query string long enough for the gateway to reject outright.
      for (let i = 0; i < eligible.length; i += 100) {
        const ids = eligible.slice(i, i + 100).map((r) => r.id);
        const { data, error } = await sb
          .from(TABLE.documentFiles)
          .select("document_id, filename, mime, storage_path, size_bytes")
          .eq("role", "original")
          .in("document_id", ids);
        if (error) throw error;
        for (const f of (data ?? []) as {
          document_id: string;
          filename: string | null;
          mime: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }[]) {
          files.set(f.document_id, {
            mime: f.mime,
            filename: f.filename,
            storage_path: f.storage_path,
            size_bytes: f.size_bytes,
          });
        }
      }

      // Already handed over, per company. Counted from ids rather than N head-count queries: one
      // request instead of one per company, and the column is a uuid either way.
      const { data: done, error: doneError } = await sb
        .from(TABLE.documents)
        .select("company_id")
        .not("handed_over_at", "is", null)
        .is("deleted_at", null);
      if (doneError) throw doneError;

      const out: Record<string, DatevCompanyStatus> = {};
      const bucket = (companyId: string): DatevCompanyStatus =>
        (out[companyId] ??= { ready: [], blocked: [], handedOver: 0 });

      for (const row of eligible) {
        const blockReason = datevBlockReason(files.get(row.id) ?? null);
        const invoice: DatevReadyInvoice = { ...row, blockReason };
        const target = bucket(row.company_id);
        if (blockReason) target.blocked.push(invoice);
        else target.ready.push(invoice);
      }
      for (const row of (done ?? []) as { company_id: string }[]) {
        bucket(row.company_id).handedOver += 1;
      }
      return out;
    },
  });
}

/**
 * The outgoing invoices a DATEV handover would carry, per company.
 *
 * Same eligibility rule as the incoming side, minus the workflow status: not yet handed over, not
 * deleted. An outgoing invoice has no `workflow_status`; `status` mirrors LexOffice and
 * means something else entirely, so issuance is the whole test.
 *
 * BLOCKING IS PER INVOICE, exactly as it is for incoming. An outgoing invoice whose file is
 * missing blocks on its own and the rest still go. An earlier version of this screen refused the
 * whole direction because no outgoing files existed anywhere on this database, which was a
 * fleet-wide observation standing in for a per-row rule; the moment one invoice has a file, that
 * was wrong.
 *
 * NEEDS `supabase db push`. `handed_over_at` and `handover_batch_id` arrive on
 * `outgoing_invoices` with migration `20260901180000_outgoing_datev_handover_columns.sql`. Without
 * it this query's filter has no column to read and the request fails, which is the loud failure of
 * the two available: the alternative is dropping the filter and re-sending everything already sent.
 *
 * Read only while the send drawer is open (`enabled`), so it costs nothing on page load.
 */
/**
 * Handovers the mail provider accepted and the tax advisor never received.
 *
 * The one thing on this screen that nothing else can surface. A failed SEND is visible immediately
 * and leaves the receipts on the ready list; a BOUNCE happens minutes later, out of band, with the
 * batch already recorded as a success and its receipts already ticked off. DATEV has no return
 * channel, so without reading the non-delivery report nothing in the system would ever notice.
 *
 * Fleet-wide and unfiltered by company on purpose: a misdelivery is not something you go looking
 * for by first picking the company it happened to.
 *
 * Written by the pipeline's `datev_bounce` stage through `mark_datev_batch_bounced`, which also
 * puts the receipts back on the ready list. Until this tenant enables that stage the query is
 * correct and simply returns nothing.
 */
export function useOpenDatevBounces() {
  return useQuery({
    queryKey: ["datev_handover_batches", "open_bounces"],
    staleTime: STALE,
    queryFn: async (): Promise<DatevHandoverBatch[]> => {
      const { data, error } = await sb
        .from(TABLE.handoverBatches)
        .select("*")
        .eq("status", "bounced")
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DatevHandoverBatch[];
    },
  });
}

/** Clear one bounce off the screen. Company-scoped in the RPC, same as every other write here. */
export function useAcknowledgeDatevBounce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { batchId: string }) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("acknowledge_datev_batch", {
        p_batch_id: args.batchId,
        p_actor: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_handover_batches"] }),
  });
}

export function useDatevOutgoingCandidates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["datev_outgoing_candidates"],
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, DatevOutgoingInvoice[]>> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoices)
        .select(
          `id, company_id, invoice_number, invoice_date, amount_gross, ${TABLE.customers}(name)`,
        )
        .is("handed_over_at", null)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: true });
      if (error) throw error;

      type Row = {
        id: string;
        company_id: string;
        invoice_number: string | null;
        invoice_date: string | null;
        amount_gross: number | null;
        customers: { name: string | null } | null;
      };
      const rows = (data ?? []) as Row[];

      // Same two-store rule the incoming side uses, so "can this be attached?" has one answer in
      // the whole app. Without the `content` column, for the same reason as there.
      const files = new Map<string, DatevAttachmentFile>();
      const ids = rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data: fs, error: fErr } = await sb
          .from(TABLE.outgoingInvoiceFiles)
          .select("outgoing_invoice_id, filename, mime, storage_path, size_bytes")
          .in("outgoing_invoice_id", ids.slice(i, i + 100));
        if (fErr) throw fErr;
        for (const f of (fs ?? []) as {
          outgoing_invoice_id: string;
          filename: string | null;
          mime: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }[]) {
          files.set(f.outgoing_invoice_id, {
            filename: f.filename,
            mime: f.mime,
            storage_path: f.storage_path,
            size_bytes: f.size_bytes,
          });
        }
      }

      const out: Record<string, DatevOutgoingInvoice[]> = {};
      for (const r of rows) {
        (out[r.company_id] ??= []).push({
          id: r.id,
          company_id: r.company_id,
          issuer: r.customers?.name ?? null,
          invoice_number: r.invoice_number,
          document_date: r.invoice_date,
          amount_gross: r.amount_gross,
          blockReason: datevBlockReason(files.get(r.id) ?? null),
        });
      }
      return out;
    },
  });
}

// Invoke the datev-handover Edge Function for one company (incoming direction only — see the
// migration's own scope notes). Manual trigger only, no cron: there is no return channel from
// DATEV, so an unattended bad send would just silently fail at the tax advisor's end.
export function useTriggerDatevHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      direction: DatevSendableDirection;
      /** Narrows the send to these receipts. Omit for everything eligible; see the server fn. */
      invoiceIds?: string[];
    }) => {
      return triggerDatevHandover({ data: args });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datev_handover_status"] });
      qc.invalidateQueries({ queryKey: ["datev_handover_batches"] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
    },
  });
}

/**
 * Send history. One row per email the handover produced, newest first.
 *
 * `companyId` is optional now. It was required, and the only screen that could have called it never
 * did — so the table that records every irreversible send to the tax advisor, including the
 * "email went out but recording it failed, do NOT resend" rows the send function writes for exactly
 * the case a human has to reconcile by hand, had no reader anywhere in the app. Passing nothing
 * returns the whole fleet's history, which is what the Verlauf tab shows.
 */
export function useDatevHandoverBatches(
  companyId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["datev_handover_batches", companyId ?? "__alle"],
    // `enabled` is separate from `companyId` on purpose. Omitting the id legitimately means "the
    // whole fleet", so a null id cannot double as "don't run" — which is exactly what a per-company
    // drawer needs while it is closed and has no company yet.
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    queryFn: async (): Promise<DatevHandoverBatch[]> => {
      let query = sb
        .from(TABLE.handoverBatches)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(companyId ? 20 : 100);
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DatevHandoverBatch[];
    },
  });
}
