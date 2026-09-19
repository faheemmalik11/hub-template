export interface NormalizedRow {
  booking_date: string;
  value_date: string | null;
  amount: number;
  currency: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  payment_reference: string | null;
  booking_text: string | null;
  provider_ref: string | null;
}

export type ParseIssueCode = "missing_booking_date" | "missing_amount";

export interface ParseIssue {
  rowIndex: number;
  code: ParseIssueCode;
  rawValue: string;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  issues: ParseIssue[];
}

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export type SingleTargetField =
  | "booking_date"
  | "value_date"
  | "amount"
  | "currency"
  | "counterparty_holder"
  | "counterparty_iban"
  | "payment_reference"
  | "booking_text";

export type ColumnMapping = Partial<Record<SingleTargetField, string>> & {
  amountDebit?: string;
  amountCredit?: string;
};

export const REQUIRED_FIELDS: readonly SingleTargetField[] = ["booking_date"];
