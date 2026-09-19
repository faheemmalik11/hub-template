export interface BankSyncLogLabels {
  title: string;
  allEvents: string;
  allLevels: string;
  allConnections: string;
  fromLabel: string;
  toLabel: string;
  resetFilters: string;
  refreshOff: string;
  refreshEvery: (minutes: number) => string;
  refreshNow: string;
  refreshing: string;
  nextRefreshIn: (time: string) => string;
  columnTime: string;
  columnEvent: string;
  columnLevel: string;
  columnConnection: string;
  columnDetails: string;
  empty: string;
}

export const englishBankSyncLogLabels: BankSyncLogLabels = {
  title: "Bank sync log",
  allEvents: "All events",
  allLevels: "All levels",
  allConnections: "All connections",
  fromLabel: "From",
  toLabel: "To",
  resetFilters: "Reset filters",
  refreshOff: "No auto-refresh",
  refreshEvery: (minutes) => `Every ${minutes} min`,
  refreshNow: "Refresh now",
  refreshing: "Refreshing…",
  nextRefreshIn: (time) => `Next refresh in ${time}`,
  columnTime: "Time",
  columnEvent: "Event",
  columnLevel: "Level",
  columnConnection: "Connection",
  columnDetails: "Details",
  empty: "No log entries in this range.",
};
