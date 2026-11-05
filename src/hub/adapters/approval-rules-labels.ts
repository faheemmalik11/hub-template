import { useMemo } from "react";

import type { ApprovalRulesLabels } from "@/kit/pages/approval-rules";

import { useTranslation } from "@/lib/i18n";

export function useApprovalRulesLabels(): ApprovalRulesLabels {
  const { t } = useTranslation();
  return useMemo<ApprovalRulesLabels>(
    () => ({
      title: t("approvalRules.lead.title"),
      dimension: {
        company: t("approvalRules.lead.dimension.company"),
        supplier: t("approvalRules.lead.dimension.supplier"),
        property: t("approvalRules.lead.dimension.property"),
        businessLine: t("approvalRules.lead.dimension.area"),
      },
      any: t("approvalRules.lead.any"),
      tabs: {
        rules: t("approvalRules.lead.tabs.rules"),
        scenario: t("approvalRules.lead.tabs.playground"),
      },
      tester: {
        title: t("approvalRules.lead.test.title"),
        hint: t("approvalRules.lead.test.hint"),
        amount: t("approvalRules.lead.test.amount"),
        check: t("approvalRules.lead.test.check"),
        reset: t("approvalRules.lead.test.reset"),
        idle: t("approvalRules.lead.test.empty"),
        idleHint: t("approvalRules.lead.test.emptyHint"),
        winnerHeading: t("approvalRules.lead.test.applies"),
        outrankedTitle: t("approvalRules.lead.test.outrankedTitle"),
        alsoMatching: (count) => t("approvalRules.lead.test.weitere", { count }),
        onlyMatch: t("approvalRules.lead.test.onlyOne"),
        none: t("approvalRules.lead.test.none"),
        noneWhy: (chain) => t("approvalRules.lead.test.noneWhy", { chain }),
      },
      summary: {
        active: (count) => t("approvalRules.lead.overview.active", { count }),
        issues: (count) => t("approvalRules.lead.overview.probleme", { count }),
        issuesTitleText: t("approvalRules.lead.overview.issuesTitle"),
        issuesHint: t("approvalRules.lead.overview.issuesHint"),
      },
      card: {
        when: t("approvalRules.lead.card.when"),
        amount: t("approvalRules.lead.card.amount"),
        approvers: t("approvalRules.lead.card.approvers"),
        anyAmount: t("approvalRules.lead.card.anyAmount"),
        atLeast: (amount) => t("approvalRules.lead.card.fromAmount", { amount }),
        priority: t("approvalRules.lead.card.priority"),
        priorityOf: (position, total) =>
          t("approvalRules.lead.card.priorityOf", { position, total }),
        actions: t("approvalRules.lead.card.actions"),
      },
      ladder: {
        newRule: t("approvalRules.lead.list.newRule"),
        empty: t("approvalRules.lead.list.empty"),
      },
      row: {
        edit: t("approvalRules.lead.row.edit"),
        active: t("approvalRules.lead.row.active"),
        inactive: t("approvalRules.lead.row.inactive"),
        activeShort: t("approvalRules.lead.row.activeShort"),
        inactiveBadge: t("approvalRules.lead.row.inactiveBadge"),
        flagInactive: t("approvalRules.lead.row.inactiveHint"),
        flagStranded: t("approvalRules.lead.row.strandedHint"),
        flagOutranked: t("approvalRules.lead.row.outrankedHint"),
        unknownApprover: t("approvalRules.lead.row.unknown"),
        deactivatedSuffix: t("approvalRules.lead.row.deactivated"),
        autoStep: t("approvalRules.lead.row.autoStep"),
      },
      editor: {
        minAmount: t("approvalRules.lead.editor.fromAmount"),
        minAmountHint: t("approvalRules.lead.editor.fromAmountHint"),
        chain: t("approvalRules.lead.editor.chain"),
        step: (index) => t("approvalRules.lead.editor.step", { n: index }),
        noFurtherStep: t("approvalRules.lead.editor.noFurtherStep"),
        chooseApprover: t("approvalRules.lead.editor.chooseApprover"),
        scopeRequired: t("approvalRules.lead.editor.attributeRequired"),
        chainHint: t("approvalRules.lead.editor.chainHint"),
        sameApproverTwice: t("approvalRules.lead.editor.samePerson"),
        stepNeedsPrevious: t("approvalRules.lead.editor.stepNeedsPrevious"),
        duplicate: t("approvalRules.lead.editor.alreadyExists"),
        save: t("approvalRules.lead.editor.save"),
        saving: t("approvalRules.lead.editor.saving"),
        cancel: t("approvalRules.lead.editor.cancel"),
        delete: t("approvalRules.lead.editor.delete"),
      },
      remove: {
        title: t("approvalRules.lead.delete.title"),
        description: t("approvalRules.lead.delete.desc"),
        reason: t("approvalRules.lead.delete.grund"),
        reasonPlaceholder: t("approvalRules.lead.delete.reasonPlaceholder"),
        confirm: t("approvalRules.lead.delete.confirm"),
        cancel: t("approvalRules.lead.delete.cancel"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("approvalRules.lead.toast.saved"),
        deleted: t("approvalRules.lead.toast.deleted"),
        activated: t("approvalRules.lead.toast.activated"),
        deactivated: t("approvalRules.lead.toast.deactivated"),
        failed: (error) => t("approvalRules.lead.toast.failed", { error }),
        unknownError: t("approvalRules.lead.toast.unknownError"),
      },
    }),
    [t],
  );
}
