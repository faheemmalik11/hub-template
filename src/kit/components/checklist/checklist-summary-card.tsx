import { ArrowRight } from "lucide-react";

import { cn } from "../../lib/class-names";
import { ProgressRing } from "./progress-ring";
import type { ChecklistLinkComponent } from "./types";

export function ChecklistSummaryCard({
  title,
  progressLabel,
  completed,
  total,
  link,
  linkLabel,
  className,
  LinkComponent,
}: {
  title: string;
  progressLabel: string;
  completed: number;
  total: number;
  link?: { to: string; search?: Record<string, unknown> };
  linkLabel?: string;
  className?: string;
  /** See the same prop on `ChecklistSteps` for why this has no default. */
  LinkComponent: ChecklistLinkComponent;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="relative shrink-0">
        <ProgressRing completed={completed} total={total} size={52} strokeWidth={5} />
        <span className="absolute inset-0 grid place-items-center text-xs font-bold text-foreground tabular-nums">
          {completed}/{total}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{progressLabel}</p>
      </div>
      {link && linkLabel && (
        <LinkComponent
          to={link.to}
          search={link.search}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-dark hover:underline"
        >
          {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
        </LinkComponent>
      )}
    </div>
  );
}
