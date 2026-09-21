import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import { invalidateRuleState } from "@/data/shared";
import { extractChartOfAccounts } from "@/lib/api/chart-of-accounts-extraction.functions";
import type {
  CostAnalysisAccountMapping,
  CostAnalysisCategory,
  RuleSuggestion,
} from "@/lib/data/types";
import type { AssignmentRuleInput } from "@/data/rules";

// ---- Category taxonomy, account mapping & rule suggestions (migration 0030) ----

function invalidateCategoryState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["bwa_categories"] });
  qc.invalidateQueries({ queryKey: ["bwa_account_mapping"] });
  qc.invalidateQueries({ queryKey: ["rule_suggestions"] });
  // A category's name/active state can change what the rule engine's preview counts show.
  invalidateRuleState(qc);
}

// The full taxonomy, both levels together (soft-deleted rows excluded). Small (~87 rows) and
// changed rarely, so one query backs every consumer: the Kategorien tab's tree, the Regeln tab's
// category Combobox, and the Vorschläge tab's per-row dropdown.
export function useCostAnalysisCategories() {
  return useQuery({
    queryKey: ["bwa_categories"],
    staleTime: STALE,
    queryFn: async (): Promise<CostAnalysisCategory[]> => {
      const { data, error } = await sb
        .from(TABLE.categories)
        .select("*")
        .is("deleted_at", null)
        // The user's own drag order (migration 0076) wins; name only breaks ties, so two rows
        // that were never dragged still come back in a stable, readable order.
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CostAnalysisCategory[];
    },
  });
}

export type CostAnalysisCategoryInput = {
  code: string;
  name: string;
  name_en: string;
  parent_id?: string | null;
  report_block: CostAnalysisCategory["report_block"];
  report_line: string;
  direction: CostAnalysisCategory["direction"];
  note?: string | null;
};

export function useCreateCostAnalysisCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CostAnalysisCategoryInput): Promise<CostAnalysisCategory> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.categories)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as CostAnalysisCategory;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

export function useUpdateCostAnalysisCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<CostAnalysisCategoryInput> }) => {
      const { error } = await sb
        .from(TABLE.categories)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// Soft delete only: "every category remains changeable and deletable at any time" (briefing), but
// a rule or receipt that already references this category must keep resolving its name.
export function useSoftDeleteCostAnalysisCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.categories)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(args.reason),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

/**
 * Persist a drag-and-drop reorder. Takes the ids of ONE level (either the parents of a tab, or
 * the children of a single parent) in their new visual order, and rewrites sort_order to match.
 *
 * Renumbered from scratch in steps of 10 rather than patched: recomputing is one predictable
 * write per row and cannot leave two siblings sharing a position, which is what would make the
 * order jump around on the next render. Steps of 10 keep room to insert without renumbering.
 */
export function useReorderCostAnalysisCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const stamp = new Date().toISOString();
      // Sequential rather than parallel: a level holds at most a few dozen rows, and PostgREST
      // gives clearer errors than a burst of concurrent PATCHes if one row is rejected.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from(TABLE.categories)
          .update({ sort_order: (i + 1) * 10, updated_at: stamp })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// Category-to-account mapping for one fiscal year. DATEV rebuilds the chart of accounts every
