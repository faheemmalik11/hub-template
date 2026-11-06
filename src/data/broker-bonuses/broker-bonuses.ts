import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export const BONUS_NOTE_MAX_LENGTH = 500;

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
export type BonusStatus = "suggested" | "submitted" | "approved" | "rejected" | "paid";

export interface BrokerBonus {
  id: string;
  broker_user_id: string;
  bonus_type: BonusType;
  earned_on: string;
  amount: number;
  note: string | null;
  deal_id: string | null;
  status: BonusStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  broker: { name: string | null; email: string } | null;
}

const BONUS_SELECT =
  `id, broker_user_id, bonus_type, earned_on, amount, note, deal_id, status, reviewed_at, review_note, ` +
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
      status: Exclude<BonusStatus, "submitted" | "suggested">;
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

export function useConfirmSuggestedBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE.brokerBonuses)
        .update({ status: "submitted" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.all }),
  });
}

export interface BonusSettings {
  notary_amount: number;
  follow_up_amount: number;
  own_lead_share_percent: number;
  company_lead_share_percent: number;
  personnel_flat_amount: number;
  company_lead_deducts_costs: boolean;
}

const SETTINGS_SELECT =
  "notary_amount, follow_up_amount, own_lead_share_percent, company_lead_share_percent, " +
  "personnel_flat_amount, company_lead_deducts_costs";

export function useBonusSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.brokerBonuses.settings,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<BonusSettings> => {
      const { data, error } = await sb.from(TABLE.bonusSettings).select(SETTINGS_SELECT).single();
      if (error) throw error;
      return data as BonusSettings;
    },
  });
}

export function useSaveBonusSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: BonusSettings) => {
      const { error } = await sb.from(TABLE.bonusSettings).update(settings).eq("single_row", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.settings }),
  });
}

export function useDealBonuses(dealId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.brokerBonuses.forDeal(dealId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<
      Array<{ bonus_type: BonusType; status: BonusStatus; amount: number }>
    > => {
      const { data, error } = await sb
        .from(TABLE.brokerBonuses)
        .select("bonus_type, status, amount")
        .eq("deal_id", dealId)
        .neq("status", "rejected");
      if (error) throw error;
      return (data ?? []) as Array<{ bonus_type: BonusType; status: BonusStatus; amount: number }>;
    },
  });
}

export function useSuggestBonuses(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      suggestions: Array<{
        brokerUserId: string;
        bonusType: BonusType;
        earnedOn: string;
        amount: number;
        note: string;
      }>,
    ) => {
      const { error } = await sb.from(TABLE.brokerBonuses).insert(
        suggestions.map((suggestion) => ({
          deal_id: dealId,
          broker_user_id: suggestion.brokerUserId,
          bonus_type: suggestion.bonusType,
          earned_on: suggestion.earnedOn,
          amount: suggestion.amount,
          note: suggestion.note,
          status: "suggested",
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.brokerBonuses.all });
    },
  });
}

export function useDealCommissionPaid(dealId: string, enabled = true) {
  return useQuery({
    queryKey: ["deal-commission-paid", dealId],
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<boolean> => {
      const { data: parties, error: partiesError } = await sb
        .from(TABLE.dealParties)
        .select(`id, ${TABLE.dealSides}!inner(deal_id)`)
        .eq(`${TABLE.dealSides}.deal_id`, dealId);
      if (partiesError) throw partiesError;
      const people = (parties ?? []) as Array<{ id: string }>;
      if (people.length === 0) return false;
      const { data: invoices, error } = await sb
        .from(TABLE.outgoingInvoices)
        .select("deal_party_id, status")
        .in(
          "deal_party_id",
          people.map((party) => party.id),
        )
        .is("deleted_at", null)
        .neq("status", "cancelled");
      if (error) throw error;
      const paid = new Set(
        ((invoices ?? []) as Array<{ deal_party_id: string | null; status: string }>)
          .filter((invoice) => invoice.status === "paid" && invoice.deal_party_id)
          .map((invoice) => invoice.deal_party_id),
      );
      const open = ((invoices ?? []) as Array<{ status: string }>).some(
        (invoice) => invoice.status !== "paid",
      );
      return !open && people.every((party) => paid.has(party.id));
    },
  });
}
