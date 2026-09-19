import { useMemo, useState } from "react";

/** How much of the current page is ticked. Drives the header checkbox. */
export type PageSelectionState = "none" | "some" | "all";

export interface RowSelection<Row> {
  selectedIds: string[];
  selectedCount: number;
  selectedRows: Row[];
  /** Rows on this page the caller allows to be ticked at all. */
  selectableCount: number;
  pageState: PageSelectionState;
  isSelected: (id: string) => boolean;
  isSelectable: (row: Row) => boolean;
  toggleRow: (id: string) => void;
  togglePage: () => void;
  clear: () => void;
}

/**
 * Ticked rows for one page of a table.
 *
 * Selection is per page on purpose. A bulk action is checked against the rows themselves, and only
 * the rows on screen are in hand, so a selection spanning pages would act on invoices nobody could
 * review first. `resetKey` describes what is on screen, filters, sort and page number included:
 * when it changes the selection is dropped.
 *
 * `selectable` marks the rows an action can apply to. Rows it rejects cannot be ticked, and the
 * header checkbox covers only the rest, so one click never arms a row the action would refuse.
 */
export function useRowSelection<Row>(
  pageRows: Row[],
  options: {
    rowId: (row: Row) => string;
    resetKey: string;
    selectable?: (row: Row) => boolean;
  },
): RowSelection<Row> {
  const { rowId, resetKey, selectable } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [seenResetKey, setSeenResetKey] = useState(resetKey);

  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setSelectedIds(new Set());
  }

  const selectableRows = useMemo(
    () => (selectable ? pageRows.filter(selectable) : pageRows),
    [pageRows, selectable],
  );
  const selectableIds = useMemo(() => selectableRows.map(rowId), [selectableRows, rowId]);

  const tickedHere = selectableIds.filter((id) => selectedIds.has(id));
  const pageState: PageSelectionState =
    tickedHere.length === 0 ? "none" : tickedHere.length === selectableIds.length ? "all" : "some";

  function toggleRow(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds(pageState === "all" ? new Set() : new Set(selectableIds));
  }

  function clear() {
    setSelectedIds(new Set());
  }

  return {
    selectedIds: [...selectedIds],
    selectedCount: selectedIds.size,
    selectedRows: pageRows.filter((row) => selectedIds.has(rowId(row))),
    selectableCount: selectableIds.length,
    pageState,
    isSelected: (id: string) => selectedIds.has(id),
    isSelectable: (row: Row) => (selectable ? selectable(row) : true),
    toggleRow,
    togglePage,
    clear,
  };
}
