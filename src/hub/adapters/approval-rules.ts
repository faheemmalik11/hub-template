import { useCallback, useMemo } from "react";

import type {
  ApprovalRuleDraft,
  ApprovalRulesAdapter,
  ApprovalRulesConfig,
  ApprovalRuleView,
  ApproverOption,
  DimensionKey,
  ScopeOption,
} from "@/kit/adapters";

import {
  useApprovalRules,
  useChainPeople,
  useCreateApprovalRule,
  useGesellschaften,
  useLieferanten,
  useObjekte,
  useSoftDeleteApprovalRule,
  useUpdateApprovalRule,
  type ApprovalRuleInput,
} from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";
import type { ApprovalRule, ChainPerson } from "@/lib/data/types";

export const APPROVAL_RULES_CONFIG: ApprovalRulesConfig = {
  dimensions: ["company", "supplier", "property"],
  maxSteps: 2,
  defaultChainLabels: [],
};

function toView(rule: ApprovalRule): ApprovalRuleView {
  const steps = [rule.step_1_user_id, rule.step_2_user_id].filter((id): id is string => !!id);
  return {
    id: rule.id,
    scope: {
      company: rule.company_id,
      supplier: rule.supplier_id,
      property: rule.property_id,
    },
    minAmount: rule.min_amount,
    steps,
    autoFinalStep: !rule.skip_step_2 && !rule.step_2_user_id,
    isActive: rule.is_active,
    createdAt: rule.created_at,
    note: rule.note,
  };
}

function toInput(draft: ApprovalRuleDraft): ApprovalRuleInput {
  const secondStep = draft.steps[1] ?? null;
  return {
    company_id: draft.scope.company ?? null,
    supplier_id: draft.scope.supplier ?? null,
    property_id: draft.scope.property ?? null,
    min_amount: draft.minAmount,
    step_1_user_id: draft.steps[0],
    step_2_user_id: secondStep,

    skip_step_2: secondStep ? false : !draft.autoFinalStep,
  };
}

export function useApprovalRulesAdapter(): ApprovalRulesAdapter {
  const { t } = useTranslation();
  const rulesQuery = useApprovalRules();

  const peopleQuery = useChainPeople();
  const companiesQuery = useGesellschaften();
  const suppliersQuery = useLieferanten();
  const propertiesQuery = useObjekte();

  const create = useCreateApprovalRule();
  const update = useUpdateApprovalRule();
  const remove = useSoftDeleteApprovalRule();

  const rules = useMemo(() => (rulesQuery.data ?? []).map(toView), [rulesQuery.data]);

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

  const approvers = useMemo<ApproverOption[]>(
    () =>
      (peopleQuery.data ?? [])
        .filter((person: ChainPerson) => person.role_name !== "super_admin")
        .map((person) => ({
          id: person.id,
          name: person.name ?? person.id,
          isActive: person.is_active,
          roleLabel: person.role_name ? t(`team.role.${person.role_name}`) : undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [peopleQuery.data, t],
  );

  const namesById = useMemo(
    () => new Map((peopleQuery.data ?? []).map((p) => [p.id, p.name ?? p.id])),
    [peopleQuery.data],
  );
  const approverName = useCallback((userId: string) => namesById.get(userId) ?? null, [namesById]);

  const saveRule = useCallback(
    async (draft: ApprovalRuleDraft) => {
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
      await remove.mutateAsync({ id, grund: reason });
    },
    [remove],
  );

  return {
    config: APPROVAL_RULES_CONFIG,
    rules: {
      data: rules,

      isLoading:
        rulesQuery.isLoading ||
        peopleQuery.isLoading ||
        companiesQuery.isLoading ||
        suppliersQuery.isLoading ||
        propertiesQuery.isLoading,
      isError: rulesQuery.isError,
      error: rulesQuery.error,
      isRefreshing: rulesQuery.isRefetching,
      refetch: () => void rulesQuery.refetch(),
    },
    scopeOptions,
    approvers,
    approverName,
    saveRule,
    setRuleActive,
    deleteRule,
    isSaving: create.isPending || update.isPending || remove.isPending,
  };
}
