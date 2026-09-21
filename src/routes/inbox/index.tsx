import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { DocumentSourcesPage } from "@/kit/pages";
import type { DocumentSourcesLabels } from "@/kit/pages";
import { useTanstackDocumentSourcesRouter } from "@/kit/pages/document-sources/tanstack-router";

import { useDocumentSourcesAdapter } from "@/hub/adapters/document-sources";
import { useFilingFolders, useMailboxFolders } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/inbox/")({
  head: () => ({ meta: [{ title: pageTitle("Postfach & Ablage") }] }),
  component: InboxPage,
});

function InboxPage() {
  const { t } = useTranslation();
  const adapter = useDocumentSourcesAdapter();
  const router = useTanstackDocumentSourcesRouter();
  // The sheet already hides UNKNOWN options while the folder list loads, but it still labels an
  // already-selected id it cannot resolve yet as "Unknown entry …3tAAA=". Until the names arrive
  // every saved folder reads as broken, so say it is loading instead of showing the raw id.
  const mailboxFolders = useMailboxFolders();
  const filingFolders = useFilingFolders();
  const foldersLoading = mailboxFolders.isLoading || filingFolders.isLoading;
  // The chips are rendered inside the kit's sheet and its label is typed to a plain string, so a
  // real skeleton element cannot be passed in. Flag the document instead and let styles.css draw
  // one over the placeholder text.
  useEffect(() => {
    const root = document.documentElement;
    if (foldersLoading) root.setAttribute("data-folders-loading", "");
    else root.removeAttribute("data-folders-loading");
    return () => root.removeAttribute("data-folders-loading");
  }, [foldersLoading]);

  const labels: DocumentSourcesLabels = {
    title: t("sources.pageTitle"),
    subtitle: t("sources.pageSubtitle"),
    filingActive: t("sources.filingActive"),
    filingActiveDetail: t("sources.filingActiveDetail"),
    filingInactive: t("sources.filingInactive"),
    filingInactiveDetail: t("sources.filingInactiveDetail"),
    lastRun: t("sources.lastRun"),
    viewLogs: t("sources.viewLogs"),
    sourcesTitle: t("sources.sourcesTitle"),
    noSources: t("sources.noSources"),
    statusConnected: t("sources.statusConnected"),
    statusNotConnected: t("sources.statusNotConnected"),
    statusNotConfigured: t("sources.statusNotConfigured"),
    edit: t("sources.edit"),
    open: t("sources.open"),
    connect: t("sources.connect"),
    setUp: t("sources.setUp"),
    runNow: t("sources.runNow"),
    runNowAsked: t("sources.runNowAsked"),
    runNowRunning: t("sources.runNowRunning"),
    runNowFound: (count: number) =>
      count === 1 ? t("sources.runNowFoundOne") : t("sources.runNowFound", { count }),
    runNowFailed: t("sources.runNowFailed"),
    // The folders a run asked for, shown as they were picked. Without this label the kit falls back
    // to "the usual folders" for every run, so a run on chosen folders read as a normal one.
    runNowReadingFolders: (names: string) => names,
    runNowDialog: {
      title: (source: string) => t("sources.runNowDialogTitle", { source }),
      description: t("sources.runNowDialogDescription"),
      defaultRun: t("sources.runNowDefault"),
      defaultRunHint: t("sources.runNowDefaultHint"),
      chosenFolders: t("sources.runNowChosen"),
      chosenFoldersHint: t("sources.runNowChosenHint"),
      limits: t("sources.runNowLimits"),
      cancel: t("sources.runNowCancel"),
      start: t("sources.runNowStart"),
      starting: t("sources.runNowStarting"),
    },
    footerTitle: t("sources.footerTitle"),
    footerDetail: t("sources.footerDetail"),
    nextRun: t("sources.nextRun"),
    sheet: {
      close: t("sources.sheet.close"),
      refreshOptions: t("sources.sheet.refreshOptions"),
      optionsLoading: t("sources.sheet.optionsLoading"),
      optionsFailed: t("sources.sheet.optionsFailed"),
      unknownValue: (shortId) =>
        foldersLoading
          ? t("sources.sheet.optionsLoading")
          : `${t("sources.sheet.unknownValuePrefix")} ${shortId}`,
      selectedCount: (count) => t("sources.sheet.selectedCount", { count }),
      searchPlaceholder: t("sources.sheet.searchPlaceholder"),
      noMatch: t("sources.sheet.noMatch"),
      recentRuns: t("sources.runs.title"),
      lastChangedBy: (name) => `${t("sources.sheet.lastChangedByPrefix")} ${name}`,
      adminOnly: t("sources.sheet.adminOnly"),
      testConnection: t("sources.sheet.testConnection"),
      testRunning: t("sources.sheet.testRunning"),
      advanced: t("sources.sheet.advanced"),
      none: t("sources.sheet.none"),
      cancel: t("sources.sheet.cancel"),
      save: t("sources.sheet.save"),
      saving: t("sources.sheet.saving"),
      saveFailed: t("sources.sheet.saveFailed"),
      saved: t("sources.sheet.saved"),
    },
  };

  return (
    <DocumentSourcesPage
      adapter={adapter}
      router={router}
      labels={labels}
      links={{ logs: "/activity-log" }}
    />
  );
}
