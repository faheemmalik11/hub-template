export interface PaymentFileLabels {
  title: string;
  description: string;
  manualUploadNotice: string;
  stepsAriaLabel: string;
  steps: {
    prepare: { title: string; subtitle: string };
    review: { title: string; subtitle: string };
    track: { title: string; subtitle: string };
  };
  manageAccounts: string;
  payFrom: { label: string; manage: string; missing: string };
  prepare: {
    title: string;
    description: string;
    searchPlaceholder: string;
    empty: string;
    noResults: string;
    selectAll: string;
    colSupplier: string;
    colInvoiceNumber: string;
    colAmount: string;
    colDueDate: string;
    colPaymentAmount: string;
    discountBadge: string;
    noInvoiceNumber: string;
  };
  draft: {
    title: string;
    selected: string;
    invoiceTotal: string;
    discountTotal: string;
    paymentTotal: string;
    unselectedHint: (count: number) => string;
    selectHint: string;
    build: string;
    building: string;
    buildDisabledNoInvoices: string;
  };
  accounts: {
    title: string;
    empty: string;
    default: string;
    setDefault: string;
    edit: string;
    delete: string;
    add: string;
    close: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    deleteConfirmCancel: string;
    deleteConfirmConfirm: string;
  };
  accountForm: {
    titleAdd: string;
    titleEdit: string;
    label: string;
    payerName: string;
    payerIban: string;
    payerBic: string;
    painVersion: string;
    executionDateRule: string;
    executionDateAsSoonAsPossible: string;
    executionDateOnDueDate: string;
    save: string;
    cancel: string;
    errorLabelRequired: string;
    errorNameRequired: string;
    errorIbanRequired: string;
    errorIbanInvalid: string;
    errorIbanNotSepa: string;
    errorBicInvalid: string;
  };
  review: {
    title: string;
    none: string;
    goToPrepare: string;
    colRecipient: string;
    colIban: string;
    colAmount: string;
    colStatus: string;
    downloadFile: string;
    discard: string;
    discardConfirmTitle: string;
    discardConfirmBody: string;
    discardConfirmCancel: string;
    discardConfirmConfirm: string;
    statusDraft: string;
    statusGenerated: string;
    statusDownloaded: string;
    statusDiscarded: string;
    skippedReason: (reason: string) => string;
  };
  track: {
    title: string;
    empty: string;
    colRecipient: string;
    colIban: string;
    colAmount: string;
    colFile: string;
  };
  history: {
    title: string;
    empty: string;
    colFile: string;
    colDate: string;
    colCount: string;
    colTotal: string;
    colStatus: string;
  };
  markPaid: string;
  markPaidConfirmTitle: string;
  markPaidConfirmBody: string;
  markPaidConfirmCancel: string;
  markPaidConfirmConfirm: string;
}

const SKIPPED_REASON_TEXT: Record<string, string> = {
  no_bank_account: "No confirmed bank account for this supplier",
  account_not_confirmed: "The supplier's bank account is not confirmed yet",
  iban_invalid: "The IBAN on file is not valid",
  iban_outside_sepa: "The IBAN is outside the SEPA area",
  bic_invalid: "The BIC on file is not valid",
  bic_country_mismatch: "The BIC does not match the IBAN's country",
  amount_missing: "There is no amount to pay",
  amount_above_maximum: "The amount is above what one transfer may carry",
  currency_not_euro: "The invoice is not in euro",
  direct_debit: "This is paid by direct debit, so it must not be transferred again",
  already_in_another_run: "This invoice is already queued in another payment file",
  recipient_name_empty: "The recipient has no name on file",
  duplicate_reference: "This invoice is listed twice in this file",
};

