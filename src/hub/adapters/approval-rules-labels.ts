import { useMemo } from "react";

import type { ApprovalRulesLabels } from "@/kit/pages/approval-rules";

import { useTranslation } from "@/lib/i18n";

export function useApprovalRulesLabels(): ApprovalRulesLabels {
  const { t } = useTranslation();
  return useMemo<ApprovalRulesLabels>(
    () => ({
      title: t("freigabeRegeln.leiter.title"),
      dimension: {
        company: t("freigabeRegeln.leiter.dimension.gesellschaft"),
        supplier: t("freigabeRegeln.leiter.dimension.lieferant"),
        property: t("freigabeRegeln.leiter.dimension.objekt"),
        businessLine: t("freigabeRegeln.leiter.dimension.bereich"),
      },
      any: t("freigabeRegeln.leiter.beliebig"),
      tabs: {
        rules: t("freigabeRegeln.leiter.tabs.regeln"),
        scenario: t("freigabeRegeln.leiter.tabs.szenario"),
      },
      tester: {
        title: t("freigabeRegeln.leiter.test.title"),
        hint: t("freigabeRegeln.leiter.test.hint"),
        amount: t("freigabeRegeln.leiter.test.betrag"),
        check: t("freigabeRegeln.leiter.test.pruefen"),
        reset: t("freigabeRegeln.leiter.test.zuruecksetzen"),
        idle: t("freigabeRegeln.leiter.test.leer"),
        idleHint: t("freigabeRegeln.leiter.test.leerHinweis"),
        winnerHeading: t("freigabeRegeln.leiter.test.trifftZu"),
        outrankedTitle: t("freigabeRegeln.leiter.test.verdraengtTitel"),
        alsoMatching: (count) => t("freigabeRegeln.leiter.test.weitere", { count }),
        onlyMatch: t("freigabeRegeln.leiter.test.einzige"),
        none: t("freigabeRegeln.leiter.test.keine"),
        noneWhy: (chain) => t("freigabeRegeln.leiter.test.keineWarum", { chain }),
      },
      summary: {
        active: (count) => t("freigabeRegeln.leiter.uebersicht.aktiv", { count }),
        issues: (count) => t("freigabeRegeln.leiter.uebersicht.probleme", { count }),
        issuesTitleText: t("freigabeRegeln.leiter.uebersicht.problemeTitel"),
        issuesHint: t("freigabeRegeln.leiter.uebersicht.problemeHinweis"),
      },
      card: {
        when: t("freigabeRegeln.leiter.karte.wenn"),
        amount: t("freigabeRegeln.leiter.karte.betrag"),
        approvers: t("freigabeRegeln.leiter.karte.genehmiger"),
        anyAmount: t("freigabeRegeln.leiter.karte.jederBetrag"),
        atLeast: (amount) => t("freigabeRegeln.leiter.karte.abBetrag", { amount }),
        priority: t("freigabeRegeln.leiter.karte.prioritaet"),
        priorityOf: (position, total) =>
          t("freigabeRegeln.leiter.karte.prioritaetVon", { position, total }),
        actions: t("freigabeRegeln.leiter.karte.aktionen"),
      },
      ladder: {
        newRule: t("freigabeRegeln.leiter.liste.neueRegel"),
        empty: t("freigabeRegeln.leiter.liste.leer"),
      },
      row: {
        edit: t("freigabeRegeln.leiter.zeile.bearbeiten"),
        active: t("freigabeRegeln.leiter.zeile.aktiv"),
        inactive: t("freigabeRegeln.leiter.zeile.inaktiv"),
        activeShort: t("freigabeRegeln.leiter.zeile.aktivKurz"),
        inactiveBadge: t("freigabeRegeln.leiter.zeile.inaktivBadge"),
        flagInactive: t("freigabeRegeln.leiter.zeile.hinweisInaktiv"),
        flagStranded: t("freigabeRegeln.leiter.zeile.hinweisGestrandet"),
        flagOutranked: t("freigabeRegeln.leiter.zeile.hinweisVerdraengt"),
        unknownApprover: t("freigabeRegeln.leiter.zeile.unbekannt"),
        deactivatedSuffix: t("freigabeRegeln.leiter.zeile.deaktiviert"),
        autoStep: t("freigabeRegeln.leiter.zeile.autoSchritt"),
      },
      editor: {
        minAmount: t("freigabeRegeln.leiter.editor.abBetrag"),
        minAmountHint: t("freigabeRegeln.leiter.editor.abBetragHinweis"),
        chain: t("freigabeRegeln.leiter.editor.kette"),
        step: (index) => t("freigabeRegeln.leiter.editor.schritt", { n: index }),
        noFurtherStep: t("freigabeRegeln.leiter.editor.keinWeiterer"),
        chooseApprover: t("freigabeRegeln.leiter.editor.genehmigerWaehlen"),
        scopeRequired: t("freigabeRegeln.leiter.editor.merkmalNoetig"),
        chainHint: t("freigabeRegeln.leiter.editor.ketteHinweis"),
        sameApproverTwice: t("freigabeRegeln.leiter.editor.gleichePerson"),
        stepNeedsPrevious: t("freigabeRegeln.leiter.editor.schrittBrauchtVorherigen"),
        duplicate: t("freigabeRegeln.leiter.editor.schonVorhanden"),
        save: t("freigabeRegeln.leiter.editor.speichern"),
        saving: t("freigabeRegeln.leiter.editor.speichert"),
        cancel: t("freigabeRegeln.leiter.editor.abbrechen"),
        delete: t("freigabeRegeln.leiter.editor.loeschen"),
      },
      remove: {
        title: t("freigabeRegeln.leiter.loeschen.title"),
        description: t("freigabeRegeln.leiter.loeschen.desc"),
        reason: t("freigabeRegeln.leiter.loeschen.grund"),
        reasonPlaceholder: t("freigabeRegeln.leiter.loeschen.grundPlaceholder"),
        confirm: t("freigabeRegeln.leiter.loeschen.bestaetigen"),
        cancel: t("freigabeRegeln.leiter.loeschen.abbrechen"),
      },
      pagination: {
        perPage: t("common.pagination.perPage"),
        showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
        pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
        previous: t("common.pagination.prev"),
        next: t("common.pagination.next"),
      },
      toast: {
        saved: t("freigabeRegeln.leiter.toast.gespeichert"),
        deleted: t("freigabeRegeln.leiter.toast.geloescht"),
        activated: t("freigabeRegeln.leiter.toast.aktiviert"),
        deactivated: t("freigabeRegeln.leiter.toast.deaktiviert"),
        failed: (error) => t("freigabeRegeln.leiter.toast.fehlgeschlagen", { error }),
        unknownError: t("freigabeRegeln.leiter.toast.unbekannterFehler"),
      },
    }),
    [t],
  );
}
