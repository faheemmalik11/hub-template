export interface VatRulesLabels {
  title: string;
  subtitle: string;
  companyLabel: string;
  allCompanies: string;
  rulesTab: string;
  reserveTab: string;
  rulesHint: string;
  newRuleButton: string;
  countBySupplier: (count: number) => string;
  countByProperty: (count: number) => string;
  countByCompany: (count: number) => string;
  countGlobal: (count: number) => string;
  empty: string;
  emptyHint: string;
  columns: {
    value: string;
    scope: string;
    effect: string;
    active: string;
    actions: string;
  };
  vatRateValue: (rate: number) => string;
  vatTreatmentName: (value: string) => string;
  vatSpecialCaseName: (value: string) => string;
  deductibleShare: (percent: number) => string;
  scopeNames: {
    supplier: string;
    property: string;
    company: string;
    referencePattern: string;
  };
  effect: (wouldChange: number, matches: number) => string;
  effectHint: string;
  toggleActivated: string;
  toggleDeactivated: string;
  actionFailed: (error: string) => string;
  apply: {
    action: string;
    title: string;
    description: (wouldChange: number, matches: number) => string;
    nothingToApply: string;
    confirm: (count: number) => string;
    cancel: string;
    appliedNone: string;
    applied: (changed: number, matches: number) => string;
    appliedWithSkipped: (changed: number, matches: number, skipped: number) => string;
  };
  deleteRule: {
    action: string;
    title: string;
    description: (value: string) => string;
    reasonPlaceholder: string;
    cancel: string;
    confirm: string;
    deleted: string;
  };
  newRule: {
    title: string;
    description: string;
    vatRateField: string;
    vatRatePlaceholder: string;
    vatRateInvalid: string;
    vatRateOutOfRange: string;
    vatRateUnusual: string;
    treatmentField: string;
    treatmentNone: string;
    treatmentHint: string;
    deductibleField: string;
    deductiblePlaceholder: string;
    deductibleInvalid: string;
    deductibleHint: string;
    specialCaseField: string;
    specialCaseNone: string;
    hospitalityHint: string;
    scopeHeading: string;
    scopeHint: string;
    anyScopeOption: string;
    referencePatternField: string;
    referencePatternPlaceholder: string;
    referencePatternHint: string;
    noteField: string;
    previewHeading: string;
    previewLoading: string;
    previewError: string;
    previewText: (wouldChange: number, matches: number) => string;
    previewHint: string;
    valueMissing: string;
    scopeMissing: string;
    alreadyExists: string;
    cancel: string;
    save: string;
    created: string;
    createFailed: (error: string) => string;
  };
  reserve: {
    title: string;
    hint: string;
    totalInputVat: string;
    deductible: string;
    nondeductible: string;
    outputVat: string;
    reserveAmount: string;
    refund: string;
    unresolved: (count: number, amountText: string) => string;
    unresolvedShort: (count: number, amountText: string) => string;
    emptyAllCompanies: string;
  };
}

