import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface TableView<Row> {
  pageRows: Row[];
  sort: string;
  direction: SortDirection;
  setSort: (key: string) => void;
  setDirection: (direction: SortDirection) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

// Client-side sort and pagination for small lists; resetKey returns to page 1 when it changes.
export function useTableView<Row>(
  rows: Row[],
  options: {
    sortValue: (row: Row, key: string) => string | number;
    initialSort: string;
    initialDirection?: SortDirection;
    initialPageSize?: number;
    resetKey?: string;
  },
): TableView<Row> {
  const {
    sortValue,
    initialSort,
    initialDirection = "asc",
    initialPageSize = 25,
    resetKey,
  } = options;
  const [sort, setSortState] = useState(initialSort);
  const [direction, setDirectionState] = useState<SortDirection>(initialDirection);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Adjust state during render so a filter change lands on page 1 without an extra paint.
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setPage(1);
  }

  const sortedRows = useMemo(() => {
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
  }, [rows, sort, direction, sortValue]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function setSort(key: string) {
    setSortState(key);
    setPage(1);
  }
  function setDirection(next: SortDirection) {
    setDirectionState(next);
    setPage(1);
  }

  return {
    pageRows,
    sort,
    direction,
    setSort,
    setDirection,
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
