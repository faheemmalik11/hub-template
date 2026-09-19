export interface OutgoingInvoicesLabels {
  title: string;
  subtitle: string;
  uploadButton: string;
  volumeLine: (count: number, sum: string) => string;
  searchPlaceholder: string;
  companyLabel: string;
  companyAll: string;
  statusLabel: string;
  statusAll: string;
  statusDraft: string;
  statusOpen: string;
  statusOverdue: string;
  statusPaid: string;
  statusVoided: string;
  queueOpenLabel: string;
  queueOpenDescription: string;
  queueOverdueLabel: string;
  queueOverdueDescription: string;
  queuePaidLabel: string;
  queuePaidDescription: string;
  columnNumber: string;
  columnCustomer: string;
  columnCompany: string;
  columnDate: string;
  columnDue: string;
  columnAmount: string;
  columnStatus: string;
  draftPlaceholder: string;
  empty: string;
  viewFile: string;
  deleteButton: string;
  deleteDialogTitle: string;
  deleteDialogDescription: string;
  deleteCancel: string;
  deleteConfirm: string;
  deletedToast: string;
  statusUpdated: string;
  sortLabel: string;
  sortAscending: string;
  sortDescending: string;
}

export const englishOutgoingInvoicesLabels: OutgoingInvoicesLabels = {
  title: "Outgoing invoices",
  subtitle: "Invoices issued to your customers.",
  uploadButton: "Upload invoice",
  volumeLine: (count, sum) => `${count} invoices, ${sum} total.`,
  searchPlaceholder: "Search customer or invoice number",
  companyLabel: "Company",
  companyAll: "All companies",
  statusLabel: "Status",
  statusAll: "All statuses",
  statusDraft: "Draft",
  statusOpen: "Open",
  statusOverdue: "Overdue",
  statusPaid: "Paid",
  statusVoided: "Voided",
  queueOpenLabel: "Open",
  queueOpenDescription: "Sent, not yet due.",
  queueOverdueLabel: "Overdue",
  queueOverdueDescription: "Past their due date.",
  queuePaidLabel: "Paid",
  queuePaidDescription: "Settled.",
  columnNumber: "Number",
  columnCustomer: "Customer",
  columnCompany: "Company",
  columnDate: "Date",
  columnDue: "Due",
  columnAmount: "Amount",
  columnStatus: "Status",
  draftPlaceholder: "Draft",
  empty: "No outgoing invoices found.",
  viewFile: "View file",
  deleteButton: "Delete",
  deleteDialogTitle: "Delete this invoice?",
  deleteDialogDescription: "This cannot be undone.",
  deleteCancel: "Cancel",
  deleteConfirm: "Delete",
  deletedToast: "Invoice deleted.",
  statusUpdated: "Status updated.",
  sortLabel: "Sort by",
  sortAscending: "Ascending",
  sortDescending: "Descending",
};
