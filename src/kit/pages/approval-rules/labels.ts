import type { DimensionKey } from "../../adapters/approval-rules";
import {
  englishPaginationLabels,
  type PaginationLabels,
} from "../../components/feedback/table-pagination";

export interface ApprovalRulesLabels {
  title: string;

  dimension: Record<DimensionKey, string>;
  any: string;
  tabs: {
    rules: string;
    scenario: string;
  };
  tester: {
    title: string;
    hint: string;
    amount: string;
    check: string;
    reset: string;

    idle: string;
    idleHint: string;
    winnerHeading: string;
    outrankedTitle: string;
    alsoMatching: (count: number) => string;
    onlyMatch: string;
    none: string;
    noneWhy: (chain: string) => string;
  };
  summary: {
    active: (count: number) => string;
    issues: (count: number) => string;

    issuesTitleText: string;
    issuesHint: string;
  };
  card: {
    when: string;
    amount: string;
    approvers: string;
    anyAmount: string;
    atLeast: (amount: string) => string;
    priority: string;
    priorityOf: (position: number, total: number) => string;
    actions: string;
  };
  ladder: {
    newRule: string;
    empty: string;
  };
  row: {
    edit: string;
    active: string;
    inactive: string;

    activeShort: string;
    inactiveBadge: string;
    flagInactive: string;
    flagStranded: string;
    flagOutranked: string;
    unknownApprover: string;
    deactivatedSuffix: string;

    autoStep: string;
  };
  editor: {
    minAmount: string;
    minAmountHint: string;
    chain: string;
    step: (index: number) => string;
    noFurtherStep: string;
    chooseApprover: string;
    scopeRequired: string;
    chainHint: string;
    sameApproverTwice: string;
    stepNeedsPrevious: string;
    duplicate: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
  };
  remove: {
    title: string;
    description: string;
    reason: string;
    reasonPlaceholder: string;
    confirm: string;
    cancel: string;
  };
  pagination: PaginationLabels;
  toast: {
    saved: string;
    deleted: string;
    activated: string;
    deactivated: string;
    failed: (error: string) => string;

    unknownError: string;
  };
}

export const englishApprovalRulesLabels: ApprovalRulesLabels = {
  title: "Approval rules",
  dimension: {
    supplier: "Supplier",
    businessLine: "Business line",
    property: "Property",
    company: "Company",
  },
  any: "any",
  tabs: {
    rules: "Rules",
    scenario: "Playground",
  },
  tester: {
    title: "Test a scenario",
    hint: "Describe an invoice and check which rule would approve it.",
    amount: "Gross amount",
    check: "Check",
    reset: "Clear",
    idle: "Nothing checked yet",
    idleHint:
      "Fill in as much of the invoice as you know and choose Check. Anything left on \u201cany\u201d is treated as unrestricted, exactly as a rule treats an axis it does not pin.",
    winnerHeading: "This rule applies",
    outrankedTitle: "Also matched, but outranked",
    alsoMatching: (count) =>
      count === 1
        ? "1 other rule also matches but is outranked."
        : `${count} other rules also match but are outranked.`,
    onlyMatch: "No other rule matches.",
    none: "No rule applies.",
    noneWhy: (chain) => `The invoice takes the default chain: ${chain}.`,
  },
  summary: {
    active: (count) => `${count} active`,
    issues: (count) => (count === 1 ? "1 configuration issue" : `${count} configuration issues`),
    issuesTitleText: "Configuration issues",
    issuesHint:
      "A rule counts as an issue when one of its steps names somebody who can no longer sign in. The rule still applies, so invoices routed to that step stop moving and nobody is told.",
  },
  card: {
    when: "When",
    amount: "Amount",
    approvers: "Approvers",
    anyAmount: "Any amount",
    atLeast: (amount) => `\u2265 ${amount}`,
    priority: "Priority",
    priorityOf: (position, total) => `${position} of ${total}`,
    actions: "Actions",
  },
  ladder: {
    newRule: "New rule",
    empty: "No rules yet.",
  },
  row: {
    edit: "Edit rule",
    active: "Rule is active",
    inactive: "Rule is switched off",
    activeShort: "Active",
    inactiveBadge: "Inactive",
    flagInactive: "This rule is switched off and is skipped during approval.",
    flagStranded: "A step names somebody who can no longer sign in, so invoices will sit here.",
    flagOutranked: "Matches the test but is outranked by a more specific rule.",
    unknownApprover: "Unknown",
    deactivatedSuffix: "deactivated",
    autoStep: "Area lead (automatic)",
  },
  editor: {
    minAmount: "From gross amount",
    minAmountHint:
      "This rule applies to invoices from this amount up; 0 means all of them. A rule's chain always applies whole: for staged approvals create two rules with the same scope and different amounts, and the matching rule with the highest amount wins.",
    chain: "Approval chain",
    step: (index) => `Step ${index}`,
    noFurtherStep: "(no further step)",
    chooseApprover: "Choose an approver",
    scopeRequired:
      "At least one attribute must be pinned, otherwise the rule would apply to every invoice.",
    chainHint:
      "The last step is the final approval and unlocks payment. The same person cannot appear twice in one chain.",
    sameApproverTwice: "Each person may appear only once in a chain.",
    stepNeedsPrevious: "This step requires the one before it.",
    duplicate: "A rule for this combination already exists.",
    save: "Save",
    saving: "Saving …",
    cancel: "Cancel",
    delete: "Delete rule",
  },
  remove: {
    title: "Delete rule?",
    description: "The rule is switched off but stays readable in the history.",
    reason: "Reason for deleting",
    reasonPlaceholder: "Reason",
    confirm: "Delete",
    cancel: "Cancel",
  },
  pagination: englishPaginationLabels,
  toast: {
    saved: "Saved.",
    deleted: "Deleted.",
    activated: "Rule activated.",
    deactivated: "Rule switched off.",
    failed: (error) => `Failed: ${error}`,
    unknownError: "Unknown error",
  },
};
