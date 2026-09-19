import type { DimensionKey } from "../../adapters/assignment-rules";
import {
  englishPaginationLabels,
  type PaginationLabels,
} from "../../components/feedback/table-pagination";

export interface AssignmentRulesLabels {
  dimension: Record<DimensionKey, string>;
  reference: string;
  any: string;

  tabs: {
    rules: string;
    playground: string;
  };

  toolbar: {
    search: string;
    newRule: string;
  };

  empty: {
    title: string;
    hint: string;
    noMatches: string;
    noMatchesHint: string;
  };

  card: {
    value: string;
    scope: string;
    impact: string;
    active: string;
    actions: string;
  };

  row: {
    edit: string;
    delete: string;
    active: string;
    inactive: string;
    flagInactive: string;
  };

  impact: {
    loading: string;
    summary: (change: number, total: number) => string;
    apply: string;
    applyTitle: string;
    applyDescription: (change: number, total: number) => string;
    applyNone: string;
    applyConfirm: (count: number) => string;
    cancel: string;
  };

  editor: {
    category: string;
    categoryPlaceholder: string;
    reference: string;
    referencePlaceholder: string;
    referenceHint: string;
    scopeRequired: string;
    categoryRequired: string;
    duplicate: string;
    preview: (change: number, total: number) => string;
    previewNone: string;
    save: string;
    saving: string;
    cancel: string;
  };

  remove: {
    title: string;
    description: string;
    reason: string;
    reasonPlaceholder: string;
    confirm: string;
    cancel: string;
  };

  tester: {
    title: string;
    hint: string;
    reference: string;
    referencePlaceholder: string;
    check: string;
    reset: string;
    idle: string;
    idleHint: string;
    winnerHeading: string;
    outrankedTitle: string;
    alsoMatching: (count: number) => string;
    onlyMatch: string;
    none: string;
    noneHint: string;
  };

  pagination: PaginationLabels;

  toast: {
    saved: string;
    deleted: string;
    activated: string;
    deactivated: string;
    applied: (changed: number, matches: number) => string;
    appliedSkipped: (changed: number, matches: number, skipped: number) => string;
    appliedNone: string;
    failed: (error: string) => string;
  };
}

export const englishAssignmentRulesLabels: AssignmentRulesLabels = {
  dimension: {
    supplier: "Supplier",
    businessLine: "Business line",
    property: "Property",
    company: "Company",
  },
  reference: "Payment reference",
  any: "No scope set",

  tabs: {
    rules: "Rules",
    playground: "Playground",
  },

  toolbar: {
    search: "Search rules",
    newRule: "New rule",
  },

  empty: {
    title: "No rules yet",
    hint: "A rule assigns a category to invoices that match its scope.",
    noMatches: "No rules match your search",
    noMatchesHint: "Try a different term or clear the search.",
  },

  card: {
    value: "Category",
    scope: "When",
    impact: "Effect",
    active: "Active",
    actions: "Actions",
  },

  row: {
    edit: "Edit rule",
    delete: "Delete rule",
    active: "Rule is active",
    inactive: "Rule is switched off",
    flagInactive: "This rule is switched off and is skipped during assignment.",
  },

  impact: {
    loading: "…",
    summary: (change, total) => `${change} of ${total} would change`,
    apply: "Apply",
    applyTitle: "Apply this rule now?",
    applyDescription: (change, total) =>
      `This would change ${change} of ${total} matching invoices.`,
    applyNone: "This rule would not change anything right now.",
    applyConfirm: (count) => `Apply to ${count}`,
    cancel: "Cancel",
  },

  editor: {
    category: "Category",
    categoryPlaceholder: "Choose a category",
    reference: "Payment reference contains",
    referencePlaceholder: "Optional text to match",
    referenceHint: "Matched as a substring of the payment reference, not case sensitive.",
    scopeRequired:
      "At least one attribute must be pinned, otherwise the rule would apply to every invoice.",
    categoryRequired: "Choose a category.",
    duplicate: "A rule for this combination already exists.",
    preview: (change, total) => `Would change ${change} of ${total} matching invoices.`,
    previewNone: "No matching invoices right now.",
    save: "Save",
    saving: "Saving …",
    cancel: "Cancel",
  },

  remove: {
    title: "Delete rule?",
    description: "The rule is switched off but stays readable in the history.",
    reason: "Reason for deleting",
    reasonPlaceholder: "Reason",
    confirm: "Delete",
    cancel: "Cancel",
  },

  tester: {
    title: "Test a scenario",
    hint: "Describe an invoice and check which rule would assign its category.",
    reference: "Payment reference",
    referencePlaceholder: "Optional text to match",
    check: "Check",
    reset: "Clear",
    idle: "Nothing checked yet",
    idleHint:
      "Fill in as much of the invoice as you know and choose Check. Anything left unset is treated as unrestricted, exactly as a rule treats an axis it does not pin.",
    winnerHeading: "This rule applies",
    outrankedTitle: "Also matched, but outranked",
    alsoMatching: (count) =>
      count === 1
        ? "1 other rule also matches but is outranked."
        : `${count} other rules also match but are outranked.`,
    onlyMatch: "No other rule matches.",
    none: "No rule applies.",
    noneHint: "The invoice keeps whatever category it already has.",
  },

  pagination: englishPaginationLabels,

  toast: {
    saved: "Saved.",
    deleted: "Deleted.",
    activated: "Rule activated.",
    deactivated: "Rule switched off.",
    applied: (changed, matches) => `Changed ${changed} of ${matches} invoices.`,
    appliedSkipped: (changed, matches, skipped) =>
      `Changed ${changed} of ${matches} invoices, skipped ${skipped} set by a person.`,
    appliedNone: "Nothing to change.",
    failed: (error) => `Failed: ${error}`,
  },
};
