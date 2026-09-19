export interface ProcessingLogLabels {
  title: string;
  processingTab: string;
  changesTab: string;
  processingSubtitle: string;
  changesSubtitle: string;
  searchPlaceholder: string;
  changesSearchPlaceholder: string;
  statusFilterPlaceholder: string;
  allStatuses: string;
  periodPlaceholder: string;
  wholePeriod: string;
  today: string;
  lastSevenDays: string;
  lastThirtyDays: string;
  exportCsv: string;
  searchIgnoredNote: string;
  matchCount: (count: number) => string;
  changesCount: (count: number) => string;
  refreshing: string;
  empty: string;
  changesEmpty: string;
  clearFilter: string;
  filterByStatus: string;
  statusLabel: (status: string) => string;
  openInvoice: string;
  showDetails: string;
  verdictNeedsReview: string;
  verdictAccepted: string;
  columns: {
    time: string;
    subject: string;
    sender: string;
    status: string;
    reason: string;
    actions: string;
    actor: string;
    changeType: string;
    tableName: string;
    changeText: string;
  };
  detail: {
    title: string;
    subject: string;
    sender: string;
    status: string;
    reason: string;
    noReason: string;
    invoice: string;
    openInvoice: string;
    noInvoice: string;
  };
}

export const englishProcessingLogLabels: ProcessingLogLabels = {
  title: "Activity log",
  processingTab: "Document processing",
  changesTab: "Changes",
  processingSubtitle: "What the document pipeline did with each incoming mail and file.",
  changesSubtitle: "Who changed what inside the app, with the reason where one was given.",
  searchPlaceholder: "Search subject, sender or reason …",
  changesSearchPlaceholder: "Search actor or text …",
  statusFilterPlaceholder: "Status",
  allStatuses: "All statuses",
  periodPlaceholder: "Period",
  wholePeriod: "Whole period",
  today: "Today",
  lastSevenDays: "Last 7 days",
  lastThirtyDays: "Last 30 days",
  exportCsv: "Export CSV",
  searchIgnoredNote:
    "This search term only contains characters the search cannot use, so it was ignored.",
  matchCount: (count) => `${count} ${count === 1 ? "entry" : "entries"}`,
  changesCount: (count) => `${count} ${count === 1 ? "change" : "changes"}`,
  refreshing: "Updating …",
  empty: "No log entries found.",
  changesEmpty: "No changes found.",
  clearFilter: "Clear filter",
  filterByStatus: "Filter by this status",
  statusLabel: (status) => status,
  openInvoice: "Open invoice",
  showDetails: "Show details",
  verdictNeedsReview: "Needs review",
  verdictAccepted: "Accepted automatically",
  columns: {
    time: "Time",
    subject: "Subject",
    sender: "Sender",
    status: "Status",
    reason: "Reason",
    actions: "Actions",
    actor: "Actor",
    changeType: "Type",
    tableName: "Table",
    changeText: "Text",
  },
  detail: {
    title: "Log entry",
    subject: "Subject",
    sender: "Sender",
    status: "Status",
    reason: "Reason",
    noReason: "No reason was recorded.",
    invoice: "Invoice",
    openInvoice: "Open invoice",
    noInvoice: "No invoice was created from this entry.",
  },
};
