import { useMemo } from "react";

import type { AssignmentRulesLabels } from "@/kit/pages/assignment-rules";

import { useTranslation } from "@/lib/i18n";

export function useAssignmentRulesLabels(): AssignmentRulesLabels {
  const { t } = useTranslation();
  return useMemo<AssignmentRulesLabels>(
    () => ({
      dimension: {
        company: t("assignmentRules.scope.company"),
        supplier: t("assignmentRules.scope.lieferant"),
        property: t("assignmentRules.scope.property"),
        businessLine: t("approvalRules.lead.dimension.area"),
      },
      reference: t("assignmentRules.scope.verwendungszweck"),
      any: t("approvalRules.lead.any"),
      tabs: {
        rules: t("assignmentRules.tab.rules"),
        playground: t("assignmentRules.tab.playground"),
      },
      toolbar: {
        search: t("assignmentRules.list.search"),
        newRule: t("assignmentRules.new.button.cost_category"),
      },
      empty: {
        title: t("assignmentRules.list.empty"),
        hint: t("assignmentRules.list.emptyHint"),
        noMatches: t("assignmentRules.list.noMatches"),
        noMatchesHint: t("assignmentRules.list.noMatchesHint"),
      },
      card: {
        value: t("assignmentRules.col.value"),
        scope: t("assignmentRules.col.scope"),
        impact: t("assignmentRules.col.impact"),
        active: t("assignmentRules.col.active"),
        actions: t("assignmentRules.col.actions"),
      },
      row: {
        edit: t("assignmentRules.action.edit"),
        delete: t("assignmentRules.action.delete"),
        active: t("approvalRules.lead.row.active"),
        inactive: t("approvalRules.lead.row.inactive"),
        flagInactive: t("approvalRules.lead.row.inactiveHint"),
      },
      impact: {
        loading: "…",
        summary: (change, total) => t("assignmentRules.impact", { change, total }),
        apply: t("assignmentRules.action.apply"),
        applyTitle: t("assignmentRules.action.applyTitle"),
        applyDescription: (change, total) =>
          t("assignmentRules.action.applyDesc", { change, total }),
        applyNone: t("assignmentRules.action.applyNone"),
        applyConfirm: (count) => t("assignmentRules.action.applyConfirm", { count }),
        cancel: t("assignmentRules.action.cancel"),
      },
      editor: {
        category: t("assignmentRules.new.category"),
        categoryPlaceholder: t("assignmentRules.new.categoryPlaceholder"),
        reference: t("assignmentRules.scope.verwendungszweck"),
        referencePlaceholder: t("assignmentRules.new.patternPlaceholder"),
        referenceHint: t("assignmentRules.new.patternHint"),
        scopeRequired: t("assignmentRules.new.scopeHint"),
        categoryRequired: t("assignmentRules.new.valueMissing"),
        duplicate: t("assignmentRules.new.alreadyExists"),
        preview: (change, total) => t("assignmentRules.new.previewText", { change, total }),
        previewNone: t("assignmentRules.action.applyNone"),
        save: t("approvalRules.lead.editor.save"),
        saving: t("approvalRules.lead.editor.saving"),
        cancel: t("assignmentRules.action.cancel"),
      },
      remove: {
        title: t("approvalRules.lead.delete.title"),
        description: t("approvalRules.lead.delete.desc"),
        reason: t("approvalRules.lead.delete.grund"),
        reasonPlaceholder: t("approvalRules.lead.delete.reasonPlaceholder"),
        confirm: t("approvalRules.lead.delete.confirm"),
        cancel: t("approvalRules.lead.delete.cancel"),
      },
      tester: {
        title: t("assignmentRules.test.title"),
        hint: t("assignmentRules.test.hint"),
        reference: t("assignmentRules.test.verwendungszweck"),
        referencePlaceholder: t("assignmentRules.test.verwendungszweckPlaceholder"),
        check: t("assignmentRules.test.check"),
        reset: t("assignmentRules.test.reset"),
        idle: t("assignmentRules.test.empty"),
        idleHint: t("assignmentRules.test.emptyHint"),
        winnerHeading: t("assignmentRules.test.applies"),
        outrankedTitle: t("assignmentRules.test.outrankedTitle"),
        alsoMatching: (count) => t("assignmentRules.test.more", { count }),
        onlyMatch: t("assignmentRules.test.onlyOne"),
        none: t("assignmentRules.test.none"),
        noneHint: t("assignmentRules.test.noneHint"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("assignmentRules.toast.saved"),
        deleted: t("assignmentRules.toast.deleted"),
        activated: t("assignmentRules.toast.activated"),
        deactivated: t("assignmentRules.toast.deactivated"),
        applied: (changed, matches) => t("assignmentRules.toast.applied", { changed, matches }),
        appliedSkipped: (changed, matches, skipped) =>
          t("assignmentRules.toast.appliedSkipped", { changed, matches, skipped }),
        appliedNone: t("assignmentRules.toast.appliedNone"),
        failed: (error) => t("assignmentRules.toast.failed", { error }),
      },
    }),
    [t],
  );
}
