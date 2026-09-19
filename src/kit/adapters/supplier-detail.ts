export interface SupplierRecord {
  id: string;
  name: string;
  vat_id: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  created_at: string;
}

export interface SupplierBankAccountRecord {
  id: string;
  iban: string;
  bic: string | null;
  bank_name: string | null;
  is_active: boolean;
  is_default: boolean;
  confirmed_at?: string | null;
}

export interface SupplierInvoiceRow {
  id: string;
  invoiceNumber: string | null;
  documentDate: string | null;
  amountGross: number | null;
  status: string | null;
  paidAt: string | null;
}

export interface NewSupplierBankAccount {
  iban: string;
  bic: string;
  bankName: string;
}

export interface SupplierDetailAdapter {
  useSupplier(id: string): {
    data: SupplierRecord | undefined;
    loading: boolean;
    error: unknown;
    refetch: () => void;
  };
  useInvoices(supplierId: string): { data: SupplierInvoiceRow[]; loading: boolean };

  canEdit: boolean;
  updateSupplier(id: string, changes: Record<string, unknown>): Promise<void>;
  softDelete(id: string, reason: string): Promise<void>;
  restore(id: string): Promise<void>;

  openInvoice: (invoiceId: string) => void;
  openSupplierList: () => void;

  bankAccounts?: {
    useAccounts(supplierId: string): { data: SupplierBankAccountRecord[]; loading: boolean };
    addAccount(supplierId: string, account: NewSupplierBankAccount): Promise<void>;
    deleteAccount(accountId: string): Promise<void>;
    setDefault(supplierId: string, accountId: string): Promise<void>;
  };
}
