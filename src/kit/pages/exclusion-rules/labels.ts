import type { ExclusionScope } from "../../adapters/exclusion-rules";

export interface ExclusionRulesLabels {
  title: string;
  subtitle: string;
  newRuleButton: string;
  empty: string;
  columns: {
    scope: string;
    term: string;
    note: string;
    active: string;
  };
  scopeNames: Record<ExclusionScope, string>;
  scopeGroupBeforeReading: string;
  scopeGroupAfterReading: string;
  dialog: {
    title: string;
    description: string;
    scopeField: string;
    termField: string;
    termPlaceholder: string;
    noteField: string;
    notePlaceholder: string;
    cancel: string;
    save: string;
    saving: string;
    termRequired: string;
    created: string;
    createFailed: (error: string) => string;
  };
  toggle: {
    activated: string;
    deactivated: string;
    failed: (error: string) => string;
  };
  deleteDialog: {
    openButton: string;
    title: string;
    description: (term: string, scopeName: string) => string;
    cancel: string;
    confirm: string;
    deleted: string;
    failed: (error: string) => string;
  };
  impactPreview: {
    checking: string;
    failed: string;
    notAvailable: string;
    noMatches: (total: number) => string;
    matches: (count: number, total: number, percentText: string) => string;
  };
}

export const englishExclusionRulesLabels: ExclusionRulesLabels = {
  title: "Exclusion rules",
  subtitle:
    "Incoming mails and files that match one of these rules are skipped by the pipeline and never become invoices.",
  newRuleButton: "New rule",
  empty: "No exclusion rules yet.",
  columns: {
    scope: "Scope",
    term: "Term",
    note: "Note",
    active: "Active",
  },
  scopeNames: {
    sender: "Sender",
    subject: "Subject",
    filename: "File name",
    envelope: "Entire envelope",
    party: "Party",
    supplier: "Supplier",
    body: "Document text",
    company: "Company",
    property: "Property",
  },
  scopeGroupBeforeReading: "Before reading (mail envelope)",
  scopeGroupAfterReading: "After reading (extracted fields)",
  dialog: {
    title: "New exclusion rule",
    description: "Mails or documents that match this rule are excluded from processing.",
    scopeField: "Scope",
    termField: "Term",
    termPlaceholder: "e.g. newsletter@",
    noteField: "Note (optional)",
    notePlaceholder: "Why this rule exists",
    cancel: "Cancel",
    save: "Create rule",
    saving: "Creating …",
    termRequired: "Please enter a term.",
    created: "Exclusion rule created.",
    createFailed: (error) => `Creating the rule failed: ${error}`,
  },
  toggle: {
    activated: "Rule activated.",
    deactivated: "Rule deactivated.",
    failed: (error) => `Updating the rule failed: ${error}`,
  },
  deleteDialog: {
    openButton: "Delete rule",
    title: "Delete this rule?",
    description: (term, scopeName) =>
      `The rule "${term}" (${scopeName}) will be removed. Future mails matching it will be processed again.`,
    cancel: "Cancel",
    confirm: "Delete",
    deleted: "Exclusion rule deleted.",
    failed: (error) => `Deleting the rule failed: ${error}`,
  },
  impactPreview: {
    checking: "Checking past entries …",
    failed: "The impact check is not available right now.",
    notAvailable: "There is no historical data to check this scope against.",
    noMatches: (total) => `No matches among ${total} past entries.`,
    matches: (count, total, percentText) =>
      `Would have matched ${count} of ${total} past entries (${percentText}%).`,
  },
};
