export type CommissionSide = "buyer" | "seller";

export type SideFee =
  { kind: "percent"; netRatePercent: number } | { kind: "fixed"; netAmountCents: number };

export interface CommissionPayer {
  key: string;
  sharePercent?: number;
}

export interface SideCommissionInput {
  side: CommissionSide;
  purchasePriceCents: number | null;
  fee: SideFee | null;
  payers: readonly CommissionPayer[];
  discountGrossCents?: number;
  vatRatePercent: number;
}

export interface DealCommissionInput {
  purchasePriceCents: number | null;
  vatRatePercent: number;
  buyer?: Omit<SideCommissionInput, "side" | "purchasePriceCents" | "vatRatePercent">;
  seller?: Omit<SideCommissionInput, "side" | "purchasePriceCents" | "vatRatePercent">;
}

export interface CommissionInvoiceDraft {
  side: CommissionSide;
  payerKey: string;
  sharePercent: number;
  sideNetCents: number;
  netRatePercent: number | null;
  grossRatePercent: number | null;
  lineGrossCents: number;
  discountGrossCents: number;
  totalGrossCents: number;
  totalNetCents: number;
  totalVatCents: number;
}

export type CommissionProblem =
  | "purchase_price_missing"
  | "fee_missing"
  | "fee_not_positive"
  | "no_payers"
  | "duplicate_payer"
  | "shares_incomplete"
  | "shares_do_not_add_up"
  | "discount_negative"
  | "discount_exceeds_fee"
  | "no_side_pays";

export interface SideProblem {
  side: CommissionSide | null;
  problem: CommissionProblem;
}

export type CommissionResult =
  { ok: true; invoices: CommissionInvoiceDraft[] } | { ok: false; problems: SideProblem[] };