// year, so the mapping is read one year at a time rather than as one global list.
export function useCostAnalysisAccountMapping(fiscalYear: number, companyId: string | null) {
  return useQuery({
    queryKey: ["bwa_account_mapping", fiscalYear, companyId],
    staleTime: STALE,
    enabled: !!companyId,
    queryFn: async (): Promise<CostAnalysisAccountMapping[]> => {
      const { data, error } = await sb
        .from(TABLE.categoryAccountMapping)
        .select("*")
        .eq("fiscal_year", fiscalYear)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("account", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CostAnalysisAccountMapping[];
    },
  });
}

export type CostAnalysisAccountMappingRow = {
  account: string;
  category_id: string;
  note?: string | null;
};

// Imports a parsed CSV (fiscal_year, account, category_id) as a batch upsert, scoped to one
// company. The caller is expected to have already shown a preview (which rows are new vs.
// changed vs. unchanged) — this mutation just commits it, matching the same preview-before-apply
// pattern already used for assignment rules.
export function useImportCostAnalysisAccountMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      fiscalYear: number;
      companyId: string;
      rows: CostAnalysisAccountMappingRow[];
    }) => {
      const actor = await actorEmail();
      const { error } = await sb.from(TABLE.categoryAccountMapping).upsert(
        args.rows.map((r) => ({
          fiscal_year: args.fiscalYear,
          account: r.account,
          company_id: args.companyId,
          category_id: r.category_id,
          note: r.note ?? null,
          created_by: actor,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "fiscal_year,account,company_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// AI extraction for the "Mit KI importieren" flow: a tax advisor's chart-of-accounts file
// (CSV/Excel parsed to text client-side, or PDF/image sent as a file) comes back as rows the user
// still reviews in a preview before anything is written — the write itself reuses
// useImportBwaAccountMapping above, same mutation the manual import used to use.
export function useExtractChartOfAccounts() {
  return useMutation({
    mutationFn: (
      args:
        | {
            mode: "file";
            filename: string;
            mime: "application/pdf" | "image/jpeg" | "image/png";
            fileBase64: string;
          }
        | { mode: "text"; filename: string; textContent: string },
    ) => extractChartOfAccounts({ data: args }),
  });
}

// Bulk rule suggestions from existing receipts (Vorschläge tab): suppliers not yet covered by an
// active cost_category rule, grouped by their most common existing category.
export function useSuggestAssignmentRules() {
  return useQuery({
    queryKey: ["rule_suggestions"],
    staleTime: STALE,
    queryFn: async (): Promise<RuleSuggestion[]> => {
      const { data, error } = await sb.rpc("suggest_assignment_rules");
      if (error) throw error;
      return (data ?? []) as RuleSuggestion[];
    },
  });
}

// Confirms a batch of suggestions as real rules, one create per suggestion (each still goes
// through the same assignment_rules insert everything else uses, so a duplicate-scope conflict on
// one row surfaces clearly rather than silently skipping).
export function useBulkCreateAssignmentRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      inputs: AssignmentRuleInput[],
    ): Promise<{ created: number; failed: number; succeededSupplierIds: string[] }> => {
      const actor = await actorEmail();
      // Independent inserts, run in parallel rather than one-at-a-time — the results are matched
      // back to their own input by array position (allSettled preserves order), so the caller can
      // tell exactly which supplier's rule actually landed instead of only a total count.
      const results = await Promise.allSettled(
        inputs.map((input) =>
          sb.from(TABLE.assignmentRules).insert({ ...input, created_by: actor }),
        ),
      );
      let created = 0;
      let failed = 0;
      const succeededSupplierIds: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && !r.value.error) {
          created += 1;
          if (inputs[i].supplier_id) succeededSupplierIds.push(inputs[i].supplier_id!);
        } else {
          failed += 1;
        }
      });
      return { created, failed, succeededSupplierIds };
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Human sets or clears a bank transaction's category (offene-posten). bank_transactions has no
// direct UPDATE policy for authenticated (SELECT only, migration 0046), so this goes through the
// SECURITY DEFINER RPC opos_set_category, same shape as useSetNoReceipt/opos_set_no_receipt above.
// The category itself (rule-suggested or human-set) is read straight off BankTransaction.category_id
// — already resolved and persisted by the categorize trigger (migration 0057), no separate query.
export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { transactionId: string; categoryId: string | null }) => {
      const { error } = await sb.rpc("opos_set_category", {
        p_transaction_id: args.transactionId,
        p_category_id: args.categoryId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_transactions"] }),
  });
}
