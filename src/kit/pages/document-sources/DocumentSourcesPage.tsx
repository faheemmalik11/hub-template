import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleHelp,
  Clock,
  History,
  Info,
  Loader2,
  PauseCircle,
  Plus,
  RefreshCw,
} from "lucide-react";

import type {
  DocumentSource,
  DocumentSourcesAdapter,
  RunNowFolder,
  SourceRunRequest,
} from "../../adapters/document-sources";
import { Button } from "../../ui/button";
import { ErrorState } from "../../components/feedback/query-states";
import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../lib/class-names";
import { SourceIconBadge, StatusChip } from "./source-visuals";
import { RunNowDialog } from "./RunNowDialog";
import { SourceSettingsSheet } from "./SourceSettingsSheet";
import { FilingStatusCard, SourceList, useFocusHighlight } from "../../widgets/document-sources";
import { englishDocumentSourcesLabels, type DocumentSourcesLabels } from "./labels";
import type { DocumentSourcesRouter } from "./router";

export interface DocumentSourcesPageProps {
  adapter: DocumentSourcesAdapter;
  /** No default — see the comment on `DocumentSourcesRouter` for why. */
  router: DocumentSourcesRouter;
  links?: { logs?: string; help?: string };
  labels?: DocumentSourcesLabels;
  className?: string;
}

export function DocumentSourcesPage({
  adapter,
  router,
  links,
  labels = englishDocumentSourcesLabels,
  className,
}: DocumentSourcesPageProps) {
  const filing = adapter.useFilingStatus();
  const sourcesQuery = adapter.useSources();
  const canEdit = adapter.useCanEdit ? adapter.useCanEdit() : true;
  const sources = sourcesQuery.data ?? [];

  const hash = router.useHash();
  const openSourceId = (hash ?? "").replace(/^#/, "");
  const openSource = sources.find((source) => source.id === openSourceId) ?? null;

  const focus = router.useFocusParam();
  useFocusHighlight(focus, openSource?.id);

  const openSourceSheet = (sourceId: string) => router.openSource(sourceId);
  const closeSourceSheet = () => router.closeSource();

  return (
    <div className={cn("max-w-4xl", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1
          data-tour="document-sources-title"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {labels.title}
        </h1>
        {labels.howItWorks && links?.help && (
          <Button asChild variant="outline" size="sm">
            <a href={links.help} target="_blank" rel="noreferrer">
              <CircleHelp />
              {labels.howItWorks}
            </a>
          </Button>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {labels.subtitle}
        {labels.learnMore && links?.help && (
          <>
            {" "}
            <a
              href={links.help}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {labels.learnMore}
            </a>
          </>
        )}
      </p>

      <FilingStatusCard
        status={filing}
        labels={labels}
        logsLink={links?.logs ? { to: links.logs, Link: router.Link } : undefined}
      />

      <h2 className="mt-8 text-sm font-semibold text-foreground">{labels.sourcesTitle}</h2>

      <SourceList
        className="mt-3"
        sources={sources}
        labels={labels}
        LinkComponent={router.Link}
        loading={sourcesQuery.isLoading}
        error={sourcesQuery.isError ? sourcesQuery.error : undefined}
        onRetry={sourcesQuery.refetch}
        onOpen={openSourceSheet}
        onConnect={adapter.connect}
        onAskForARun={
          adapter.askForARun
            ? (sourceId, folders) => adapter.askForARun?.(sourceId, folders) ?? Promise.resolve()
            : undefined
        }
        onAddSource={adapter.addSource}
      />

      <div className="mt-8 flex items-start gap-3 rounded-xl bg-accent p-4 text-accent-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">{labels.footerTitle}</p>
          <p className="text-sm text-accent-foreground/80">{labels.footerDetail}</p>
          {labels.nextRun && filing.nextRunLabel && (
            <p className="flex items-center gap-1.5 pt-1 text-sm">
              <Clock className="size-3.5 shrink-0" />
              <span className="text-accent-foreground/80">{labels.nextRun}:</span>
              <span className="font-medium">{filing.nextRunLabel}</span>
            </p>
          )}
        </div>
      </div>

      <SourceSettingsSheet
        source={openSource}
        labels={labels}
        canEdit={canEdit}
        onClose={closeSourceSheet}
        onSave={adapter.saveSource}
        onRefreshOptions={adapter.refreshOptions}
        onLoadFieldOptions={adapter.loadFieldOptions}
        onTestConnection={adapter.testConnection}
      />
    </div>
  );
}
