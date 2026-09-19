export interface TrashPageLabels {
  title: string;
  subtitle: string;
  empty: string;
  searchLabel: string;
  searchPlaceholder: string;
  allTypes: string;
  ageFilterLabel: string;
  anyAge: string;
  olderThanThirtyDays: string;
  olderThanNinetyDays: string;
  olderThanOneYear: string;
  deletedToday: string;
  deletedDaysAgo: (count: number) => string;
  deletedMonthsAgo: (count: number) => string;
  deletedYearsAgo: (count: number) => string;
  sortAscending: string;
  sortDescending: string;
  tableLabel: (tableName: string) => string;
  columns: {
    type: string;
    label: string;
    deletedAt: string;
    deletedBy: string;
    reason: string;
  };
  selection: {
    selectPage: string;
    selectRow: (label: string) => string;
    selectedCount: (count: number) => string;
    clearSelection: string;
    restoreSelected: (count: number) => string;
    purgeSelected: (count: number) => string;
    selectAllFiltered: (count: number) => string;
    allFilteredSelected: (count: number) => string;
    notPurgeableCount: (count: number) => string;
  };
  fullReason: {
    showMore: string;
    title: string;
  };
  restore: {
    action: string;
    title: string;
    description: (label: string) => string;
    reasonLabel: string;
    reasonPlaceholder: string;
    cancel: string;
    confirm: string;
    succeeded: (label: string) => string;
    failed: (error: string) => string;
    manySucceeded: (count: number) => string;
  };
  purge: {
    action: string;
    title: string;
    description: (label: string) => string;
    cancel: string;
    confirm: string;
    lockedReason: (tableName: string) => string;
    manyTitle: (count: number) => string;
    manyDescription: (count: number) => string;
    succeeded: (label: string) => string;
    failed: (error: string) => string;
    manySucceeded: (count: number) => string;
  };
}

export const englishTrashPageLabels: TrashPageLabels = {
  title: "Trash",
  subtitle: "Deleted records that are restorable or permanently deletable.",
  empty: "Trash is empty.",
  searchLabel: "Search the trash",
  searchPlaceholder: "Search label, reason or person",
  allTypes: "All types",
  ageFilterLabel: "Age",
  anyAge: "Any age",
  olderThanThirtyDays: "Older than 30 days",
  olderThanNinetyDays: "Older than 90 days",
  olderThanOneYear: "Older than 1 year",
  deletedToday: "deleted today",
  deletedDaysAgo: (count) => `${count} ${count === 1 ? "day" : "days"} ago`,
  deletedMonthsAgo: (count) => `${count} ${count === 1 ? "month" : "months"} ago`,
  deletedYearsAgo: (count) => `${count} ${count === 1 ? "year" : "years"} ago`,
  sortAscending: "sort ascending",
  sortDescending: "sort descending",
  tableLabel: (tableName) => tableName,
  columns: {
    type: "Type",
    label: "Label",
    deletedAt: "Deleted on",
    deletedBy: "Deleted by",
    reason: "Reason",
  },
  selection: {
    selectPage: "Select all on this page",
    selectRow: (label) => `Select '${label}'`,
    selectedCount: (count) => `${count} selected`,
    clearSelection: "Clear selection",
    restoreSelected: (count) => `Restore (${count})`,
    purgeSelected: (count) => `Delete permanently (${count})`,
    selectAllFiltered: (count) => `Select all ${count} entries`,
    allFilteredSelected: (count) => `All ${count} entries are selected.`,
    notPurgeableCount: (count) =>
      `${count} of the selected records cannot be permanently deleted; they stay in the trash.`,
  },
  fullReason: {
    showMore: "Show the full reason",
    title: "Deletion reason",
  },
  restore: {
    action: "Restore",
    title: "Restore",
    description: (label) =>
      `'${label}' goes back into the active list and takes effect immediately: rules start matching again, invoices re-enter the workflow.`,
    reasonLabel: "Reason (optional)",
    reasonPlaceholder: "Why is this being restored?",
    cancel: "Cancel",
    confirm: "Restore",
    succeeded: (label) => `'${label}' restored.`,
    failed: (error) => `Restore failed: ${error}`,
    manySucceeded: (count) => `${count} ${count === 1 ? "record" : "records"} restored.`,
  },
  purge: {
    action: "Delete permanently",
    title: "Delete permanently",
    description: (label) => `'${label}' will be deleted irreversibly. This cannot be undone.`,
    cancel: "Cancel",
    confirm: "Delete permanently",
    lockedReason: (tableName) =>
      tableName === "invoices"
        ? "Invoices cannot be permanently deleted: retention rules only allow deactivating them. Restoring is still possible."
        : "Cannot be permanently deleted: other records still reference this one. Restoring is still possible.",
    manyTitle: (count) => `Delete ${count} ${count === 1 ? "record" : "records"} permanently`,
    manyDescription: (count) =>
      `${count} ${count === 1 ? "record" : "records"} will be deleted irreversibly. This cannot be undone.`,
    succeeded: (label) => `'${label}' permanently deleted.`,
    failed: (error) => `Delete failed: ${error}`,
    manySucceeded: (count) => `${count} ${count === 1 ? "record" : "records"} permanently deleted.`,
  },
};
