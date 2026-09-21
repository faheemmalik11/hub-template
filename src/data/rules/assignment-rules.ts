import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { invalidateRuleState, requiredReason } from "@/data/shared";
import type {
  AssignmentRule,
  RuleBulkApplyResult,
  RulePreview,
  RuleTarget,
  VatSpecialCase,
  VatTreatment,
} from "@/lib/data/types";

// ---- Review & assign: rules, review decisions, mail settings (migration 0025) ----

// Active rule catalogue (soft-deleted rules stay in the table for the audit trail but never show).
// Ordered the way resolution reads them, most specific first, so the list itself explains which
// rule would win.
export function useAssignmentRules() {
  return useQuery({
    queryKey: ["assignment_rules"],
    staleTime: STALE,
    queryFn: async (): Promise<AssignmentRule[]> => {
      const { data, error } = await sb
        .from(TABLE.assignmentRules)
        .select("*")
        .is("deleted_at", null)
        .order("target", { ascending: true })
        .order("specificity", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRule[];
    },
  });
}

// Fields a caller may set on a rule. `specificity` is a generated column and must never be sent.
export type AssignmentRuleInput = {
  target: RuleTarget;
  cost_category?: string | null;
  // Structured taxonomy reference (migration 0030). Set this from the category Combobox; when
  // present it is canonical and cost_category becomes a derived display value.
  category_id?: string | null;
  vat_rate?: number | null;
  vat_treatment?: VatTreatment | null;
  // Additive to vat_rate on the same rule row (migration 0031). Only meaningful when
  // target === "vat_rate".
  vat_deductible_pct?: number | null;
  vat_special_case?: VatSpecialCase | null;
  supplier_id?: string | null;
  property_id?: string | null;
  company_id?: string | null;
  reference_pattern?: string | null;
  note?: string | null;
  is_active?: boolean;
};

export function useCreateAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignmentRuleInput): Promise<AssignmentRule> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.assignmentRules)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

