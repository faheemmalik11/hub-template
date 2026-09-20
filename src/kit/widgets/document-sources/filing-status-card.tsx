import { CheckCircle2, History, PauseCircle } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Button } from "../../ui/button";
import type { DocumentSourcesLabels } from "../../pages/document-sources/labels";

export interface FilingStatus {
  active: boolean;
  lastRunLabel?: string | null;
  nextRunLabel?: string | null;
}

export interface FilingStatusCardProps {
  status: FilingStatus;
  labels: DocumentSourcesLabels;
  logsLink?: {
    to: string;
    Link: ComponentType<{ to: string; className?: string; children?: ReactNode }>;
  };
  className?: string;
}

export function FilingStatusCard({ status, labels, logsLink, className }: FilingStatusCardProps) {
  const Link = logsLink?.Link;
  return (
    <div
      data-tour="document-sources-status"
      className={
        className ??
        "mt-6 flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
      }
    >
      <div className="flex min-w-0 items-start gap-3">
        {status.active ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {status.active ? labels.filingActive : labels.filingInactive}
          </p>
          <p className="text-sm text-muted-foreground">
            {status.active ? labels.filingActiveDetail : labels.filingInactiveDetail}
          </p>
          {status.lastRunLabel && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm">
              <History className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{labels.lastRun}:</span>
              <span className="font-medium text-foreground">{status.lastRunLabel}</span>
            </p>
          )}
        </div>
      </div>
      {logsLink && Link && (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={logsLink.to}>{labels.viewLogs}</Link>
        </Button>
      )}
    </div>
  );
}
