import type { QueryResult } from "../lib/query-result";

export { ANY_VALUE, DIMENSION_WEIGHT, PINNED_DIMENSION_WEIGHT } from "./rule-scope";
export type { DimensionKey, ScopeOption } from "./rule-scope";

import type { DimensionKey, ScopeOption } from "./rule-scope";

export interface ApproverOption {
  id: string;
  name: string;

  isActive: boolean;

  roleLabel?: string;
}

export interface ApprovalRuleView {
  id: string;

  scope: Partial<Record<DimensionKey, string | null>>;

  minAmount: number;

  steps: string[];

  autoFinalStep?: boolean;
  isActive: boolean;

  createdAt: string;
  note: string | null;
}

export interface ApprovalRuleDraft {
  id?: string;
  scope: Partial<Record<DimensionKey, string | null>>;
  minAmount: number;
  steps: string[];

  autoFinalStep?: boolean;
}

export interface RuleQuery {
  scope: Partial<Record<DimensionKey, string | null>>;
  amount: number;
}

export interface ApprovalRulesConfig {
  dimensions: DimensionKey[];

  maxSteps: number;

  defaultChainLabels: string[];
}

export interface ApprovalRulesAdapter {
  config: ApprovalRulesConfig;
  rules: QueryResult<ApprovalRuleView[]>;

  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  approvers: ApproverOption[];

  approverName: (userId: string) => string | null;
  saveRule: (draft: ApprovalRuleDraft) => Promise<void>;
  setRuleActive: (id: string, isActive: boolean) => Promise<void>;
  deleteRule: (id: string, reason: string) => Promise<void>;
  isSaving: boolean;
}
