import type { BankTransactionRecord } from "./bank-reconciliation";

export interface OpenItemRow {
  type: "incoming" | "outgoing";
  id: string;
  companyCode: string | null;
  counterparty: string;
  invoiceNumber: string | null;
  amount: number | null;
  matchedAmount: number;
  receivedAt: string | null;
  documentDate: string | null;
  dueDate: string | null;
  discountDeadline: string | null;
  discountPercent: number | null;
  discountAmount: number | null;
  blocked: boolean;
}

export interface OpenItemsAdapter {
  useOpenItems(includeBlocked: boolean): { data: OpenItemRow[]; loading: boolean; error: unknown };
  useMissingReceiptTransactions(): {
    data: BankTransactionRecord[];
    loading: boolean;
    error: unknown;
  };
  useCompanyOptions(): { data: { code: string; name: string }[]; loading: boolean };
  openInvoice: (row: { type: "incoming" | "outgoing"; id: string }) => void;
  formatMoney: (value: number | null) => string;
  formatDate: (iso: string | null) => string;
}
