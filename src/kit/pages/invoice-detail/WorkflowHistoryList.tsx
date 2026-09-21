import { ArrowUp } from "lucide-react";

import { cn } from "../../lib/class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { InvoiceHistoryEntry } from "../../components/invoice-review/pipeline-types";

export interface WorkflowHistoryRow {
  entry: InvoiceHistoryEntry;
  from: string;
  to: string;
  qualifier: string | null;
  comment: string | null;
  durationMs: number;
}

export interface WorkflowHistoryLabels {
  emptyText: string;
  actorSystem: string;
  actingAs: (name: string) => string;
  reason: string;
  arrivedLabel: string;
  formatDateTime: (iso: string) => string;
  durationShort: (value: number, unit: "minutes" | "hours" | "days") => string;
}

function durationParts(ms: number): { value: number; unit: "minutes" | "hours" | "days" } {
  const minutes = ms / 60_000;
  if (minutes < 60) return { value: Math.max(1, Math.round(minutes)), unit: "minutes" };
  const hours = minutes / 60;
  if (hours < 24) return { value: Math.round(hours), unit: "hours" };
  return { value: Math.round(hours / 24), unit: "days" };
}

export function WorkflowHistoryList({
  rows,
  arrivedAt,
  labels,
}: {
  rows: WorkflowHistoryRow[];
  arrivedAt?: string | null;
  labels: WorkflowHistoryLabels;
}) {
  if (rows.length === 0) {
    return <p className="text-base text-muted-foreground">{labels.emptyText}</p>;
  }
  const display = [...rows].reverse();
  return (
    <ol>
      {display.map(({ entry, to, qualifier, comment, durationMs }, i) => {
        const newest = i === 0;
        const duration = durationParts(durationMs);
        const actingAs = (entry.data as { handelnd_als?: string | null } | null)?.handelnd_als;
        const bad = entry.type === "ablehnung" || entry.type === "zahlung_fehlgeschlagen";
        const chipTone = bad
          ? "bg-red-100 text-red-800"
          : entry.type === "rueckfrage"
            ? "bg-orange-100 text-orange-800"
            : "bg-violet-100 text-violet-800";
        return (
          <li key={entry.id} className="flex gap-2">
            <div className="flex w-12 shrink-0 flex-col items-end pr-1">
              <span className="mt-1 h-3.5 shrink-0" aria-hidden="true" />
              {duration.value > 0 && (
                <span className="flex flex-1 items-center whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {labels.durationShort(duration.value, duration.unit)}
                </span>
              )}
            </div>
            <div className="flex w-5 shrink-0 flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-3.5 shrink-0 rounded-full",
                  bad ? "bg-red-500" : "bg-brand",
                  newest && "ring-2 ring-brand/60 ring-offset-2 ring-offset-card",
                )}
              />
              <ArrowUp
                className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              <span className="-mt-1 mb-1 w-0 flex-1 border-l-2 border-muted-foreground/20" />
            </div>
            <div className="min-w-0 pb-5">
              <div className="w-full flex items-center gap-2">
                <p className="text-base font-medium text-foreground">{to}</p>
                <p className="mt-0.5 flex min-h-6 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {qualifier &&
                    (comment ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                              chipTone,
                            )}
                          >
                            {qualifier}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[18rem]">
                          {comment}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span
                        className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", chipTone)}
                      >
                        {qualifier}
                      </span>
                    ))}
                  {!qualifier && comment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                            chipTone,
                          )}
                        >
                          {labels.reason}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[18rem]">
                        {comment}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </p>
              </div>

              <p className="mt-0.5 text-sm text-muted-foreground">
                {entry.actor ?? labels.actorSystem}
                {actingAs && ` · ${labels.actingAs(actingAs)}`} ·{" "}
                {labels.formatDateTime(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
      {arrivedAt && (
        <li className="flex gap-2">
          <div className="w-12 shrink-0" aria-hidden="true" />
          <div className="flex w-5 shrink-0 flex-col items-center">
            <span className="mt-1 size-3.5 shrink-0 rounded-full bg-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">{labels.arrivedLabel}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {labels.formatDateTime(arrivedAt)}
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}
