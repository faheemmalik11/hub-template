export interface SupplierListLabels {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  statusAll: string;
  statusActive: string;
  statusDeleted: string;
  missingAddressToggle: (count: number) => string;
  columnName: string;
  columnAddress: string;
  columnIban: string;
  columnBooked: string;
  columnInvoiceCount: (count: number) => string;
  noAddress: string;
  unconfirmedAccount: string;
  deletedBadge: string;
  empty: string;
  newSupplierButton: string;
  newSupplierTitle: string;
  newSupplierDescription: string;
  nameFieldLabel: string;
  nameFieldPlaceholder: string;
  nameRequired: string;
  cancel: string;
  create: string;
  creating: string;
  createdToast: string;
  createFailedToast: (error: string) => string;
  sortLabel: string;
  sortAscending: string;
  sortDescending: string;
}

export const englishSupplierListLabels: SupplierListLabels = {
  title: "Suppliers",
  subtitle: "Every supplier the pipeline or a person has entered.",
  searchPlaceholder: "Search name or address",
  statusAll: "All",
  statusActive: "Active",
  statusDeleted: "Deleted",
  missingAddressToggle: (count) => `Missing address (${count})`,
  columnName: "Name",
  columnAddress: "Address",
  columnIban: "IBAN",
  columnBooked: "Booked total",
  columnInvoiceCount: (count) => `${count} invoice${count === 1 ? "" : "s"}`,
  noAddress: "No address",
  unconfirmedAccount: "New bank account, not yet confirmed",
  deletedBadge: "Deleted",
  empty: "No suppliers found.",
  newSupplierButton: "New supplier",
  newSupplierTitle: "New supplier",
  newSupplierDescription: "Add a supplier by hand.",
  nameFieldLabel: "Name",
  nameFieldPlaceholder: "Supplier name",
  nameRequired: "Name is required.",
  cancel: "Cancel",
  create: "Create",
  creating: "Creating…",
  createdToast: "Supplier created.",
  createFailedToast: (error) => `Could not create the supplier: ${error}`,
  sortLabel: "Sort by",
  sortAscending: "Ascending",
  sortDescending: "Descending",
};
