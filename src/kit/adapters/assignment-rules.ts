import type { QueryResult } from "../lib/query-result";

export { ANY_VALUE, DIMENSION_WEIGHT, PINNED_DIMENSION_WEIGHT } from "./rule-scope";
export type { DimensionKey, ScopeOption } from "./rule-scope";

import type { DimensionKey, ScopeOption } from "./rule-scope";

export interface CategoryOption {
  id: string;
  label: string;
  keywords?: string;
}

export interface AssignmentRuleView {
  id: string;

  scope: Partial<Record<DimensionKey, string | null>>;

  referencePattern: string | null;

  categoryId: string;
  categoryLabel: string;

  isActive: boolean;

  createdAt: string;
  note: string | null;
}

export interface AssignmentRuleDraft {
  id?: string;
  scope: Partial<Record<DimensionKey, string | null>>;
  referencePattern: string | null;
  categoryId: string;
}

export interface AssignmentRuleQuery {
  scope: Partial<Record<DimensionKey, string | null>>;
  reference: string;
}

export interface AssignmentRulesConfig {
  dimensions: DimensionKey[];
}

export interface AssignmentRulesAdapter {
  config: AssignmentRulesConfig;
  rules: QueryResult<AssignmentRuleView[]>;

  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  categories: CategoryOption[];

  saveRule: (draft: AssignmentRuleDraft) => Promise<void>;
  setRuleActive: (id: string, isActive: boolean) => Promise<void>;
  deleteRule: (id: string, reason: string) => Promise<void>;
  isSaving: boolean;
}
