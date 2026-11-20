import type { Deal } from "@/data";

export const UNMAINTAINED_CRM_FIELDS = [
  "purchase_price",
  "notarised_on",
  "buyer_rate",
  "seller_rate",
] as const;

export type UnmaintainedCrmField = (typeof UNMAINTAINED_CRM_FIELDS)[number];

export function unmaintainedCrmFieldsOf(deal: Deal): UnmaintainedCrmField[] {
  const missing: UnmaintainedCrmField[] = [];
  if (deal.purchase_price === null) missing.push("purchase_price");
  if (deal.notarised_on === null) missing.push("notarised_on");
  for (const side of ["buyer", "seller"] as const) {
    const dealSide = deal.deal_sides.find((candidate) => candidate.side === side);
    if (dealSide?.fee_kind === "percent" && dealSide.fee_net_rate === null) {
      missing.push(side === "buyer" ? "buyer_rate" : "seller_rate");
    }
  }
  return missing;
}
