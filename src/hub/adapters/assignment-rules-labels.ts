import { useMemo } from "react";

import type { AssignmentRulesLabels } from "@/kit/pages/assignment-rules";

import { useTranslation } from "@/lib/i18n";

export function useAssignmentRulesLabels(): AssignmentRulesLabels {
  const { t } = useTranslation();
  return useMemo<AssignmentRulesLabels>(
    () => ({
      dimension: {
        company: t("assignmentRules.scope.gesellschaft"),
        supplier: t("assignmentRules.scope.lieferant"),
        property: t("assignmentRules.scope.objekt"),
        businessLine: t("approvalRules.leiter.dimension.bereich"),
      },
      reference: t("assignmentRules.scope.verwendungszweck"),
      any: t("approvalRules.leiter.beliebig"),
      tabs: {
        rules: t("assignmentRules.tab.regeln"),
        playground: t("assignmentRules.tab.spielplatz"),
      },
      toolbar: {
        search: t("assignmentRules.list.suche"),
        newRule: t("assignmentRules.neu.button.cost_category"),
      },
      empty: {
        title: t("assignmentRules.list.empty"),
        hint: t("assignmentRules.list.emptyHint"),
        noMatches: t("assignmentRules.list.keineTreffer"),
        noMatchesHint: t("assignmentRules.list.keineTrefferHint"),
      },
      card: {
        value: t("assignmentRules.col.wert"),
        scope: t("assignmentRules.col.geltungsbereich"),
        impact: t("assignmentRules.col.wirkung"),
        active: t("assignmentRules.col.aktiv"),
        actions: t("assignmentRules.col.aktionen"),
      },
      row: {
        edit: t("assignmentRules.action.bearbeiten"),
        delete: t("assignmentRules.action.loeschen"),
        active: t("approvalRules.leiter.zeile.aktiv"),
        inactive: t("approvalRules.leiter.zeile.inaktiv"),
        flagInactive: t("approvalRules.leiter.zeile.hinweisInaktiv"),
      },
      impact: {
        loading: "…",
        summary: (change, total) => t("assignmentRules.wirkung", { change, total }),
        apply: t("assignmentRules.action.anwenden"),
        applyTitle: t("assignmentRules.action.anwendenTitle"),
        applyDescription: (change, total) =>
          t("assignmentRules.action.anwendenDesc", { change, total }),
        applyNone: t("assignmentRules.action.anwendenKeine"),
        applyConfirm: (count) => t("assignmentRules.action.anwendenConfirm", { count }),
        cancel: t("assignmentRules.action.abbrechen"),
      },
      editor: {
        category: t("assignmentRules.neu.kategorie"),
        categoryPlaceholder: t("assignmentRules.neu.kategoriePlaceholder"),
        reference: t("assignmentRules.scope.verwendungszweck"),
        referencePlaceholder: t("assignmentRules.neu.musterPlaceholder"),
        referenceHint: t("assignmentRules.neu.musterHint"),
        scopeRequired: t("assignmentRules.neu.geltungsbereichHint"),
        categoryRequired: t("assignmentRules.neu.wertFehlt"),
        duplicate: t("assignmentRules.neu.schonVorhanden"),
        preview: (change, total) => t("assignmentRules.neu.vorschauText", { change, total }),
        previewNone: t("assignmentRules.action.anwendenKeine"),
        save: t("approvalRules.leiter.editor.speichern"),
        saving: t("approvalRules.leiter.editor.speichert"),
        cancel: t("assignmentRules.action.abbrechen"),
      },
      remove: {
        title: t("approvalRules.leiter.loeschen.title"),
        description: t("approvalRules.leiter.loeschen.desc"),
        reason: t("approvalRules.leiter.loeschen.grund"),
        reasonPlaceholder: t("approvalRules.leiter.loeschen.grundPlaceholder"),
        confirm: t("approvalRules.leiter.loeschen.bestaetigen"),
        cancel: t("approvalRules.leiter.loeschen.abbrechen"),
      },
      tester: {
        title: t("assignmentRules.test.title"),
        hint: t("assignmentRules.test.hint"),
        reference: t("assignmentRules.test.verwendungszweck"),
        referencePlaceholder: t("assignmentRules.test.verwendungszweckPlaceholder"),
        check: t("assignmentRules.test.pruefen"),
        reset: t("assignmentRules.test.zuruecksetzen"),
        idle: t("assignmentRules.test.leer"),
        idleHint: t("assignmentRules.test.leerHinweis"),
        winnerHeading: t("assignmentRules.test.trifftZu"),
        outrankedTitle: t("assignmentRules.test.verdraengtTitel"),
        alsoMatching: (count) => t("assignmentRules.test.weitere", { count }),
        onlyMatch: t("assignmentRules.test.einzige"),
        none: t("assignmentRules.test.keine"),
        noneHint: t("assignmentRules.test.keineHinweis"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("assignmentRules.toast.gespeichert"),
        deleted: t("assignmentRules.toast.geloescht"),
        activated: t("assignmentRules.toast.aktiviert"),
        deactivated: t("assignmentRules.toast.deaktiviert"),
        applied: (changed, matches) => t("assignmentRules.toast.angewendet", { changed, matches }),
        appliedSkipped: (changed, matches, skipped) =>
          t("assignmentRules.toast.angewendetUebersprungen", { changed, matches, skipped }),
        appliedNone: t("assignmentRules.toast.angewendetKeine"),
        failed: (error) => t("assignmentRules.toast.fehlgeschlagen", { error }),
      },
    }),
    [t],
  );
}
