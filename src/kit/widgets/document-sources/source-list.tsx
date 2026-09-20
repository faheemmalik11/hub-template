import { Plus } from "lucide-react";

import { ErrorState } from "../../components/feedback/query-states";
import { Skeleton } from "../../ui/skeleton";
import type { DocumentSource, RunNowFolder } from "../../adapters/document-sources";
import type { DocumentSourcesLabels } from "../../pages/document-sources/labels";
import type { DocumentSourcesRouter } from "../../pages/document-sources/router";
import { SourceRow } from "./source-row";

export interface SourceListProps {
  sources: DocumentSource[];
  labels: DocumentSourcesLabels;
  LinkComponent: DocumentSourcesRouter["Link"];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOpen: (sourceId: string) => void;
  onConnect?: (sourceId: string) => void;
  onAskForARun?: (sourceId: string, folders?: RunNowFolder[]) => Promise<void>;
  onAddSource?: () => void;
  className?: string;
}

export function SourceList({
  sources,
  labels,
  LinkComponent,
  loading,
  error,
  onRetry,
  onOpen,
  onConnect,
  onAskForARun,
  onAddSource,
  className,
}: SourceListProps) {
  if (error) {
    return (
      <div className={className}>
        <ErrorState error={error} onRetry={onRetry ?? (() => {})} />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`${className ?? ""} space-y-px overflow-hidden rounded-xl border border-border`}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[72px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        data-tour="document-sources-list"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
      >
        {sources.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{labels.noSources}</p>
        )}
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            labels={labels}
            LinkComponent={LinkComponent}
            onOpen={() => onOpen(source.id)}
            onConnect={onConnect ? () => onConnect(source.id) : undefined}
            onAskForARun={onAskForARun ? (folders) => onAskForARun(source.id, folders) : undefined}
          />
        ))}
      </div>

      {onAddSource && labels.addSourceTitle && (
        <button
          type="button"
          onClick={onAddSource}
          className="mt-3 flex w-full cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border p-4 text-left transition-colors hover:bg-muted/40"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Plus className="size-5 text-muted-foreground" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">
              {labels.addSourceTitle}
            </span>
            <span className="block text-sm text-muted-foreground">{labels.addSourceDetail}</span>
          </span>
        </button>
      )}
    </div>
  );
}
