export type OutgoingInvoiceStatus = "draft" | "open" | "paidoff" | "voided";

export interface OutgoingInvoiceRecord {
  id: string;
  company_id: string | null;
  customer_name: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  due_date: string | null;
  amount_gross: number | null;
  voucher_status: OutgoingInvoiceStatus;
}

export interface OutgoingInvoiceAdapter {
  useInvoices(companyId?: string): {
    data: OutgoingInvoiceRecord[];
    loading: boolean;
    error: unknown;
  };
  useCompanyOptions(): { data: { id: string; code: string; name: string }[]; loading: boolean };

  setStatus(id: string, status: OutgoingInvoiceStatus): Promise<void>;
  softDelete(id: string): Promise<void>;

  openFile?: (invoiceId: string) => void;
  openUpload: () => void;

  formatMoney: (value: number | null) => string;
  formatDate: (iso: string | null) => string;
}
