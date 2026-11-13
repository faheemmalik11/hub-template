import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { DEFAULT_MATCHING_SETTINGS } from "@/kit/lib/bank-matching";
import type {
  FilenameSettings,
  InvoiceKindLabel,
  InvoiceSettings,
  MatchingSettings,
} from "@/lib/data/types";
import { STALE, SINGLETON_ROW_ID, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

// ---- Filename settings (filename_settings; migration 20260804090000_filename_settings) ----
// Singleton row driving the admin-configurable uniform filename pattern. See
// src/lib/filename.ts (buildSuggestedFilename) and docs/FILENAME_CONVENTION.md.

export function useFilenameSettings() {
  return useQuery({
    queryKey: ["filename_settings"],
    staleTime: STALE,
    queryFn: async (): Promise<FilenameSettings> => {
      const { data, error } = await sb
        .from(TABLE.filenameSettings)
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as unknown as FilenameSettings;
    },
  });
}

export function useUpdateFilenameSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: Partial<Omit<FilenameSettings, "id" | "updated_at" | "updated_by">>,
    ) => {
      const actor = await actorEmail();
      // Read the row BEFORE writing so the trail records what the convention WAS. This setting
      // governs the name of every document the Hub hands to a person or to DATEV, and changing it
      // used to leave nothing behind but updated_at/updated_by on a single-row table.
      const { data: before } = await sb
        .from(TABLE.filenameSettings)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      const { error } = await sb
        .from(TABLE.filenameSettings)
        .update({ ...changes, updated_at: new Date().toISOString(), updated_by: actor })
        .eq("id", true);
      if (error) throw error;
      // record_id: the table is a singleton keyed on `id = true`, which is not a uuid — the
      // all-zero uuid stands in for "the one row".
      await insertChangeHistory(
        "filename_settings",
        "00000000-0000-0000-0000-000000000000",
        "updated",
        null,
        { vorher: before ?? null, nachher: changes },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["filename_settings"] }),
  });
}

export function useMatchingSettings() {
  return useQuery({
    queryKey: ["matching_settings"],
    staleTime: STALE,
    queryFn: async (): Promise<MatchingSettings> => {
      const { data, error } = await sb.from(TABLE.matchingSettings).select("*").maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: true,
        amount_tolerance: DEFAULT_MATCHING_SETTINGS.amountTolerance,
        auto_match_threshold: DEFAULT_MATCHING_SETTINGS.autoMatchThreshold,
        candidate_threshold: DEFAULT_MATCHING_SETTINGS.candidateThreshold,
      }) as MatchingSettings;
    },
  });
}

// ---- Approval settings (tenant_settings.config.approval) ----
// A free-form key on the same singleton row the Hub already reads for locale/tax regime
// (src/lib/tenant-config.server.ts) -- a one-off boolean does not earn its own table the way
// filename/matching settings did. Off by default, so no existing client's approval flow changes
// until a tenant deliberately turns it on.

export function useApprovalSettings() {
  return useQuery({
    queryKey: ["approval_settings"],
    staleTime: STALE,
    queryFn: async (): Promise<{ requireCompanyBeforeFinalApprove: boolean }> => {
      const { data, error } = await sb
        .from(TABLE.tenantSettings)
        .select("config")
        .eq("single_row", true)
        .maybeSingle();
      if (error) throw error;
      const approval = (
        data?.config as { approval?: { requireCompanyBeforeFinalApprove?: boolean } } | null
      )?.approval;
      return {
        requireCompanyBeforeFinalApprove: approval?.requireCompanyBeforeFinalApprove ?? false,
      };
    },
  });
}

export function useUpdateMatchingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<MatchingSettings>) => {
      const { error } = await sb
        .from(TABLE.matchingSettings)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matching_settings"] });
      qc.invalidateQueries({ queryKey: ["match_candidates"] });
    },
  });
}

export function useInvoiceSettings() {
  return useQuery({
    queryKey: queryKeys.settings.invoiceSettings,
    staleTime: STALE,
    queryFn: async (): Promise<InvoiceSettings> => {
      const { data, error } = await sb
        .from(TABLE.invoiceSettings)
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as unknown as InvoiceSettings;
    },
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: Partial<Omit<InvoiceSettings, "id" | "updated_at" | "updated_by">>,
    ) => {
      const actor = await actorEmail();
      const { data: before } = await sb
        .from(TABLE.invoiceSettings)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      const { error } = await sb
        .from(TABLE.invoiceSettings)
        .update({ ...changes, updated_at: new Date().toISOString(), updated_by: actor })
        .eq("id", true);
      if (error) throw error;
      await insertChangeHistory("invoice_settings", SINGLETON_ROW_ID, "updated", null, {
        vorher: before ?? null,
        nachher: changes,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.invoiceSettings }),
  });
}

export function useInvoiceKindLabels() {
  return useQuery({
    queryKey: queryKeys.settings.invoiceKindLabels,
    staleTime: STALE,
    queryFn: async (): Promise<InvoiceKindLabel[]> => {
      const { data, error } = await sb
        .from(TABLE.invoiceKindLabels)
        .select("kind, label")
        .order("kind");
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceKindLabel[];
    },
  });
}

export function useSaveInvoiceKindLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labels: InvoiceKindLabel[]) => {
      const actor = await actorEmail();
      if (labels.length > 0) {
        const { error } = await sb.from(TABLE.invoiceKindLabels).upsert(
          labels.map((one) => ({
            kind: one.kind,
            label: one.label,
            updated_at: new Date().toISOString(),
            updated_by: actor,
          })),
          { onConflict: "kind" },
        );
        if (error) throw error;
      }
      const { data: stored, error: readError } = await sb
        .from(TABLE.invoiceKindLabels)
        .select("kind");
      if (readError) throw readError;
      const keptKinds = new Set(labels.map((one) => one.kind));
      const removedKinds = ((stored ?? []) as unknown as { kind: string }[])
        .map((one) => one.kind)
        .filter((kind) => !keptKinds.has(kind));
      if (removedKinds.length > 0) {
        const { error } = await sb.from(TABLE.invoiceKindLabels).delete().in("kind", removedKinds);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.invoiceKindLabels }),
  });
}
