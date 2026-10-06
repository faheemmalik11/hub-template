import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export const BONUS_TYPES = [
  "notary",
  "google_review",
  "viewing_new_job",
  "company_lead_share",
  "own_job_share",
  "financing_referral",
  "other",
] as const;

export type BonusType = (typeof BONUS_TYPES)[number];
export type BonusStatus = "submitted" | "approved" | "rejected" | "paid";

export interface BrokerBonus {
  id: string;
  broker_user_id: string;
  bonus_type: BonusType;
  earned_on: string;
  amount: number;
  note: string | null;
  status: BonusStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  broker: { name: string | null; email: string } | null;
}

const BONUS_SELECT =
  `id, broker_user_id, bonus_type, earned_on, amount, note, status, reviewed_at, review_note, ` +
  `created_at, broker:app_users!broker_user_id(name, email)`;

export function useBrokerBonuses() {
  return useQuery({
    queryKey: queryKeys.brokerBonuses.all,
    staleTime: STALE,
    queryFn: async (): Promise<BrokerBonus[]> => {
      const { data, error } = await sb
        .from(TABLE.brokerBonuses)
        .select(BONUS_SELECT)
        .order("earned_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BrokerBonus[];
    },
  });
}

export function useSubmitBrokerBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bonusType: BonusType;
      earnedOn: string;
      amount: number;
      note: string | null;
    }) => {
      const { error } = await sb.from(TABLE.brokerBonuses).insert({
        bonus_type: input.bonusType,
        earned_on: input.earnedOn,
        amount: input.amount,
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.all }),
  });
}

export function useDeleteBrokerBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from(TABLE.brokerBonuses).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.all }),
  });
}

export function useReviewBrokerBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: Exclude<BonusStatus, "submitted">;
      amount?: number;
      reviewNote?: string | null;
    }) => {
      const { error } = await sb
        .from(TABLE.brokerBonuses)
        .update({
          status: input.status,
          ...(input.amount === undefined ? {} : { amount: input.amount }),
          review_note: input.reviewNote ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.all }),
  });
}
