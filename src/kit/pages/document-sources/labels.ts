export interface DocumentSourcesLabels {
  title: string;
  howItWorks?: string;
  learnMore?: string;
  addSourceTitle?: string;
  addSourceDetail?: string;
  subtitle: string;
  filingActive: string;
  filingActiveDetail: string;
  filingInactive: string;
  filingInactiveDetail: string;
  lastRun: string;
  viewLogs: string;
  sourcesTitle: string;
  noSources: string;
  statusConnected: string;
  statusNotConnected: string;
  statusNotConfigured: string;
  edit: string;
  open?: string;
  connect: string;
  setUp: string;
  /** The "run now" button. Absent labels hide it as surely as an absent adapter method. */
  runNow?: string;
  runNowAsked?: string;
  runNowRunning?: string;
  runNowFound?: (count: number) => string;
  runNowFailed?: string;
  /** Which folders a run reads or read, shown under the card: "Reading Pleo, Archiv 2025". */
  runNowReadingFolders?: (names: string) => string;
  /** What a run without picked folders reads; falls back to `runNowDialog.defaultRun`. */
  runNowReadingUsual?: string;
  /** The dialog a channel with folders opens. Absent labels fall back to these English ones. */
  runNowDialog?: {
    title: (sourceName: string) => string;
    description: string;
    defaultRun: string;
    defaultRunHint: string;
    chosenFolders: string;
    chosenFoldersHint: string;
    limits: string;
    cancel: string;
    start: string;
    starting: string;
  };
  footerTitle: string;
  footerDetail: string;
  nextRun?: string;
  sheet: {
    close: string;
    refreshOptions: string;
    optionsLoading: string;
    optionsFailed: string;
    unknownValue?: (shortId: string) => string;
    recentRuns?: string;
    selectedCount?: (count: number) => string;
    searchPlaceholder?: string;
    noMatch?: string;
    lastChangedBy: (name: string) => string;
    adminOnly: string;
    testConnection: string;
    testRunning: string;
    advanced: string;
    none: string;
    cancel: string;
    save: string;
    saving: string;
    saveFailed: string;
    saved: string;
  };
}

export const englishDocumentSourcesLabels: DocumentSourcesLabels = {
  title: "Document sources & filing",
  howItWorks: "How it works",
  learnMore: "Learn more about filing",
  addSourceTitle: "Add document source",
  addSourceDetail: "Email, cloud storage and more",
  subtitle: "Choose where documents are collected from and what happens to them after processing.",
  filingActive: "Filing is active",
  filingActiveDetail: "Documents are being collected from your connected sources.",
  filingInactive: "Filing is paused",
  filingInactiveDetail: "No documents are being collected right now.",
  lastRun: "Last run",
  viewLogs: "View logs",
  sourcesTitle: "Document sources",
  noSources: "No sources are set up for this project.",
  statusConnected: "Connected",
  statusNotConnected: "Not connected",
  statusNotConfigured: "Not configured",
  edit: "Edit",
  open: "Open",
  connect: "Connect",
  setUp: "Set up",
  runNow: "Run now",
  runNowAsked: "Asked for",
  runNowRunning: "Running…",
  runNowFound: (count: number) => (count === 1 ? "1 new document" : `${count} new documents`),
  runNowFailed: "Could not run",
  runNowReadingFolders: (names) => `Folders: ${names}`,
  runNowDialog: {
    title: (sourceName) => `Run ${sourceName} now`,
    description: "Read new documents now instead of waiting for the next scheduled run.",
    defaultRun: "The usual folders",
    defaultRunHint: "Exactly what the scheduled run reads.",
    chosenFolders: "Specific folders",
    chosenFoldersHint: "Look for documents that were never imported, for example in an archive.",
    limits:
      "Documents already imported are skipped. The client's start date and run limit apply to this run as a whole.",
    cancel: "Cancel",
    start: "Run now",
    starting: "Asking…",
  },
  footerTitle: "Configurations are used by the filing service",
  footerDetail: "Changes you make here are applied the next time documents are processed.",
  nextRun: "Next run",
  sheet: {
    close: "Close",
    refreshOptions: "Refresh",
    optionsLoading: "Loading…",
    optionsFailed: "The list could not be loaded. Saved values are kept.",
    unknownValue: (shortId) => `Unknown entry ${shortId}`,
    recentRuns: "Recent runs",
    selectedCount: (count) => `${count} selected`,
    searchPlaceholder: "Search …",
    noMatch: "No match found.",
    lastChangedBy: (name) => `Last changed by ${name}`,
    adminOnly: "Only administrators can change these settings.",
    testConnection: "Test connection",
    testRunning: "Testing…",
    advanced: "Advanced settings",
    none: "(none)",
    cancel: "Cancel",
    save: "Save changes",
    saving: "Saving…",
    saveFailed: "Saving failed. Please try again.",
    saved: "Saved.",
  },
};
