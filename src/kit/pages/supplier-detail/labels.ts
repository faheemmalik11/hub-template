export interface SupplierDetailLabels {
  backToList: string;
  notFoundTitle: string;
  notFoundBody: (id: string) => string;
  deletedBanner: (date: string) => string;
  edit: string;
  save: string;
  cancel: string;
  saving: string;
  saved: string;
  saveFailed: (error: string) => string;
  fieldName: string;
  fieldVatId: string;
  fieldAddress: string;
  fieldPhone: string;
  fieldEmail: string;
  fieldContactPerson: string;
  deleteButton: string;
  deleteDialogTitle: string;
  deleteDialogDescription: string;
  deleteReasonPlaceholder: string;
  deleteConfirm: string;
  deletedToast: string;
  restoreButton: string;
  restoredToast: string;
  bankAccountsTitle: string;
  bankAccountsEmpty: string;
  addAccount: string;
  addAccountTitle: string;
  ibanField: string;
  bicField: string;
  bankNameField: string;
  addAccountConfirm: string;
  accountAdded: string;
  removeAccount: string;
  accountRemoved: string;
  setDefault: string;
  defaultBadge: string;
  copyAccount: string;
  copiedToast: string;
  invoicesTitle: string;
  invoicesEmpty: string;
  invoiceNumber: (nr: string) => string;
  noInvoiceNumber: string;
}

export const englishSupplierDetailLabels: SupplierDetailLabels = {
  backToList: "Back to suppliers",
  notFoundTitle: "Supplier not found",
  notFoundBody: (id) => `No supplier matches "${id}".`,
  deletedBanner: (date) => `Deleted on ${date}.`,
  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  saving: "Saving…",
  saved: "Saved.",
  saveFailed: (error) => `Save failed: ${error}`,
  fieldName: "Name",
  fieldVatId: "VAT ID",
  fieldAddress: "Address",
  fieldPhone: "Phone",
  fieldEmail: "Email",
  fieldContactPerson: "Contact person",
  deleteButton: "Delete",
  deleteDialogTitle: "Delete this supplier?",
  deleteDialogDescription: "This moves the supplier to trash. It can be restored later.",
  deleteReasonPlaceholder: "Reason (optional)",
  deleteConfirm: "Delete",
  deletedToast: "Supplier deleted.",
  restoreButton: "Restore",
  restoredToast: "Supplier restored.",
  bankAccountsTitle: "Bank accounts",
  bankAccountsEmpty: "No bank accounts on file.",
  addAccount: "Add account",
  addAccountTitle: "Add a bank account",
  ibanField: "IBAN",
  bicField: "BIC",
  bankNameField: "Bank name",
  addAccountConfirm: "Add",
  accountAdded: "Account added.",
  removeAccount: "Remove",
  accountRemoved: "Account removed.",
  setDefault: "Set as default",
  defaultBadge: "Default",
  copyAccount: "Copy account details",
  copiedToast: "Copied.",
  invoicesTitle: "Invoices",
  invoicesEmpty: "No invoices from this supplier yet.",
  invoiceNumber: (nr) => `No. ${nr}`,
  noInvoiceNumber: "No invoice number",
};
