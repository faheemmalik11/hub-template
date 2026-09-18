import { Link } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A ranked list with share bars. Bar and badge show the SAME number, the entry's share of the
 * whole, so the visual and the figure can never disagree. Rows link into the screen behind them
 * when the host supplies a link.
 */
const BAR_FILL = "bg-brand-hover";

export interface RankedBarRow {
  key: string;
  label: string;
  /** Already formatted for display ("€3.2K"). */
  valueText: string;
  /** Share of the whole in percent, drives bar width and badge. */
  sharePct: number;
  link?: { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
}

export function RankedBars({ rows }: { rows: RankedBarRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5">
      {rows.map((row, i) => {
        const body = (
          <>
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-foreground">{row.label}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {row.valueText}
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full", BAR_FILL)}
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
                className="flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-brand-wash"
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
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-0.5">
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
