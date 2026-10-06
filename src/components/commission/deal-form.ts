import { calculateDealCommission } from "../../kit/lib/commission/calculate.ts";
import type { CommissionResult, CommissionSide, SideFee } from "@/kit/lib/commission/types";
import type { Deal, DealInput, DealSide, DealSideInput, FeeKind } from "@/data/deals/deals";

export const SIDES: CommissionSide[] = ["buyer", "seller"];

export interface PartyForm {
  customerId: string;
  share: string;
}

export interface SideForm {
  enabled: boolean;
  feeKind: FeeKind;
  rate: string;
  amount: string;
  discount: string;
  discountReason: string;
  parties: PartyForm[];
}

export interface DealForm {
  companyId: string | null;
  notarisedOn: string;
  purchasePrice: string;
  vatRate: string;
  note: string;
  buyer: SideForm;
  seller: SideForm;
}

const GROUPED_THOUSANDS = /^-?\d{1,3}(\.\d{3})+$/;

export function parseDecimal(input: string): number | null {
  const compact = input.replace(/\s|€|%/g, "");
  if (!compact) return null;
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : GROUPED_THOUSANDS.test(compact)
      ? compact.replace(/\./g, "")
      : compact;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatDecimal(value: number | null | undefined): string {
  return value === null || value === undefined
    ? ""
    : value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function emptySide(enabled: boolean): SideForm {
  return {
    enabled,
    feeKind: "percent",
    rate: "",
    amount: "",
    discount: "",
    discountReason: "",
    parties: [],
  };
}

function sideFormOf(side: DealSide | undefined): SideForm {
  if (!side) return emptySide(false);
  return {
    enabled: true,
    feeKind: side.fee_kind,
    rate: formatDecimal(side.fee_net_rate),
    amount: formatDecimal(side.fee_net_amount),
    discount: side.discount_gross ? formatDecimal(side.discount_gross) : "",
    discountReason: side.discount_reason ?? "",
    parties: side.deal_parties.map((party) => ({
      customerId: party.customer_id,
      share: formatDecimal(party.share_percent),
    })),
  };
}

export function dealFormOf(deal: Deal): DealForm {
  const sideOf = (side: CommissionSide) => deal.deal_sides.find((s) => s.side === side);
  const isNew = deal.deal_sides.length === 0;
  return {
    companyId: deal.company_id,
    notarisedOn: deal.notarised_on ?? "",
    purchasePrice: formatDecimal(deal.purchase_price),
    vatRate: formatDecimal(deal.vat_rate),
    note: deal.note ?? "",
    buyer: isNew ? emptySide(true) : sideFormOf(sideOf("buyer")),
    seller: isNew ? emptySide(true) : sideFormOf(sideOf("seller")),
  };
}

function cents(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

function feeOf(side: SideForm): SideFee | null {
  if (side.feeKind === "percent") {
    const rate = parseDecimal(side.rate);
    return rate === null ? null : { kind: "percent", netRatePercent: rate };
  }
  const amount = cents(parseDecimal(side.amount));
  return amount === null ? null : { kind: "fixed", netAmountCents: amount };
}

export function calculateDealForm(form: DealForm): CommissionResult {
  const sideInput = (side: SideForm) =>
    side.enabled
      ? {
          fee: feeOf(side),
          payers: side.parties
            .filter((party) => party.customerId)
            .map((party) => {
              const share = parseDecimal(party.share);
              return share === null
                ? { key: party.customerId }
                : { key: party.customerId, sharePercent: share };
            }),
          discountGrossCents: cents(parseDecimal(side.discount)) ?? 0,
        }
      : undefined;
  return calculateDealCommission({
    purchasePriceCents: cents(parseDecimal(form.purchasePrice)),
    vatRatePercent: parseDecimal(form.vatRate) ?? 19,
    buyer: sideInput(form.buyer),
    seller: sideInput(form.seller),
  });
}

export function saveInputOf(form: DealForm): { deal: DealInput; sides: DealSideInput[] } {
  return {
    deal: {
      company_id: form.companyId,
      notarised_on: form.notarisedOn || null,
      purchase_price: parseDecimal(form.purchasePrice),
      vat_rate: parseDecimal(form.vatRate) ?? 19,
      note: form.note.trim() || null,
    },
    sides: SIDES.filter((side) => form[side].enabled).map((side) => {
      const sideForm = form[side];
      return {
        side,
        fee_kind: sideForm.feeKind,
        fee_net_rate: sideForm.feeKind === "percent" ? parseDecimal(sideForm.rate) : null,
        fee_net_amount: sideForm.feeKind === "fixed" ? parseDecimal(sideForm.amount) : null,
        discount_gross: parseDecimal(sideForm.discount) ?? 0,
        discount_reason: sideForm.discountReason.trim() || null,
        parties: sideForm.parties
          .filter((party) => party.customerId)
          .map((party) => ({
            customer_id: party.customerId,
            share_percent: parseDecimal(party.share),
          })),
      };
    }),
  };
}

export function dealGrossTotalCents(result: CommissionResult): number | null {
  return result.ok
    ? result.invoices.reduce((sum, invoice) => sum + invoice.totalGrossCents, 0)
    : null;
}
