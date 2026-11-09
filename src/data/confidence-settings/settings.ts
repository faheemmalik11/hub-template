import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { TABLE } from "@/config/tables";

export type ConfidenceSettings = {
  id: boolean;
  ampel_green_min: number;
  ampel_yellow_min: number;
  relevance_min_konfidenz: number;
  relevance_noninvoice_max_konfidenz: number;
  updated_at: string;
  updated_by: string | null;
};

export function useConfidenceSettings() {
  return useQuery({
    queryKey: ["confidence_settings"],
    staleTime: STALE,
    queryFn: async (): Promise<ConfidenceSettings> => {
      const { data, error } = await sb
        .from(TABLE.confidenceSettings)
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as unknown as ConfidenceSettings;
    },
  });
}

export function useUpdateConfidenceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: Partial<Omit<ConfidenceSettings, "id" | "updated_at" | "updated_by">>,
    ) => {
      const actor = await actorEmail();
      const { data: before } = await sb
        .from(TABLE.confidenceSettings)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      const { error } = await sb
        .from(TABLE.confidenceSettings)
        .update({ ...changes, updated_at: new Date().toISOString(), updated_by: actor })
        .eq("id", true);
      if (error) throw error;
      await insertChangeHistory(
        TABLE.confidenceSettings,
        "00000000-0000-0000-0000-000000000000",
        "updated",
        null,
        { vorher: before ?? null, nachher: changes },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["confidence_settings"] }),
  });
}
