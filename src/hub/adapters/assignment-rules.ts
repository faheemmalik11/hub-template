import { useCallback, useMemo } from "react";

import {
  useAssignmentRules,
  useCostAnalysisCategories,
  useCreateAssignmentRule,
  useCompanies,
  useSuppliers,
  useProperties,
  useSoftDeleteAssignmentRule,
  useUpdateAssignmentRule,
  type AssignmentRuleInput,
} from "@/data";
import type { AssignmentRule, CostAnalysisCategory } from "@/lib/data/types";

import type {
  AssignmentRuleDraft,
  AssignmentRulesAdapter,
  AssignmentRulesConfig,
  AssignmentRuleView,
  CategoryOption,
  DimensionKey,
  ScopeOption,
} from "@/kit/adapters";

export const ASSIGNMENT_RULES_CONFIG: AssignmentRulesConfig = {
  dimensions: ["company", "supplier", "property"],
};

function categoryDisplayLabel(
  category: CostAnalysisCategory,
  categoryById: Map<string, CostAnalysisCategory>,
) {
  const parent = category.parent_id ? categoryById.get(category.parent_id) : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

function toInput(draft: AssignmentRuleDraft): AssignmentRuleInput {
  return {
    target: "cost_category",
    category_id: draft.categoryId || null,
    supplier_id: draft.scope.supplier ?? null,
    property_id: draft.scope.property ?? null,
    company_id: draft.scope.company ?? null,
    reference_pattern: draft.referencePattern,
  };
}

export function useAssignmentRulesAdapter(): AssignmentRulesAdapter {
  const rulesQuery = useAssignmentRules();
  const categoriesQuery = useCostAnalysisCategories();
  const companiesQuery = useCompanies();
  const suppliersQuery = useSuppliers();
  const propertiesQuery = useProperties();

  const create = useCreateAssignmentRule();
  const update = useUpdateAssignmentRule();
  const remove = useSoftDeleteAssignmentRule();

  const categoryById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category])),
    [categoriesQuery.data],
  );

  const resolveCategoryLabel = useCallback(
    (rule: AssignmentRule) => {
      const category = rule.category_id ? categoryById.get(rule.category_id) : undefined;
      if (category) return categoryDisplayLabel(category, categoryById);
      return rule.cost_category ?? "—";
    },
    [categoryById],
  );

  const rules = useMemo<AssignmentRuleView[]>(
    () =>
      (rulesQuery.data ?? [])
        .filter((rule) => rule.target === "cost_category")
        .map((rule) => ({
          id: rule.id,
          scope: {
            supplier: rule.supplier_id,
            property: rule.property_id,
            company: rule.company_id,
          },
          referencePattern: rule.reference_pattern,
          categoryId: rule.category_id ?? "",
          categoryLabel: resolveCategoryLabel(rule),
          isActive: rule.is_active,
          createdAt: rule.created_at,
          note: rule.note,
        })),
    [rulesQuery.data, resolveCategoryLabel],
  );

  const categories = useMemo<CategoryOption[]>(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) => category.is_active && !category.is_catchall)
        .map((category) => ({
          id: category.id,
          label: categoryDisplayLabel(category, categoryById),
          keywords: `${category.code} ${category.name_en}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categoriesQuery.data, categoryById],
  );

  const scopeOptions = useMemo<Partial<Record<DimensionKey, ScopeOption[]>>>(
    () => ({
      company: (companiesQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.code,
        code: row.code,
        keywords: row.name,
      })),
      supplier: (suppliersQuery.data ?? []).map((row) => ({ id: row.id, label: row.name })),
      property: (propertiesQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.code,
        code: row.code,
        keywords: row.name ?? "",
      })),
    }),
    [companiesQuery.data, suppliersQuery.data, propertiesQuery.data],
  );

  const saveRule = useCallback(
    async (draft: AssignmentRuleDraft) => {
      const input = toInput(draft);
      if (draft.id) await update.mutateAsync({ id: draft.id, changes: input });
      else await create.mutateAsync(input);
    },
    [create, update],
  );

  const setRuleActive = useCallback(
    async (id: string, isActive: boolean) => {
      await update.mutateAsync({ id, changes: { is_active: isActive } });
    },
    [update],
  );

  const deleteRule = useCallback(
    async (id: string, reason: string) => {
      await remove.mutateAsync({ id, reason: reason });
    },
    [remove],
  );

  return {
    config: ASSIGNMENT_RULES_CONFIG,
    rules: {
      data: rules,
      isLoading:
        rulesQuery.isLoading ||
        categoriesQuery.isLoading ||
        companiesQuery.isLoading ||
        suppliersQuery.isLoading ||
        propertiesQuery.isLoading,
      isError: rulesQuery.isError,
      error: rulesQuery.error,
      isRefreshing: rulesQuery.isRefetching,
      refetch: () => void rulesQuery.refetch(),
    },
    scopeOptions,
    categories,
    saveRule,
    setRuleActive,
    deleteRule,
    isSaving: create.isPending || update.isPending || remove.isPending,
  };
}
