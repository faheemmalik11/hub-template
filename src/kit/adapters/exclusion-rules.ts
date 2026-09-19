import type { QueryResult } from "../lib/query-result";

// Scopes matched against the mail/file envelope before the AI reads the document.
export const EXCLUSION_SCOPES_BEFORE_READING = [
  "sender",
  "subject",
  "filename",
  "envelope",
] as const;

// Scopes matched against the extracted fields after the AI has read the document.
export const EXCLUSION_SCOPES_AFTER_READING = [
  "party",
  "supplier",
  "body",
  "company",
  "property",
] as const;

export type ExclusionScope =
  | (typeof EXCLUSION_SCOPES_BEFORE_READING)[number]
  | (typeof EXCLUSION_SCOPES_AFTER_READING)[number];

export interface ExclusionRule {
  id: string;
  scope: ExclusionScope;
  term: string;
  note: string | null;
  isActive: boolean;
}

export interface ExclusionImpact {
  // False when this scope has no historical data to check against.
  supported: boolean;
  matchCount: number;
  totalCount: number;
}

export interface ExclusionRulesAdapter {
  useExclusionRules(): QueryResult<ExclusionRule[]>;
  useExclusionImpact(query: {
    scope: ExclusionScope;
    term: string;
    enabled: boolean;
  }): QueryResult<ExclusionImpact>;
  createExclusionRule(input: { scope: ExclusionScope; term: string; note: string }): Promise<void>;
  setExclusionRuleActive(input: { id: string; isActive: boolean }): Promise<void>;
  deleteExclusionRule(id: string): Promise<void>;
}
