export interface SyncLogRow {
  id: string;
  createdAt: string;
  event: string;
  level: string;
  connectionId: string | null;
  message: string | null;
  counts: Record<string, unknown> | null;
}

export interface SyncLogFilter {
  event?: string;
  level?: string;
  connectionId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  refreshMs: number;
}

export interface SyncLogAdapter {
  useLogsPage(filter: SyncLogFilter): {
    data: { rows: SyncLogRow[]; total: number } | undefined;
    isFetching: boolean;
    dataUpdatedAt: number;
    error: unknown;
    refetch: () => void;
  };
  useFacets(): { data: { events: string[]; levels: string[] } | undefined };
  useConnections(): { data: { id: string; label: string }[] };
  formatDateTime: (iso: string) => string;
  eventLabel: (event: string) => string;
  countLabel: (key: string) => string;
}