export function useUpdateAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<AssignmentRuleInput> }) => {
      const { error } = await sb
        .from(TABLE.assignmentRules)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Soft delete. A rule that shaped past assignments has to stay auditable, so this is an UPDATE
// and the DB has no delete policy for the table at all.
export function useSoftDeleteAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.assignmentRules)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(args.reason),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Retroactive impact of one rule ("this rule would change 47 old receipts"). staleTime 0: the
// count is a decision aid shown right before the user commits, so it must not come from cache.
export function useRulePreview(ruleId: string | null) {
  return useQuery({
    queryKey: ["assignment_rule_preview", ruleId],
    enabled: !!ruleId,
    staleTime: 0,
    queryFn: async (): Promise<RulePreview> => {
      const { data, error } = await sb.rpc("assignment_rule_preview", { p_rule: ruleId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        matches: Number(row?.matches ?? 0),
        would_change: Number(row?.would_change ?? 0),
      };
    },
  });
}

// Retroactive impact of a rule that does not exist yet, so the create/edit dialog can show it
// BEFORE committing. `excludeRule` must be set when re-previewing an existing rule, otherwise the
// rule counts as its own competitor and the preview reports zero changes.
//
// Disabled until the scope is non-empty and the value is set: an unscoped query would describe a
// rule the DB would refuse to store anyway.
export function useRulePreviewScope(input: AssignmentRuleInput | null, excludeRule?: string) {
  const scopeSet =
    !!input &&
    !!(input.supplier_id || input.property_id || input.company_id || input.reference_pattern);
  const valueSet =
    !!input &&
    (input.target === "cost_category"
      ? !!input.cost_category || !!input.category_id
      : input.vat_rate != null);
  return useQuery({
    queryKey: ["assignment_rule_preview", "scope", input, excludeRule ?? null],
    enabled: scopeSet && valueSet,
    staleTime: 0,
    queryFn: async (): Promise<RulePreview> => {
      const { data, error } = await sb.rpc("assignment_rule_preview_scope", {
        p_target: input!.target,
        p_cost_category: input!.cost_category ?? null,
        p_vat_rate: input!.vat_rate ?? null,
        p_supplier_id: input!.supplier_id ?? null,
        p_property_id: input!.property_id ?? null,
        p_company_id: input!.company_id ?? null,
        p_reference_pattern: input!.reference_pattern ?? null,
        p_exclude_rule: excludeRule ?? null,
        p_vat_treatment: input!.vat_treatment ?? null,
        p_category_id: input!.category_id ?? null,
        p_vat_deductible_pct: input!.vat_deductible_pct ?? null,
        p_vat_special_case: input!.vat_special_case ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        matches: Number(row?.matches ?? 0),
        would_change: Number(row?.would_change ?? 0),
      };
    },
  });
}

// Which rule currently wins for this receipt, per target. Used to show "a rule would set X" next
// to a field, including when the field is human-set and therefore protected — seeing the rule you
// are overriding is the point.
export function useResolvedRules(documentId: string | null) {
  return useQuery({
    queryKey: ["resolved_rules", documentId],
    enabled: !!documentId,
    staleTime: 0,
    queryFn: async (): Promise<Record<RuleTarget, string | null>> => {
      const [cat, vat] = await Promise.all([
        sb.rpc("resolve_assignment_rule", { p_invoice: documentId, p_target: "cost_category" }),
        sb.rpc("resolve_assignment_rule", { p_invoice: documentId, p_target: "vat_rate" }),
      ]);
      if (cat.error) throw cat.error;
      if (vat.error) throw vat.error;
      return {
        cost_category: (cat.data as string | null) ?? null,
        vat_rate: (vat.data as string | null) ?? null,
      };
    },
  });
}

// Every rule matching one receipt + target, most specific first (migration 0056) — not just the
// winner useResolvedRules() above returns. Lets the UI show "N rules matched, X wins" instead of
// silently applying one of several candidates (Briefing Screen 4: "a clear priority is needed").
export type RuleCandidate = { rule_id: string; specificity: number; is_winner: boolean };

export function useAssignmentRuleCandidates(documentId: string | null, target: RuleTarget) {
  return useQuery({
    queryKey: ["resolved_rule_candidates", documentId, target],
    enabled: !!documentId,
    staleTime: 0,
    queryFn: async (): Promise<RuleCandidate[]> => {
      const { data, error } = await sb.rpc("resolve_assignment_rule_candidates", {
        p_invoice: documentId,
        p_target: target,
      });
      if (error) throw error;
      return (data ?? []) as RuleCandidate[];
    },
  });
}

// Apply the winning rules to one receipt. The RPC skips human-set fields and writes its own
// invoice_history entry, so there is no insertVerlauf here. Returns what it changed and what it
// deliberately left alone, so the caller can report the difference instead of claiming success.
export interface RuleApplyResult {
  changed: { field: string; from: unknown; to: unknown; rule_id: string }[];
  skipped: { field: string; reason: string; rule_id: string }[];
}

export function useApplyAssignmentRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string): Promise<RuleApplyResult> => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("apply_assignment_rules", {
        p_invoice: documentId,
        p_actor: actor,
      });
      if (error) throw error;
      const r = (data ?? {}) as Partial<RuleApplyResult>;
      return { changed: r.changed ?? [], skipped: r.skipped ?? [] };
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Make a rule's retroactive effect actually happen (migration 0029): walks every receipt in the
// rule's scope and applies it, the same way the per-receipt button does, so "this rule would
// change 47 old receipts" is something a person can act on rather than only read.
export function useApplyAssignmentRuleBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string): Promise<RuleBulkApplyResult> => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("apply_assignment_rule_bulk", {
        p_rule: ruleId,
        p_actor: actor,
      });
      if (error) throw error;
      return data as RuleBulkApplyResult;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}
