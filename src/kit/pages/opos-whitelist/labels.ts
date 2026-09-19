export interface OposWhitelistLabels {
  title: string;
  subtitle: string;
  hint: string;
  readOnlyHint: string;
  reapplyButton: string;
  reapplying: string;
  reappliedToast: (count: number) => string;
  newRuleButton: string;
  searchPlaceholder: string;
  categoryAll: string;
  category: Record<string, string>;
  statusAll: string;
  statusActive: string;
  statusInactive: string;
  hitsAll: string;
  hitsWith: string;
  hitsWithout: string;
  resetFilters: string;
  shownOfTotal: (shown: number, total: number) => string;
  columnCategory: string;
  columnScope: string;
  columnTerm: string;
  columnHits: string;
  columnNote: string;
  columnCreated: string;
  columnActive: string;
  scope: Record<string, string>;
  shadowedBy: (term: string) => string;
  empty: string;
  noMatches: string;
  editRuleTitle: string;
  newRuleTitle: string;
  fieldTerm: string;
  fieldTermHint: (min: number) => string;
  fieldTermTooShort: (min: number) => string;
  fieldScope: string;
  fieldCategory: string;
  fieldNote: string;
  fieldNotePlaceholder: string;
  fieldActive: string;
  asciiSuggestion: (spelling: string) => string;
  cancel: string;
  save: string;
  saving: string;
  saveFailed: (error: string) => string;
  ruleSaved: string;
  editButton: string;
  deleteButton: string;
  deleteDialogTitle: string;
  deleteDialogDescriptionWithHits: (count: number) => string;
  deleteDialogDescription: string;
  deleteConfirm: string;
  deletedToast: string;
}

export const englishOposWhitelistLabels: OposWhitelistLabels = {
  title: "Excluded payments",
  subtitle: "Bank movements that will never have a receipt, kept out of the open-items list.",
  hint: "A rule hides any bank movement whose matched field contains the term. Deleting a rule brings its movements back into Bank reconciliation.",
  readOnlyHint: "You can view these rules but not change them.",
  reapplyButton: "Reapply all rules",
  reapplying: "Reapplying…",
  reappliedToast: (count) => `${count} transaction${count === 1 ? "" : "s"} updated.`,
  newRuleButton: "New rule",
  searchPlaceholder: "Search term or note",
  categoryAll: "All categories",
  category: {
    salary: "Salary",
    tax_prepayment: "Tax prepayment",
    private_withdrawal: "Private withdrawal",
    rebooking: "Rebooking",
    loan_installment: "Loan installment",
    fee_interest: "Fee / interest",
    atm_withdrawal: "ATM withdrawal",
    other: "Other",
  },
  statusAll: "All statuses",
  statusActive: "Active",
  statusInactive: "Inactive",
  hitsAll: "Any hit count",
  hitsWith: "With hits",
  hitsWithout: "Without hits",
  resetFilters: "Reset filters",
  shownOfTotal: (shown, total) => `${shown} of ${total} rules`,
  columnCategory: "Category",
  columnScope: "Matches",
  columnTerm: "Term",
  columnHits: "Hits",
  columnNote: "Note",
  columnCreated: "Created",
  columnActive: "Active",
  scope: {
    reference: "Reference",
    counterparty: "Counterparty",
    iban: "IBAN",
    booking_text: "Booking text",
    any: "Any field",
  },
  shadowedBy: (term) => `Already covered by "${term}"`,
  empty: "No rules yet.",
  noMatches: "No rules match these filters.",
  editRuleTitle: "Edit rule",
  newRuleTitle: "New rule",
  fieldTerm: "Term",
  fieldTermHint: (min) => `At least ${min} characters. Matched as plain text, case-insensitive.`,
  fieldTermTooShort: (min) => `Enter at least ${min} characters.`,
  fieldScope: "Matches",
  fieldCategory: "Category",
  fieldNote: "Note",
  fieldNotePlaceholder: "Why this rule exists (optional)",
  fieldActive: "Active",
  asciiSuggestion: (spelling) =>
    `Consider also adding "${spelling}" — German bank exports use both spellings.`,
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  saveFailed: (error) => `Could not save: ${error}`,
  ruleSaved: "Rule saved.",
  editButton: "Edit",
  deleteButton: "Delete",
  deleteDialogTitle: "Delete this rule?",
  deleteDialogDescriptionWithHits: (count) =>
    `${count} transaction${count === 1 ? "" : "s"} currently hidden by this rule will come back into Bank reconciliation.`,
  deleteDialogDescription: "This rule currently hides nothing.",
  deleteConfirm: "Delete",
  deletedToast: "Rule deleted.",
};
