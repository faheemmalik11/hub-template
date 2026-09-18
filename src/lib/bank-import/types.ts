// Shared types for the manual bank-transaction import wizard (CSV/XLSX today, CAMT.053 XML
// planned as a fast-follow — see docs/BANK_MANUAL_IMPORT.md).

/** One transaction after parsing + column mapping, ready to send to bank-manual-import. */
export interface NormalizedRow {
  booking_date: string; // ISO yyyy-mm-dd
  value_date: string | null;
  amount: number; // signed: negative = outgoing, positive = incoming
  currency: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  payment_reference: string | null;
  booking_text: string | null;
  /** Bank-assigned unique reference, when the source format has one. Null for plain CSV/XLSX. */
  provider_ref: string | null;
}

/** Row-level problem found while normalizing — the row is skipped, not silently dropped. */
export interface ParseIssue {
  rowIndex: number;
  reason: string;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  issues: ParseIssue[];
}

/** A parsed CSV/XLSX file before column mapping is applied. */
export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

/** Single-column targets. Amount can instead be split across amountDebit/amountCredit. */
export type SingleTargetField =
  | "booking_date"
  | "value_date"
  | "amount"
  | "currency"
  | "counterparty_holder"
  | "counterparty_iban"
  | "payment_reference"
  | "booking_text";

/** Maps a target field to a source column header. Null = not mapped (only valid for optional fields). */
export type ColumnMapping = Partial<Record<SingleTargetField, string>> & {
  /** Set instead of `amount` when the bank splits sign into two columns (Soll/Haben). */
  amountDebit?: string;
  amountCredit?: string;
};

// "amount" is required but validated separately (§ mapping.ts) since it may instead be supplied
// as an amountDebit/amountCredit pair — a plain field list can't express that either/or.
export const REQUIRED_FIELDS: readonly SingleTargetField[] = ["booking_date"];
