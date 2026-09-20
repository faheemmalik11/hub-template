import { useEffect, useMemo, useState } from "react";

import type { ProcessingLogAdapter, ProcessingLogEntry } from "../../adapters/processing-log";

export const ALL_STATUSES = "__all";

export const LOG_PERIODS = {
  all: "all",
  today: "today",
  sevenDays: "sevenDays",
  thirtyDays: "thirtyDays",
} as const;

export type LogPeriod = (typeof LOG_PERIODS)[keyof typeof LOG_PERIODS];

export interface LogView {
  searchInput: string;
  setSearchInput: (value: string) => void;
  searchTerm: string;
  searchIgnored: boolean;

  statusFilter: string;
  setStatusFilter: (value: string) => void;
  statusValues: string[];
  counts: Record<string, number>;

  period: LogPeriod;
  setPeriod: (period: LogPeriod) => void;

  rows: ProcessingLogEntry[];
  total: number;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  retry: () => void;
  countsLoading: boolean;

  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;
  firstShown: number;
  lastShown: number;
}

export function useLogView(adapter: ProcessingLogAdapter, initialPeriod: LogPeriod): LogView {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedTerm(searchInput);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [period, setPeriod] = useState<LogPeriod>(initialPeriod);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, period, pageSize]);

  const bounds = useMemo(() => periodBounds(period), [period]);

  const logQuery = adapter.useLogPage({
    search: searchTerm,
    status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
    page,
    pageSize,
  });
  const countsQuery = adapter.useStatusCounts({
    search: searchTerm,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
  });

  const total = logQuery.data?.total ?? 0;
  const counts = useMemo(() => countsQuery.data ?? {}, [countsQuery.data]);

  return {
    searchInput,
    setSearchInput,
    searchTerm,
    searchIgnored: adapter.searchTermWasIgnored(searchTerm),

    statusFilter,
    setStatusFilter,
    statusValues: useMemo(
      () => Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)),
      [counts],
    ),
    counts,

    period,
    setPeriod,

    rows: logQuery.data?.rows ?? [],
    total,
    loading: logQuery.isLoading,
    refreshing: logQuery.isRefreshing ?? false,
    error: logQuery.isError ? logQuery.error : undefined,
    retry: logQuery.refetch,
    countsLoading: countsQuery.isLoading,

    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    firstShown: total === 0 ? 0 : (page - 1) * pageSize + 1,
    lastShown: Math.min(page * pageSize, total),
  };
}

/** Typing must not fire a query per keystroke. */
export function useDebouncedTerm(input: string): string {
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  return term;
}

export function isoToday(): string {
  return isoDaysAgo(0);
}

export function periodBounds(period: LogPeriod): {
  fromDate: string | null;
  toDate: string | null;
} {
  if (period === LOG_PERIODS.today) return { fromDate: isoDaysAgo(0), toDate: isoDaysAgo(0) };
  if (period === LOG_PERIODS.sevenDays) return { fromDate: isoDaysAgo(6), toDate: isoDaysAgo(0) };
  if (period === LOG_PERIODS.thirtyDays) return { fromDate: isoDaysAgo(29), toDate: isoDaysAgo(0) };
  return { fromDate: null, toDate: null };
}

function isoDaysAgo(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
