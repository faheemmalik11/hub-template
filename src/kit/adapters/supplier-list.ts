import type { SupplierRecord } from "./supplier-detail";

export interface SupplierListRow extends SupplierRecord {
  bookedTotal: number;
  invoiceCount: number;
  hasUnconfirmedAccount: boolean;
}

export interface NewSupplierInput {
  name: string;
}

export interface SupplierListAdapter {
  useSuppliers(includeDeleted: boolean): {
    data: SupplierListRow[];
    loading: boolean;
    error: unknown;
  };
  canCreate: boolean;
  createSupplier(input: NewSupplierInput): Promise<{ id: string }>;
  openSupplier: (supplierId: string) => void;
}
