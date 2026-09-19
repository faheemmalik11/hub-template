import { ArrowRight, ChevronRight, TriangleAlert } from "lucide-react";

import { cn } from "../../lib/class-names";
import { SEVERITY_ACTION_REQUIRED, ReviewLine } from "../../components/invoice-review/review";

export interface ReviewCardLabels {
  title: string;
  checks: (count: number) => string;
  choose: string;
  fix: string;
}

export function ReviewCard({
  lines,
  anchorId,
  open,
  onOpenChange,
  flash,
  onJump,
  labels,
  className,
}: {
  lines: ReviewLine[];
  anchorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flash: boolean;
  onJump: (tab: string, anchor: string) => void;
  labels: ReviewCardLabels;
  className?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <details
      id={anchorId}
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className={cn(
        "group scroll-mt-24 rounded-xl border p-4 text-base transition-shadow duration-500",
        className,
        flash && "ring-2 ring-destructive ring-offset-2",
        "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{labels.title}</span>
        <span className="shrink-0 text-sm font-normal opacity-80">
          {labels.checks(lines.length)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 opacity-60 transition-transform group-open:rotate-90" />
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-10 marker:text-destructive/60">
        {lines.map((r, i) => {
          const fixMark = r.jumpTo ? (
            <button
              type="button"
              onClick={() => onJump(r.jumpTo!.tab, r.jumpTo!.anchor)}
              className="group/fix inline-flex shrink-0 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded px-1 text-xs font-medium text-destructive underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              {r.severity === SEVERITY_ACTION_REQUIRED ? labels.choose : labels.fix}
              <ArrowRight className="size-3 transition-transform group-hover/fix:translate-x-0.5" />
            </button>
          ) : null;
          return (
            <li key={`${r.field ?? "-"}-${i}`} className="py-0.5 pl-1">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {r.title && (
                    <span className="min-w-0 truncate font-medium text-foreground">{r.title}</span>
                  )}
                  <span className={cn("text-sm text-muted-foreground", !r.title && "text-base")}>
                    {r.text}
                  </span>
                  {fixMark}
                </span>
                {r.numbers && (
                  <span className="block text-sm tabular-nums text-muted-foreground">
                    {r.numbers}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
