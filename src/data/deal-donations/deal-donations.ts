import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export type DonationStatus = "suggested" | "paid" | "cancelled";

export interface DealDonation {
  id: string;
  deal_id: string;
  organisation: string;
  iban: string | null;
  contact_person: string | null;
  contact_reachability: string | null;
  handover_date: string | null;
  amount: number;
  status: DonationStatus;
  cancel_reason: string | null;
  paid_at: string | null;
}

const DONATION_SELECT =
  "id, deal_id, organisation, iban, contact_person, contact_reachability, handover_date, " +
  "amount, status, cancel_reason, paid_at";

export function useDealDonation(dealId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dealDonations.forDeal(dealId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<DealDonation | null> => {
      const { data, error } = await sb
        .from(TABLE.dealDonations)
        .select(DONATION_SELECT)
        .eq("deal_id", dealId)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) throw error;
      return data as DealDonation | null;
    },
  });
}

export function useSuggestDonation(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organisation: string;
      amount: number;
      iban?: string | null;
      contactPerson?: string | null;
      contactReachability?: string | null;
      handoverDate?: string | null;
    }) => {
      const { error } = await sb.from(TABLE.dealDonations).insert({
        deal_id: dealId,
        organisation: input.organisation,
        amount: input.amount,
        iban: input.iban ?? null,
        contact_person: input.contactPerson ?? null,
        contact_reachability: input.contactReachability ?? null,
        handover_date: input.handoverDate ?? null,
        status: "suggested",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dealDonations.forDeal(dealId) }),
  });
}

export function useMarkDonationPaid(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from(TABLE.dealDonations).update({ status: "paid" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dealDonations.forDeal(dealId) }),
  });
}

export function useCancelDonation(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string | null }) => {
      const { error } = await sb
        .from(TABLE.dealDonations)
        .update({ status: "cancelled", cancel_reason: input.reason })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dealDonations.forDeal(dealId) }),
  });
}

export interface DonationSettings {
  threshold_amount: number;
  donation_amount: number;
}

export function useDonationSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dealDonations.settings,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<DonationSettings> => {
      const { data, error } = await sb
        .from(TABLE.donationSettings)
        .select("threshold_amount, donation_amount")
        .single();
      if (error) throw error;
      return data as DonationSettings;
    },
  });
}

export function useSaveDonationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DonationSettings) => {
      const { error } = await sb
        .from(TABLE.donationSettings)
        .update(settings)
        .eq("single_row", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dealDonations.settings }),
  });
}
