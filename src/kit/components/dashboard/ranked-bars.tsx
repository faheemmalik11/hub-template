import { Link } from "@tanstack/react-router";

import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../lib/class-names";

const BAR_TINTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

export interface RankedBarRow {
  key: string;
  label: string;
  valueText: string;
  sharePct: number;
  link?: { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
}

export function RankedBars({ rows }: { rows: RankedBarRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5">
      {rows.map((row, index) => {
        const body = (
          <>
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-foreground">{row.label}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {row.valueText}
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-brand-tint">
                <span
                  className={cn("block h-full rounded-full", BAR_TINTS[index % BAR_TINTS.length])}
                  style={{ width: `${Math.min(Math.max(row.sharePct, 2), 100)}%` }}
                />
              </span>
            </span>
            <span className="w-12 shrink-0 rounded-md border border-border px-1.5 py-0.5 text-center text-[0.7rem] font-medium tabular-nums text-muted-foreground">
              {row.sharePct.toFixed(0)} %
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {row.link ? (
              <Link
                to={row.link.to}
                params={row.link.params as never}
                search={row.link.search as never}
                className="flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-brand-tint/50"
              >
                {body}
              </Link>
            ) : (
              <span className="flex items-center gap-3 px-1 py-0.5">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RankedBarsSkeleton() {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-1 py-0.5">
          <Skeleton className="h-4 w-5" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      ))}
    </div>
  );
}
