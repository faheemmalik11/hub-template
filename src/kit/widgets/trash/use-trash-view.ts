import { useMemo, useState } from "react";

import type { TrashAdapter, TrashedRecord } from "../../adapters/trash";

export const ALL_TABLES = "__all";
const DEFAULT_PAGE_SIZE = 25;

export type TrashSortKey = "deletedAt" | "type" | "label";

export interface AgeOption {
  value: string;
  minimumDays: number;
}

export interface TrashView {
  tableFilter: string;
  setTableFilter: (value: string) => void;
  searchInput: string;
  setSearchInput: (value: string) => void;
  ageFilter: string;
  setAgeFilter: (value: string) => void;

  sortKey: TrashSortKey;
  sortAscending: boolean;
  sortBy: (key: TrashSortKey) => void;

  allRecords: TrashedRecord[];
  records: TrashedRecord[];
  visibleRecords: TrashedRecord[];
  loading: boolean;
  error: unknown;
  refetch: () => void;

  pageIndex: number;
  setPageIndex: (index: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;

  selectedKeys: Set<string>;
  selectedRecords: TrashedRecord[];
  wholePageSelected: boolean;
  pagePartlySelected: boolean;
  allFilteredSelected: boolean;
  moreThanOnePage: boolean;
  togglePageSelection: () => void;
  selectAllFiltered: () => void;
  toggleOne: (record: TrashedRecord) => void;
  clearSelection: () => void;
}

export function recordKey(record: TrashedRecord): string {
  return `${record.tableName}:${record.id}`;
}

export function ageInDays(deletedAt: string): number {
  return Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
}

/**
 * The trash list: what is shown, in what order, and what is ticked.
 *
 * Selection is kept by key rather than by index, so it survives filtering and paging: a person who
 * ticks something, then searches, has not silently changed what they are about to delete.
 */
export function useTrashView(adapter: TrashAdapter, ageOptions: readonly AgeOption[]): TrashView {
  const [tableFilter, setTableFilter] = useState<string>(ALL_TABLES);
  const [searchInput, setSearchInput] = useState("");
  const [ageFilter, setAgeFilter] = useState<string>("any");
  const [sortKey, setSortKey] = useState<TrashSortKey>("deletedAt");
  const [sortAscending, setSortAscending] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const recordsQuery = adapter.useTrashedRecords(
    tableFilter === ALL_TABLES ? undefined : tableFilter,
  );
  const allRecords = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);

  const records = useMemo(() => {
    const needle = searchInput.trim().toLowerCase();
    const minimumDays = ageOptions.find((option) => option.value === ageFilter)?.minimumDays ?? 0;
    const matches = allRecords.filter((record) => {
      if (minimumDays > 0 && ageInDays(record.deletedAt) < minimumDays) return false;
      if (!needle) return true;
      return `${record.label ?? ""} ${record.tableName} ${record.deleteReason ?? ""}`
        .toLowerCase()
        .includes(needle);
    });

    const direction = sortAscending ? 1 : -1;
    return [...matches].sort((a, b) => {
      if (sortKey === "deletedAt") {
        return direction * (new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime());
      }
      const left = sortKey === "type" ? a.tableName : (a.label ?? "");
      const right = sortKey === "type" ? b.tableName : (b.label ?? "");
      return direction * left.localeCompare(right);
    });
  }, [allRecords, searchInput, ageFilter, ageOptions, sortKey, sortAscending]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPageIndex = Math.min(pageIndex, totalPages - 1);
  const visibleRecords = records.slice(
    currentPageIndex * pageSize,
    currentPageIndex * pageSize + pageSize,
  );

  const visibleKeys = visibleRecords.map(recordKey);
  const wholePageSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));

  return {
    tableFilter,
    setTableFilter,
    searchInput,
    setSearchInput,
    ageFilter,
    setAgeFilter,

    sortKey,
    sortAscending,
    sortBy: (key) => {
      if (key === sortKey) {
        setSortAscending((ascending) => !ascending);
        return;
      }
      setSortKey(key);
      setSortAscending(key !== "deletedAt");
    },

    allRecords,
    records,
    visibleRecords,
    loading: recordsQuery.isLoading,
    error: recordsQuery.isError ? recordsQuery.error : undefined,
    refetch: recordsQuery.refetch,

    pageIndex: currentPageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    totalPages,

    selectedKeys,
    selectedRecords: records.filter((record) => selectedKeys.has(recordKey(record))),
    wholePageSelected,
    pagePartlySelected: !wholePageSelected && visibleKeys.some((key) => selectedKeys.has(key)),
    allFilteredSelected:
      records.length > 0 && records.every((record) => selectedKeys.has(recordKey(record))),
    moreThanOnePage: totalPages > 1,
    togglePageSelection: () =>
      setSelectedKeys((current) => {
        const next = new Set(current);
        if (wholePageSelected) visibleKeys.forEach((key) => next.delete(key));
        else visibleKeys.forEach((key) => next.add(key));
        return next;
      }),
    selectAllFiltered: () => setSelectedKeys(new Set(records.map(recordKey))),
    toggleOne: (record) =>
      setSelectedKeys((current) => {
        const next = new Set(current);
        const key = recordKey(record);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    clearSelection: () => setSelectedKeys(new Set()),
  };
}
