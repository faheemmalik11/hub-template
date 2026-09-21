import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import type { FilenameSettings, MatchingSettings } from "@/lib/data/types";
import { STALE, SINGLETON_ROW_ID, actorEmail, insertChangeHistory, sb } from "@/data/client";

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
        amount_tolerance: 0.01,
        auto_match_threshold: 0.9,
        candidate_threshold: 0.6,
      }) as MatchingSettings;
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
