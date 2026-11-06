import type { TransferRequest } from "@/kit/lib/sepa";
import { discountOpportunity, isDirectDebit } from "@/lib/data/format";

export interface PaymentFileItemRow {
  document_id: string;
  recipient_name: string;
  iban: string;
  bic: string | null;
  amount: number;
  payment_reference: string | null;
}

export function transfersFromItems(items: readonly PaymentFileItemRow[]): TransferRequest[] {
  return items.map((item) => ({
    reference: item.document_id,
    recipientName: item.recipient_name,
    iban: item.iban,
    bic: item.bic,
    amount: item.amount,
    remittance: item.payment_reference,
    accountConfirmed: true,
  }));
}

export function paymentFileMessageId(today: string, fileId: string): string {
  return `PF-${today}-${fileId.slice(0, 8)}`;
}

export const PAYABLE_WORKFLOW_STATUSES = ["approved_final"];

export interface DiscountDocument {
  amount_gross: number | null;
  early_payment_deadline: string | null;
  early_payment_discount_percent: number | null;
  early_payment_discount_amount: number | null;
  paid_at: string | null;
}

export function amountDueNow(
  document: DiscountDocument,
  today: string,
): { amount: number | null; discountApplied: boolean } {
  const opportunity = discountOpportunity(document, today);
  const useDiscount = Boolean(
    opportunity && opportunity.state !== "lapsed" && opportunity.reducedAmount != null,
  );
  return {
    amount: useDiscount ? (opportunity?.reducedAmount ?? null) : document.amount_gross,
    discountApplied: useDiscount,
  };
}

export interface PayableAccountCandidate {
  iban: string | null;
  bic: string | null;
  deleted_at: string | null;
  is_active: boolean;
  is_payable: boolean | null;
  confirmed_at: string | null;
}

export function usableAccount(
  account: PayableAccountCandidate | null | undefined,
): { iban: string; bic: string | null } | null {
  if (!account) return null;
  if (account.deleted_at || !account.is_active || !account.is_payable || !account.confirmed_at) {
    return null;
  }
  if (!account.iban) return null;
  return { iban: account.iban, bic: account.bic };
}

export function transferDirectDebit(paymentMethod: string | null): boolean {
  return isDirectDebit(paymentMethod);
}