export const englishVatRulesLabels: VatRulesLabels = {
  title: "VAT rules & tax reserve",
  subtitle:
    "Rules that set the VAT rate, tax treatment and deductibility of incoming invoices, and the reserve they suggest.",
  companyLabel: "Company",
  allCompanies: "All companies",
  rulesTab: "Rules",
  reserveTab: "Tax reserve",
  rulesHint:
    "A rule sets the VAT rate and deductibility for every invoice that matches its scope. More specific rules win over broader ones.",
  newRuleButton: "New VAT rule",
  countBySupplier: (count) => `${count} per supplier`,
  countByProperty: (count) => `${count} per property`,
  countByCompany: (count) => `${count} per company`,
  countGlobal: (count) => `${count} global`,
  empty: "No VAT rules yet.",
  emptyHint: "Create a rule to set VAT rate and deductibility automatically.",
  columns: {
    value: "Value",
    scope: "Scope",
    effect: "Effect",
    active: "Active",
    actions: "Actions",
  },
  vatRateValue: (rate) => `${rate} %`,
  vatTreatmentName: (value) => value,
  vatSpecialCaseName: (value) => value,
  deductibleShare: (percent) => `${percent}% deductible`,
  scopeNames: {
    supplier: "Supplier",
    property: "Property",
    company: "Company",
    referencePattern: "Reference",
  },
  effect: (wouldChange, matches) => `${wouldChange} of ${matches}`,
  effectHint: "How many existing invoices this rule would still change if applied retroactively.",
  toggleActivated: "Rule activated.",
  toggleDeactivated: "Rule deactivated.",
  actionFailed: (error) => `The action failed: ${error}`,
  apply: {
    action: "Apply",
    title: "Apply this rule to existing invoices?",
    description: (wouldChange, matches) =>
      `This rule matches ${matches} existing invoices and would change ${wouldChange} of them.`,
    nothingToApply: "This rule would not change any existing invoice.",
    confirm: (count) => `Change ${count} invoices`,
    cancel: "Cancel",
    appliedNone: "No invoices needed a change.",
    applied: (changed, matches) => `Changed ${changed} of ${matches} matching invoices.`,
    appliedWithSkipped: (changed, matches, skipped) =>
      `Changed ${changed} of ${matches} matching invoices; ${skipped} were skipped.`,
  },
  deleteRule: {
    action: "Delete",
    title: "Delete this rule?",
    description: (value) =>
      `The rule "${value}" stays visible in the audit trail but stops affecting new invoices.`,
    reasonPlaceholder: "Reason for deleting",
    cancel: "Cancel",
    confirm: "Delete rule",
    deleted: "Rule deleted.",
  },
  newRule: {
    title: "New VAT rule",
    description:
      "Sets VAT rate, tax treatment and deductibility for every invoice matching the scope below.",
    vatRateField: "VAT rate (%)",
    vatRatePlaceholder: "19",
    vatRateInvalid: "Please enter a number.",
    vatRateOutOfRange: "The VAT rate must be between 0 and 100.",
    vatRateUnusual: "This is an unusual VAT rate — please double-check it.",
    treatmentField: "Tax treatment",
    treatmentNone: "Not set",
    treatmentHint: "How the invoice is treated for tax purposes.",
    deductibleField: "Deductible share (%)",
    deductiblePlaceholder: "100",
    deductibleInvalid: "The deductible share must be between 0 and 100.",
    deductibleHint: "How much of the input VAT can be deducted. Leave empty for fully deductible.",
    specialCaseField: "Special case",
    specialCaseNone: "None",
    hospitalityHint: "Hospitality costs are typically 70% deductible.",
    scopeHeading: "Scope",
    scopeHint: "At least one scope is required, so the rule cannot silently match everything.",
    anyScopeOption: "Any",
    referencePatternField: "Reference pattern",
    referencePatternPlaceholder: "e.g. maintenance contract",
    referencePatternHint: "Matches when the invoice reference contains this text.",
    noteField: "Note",
    previewHeading: "Retroactive effect",
    previewLoading: "Calculating …",
    previewError: "The preview is not available right now.",
    previewText: (wouldChange, matches) =>
      `This rule matches ${matches} existing invoices and would change ${wouldChange} of them.`,
    previewHint:
      "The gap between the two numbers is invoices that are already correct or were decided by a person.",
    valueMissing: "Please enter a valid VAT rate first.",
    scopeMissing: "Please narrow the rule down to at least one scope.",
    alreadyExists: "A rule with this exact scope already exists.",
    cancel: "Cancel",
    save: "Create rule",
    created: "VAT rule created.",
    createFailed: (error) => `Creating the rule failed: ${error}`,
  },
  reserve: {
    title: "Recommended tax reserve",
    hint: "A recommendation based on the current invoices — never a booking.",
    totalInputVat: "Input VAT total",
    deductible: "Of which deductible",
    nondeductible: "Of which non-deductible",
    outputVat: "Output VAT",
    reserveAmount: "Recommended reserve",
    refund: "Expected refund",
    unresolved: (count, amountText) =>
      `${count} invoices totalling ${amountText} have no resolved deductibility yet and are not included.`,
    unresolvedShort: (count, amountText) => `${count} unresolved (${amountText})`,
    emptyAllCompanies: "No data available yet.",
  },
};
