export interface OpenItemsLabels {
  title: string;
  subtitle: string;
  tabOpenItems: string;
  tabMissingReceipts: string;
  searchPlaceholder: string;
  companyAll: string;
  typeAll: string;
  typeIncoming: string;
  typeOutgoing: string;
  dueAll: string;
  dueSoon: string;
  dueOverdue: string;
  showBlocked: string;
  summary: (count: number, overdueCount: number, overdueAmount: string) => string;
  columnType: string;
  columnCounterparty: string;
  columnInvoice: string;
  columnAmount: string;
  columnMatched: string;
  columnReceived: string;
  columnDue: string;
  columnDiscount: string;
  daysOverdue: (days: number) => string;
  daysOld: (days: number) => string;
  discountUntil: (date: string, percent: number) => string;
  blockedBadge: string;
  emptyOpenItems: string;
  directionAll: string;
  directionIncoming: string;
  directionOutgoing: string;
  columnDate: string;
  columnAccount: string;
  columnSource: string;
  emptyMissing: string;
}

export const englishOpenItemsLabels: OpenItemsLabels = {
  title: "Bank reconciliation",
  subtitle: "Invoices still waiting on a payment, and payments still waiting on an invoice.",
  tabOpenItems: "Open items",
  tabMissingReceipts: "Missing receipts",
  searchPlaceholder: "Search counterparty",
  companyAll: "All companies",
  typeAll: "All",
  typeIncoming: "Incoming",
  typeOutgoing: "Outgoing",
  dueAll: "Any due date",
  dueSoon: "Due soon",
  dueOverdue: "Overdue",
  showBlocked: "Show items that can never be matched",
  summary: (count, overdueCount, overdueAmount) =>
    `${count} open, ${overdueCount} overdue totaling ${overdueAmount}.`,
  columnType: "Type",
  columnCounterparty: "Counterparty",
  columnInvoice: "Invoice",
  columnAmount: "Amount",
  columnMatched: "Matched",
  columnReceived: "Received",
  columnDue: "Due / age",
  columnDiscount: "Discount",
  daysOverdue: (days) => `${days}d overdue`,
  daysOld: (days) => `${days}d old`,
  discountUntil: (date, percent) => `${percent}% until ${date}`,
  blockedBadge: "Can't be matched",
  emptyOpenItems: "Nothing open.",
  directionAll: "All directions",
  directionIncoming: "Incoming",
  directionOutgoing: "Outgoing",
  columnDate: "Date",
  columnAccount: "Account",
  columnSource: "Source",
  emptyMissing: "No unmatched transactions.",
};
