import type { QueryResult } from "../lib/query-result";

export interface Customer {
  id: string;
  companyId: string;
  isCompany: boolean;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressZip: string | null;
  addressCity: string | null;
  vatId: string | null;
  customerNumber: string | null;
  updatedAt: string;
}

export interface CustomerCompany {
  id: string;
  code: string;
  name: string;
}

export type CustomerInvoiceStatus = "draft" | "open" | "paid" | "voided";

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amountGross: number | null;
  status: CustomerInvoiceStatus;
}

export interface CustomerInvoiceTotals {
  invoiceCount: number;
  totalAmount: number;
  overdueCount: number;
}

export interface NewCustomerInput {
  companyId: string;
  isCompany: boolean;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressZip: string | null;
  addressCity: string | null;
  vatId: string | null;
}

export interface CustomerUpdateInput {
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressZip: string | null;
  addressCity: string | null;
  vatId: string | null;
  customerNumber: string | null;
}

export interface CustomersAdapter {
  useCustomers(): QueryResult<Customer[]>;
  useCustomer(customerId: string): QueryResult<Customer | null>;
  useCompanies(): QueryResult<CustomerCompany[]>;
  /** Pre-aggregated invoice totals for the list, keyed by customer id. */
  useInvoiceTotalsByCustomer(): QueryResult<Record<string, CustomerInvoiceTotals>>;
  useCustomerInvoices(customerId: string): QueryResult<CustomerInvoice[]>;
  createCustomer(input: NewCustomerInput): Promise<void>;
  updateCustomer(customerId: string, input: CustomerUpdateInput): Promise<void>;
  deleteCustomer(customerId: string, reason: string): Promise<void>;
  openCustomer(customerId: string): void;
  openCustomerList(): void;
}
