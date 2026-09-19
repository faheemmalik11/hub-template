import type { OposCategory, OposScope } from "../lib/opos-whitelist";

export interface OposRule {
  id: string;
  term: string;
  scope: OposScope;
  category: OposCategory;
  note: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface NewOposRule {
  term: string;
  scope: OposScope;
  category: OposCategory;
  note: string;
  isActive: boolean;
}

export interface OposWhitelistAdapter {
  useRules(): { data: OposRule[]; loading: boolean; error: unknown };
  useHitCounts(): { data: Map<string, number>; loading: boolean };
  canWrite: boolean;
  createRule(input: NewOposRule): Promise<void>;
  updateRule(id: string, changes: Partial<NewOposRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
  reapplyAll(): Promise<{ affected: number }>;
  formatDate: (iso: string) => string;
}
