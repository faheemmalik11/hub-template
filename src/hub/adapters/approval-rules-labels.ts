import { useMemo } from "react";

import type { ApprovalRulesLabels } from "@/kit/pages/approval-rules";

import { useTranslation } from "@/lib/i18n";

export function useApprovalRulesLabels(): ApprovalRulesLabels {
  const { t } = useTranslation();
  return useMemo<ApprovalRulesLabels>(
    () => ({
      title: t("approvalRules.leiter.title"),
      dimension: {
        company: t("approvalRules.leiter.dimension.gesellschaft"),
        supplier: t("approvalRules.leiter.dimension.lieferant"),
        property: t("approvalRules.leiter.dimension.objekt"),
        businessLine: t("approvalRules.leiter.dimension.bereich"),
      },
      any: t("approvalRules.leiter.beliebig"),
      tabs: {
        rules: t("approvalRules.leiter.tabs.regeln"),
        scenario: t("approvalRules.leiter.tabs.szenario"),
      },
      tester: {
        title: t("approvalRules.leiter.test.title"),
        hint: t("approvalRules.leiter.test.hint"),
        amount: t("approvalRules.leiter.test.betrag"),
        check: t("approvalRules.leiter.test.pruefen"),
        reset: t("approvalRules.leiter.test.zuruecksetzen"),
        idle: t("approvalRules.leiter.test.leer"),
        idleHint: t("approvalRules.leiter.test.leerHinweis"),
        winnerHeading: t("approvalRules.leiter.test.trifftZu"),
        outrankedTitle: t("approvalRules.leiter.test.verdraengtTitel"),
        alsoMatching: (count) => t("approvalRules.leiter.test.weitere", { count }),
        onlyMatch: t("approvalRules.leiter.test.einzige"),
        none: t("approvalRules.leiter.test.keine"),
        noneWhy: (chain) => t("approvalRules.leiter.test.keineWarum", { chain }),
      },
      summary: {
        active: (count) => t("approvalRules.leiter.uebersicht.aktiv", { count }),
        issues: (count) => t("approvalRules.leiter.uebersicht.probleme", { count }),
        issuesTitleText: t("approvalRules.leiter.uebersicht.problemeTitel"),
        issuesHint: t("approvalRules.leiter.uebersicht.problemeHinweis"),
      },
      card: {
        when: t("approvalRules.leiter.karte.wenn"),
        amount: t("approvalRules.leiter.karte.betrag"),
        approvers: t("approvalRules.leiter.karte.genehmiger"),
        anyAmount: t("approvalRules.leiter.karte.jederBetrag"),
        atLeast: (amount) => t("approvalRules.leiter.karte.abBetrag", { amount }),
        priority: t("approvalRules.leiter.karte.prioritaet"),
        priorityOf: (position, total) =>
          t("approvalRules.leiter.karte.prioritaetVon", { position, total }),
        actions: t("approvalRules.leiter.karte.aktionen"),
      },
      ladder: {
        newRule: t("approvalRules.leiter.liste.neueRegel"),
        empty: t("approvalRules.leiter.liste.leer"),
      },
      row: {
        edit: t("approvalRules.leiter.zeile.bearbeiten"),
        active: t("approvalRules.leiter.zeile.aktiv"),
        inactive: t("approvalRules.leiter.zeile.inaktiv"),
        activeShort: t("approvalRules.leiter.zeile.aktivKurz"),
        inactiveBadge: t("approvalRules.leiter.zeile.inaktivBadge"),
        flagInactive: t("approvalRules.leiter.zeile.hinweisInaktiv"),
        flagStranded: t("approvalRules.leiter.zeile.hinweisGestrandet"),
        flagOutranked: t("approvalRules.leiter.zeile.hinweisVerdraengt"),
        unknownApprover: t("approvalRules.leiter.zeile.unbekannt"),
        deactivatedSuffix: t("approvalRules.leiter.zeile.deaktiviert"),
        autoStep: t("approvalRules.leiter.zeile.autoSchritt"),
      },
      editor: {
        minAmount: t("approvalRules.leiter.editor.abBetrag"),
        minAmountHint: t("approvalRules.leiter.editor.abBetragHinweis"),
        chain: t("approvalRules.leiter.editor.kette"),
        step: (index) => t("approvalRules.leiter.editor.schritt", { n: index }),
        noFurtherStep: t("approvalRules.leiter.editor.keinWeiterer"),
        chooseApprover: t("approvalRules.leiter.editor.genehmigerWaehlen"),
        scopeRequired: t("approvalRules.leiter.editor.merkmalNoetig"),
        chainHint: t("approvalRules.leiter.editor.ketteHinweis"),
        sameApproverTwice: t("approvalRules.leiter.editor.gleichePerson"),
        stepNeedsPrevious: t("approvalRules.leiter.editor.schrittBrauchtVorherigen"),
        duplicate: t("approvalRules.leiter.editor.schonVorhanden"),
        save: t("approvalRules.leiter.editor.speichern"),
        saving: t("approvalRules.leiter.editor.speichert"),
        cancel: t("approvalRules.leiter.editor.abbrechen"),
        delete: t("approvalRules.leiter.editor.loeschen"),
      },
      remove: {
        title: t("approvalRules.leiter.loeschen.title"),
        description: t("approvalRules.leiter.loeschen.desc"),
        reason: t("approvalRules.leiter.loeschen.grund"),
        reasonPlaceholder: t("approvalRules.leiter.loeschen.grundPlaceholder"),
        confirm: t("approvalRules.leiter.loeschen.bestaetigen"),
        cancel: t("approvalRules.leiter.loeschen.abbrechen"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("approvalRules.leiter.toast.gespeichert"),
        deleted: t("approvalRules.leiter.toast.geloescht"),
        activated: t("approvalRules.leiter.toast.aktiviert"),
        deactivated: t("approvalRules.leiter.toast.deaktiviert"),
        failed: (error) => t("approvalRules.leiter.toast.fehlgeschlagen", { error }),
        unknownError: t("approvalRules.leiter.toast.unbekannterFehler"),
      },
    }),
    [t],
  );
}
