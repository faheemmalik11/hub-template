export interface ManualBookingsLabels {
  title: string;
  subtitle: string;
  hint: string;
  companyLabel: string;
  companyAll: string;
  yearLabel: string;
  yearInvalid: (min: number, max: number, fallback: number) => string;
  newBookingButton: string;
  searchPlaceholder: string;
  sortPeriodAsc: string;
  sortPeriodDesc: string;
  sortAmountDesc: string;
  sortAmountAsc: string;
  sortCategory: string;
  columnCompany: string;
  columnPeriod: string;
  columnCategory: string;
  columnProperty: string;
  columnNote: string;
  columnAmount: string;
  columnActions: string;
  recurringBadge: string;
  empty: string;
  editButton: string;
  deleteButton: string;
  deleteDialogTitle: string;
  deleteDialogDescription: string;
  deleteCancel: string;
  deleteConfirm: string;
  deletedToast: string;
  editDialogTitle: string;
  newDialogTitle: string;
  fieldCompany: string;
  fieldCategory: string;
  fieldProperty: string;
  propertyNone: string;
  fieldMonth: string;
  fieldYear: string;
  fieldAmount: string;
  fieldNote: string;
  fieldRecurring: string;
  fieldRecurringUntil: string;
  recurringUntilNone: string;
  cancel: string;
  save: string;
  saving: string;
  saveFailed: (error: string) => string;
  savedToast: string;
  endBeforeStart: string;
  endMonthNeedsYear: string;
}

export const englishManualBookingsLabels: ManualBookingsLabels = {
  title: "Manual bookings",
  subtitle: "Cost-side entries that have no invoice or bank transaction behind them.",
  hint: "Manual bookings flow into the evaluation on the same footing as receipts, in the category you pick.",
  companyLabel: "Company",
  companyAll: "All companies",
  yearLabel: "Year",
  yearInvalid: (min, max, fallback) =>
    `Enter a year between ${min} and ${max}. Showing ${fallback}.`,
  newBookingButton: "New booking",
  searchPlaceholder: "Search note, category, property…",
  sortPeriodAsc: "Period, earliest first",
  sortPeriodDesc: "Period, latest first",
  sortAmountDesc: "Amount, highest first",
  sortAmountAsc: "Amount, lowest first",
  sortCategory: "Category",
  columnCompany: "Company",
  columnPeriod: "Period",
  columnCategory: "Category",
  columnProperty: "Property",
  columnNote: "Note",
  columnAmount: "Amount",
  columnActions: "Actions",
  recurringBadge: "Recurring",
  empty: "No manual bookings for this year.",
  editButton: "Edit",
  deleteButton: "Delete",
  deleteDialogTitle: "Delete this booking?",
  deleteDialogDescription: "This cannot be undone.",
  deleteCancel: "Cancel",
  deleteConfirm: "Delete",
  deletedToast: "Booking deleted.",
  editDialogTitle: "Edit booking",
  newDialogTitle: "New booking",
  fieldCompany: "Company",
  fieldCategory: "Category",
  fieldProperty: "Property",
  propertyNone: "No property",
  fieldMonth: "Month",
  fieldYear: "Year",
  fieldAmount: "Amount",
  fieldNote: "Note",
  fieldRecurring: "Repeats every month",
  fieldRecurringUntil: "Until",
  recurringUntilNone: "No end date",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  saveFailed: (error) => `Could not save: ${error}`,
  savedToast: "Booking saved.",
  endBeforeStart: "The end period can't be before the start.",
  endMonthNeedsYear: "Pick a year for the end month too.",
};
