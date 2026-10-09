import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";
import type { CommissionSide } from "@/kit/lib/commission";

export type DealStatus = "incomplete" | "ready" | "approved" | "invoiced" | "cancelled";
export type FeeKind = "percent" | "fixed";

export interface DealParty {
  id: string;
  customer_id: string;
  share_percent: number | null;
  discount_gross: number;
  discount_reason: string | null;
  position: number;
  customer: { name: string } | null;
}

export interface DealSide {
  id: string;
  side: CommissionSide;
  fee_kind: FeeKind;
  fee_net_rate: number | null;
  fee_net_amount: number | null;
  deal_parties: DealParty[];
}

export type DealCostKind = "city_fee" | "photos" | "energy_certificate" | "voucher" | "other";

export const DEAL_COST_KINDS: DealCostKind[] = [
  "city_fee",
  "photos",
  "energy_certificate",
  "voucher",
  "other",
];

export interface DealCost {
  id: string;
  kind: DealCostKind;
  description: string | null;
  amount: number;
  incurred_on: string | null;
}

export interface Deal {
  id: string;
  company_id: string | null;
  property_id: string | null;
  property_label: string | null;
  status: DealStatus;
  notarised_on: string | null;
  purchase_price: number | null;
  vat_rate: number;
  note: string | null;
  acquired_by: string | null;
  handled_by: string | null;
  own_lead: boolean;
  from_viewing: boolean;
  referrer_customer_id: string | null;
  costs_closed_at: string | null;
  ready_for_bookkeeping_at: string | null;
  approved_at: string | null;
  created_at: string;
  property: { code: string; name: string } | null;
  deal_sides: DealSide[];
  deal_costs: DealCost[];
}

export interface DealSideInput {
  side: CommissionSide;
  fee_kind: FeeKind;
  fee_net_rate: number | null;
  fee_net_amount: number | null;
  parties: Array<{
    customer_id: string;
    share_percent: number | null;
    discount_gross: number;
    discount_reason: string | null;
  }>;
}

export interface DealCostInput {
  kind: DealCostKind;
  description: string | null;
  amount: number;
  incurred_on: string | null;
}

export interface DealInput {
  company_id: string | null;
  notarised_on: string | null;
  purchase_price: number | null;
  vat_rate: number;
  note: string | null;
  acquired_by: string | null;
  handled_by: string | null;
  own_lead: boolean;
  from_viewing: boolean;
  referrer_customer_id: string | null;
  costs_closed: boolean;
  ready_for_bookkeeping: boolean;
}

const DEAL_SELECT =
  `id, company_id, property_id, property_label, status, notarised_on, purchase_price, vat_rate, ` +
  `note, acquired_by, handled_by, own_lead, from_viewing, referrer_customer_id, costs_closed_at, ` +
  `ready_for_bookkeeping_at, approved_at, created_at, property:${TABLE.properties}(code, name), ` +
  `deal_sides:${TABLE.dealSides}(id, side, fee_kind, fee_net_rate, fee_net_amount, ` +
  `deal_parties:${TABLE.dealParties}(id, customer_id, share_percent, discount_gross, ` +
  `discount_reason, position, customer:${TABLE.customers}(name))), ` +
  `deal_costs:${TABLE.dealCosts}(id, kind, description, amount, incurred_on)`;

function sortedParties(deal: Deal): Deal {
  return {
    ...deal,
    deal_costs: [...deal.deal_costs].sort((a, b) =>
      (a.incurred_on ?? "").localeCompare(b.incurred_on ?? ""),
    ),
    deal_sides: deal.deal_sides.map((side) => ({
      ...side,
      deal_parties: [...side.deal_parties].sort((a, b) => a.position - b.position),
    })),
  };
}

export function useDeals() {
  return useQuery({
    queryKey: queryKeys.deals.all,
    staleTime: STALE,
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await sb
        .from(TABLE.deals)
        .select(DEAL_SELECT)
        .is("deleted_at", null)
        .order("notarised_on", { ascending: false, nullsFirst: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Deal[]).map(sortedParties);
    },
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: queryKeys.deals.one(id),
    staleTime: STALE,
    queryFn: async (): Promise<Deal | null> => {
      const { data, error } = await sb
        .from(TABLE.deals)
        .select(DEAL_SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? sortedParties(data as Deal) : null;
    },
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      propertyLabel: string;
      companyId: string | null;
      purchasePrice: number | null;
    }): Promise<string> => {
      const { data, error } = await sb
        .from(TABLE.deals)
        .insert({
          property_id: input.propertyId,
          property_label: input.propertyLabel,
          company_id: input.companyId,
          purchase_price: input.purchasePrice,
          created_by: await actorEmail(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.deals.all }),
  });
}

export function useSaveDeal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      deal: DealInput;
      sides: DealSideInput[];
      costs: DealCostInput[];
      complete: boolean;
    }) => {
      const { error } = await sb.rpc("save_deal", {
        p_deal_id: dealId,
        p_deal: input.deal,
        p_sides: input.sides,
        p_costs: input.costs,
        p_status: input.complete ? "ready" : "incomplete",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.deals.all }),
  });
}

export function useApproveDeal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("approve_deal", { p_deal_id: dealId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.deals.all }),
  });
}
