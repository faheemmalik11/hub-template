import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export type ReferrerBonusStatus = "suggested" | "paid" | "cancelled";

export interface DealReferrerBonus {
  id: string;
  deal_id: string;
  referrer_customer_id: string;
  tier: number;
  amount: number;
  earned_on: string;
  status: ReferrerBonusStatus;
  cancel_reason: string | null;
  paid_at: string | null;
}

const REFERRER_BONUS_SELECT =
  "id, deal_id, referrer_customer_id, tier, amount, earned_on, status, cancel_reason, paid_at";

export function useDealReferrerBonus(dealId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dealReferrerBonuses.forDeal(dealId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<DealReferrerBonus | null> => {
      const { data, error } = await sb
        .from(TABLE.dealReferrerBonuses)
        .select(REFERRER_BONUS_SELECT)
        .eq("deal_id", dealId)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) throw error;
      return data as DealReferrerBonus | null;
    },
  });
}

/** Which referral number this would be for that referrer this calendar year, for defaulting the amount field. */
export function useReferrerBonusTier(referrerCustomerId: string | null, earnedOn: string) {
  return useQuery({
    queryKey: queryKeys.dealReferrerBonuses.tier(referrerCustomerId ?? "", earnedOn),
    enabled: !!referrerCustomerId,
    staleTime: STALE,
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb.rpc("referrer_bonus_tier", {
        p_referrer_customer_id: referrerCustomerId,
        p_earned_on: earnedOn,
      });
      if (error) throw error;
      return data as number;
    },
  });
}

export function useSuggestReferrerBonus(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      referrerCustomerId: string;
      tier: number;
      amount: number;
      earnedOn: string;
    }) => {
      const { error } = await sb.from(TABLE.dealReferrerBonuses).insert({
        deal_id: dealId,
        referrer_customer_id: input.referrerCustomerId,
        tier: input.tier,
        amount: input.amount,
        earned_on: input.earnedOn,
        status: "suggested",
      });
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.dealReferrerBonuses.forDeal(dealId) }),
  });
}

export function useMarkReferrerBonusPaid(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE.dealReferrerBonuses)
        .update({ status: "paid" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.dealReferrerBonuses.forDeal(dealId) }),
  });
}

export function useCancelReferrerBonus(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string | null }) => {
      const { error } = await sb
        .from(TABLE.dealReferrerBonuses)
        .update({ status: "cancelled", cancel_reason: input.reason })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.dealReferrerBonuses.forDeal(dealId) }),
  });
}
