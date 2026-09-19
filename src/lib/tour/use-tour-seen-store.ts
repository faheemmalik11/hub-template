import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TourSeenStore } from "@/kit/components/tour";

import { supabase } from "@/integrations/supabase/client";
import { TABLE } from "@/config/tables";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type TourProgressRow = {
  tour_id: string;
  version: number;
};

type SaveInput = {
  tourId: string;
  version: number;
  status: "skipped" | "completed";
  lastStep: number;
};

export function useTourSeenStore(): TourSeenStore {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["tour_progress", "session_user"],
    staleTime: Infinity,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });
  const userId = sessionQuery.data ?? null;

  const progressQuery = useQuery({
    queryKey: ["tour_progress", userId],
    enabled: Boolean(userId),
    staleTime: Infinity,
    queryFn: async (): Promise<TourProgressRow[]> => {
      const { data, error } = await sb.from(TABLE.tourProgress).select("tour_id, version");
      if (error) throw error;
      return (data ?? []) as TourProgressRow[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ tourId, version, status, lastStep }: SaveInput) => {
      if (!userId) return;
      // Only the first landing on a page is worth recording. Reopening from the header is a
      // deliberate act that should leave no trace and change nothing.
      const alreadyRecorded = (progressQuery.data ?? []).some((row) => row.tour_id === tourId);
      if (alreadyRecorded) return;
      const { error } = await sb
        .from(TABLE.tourProgress)
        .upsert(
          { user_id: userId, tour_id: tourId, version, status, last_step: lastStep },
          { onConflict: "user_id,tour_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tour_progress", userId] });
    },
    // A tour that fails to record looks exactly like one nobody finished: it simply opens again on
    // the next visit, with nothing anywhere to say why. Not a toast, because there is nothing the
    // reader can do about it, but it must not vanish without trace.
    onError: (error) => {
      console.error("tour_progress could not be saved", error);
    },
  });

  const rows = progressQuery.data;
  const saveTour = save.mutate;

  return useMemo<TourSeenStore>(
    () => ({
      // Until the rows are in, the answer is unknown, and guessing would either hide a tour from
      // somebody who never saw it or replay one somebody already dismissed.
      isReady: Boolean(userId) && !progressQuery.isLoading,
      // SEEN IS SEEN. The version is stored but does not gate this. It used to require
      // `row.version >= version`, so bumping a tour's version replayed it for everybody who had
      // already sat through it, which reads as the app having forgotten rather than as an update.
      // A tour worth showing again is a new tour with a new id.
      hasSeen: (tourId) => (rows ?? []).some((row) => row.tour_id === tourId),
      markSeen: (tourId, version, outcome) =>
        saveTour({ tourId, version, status: outcome.status, lastStep: outcome.lastStep }),
    }),
    [userId, progressQuery.isLoading, rows, saveTour],
  );
}
