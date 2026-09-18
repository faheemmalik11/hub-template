import { useMemo } from "react";

import type { AssignmentRulesLabels } from "@hub-kit/core/assignment-rules";

import { useTranslation } from "@/lib/i18n";

export function useAssignmentRulesLabels(): AssignmentRulesLabels {
  const { t } = useTranslation();
  return useMemo<AssignmentRulesLabels>(
    () => ({
      dimension: {
        company: t("zuordnungsregeln.scope.gesellschaft"),
        supplier: t("zuordnungsregeln.scope.lieferant"),
        property: t("zuordnungsregeln.scope.objekt"),
        businessLine: t("freigabeRegeln.leiter.dimension.bereich"),
      },
      reference: t("zuordnungsregeln.scope.verwendungszweck"),
      any: t("freigabeRegeln.leiter.beliebig"),
      tabs: {
        rules: t("zuordnungsregeln.tab.regeln"),
        playground: t("zuordnungsregeln.tab.spielplatz"),
      },
      toolbar: {
        search: t("zuordnungsregeln.list.suche"),
        newRule: t("zuordnungsregeln.neu.button.cost_category"),
      },
      empty: {
        title: t("zuordnungsregeln.list.empty"),
        hint: t("zuordnungsregeln.list.emptyHint"),
        noMatches: t("zuordnungsregeln.list.keineTreffer"),
        noMatchesHint: t("zuordnungsregeln.list.keineTrefferHint"),
      },
      card: {
        value: t("zuordnungsregeln.col.wert"),
        scope: t("zuordnungsregeln.col.geltungsbereich"),
        impact: t("zuordnungsregeln.col.wirkung"),
        active: t("zuordnungsregeln.col.aktiv"),
        actions: t("zuordnungsregeln.col.aktionen"),
      },
      row: {
        edit: t("zuordnungsregeln.action.bearbeiten"),
        delete: t("zuordnungsregeln.action.loeschen"),
        active: t("freigabeRegeln.leiter.zeile.aktiv"),
        inactive: t("freigabeRegeln.leiter.zeile.inaktiv"),
        flagInactive: t("freigabeRegeln.leiter.zeile.hinweisInaktiv"),
      },
      impact: {
        loading: "…",
        summary: (change, total) => t("zuordnungsregeln.wirkung", { change, total }),
        apply: t("zuordnungsregeln.action.anwenden"),
        applyTitle: t("zuordnungsregeln.action.anwendenTitle"),
        applyDescription: (change, total) =>
          t("zuordnungsregeln.action.anwendenDesc", { change, total }),
        applyNone: t("zuordnungsregeln.action.anwendenKeine"),
        applyConfirm: (count) => t("zuordnungsregeln.action.anwendenConfirm", { count }),
        cancel: t("zuordnungsregeln.action.abbrechen"),
      },
      editor: {
        category: t("zuordnungsregeln.neu.kategorie"),
        categoryPlaceholder: t("zuordnungsregeln.neu.kategoriePlaceholder"),
        reference: t("zuordnungsregeln.scope.verwendungszweck"),
        referencePlaceholder: t("zuordnungsregeln.neu.musterPlaceholder"),
        referenceHint: t("zuordnungsregeln.neu.musterHint"),
        scopeRequired: t("zuordnungsregeln.neu.geltungsbereichHint"),
        categoryRequired: t("zuordnungsregeln.neu.wertFehlt"),
        duplicate: t("zuordnungsregeln.neu.schonVorhanden"),
        preview: (change, total) => t("zuordnungsregeln.neu.vorschauText", { change, total }),
        previewNone: t("zuordnungsregeln.action.anwendenKeine"),
        save: t("freigabeRegeln.leiter.editor.speichern"),
        saving: t("freigabeRegeln.leiter.editor.speichert"),
        cancel: t("zuordnungsregeln.action.abbrechen"),
      },
      remove: {
        title: t("freigabeRegeln.leiter.loeschen.title"),
        description: t("freigabeRegeln.leiter.loeschen.desc"),
        reason: t("freigabeRegeln.leiter.loeschen.grund"),
        reasonPlaceholder: t("freigabeRegeln.leiter.loeschen.grundPlaceholder"),
        confirm: t("freigabeRegeln.leiter.loeschen.bestaetigen"),
        cancel: t("freigabeRegeln.leiter.loeschen.abbrechen"),
      },
      tester: {
        title: t("zuordnungsregeln.test.title"),
        hint: t("zuordnungsregeln.test.hint"),
        reference: t("zuordnungsregeln.test.verwendungszweck"),
        referencePlaceholder: t("zuordnungsregeln.test.verwendungszweckPlaceholder"),
        check: t("zuordnungsregeln.test.pruefen"),
        reset: t("zuordnungsregeln.test.zuruecksetzen"),
        idle: t("zuordnungsregeln.test.leer"),
        idleHint: t("zuordnungsregeln.test.leerHinweis"),
        winnerHeading: t("zuordnungsregeln.test.trifftZu"),
        outrankedTitle: t("zuordnungsregeln.test.verdraengtTitel"),
        alsoMatching: (count) => t("zuordnungsregeln.test.weitere", { count }),
        onlyMatch: t("zuordnungsregeln.test.einzige"),
        none: t("zuordnungsregeln.test.keine"),
        noneHint: t("zuordnungsregeln.test.keineHinweis"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("zuordnungsregeln.toast.gespeichert"),
        deleted: t("zuordnungsregeln.toast.geloescht"),
        activated: t("zuordnungsregeln.toast.aktiviert"),
        deactivated: t("zuordnungsregeln.toast.deaktiviert"),
        applied: (changed, matches) => t("zuordnungsregeln.toast.angewendet", { changed, matches }),
        appliedSkipped: (changed, matches, skipped) =>
          t("zuordnungsregeln.toast.angewendetUebersprungen", { changed, matches, skipped }),
        appliedNone: t("zuordnungsregeln.toast.angewendetKeine"),
        failed: (error) => t("zuordnungsregeln.toast.fehlgeschlagen", { error }),
      },
    }),
    [t],
  );
}
