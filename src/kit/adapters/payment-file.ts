export interface PaymentAccountRow {
  id: string;
  label: string;
  payerName: string;
  payerIban: string;
  payerBic: string | null;
  painVersion: string;
  executionDateRule: string;
  isDefault: boolean;
}

export interface PaymentAccountFormValues {
  label: string;
  payerName: string;
  payerIban: string;
  payerBic: string;
  painVersion: string;
  executionDateRule: string;
}

export interface PayableDocumentRow {
  id: string;
  issuer: string | null;
  invoiceNumber: string | null;
  amountGross: number | null;
  dueDate: string | null;
  amountDueNow: number;
  discountApplied: boolean;
}

export interface PaymentFileRow {
  id: string;
  filename: string | null;
  createdAt: string;
  itemCount: number;
  total: number;
  status: "draft" | "generated" | "downloaded" | "discarded";
}

export interface PaymentFileItemRow {
  id: string;
  documentId: string;
  recipientName: string;
  iban: string;
  amount: number;
  skippedReason: string | null;
}

export interface PendingPaymentRow {
  documentId: string;
  recipientName: string;
  iban: string;
  amount: number;
  fileName: string | null;
}

export interface PaymentFileBusyState {
  creatingFile: boolean;
  downloading: boolean;
  discarding: boolean;
  confirmingPaid: boolean;
  savingAccount: boolean;
}

export interface PaymentFileAdapter {
  companyId: string;

  useAccounts(): { data: PaymentAccountRow[]; loading: boolean };
  useFiles(): { data: PaymentFileRow[]; loading: boolean; error: unknown; refetch: () => void };
  usePayableDocuments(
    search: string,
    page: number,
    pageSize: number,
  ): {
    data: { rows: PayableDocumentRow[]; total: number };
    loading: boolean;
    error: unknown;
    refetch: () => void;
  };
  useFile(fileId: string | undefined): {
    data: { file: PaymentFileRow; items: PaymentFileItemRow[] } | undefined;
    loading: boolean;
    error: unknown;
    refetch: () => void;
  };
  usePendingPayments(): {
    data: PendingPaymentRow[];
    loading: boolean;
    error: unknown;
    refetch: () => void;
  };

  busy: PaymentFileBusyState;
  createAccount(values: PaymentAccountFormValues): Promise<void>;
  updateAccount(id: string, values: PaymentAccountFormValues): Promise<void>;
  setDefaultAccount(id: string): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  createFile(documentIds: string[], accountId: string): Promise<string>;
  generateAndDownloadFile(fileId: string): Promise<{ fileName: string; content: string }[]>;
  discardFile(fileId: string): Promise<void>;
  confirmPaid(documentId: string): Promise<void>;

  openDocument(documentId: string): void;
  downloadFile(fileName: string, content: string): void;
  formatMoney(value: number | null): string;
  formatDate(iso: string | null): string;
}
