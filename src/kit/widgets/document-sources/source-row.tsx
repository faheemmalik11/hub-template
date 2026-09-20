import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Plus, RefreshCw } from "lucide-react";

import type {
  DocumentSource,
  RunNowFolder,
  SourceRunRequest,
} from "../../adapters/document-sources";
import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";
import { SourceIconBadge, StatusChip } from "../../pages/document-sources/source-visuals";
import { RunNowDialog } from "../../pages/document-sources/RunNowDialog";
import type { DocumentSourcesLabels } from "../../pages/document-sources/labels";
import type { DocumentSourcesRouter } from "../../pages/document-sources/router";
import { Skeleton } from "../../ui/skeleton";

function withoutTrailingDots(text: string): string {
  return text.replace(/\s*(…|\.\.\.)$/, "");
}

/** What a run somebody asked for is doing. Nothing at all until somebody asks. */
function RunRequestLine({
  request,
  labels,
}: {
  request: SourceRunRequest | undefined;
  labels: DocumentSourcesLabels;
}) {
  if (!request || request.status === "idle") return null;

  // Which folders, when somebody picked them: "the usual folders" needs no saying.
  const folders =
    request.folderNames && request.folderNames.length > 0 && labels.runNowReadingFolders
      ? labels.runNowReadingFolders(request.folderNames.join(", "))
      : null;

  if (request.status === "pending" || request.status === "running") {
    const text = request.status === "running" ? labels.runNowRunning : labels.runNowAsked;
    if (!text) return null;
    // The only sign a run is going, so it always says what is being read.
    const what = folders ?? labels.runNowReadingUsual ?? labels.runNowDialog?.defaultRun;
    return (
      <p className="mt-2.5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span className="truncate" title={what ?? undefined}>
          {what ? `${withoutTrailingDots(text)} · ${what}` : text}
        </span>
      </p>
    );
  }

  if (request.status === "failed") {
    // The note says what went wrong and what to do, so it is shown rather than summarised.
    return (
      <p className="mt-2.5 text-sm text-destructive" title={request.note ?? undefined}>
        {labels.runNowFailed}
        {request.note ? `: ${request.note}` : ""}
        {folders && ` · ${folders}`}
      </p>
    );
  }

  const found = labels.runNowFound?.(request.processedCount ?? 0);
  if (!found) return null;
  return (
    <p className="mt-2.5 flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
      <span className="truncate" title={folders ?? undefined}>
        {found}
        {folders && ` · ${folders}`}
      </span>
    </p>
  );
}

export function SourceRow({
  source,
  labels,
  LinkComponent,
  onOpen,
  onConnect,
  onAskForARun,
}: {
  source: DocumentSource;
  labels: DocumentSourcesLabels;
  LinkComponent: DocumentSourcesRouter["Link"];
  onOpen: () => void;
  onConnect?: () => void;
  onAskForARun?: (folders?: RunNowFolder[]) => Promise<void>;
}) {
  const selectedItems = source.selectedItems ?? [];
  const hasSelectedItems = selectedItems.length > 0;
  const needsConnect = source.status === "not_connected" && onConnect !== undefined;

  // Asking is optimistic: the row reaches us over Realtime, and until it does the button would
  // otherwise sit there looking as though the press did nothing.
  const [asking, setAsking] = useState(false);
  const status = source.runRequest?.status ?? "idle";
  const busy = asking || status === "pending" || status === "running";
  // Nothing to run for a source that is not connected yet, and no button without a label for it.
  const canRunNow =
    onAskForARun !== undefined &&
    labels.runNow !== undefined &&
    source.status === "connected" &&
    !source.asksForItself;

  // A channel with folders asks what to read; one without runs as its schedule would.
  const [choosing, setChoosing] = useState(false);

  async function ask(folders?: RunNowFolder[]) {
    setAsking(true);
    try {
      await onAskForARun?.(folders);
    } finally {
      setAsking(false);
    }
  }

  function press() {
    if (source.runNowFolders) setChoosing(true);
    else void ask();
  }
  const actionLabel = needsConnect
    ? labels.connect
    : source.status === "not_configured"
      ? labels.setUp
      : labels.edit;

  return (
    // Anchored per source so a tour can point at one row: the mailbox that feeds the Hub, or the
    // filing that everything lands in, rather than at the list as a whole.
    <div data-tour={`document-source-${source.id}`} className="flex items-start gap-4 p-4">
      <SourceIconBadge icon={source.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold text-foreground">{source.name}</p>
          <StatusChip status={source.status} labels={labels} />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{source.detail}</p>
        {hasSelectedItems ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {source.selectedItemsLabel && (
              <span className="text-xs text-muted-foreground">{source.selectedItemsLabel}</span>
            )}
            {source.selectedItemsLoading
              ? selectedItems.map((item) => (
                  <Skeleton key={item} className="h-[22px] w-24 rounded-md" />
                ))
              : selectedItems.map((item) => (
                  <span
                    key={item}
                    title={item}
                    className="max-w-40 truncate rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-foreground"
                  >
                    {item}
                  </span>
                ))}
          </div>
        ) : (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.statusDetail}</p>
        )}
        {source.secondaryItems && source.secondaryItems.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {source.secondaryIcon && (
              <SourceIconBadge
                icon={source.secondaryIcon}
                className="size-4 rounded bg-transparent"
              />
            )}
            {source.secondaryItemsLabel && (
              <span className="text-xs text-muted-foreground">{source.secondaryItemsLabel}</span>
            )}
            {source.secondaryItems.map((item) => (
              // The row wraps, so a filing destination gets the width it needs and only
              // truncates once it outgrows the card. A folder name cut to "Antonius Apotheke
              // Doc..." names nothing, and this row carries one chip where the row above carries
              // many.
              <span
                key={item}
                title={item}
                className="max-w-full truncate rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        )}
        <RunRequestLine request={source.runRequest} labels={labels} />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {canRunNow && source.runNowFolders && (
          <RunNowDialog
            open={choosing}
            onOpenChange={setChoosing}
            sourceName={source.name}
            folderField={source.runNowFolders}
            labels={labels}
            onStart={(folders) => ask(folders ?? undefined)}
          />
        )}
        {canRunNow && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={press}
            title={labels.runNow}
          >
            {/* The line under the card says a run is going; the button only stops a second ask. */}
            {asking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span className="ml-1.5">{labels.runNow}</span>
          </Button>
        )}
        {source.fields.length > 0 || needsConnect ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-20"
            onClick={needsConnect ? onConnect : onOpen}
          >
            {actionLabel}
          </Button>
        ) : source.link && labels.open ? (
          <Button asChild variant="outline" size="sm" className="min-w-20">
            <LinkComponent to={source.link}>{labels.open}</LinkComponent>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