export const englishPaymentFileLabels: PaymentFileLabels = {
  title: "Payment file",
  description: "Build a SEPA file for approved invoices and download it to upload to your bank.",
  manualUploadNotice:
    "This page only creates a file. You download it and upload it to your bank yourself. No payment is sent automatically.",
  stepsAriaLabel: "Payment file steps",
  steps: {
    prepare: { title: "Prepare", subtitle: "Choose invoices and an account" },
    review: { title: "Review", subtitle: "Check the file before you download it" },
    track: { title: "Track", subtitle: "Confirm what the bank has paid" },
  },
  manageAccounts: "Manage accounts",
  payFrom: {
    label: "Pay from",
    manage: "Manage accounts",
    missing: "Add a payment account before you build a file.",
  },
  prepare: {
    title: "Approved invoices",
    description: "These invoices are approved and ready to be paid.",
    searchPlaceholder: "Search issuer or invoice number",
    empty: "No invoices are waiting to be paid.",
    noResults: "No invoices match your search.",
    selectAll: "Select all on this page",
    colSupplier: "Supplier",
    colInvoiceNumber: "Invoice number",
    colAmount: "Amount",
    colDueDate: "Due date",
    colPaymentAmount: "Amount to pay",
    discountBadge: "Discount applied",
    noInvoiceNumber: "No invoice number",
  },
  draft: {
    title: "This file so far",
    selected: "Invoices selected",
    invoiceTotal: "Invoice total",
    discountTotal: "Discount",
    paymentTotal: "Amount to pay",
    unselectedHint: (count) =>
      `${count} more invoice${count === 1 ? "" : "s"} could still be added.`,
    selectHint: "Select invoices on the left to build a file.",
    build: "Build file",
    building: "Building…",
    buildDisabledNoInvoices: "Select at least one invoice first.",
  },
  accounts: {
    title: "Payment accounts",
    empty: "No payment accounts yet.",
    default: "Default",
    setDefault: "Make default",
    edit: "Edit",
    delete: "Delete",
    add: "Add account",
    close: "Close",
    deleteConfirmTitle: "Delete this account?",
    deleteConfirmBody:
      "This account will no longer be offered. Files already built from it stay as they are.",
    deleteConfirmCancel: "Cancel",
    deleteConfirmConfirm: "Delete",
  },
  accountForm: {
    titleAdd: "Add a payment account",
    titleEdit: "Edit payment account",
    label: "Name",
    payerName: "Account holder",
    payerIban: "IBAN",
    payerBic: "BIC",
    painVersion: "File format",
    executionDateRule: "When to pay",
    executionDateAsSoonAsPossible: "As soon as possible",
    executionDateOnDueDate: "On the due date",
    save: "Save",
    cancel: "Cancel",
    errorLabelRequired: "Enter a name for this account.",
    errorNameRequired: "Enter the account holder's name.",
    errorIbanRequired: "Enter the account's IBAN.",
    errorIbanInvalid: "This is not a complete IBAN.",
    errorIbanNotSepa: "This IBAN is outside the SEPA area.",
    errorBicInvalid: "A BIC has 8 or 11 characters, for example MALADE51DKH.",
  },
  review: {
    title: "Review the file",
    none: "No file is selected yet.",
    goToPrepare: "Go to Prepare",
    colRecipient: "Recipient",
    colIban: "IBAN",
    colAmount: "Amount",
    colStatus: "Status",
    downloadFile: "Download file",
    discard: "Discard this file",
    discardConfirmTitle: "Discard this payment file?",
    discardConfirmBody: "The invoices in it become available to add to a new file.",
    discardConfirmCancel: "Cancel",
    discardConfirmConfirm: "Discard",
    statusDraft: "Draft",
    statusGenerated: "Generated",
    statusDownloaded: "Downloaded",
    statusDiscarded: "Discarded",
    skippedReason: (reason) => SKIPPED_REASON_TEXT[reason] ?? reason,
  },
  track: {
    title: "Waiting for bank confirmation",
    empty: "Nothing is waiting on a bank confirmation.",
    colRecipient: "Recipient",
    colIban: "IBAN",
    colAmount: "Amount",
    colFile: "File",
  },
  history: {
    title: "Payment files",
    empty: "No payment files yet.",
    colFile: "File",
    colDate: "Created",
    colCount: "Invoices",
    colTotal: "Total",
    colStatus: "Status",
  },
  markPaid: "Mark as paid",
  markPaidConfirmTitle: "Confirm this was paid?",
  markPaidConfirmBody: "Only confirm once your bank shows the transfer actually went through.",
  markPaidConfirmCancel: "Cancel",
  markPaidConfirmConfirm: "Confirm",
};
