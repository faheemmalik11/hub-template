import type { NormalizedRow } from "../lib/bank-import/types";

export interface BankAccountRecord {
  id: string;
  account_name: string | null;
  company_code: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  product_type: string | null;
  currency: string | null;
  balance: number | null;
  balance_date: string | null;
  is_own_account: boolean;
  excluded_at: string | null;
}

export interface BankTransactionRecord {
  id: string;
  account_id: string;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  payment_reference: string | null;
  booking_text: string | null;
  direction: string | null;
  transaction_type: string | null;
  matching_status: string;
  no_receipt_reason: string | null;
}

export interface BankMatchCandidate {
  invoiceId: string;
  issuer: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  documentDate: string | null;
  score: number | null;
  reasons?: string[] | null;
}

export interface BankInvoiceSearchResult {
  id: string;
  issuer: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  documentDate: string | null;
}

export interface BankMatchingSettingsRecord {
  amount_tolerance: number;
  auto_match_threshold: number;
  candidate_threshold: number;
}

export interface BankReconciliationAdapter {
  useAccounts(): { data: BankAccountRecord[]; loading: boolean; error: unknown };
  useTransactions(): { data: BankTransactionRecord[]; loading: boolean; error: unknown };
  useCompanyOptions?(): { data: { code: string; name: string }[]; loading: boolean };

  useCandidates(transactionId: string): { data: BankMatchCandidate[]; loading: boolean };
  confirmMatch(
    transactionId: string,
    invoiceId: string,
    options?: { differenceReason?: string; fullyCovered?: boolean },
  ): Promise<void>;
  rejectMatch(transactionId: string, invoiceId: string): Promise<void>;
  useMatchingSettings?(): {
    data: BankMatchingSettingsRecord | null;
    loading: boolean;
    update: (patch: Partial<BankMatchingSettingsRecord>) => Promise<void>;
  };

  noReceipt?: {
    mark(transactionId: string, reason: string): Promise<void>;
    clear(transactionId: string): Promise<void>;
    reasons: { value: string; label: string }[];
  };

  manualSearch?: {
    search(query: string): Promise<BankInvoiceSearchResult[]>;
  };

  openInvoice: (invoiceId: string) => void;
  formatMoney: (value: number | null) => string;
  formatDate: (iso: string | null) => string;

  import?: {
    useAccountOptions(): { data: { id: string; label: string }[]; loading: boolean };
    importRows(
      accountId: string,
      filename: string,
      rows: NormalizedRow[],
    ): Promise<{ imported: number; skipped: number; duplicates: number }>;
  };
}
