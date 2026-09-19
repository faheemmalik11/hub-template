import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export function nextSortState(
  column: string,
  sort: string,
  direction: SortDirection,
): { sort: string; direction: SortDirection } {
  if (column === sort) {
    return { sort, direction: direction === "asc" ? "desc" : "asc" };
  }
  return { sort: column, direction: "asc" };
}

export interface TableView<Row> {
  pageRows: Row[];
  sort: string;
  direction: SortDirection;
  setSort: (key: string) => void;
  setDirection: (direction: SortDirection) => void;
  toggleSort: (key: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

export function useTableView<Row>(
  rows: Row[],
  options: {
    sortValue: (row: Row, key: string) => string | number;
    initialSort: string;
    initialDirection?: SortDirection;
    initialPageSize?: number;
    resetKey?: string;
    /**
     * How many rows match in total, when `rows` is already one page from a server.
     *
     * Given, the hook stops sorting and slicing: the caller has done both in its query, and
     * doing it again here would reorder one page against itself and then cut it to a page of a
     * page. Sort and page state still live here, so the same header and pager drive both modes.
     */
    totalRows?: number;
  },
): TableView<Row> {
  const {
    sortValue,
    initialSort,
    initialDirection = "asc",
    initialPageSize = 25,
    resetKey,
    totalRows,
  } = options;
  const servedByPage = totalRows !== undefined;
  const [sort, setSortState] = useState(initialSort);
  const [direction, setDirectionState] = useState<SortDirection>(initialDirection);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setPage(1);
  }

  const sortedRows = useMemo(() => {
    if (servedByPage) return rows;
    const copy = [...rows];
    copy.sort((first, second) => {
      const firstValue = sortValue(first, sort);
      const secondValue = sortValue(second, sort);
      const comparison =
        typeof firstValue === "number" && typeof secondValue === "number"
          ? firstValue - secondValue
          : String(firstValue).localeCompare(String(secondValue));
      return direction === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [rows, sort, direction, sortValue, servedByPage]);

  const total = servedByPage ? totalRows : sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageRows = servedByPage
    ? sortedRows
    : sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function setSort(key: string) {
    setSortState(key);
    setPage(1);
  }
  function setDirection(next: SortDirection) {
    setDirectionState(next);
    setPage(1);
  }
  function toggleSort(key: string) {
    const next = nextSortState(key, sort, direction);
    setSortState(next.sort);
    setDirectionState(next.direction);
    setPage(1);
  }

  return {
    pageRows,
    sort,
    direction,
    setSort,
    setDirection,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    from,
    to,
  };
}
