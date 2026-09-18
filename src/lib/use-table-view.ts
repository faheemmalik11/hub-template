import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface TableView<T> {
  pageRows: T[];
  sort: string;
  dir: SortDir;
  setSort: (key: string) => void;
  setDir: (dir: SortDir) => void;
  /**
   * What a click on a sortable column header means: same column → flip the direction, a different
   * column → sort by it ascending. Every table header that sorts wants exactly this, so it lives
   * here rather than being re-derived next to each table.
   */
  toggleSort: (key: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

/**
 * Client-side sort + pagination for the small master-data lists (suppliers, companies,
 * properties). The caller supplies `sortValue(row, key)` returning a comparable value for the
 * active column — strings compare with German locale, numbers numerically. `resetKey` (e.g. the
 * search term) resets to the first page whenever it changes. Clicking a header toggles the sort
 * direction; picking a new column starts ascending.
 */
export function useTableView<T>(
  rows: T[],
  opts: {
    sortValue: (row: T, key: string) => string | number;
    initialSort: string;
    initialDir?: SortDir;
    initialPageSize?: number;
    resetKey?: string;
  },
): TableView<T> {
  const { sortValue, initialSort, initialDir = "asc", initialPageSize = 25, resetKey } = opts;
  const [sort, setSortState] = useState(initialSort);
  const [dir, setDirState] = useState<SortDir>(initialDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to the first page when the upstream filter changes (React-sanctioned
  // "adjust state during render" — no effect, no extra paint).
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setPage(1);
  }

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "de");
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [rows, sort, dir, sortValue]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Changing the sort field or direction returns to the first page.
  function setSort(key: string) {
    setSortState(key);
    setPage(1);
  }
  function setDir(next: SortDir) {
    setDirState(next);
    setPage(1);
  }
  function toggleSort(key: string) {
    if (key === sort) setDirState(dir === "asc" ? "desc" : "asc");
    else {
      setSortState(key);
      setDirState("asc");
    }
    setPage(1);
  }

  return {
    pageRows,
    sort,
    dir,
    setSort,
    setDir,
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
