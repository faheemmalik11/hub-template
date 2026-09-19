import type { QueryResult } from "../lib/query-result";

export interface VatRule {
  id: string;
  vatRate: number | null;
  vatTreatment: string | null;
  vatDeductiblePercent: number | null;
  vatSpecialCase: string | null;
  supplierId: string | null;
  propertyId: string | null;
  companyId: string | null;
  referencePattern: string | null;
  note: string | null;
  isActive: boolean;
}

export interface VatRuleDraft {
  vatRate: number;
  vatTreatment: string | null;
  vatDeductiblePercent: number | null;
  vatSpecialCase: string | null;
  supplierId: string | null;
  propertyId: string | null;
  companyId: string | null;
  referencePattern: string | null;
}

export interface VatRuleInput extends VatRuleDraft {
  note: string | null;
}

export interface VatRuleCompany {
  id: string;
  code: string;
  name: string;
}

export interface VatRuleSupplier {
  id: string;
  name: string;
}

export interface VatRuleProperty {
  id: string;
  code: string;
  name: string | null;
}

// How many existing invoices a rule would still change if applied across the board.
export interface RuleImpact {
  wouldChange: number;
  matches: number;
}

export interface BulkApplyResult {
  changed: number;
  matches: number;
  skipped: number;
}

export interface VatReserveSummary {
  companyId: string;
  inputVatTotal: number;
  inputVatDeductible: number;
  inputVatNondeductible: number;
  outputVat: number;
  reserve: number;
  unresolvedCount: number;
  unresolvedAmount: number;
}

export interface VatRulesAdapter {
  useVatRules(): QueryResult<VatRule[]>;
  useCompanies(): QueryResult<VatRuleCompany[]>;
  useSuppliers(): QueryResult<VatRuleSupplier[]>;
  useProperties(): QueryResult<VatRuleProperty[]>;
  useRuleImpact(ruleId: string): QueryResult<RuleImpact>;
  useDraftImpact(draft: VatRuleDraft | null): QueryResult<RuleImpact>;
  useVatReserve(companyId: string | null): QueryResult<VatReserveSummary>;
  useVatReserveForCompanies(companyIds: string[]): QueryResult<VatReserveSummary[]>;
  createVatRule(input: VatRuleInput): Promise<void>;
  setVatRuleActive(input: { id: string; isActive: boolean }): Promise<void>;
  applyVatRuleToExisting(ruleId: string): Promise<BulkApplyResult>;
  deleteVatRule(input: { id: string; reason: string }): Promise<void>;
  // True when a create failed because an identical rule scope already exists.
  isDuplicateRuleError(error: unknown): boolean;
  vatTreatmentValues: string[];
  vatSpecialCaseValues: string[];
}
