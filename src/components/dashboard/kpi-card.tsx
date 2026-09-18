import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One headline figure. The WHOLE card is the link (a stretched overlay), so a reader clicks the
 * number they are looking at and lands on the screen behind it. Whatever the host renders in
 * `headerRight` (a period picker) sits above the overlay and keeps working on its own.
 */
export function KpiCard({
  icon: Icon,
  iconTint,
  label,
  to,
  loading,
  value,
  delta,
  headerRight,
  className,
}: {
  icon: LucideIcon;
  iconTint: string;
  label: string;
  to: string;
  loading: boolean;
  value: ReactNode;
  delta?: ReactNode;
  headerRight?: ReactNode;
  /** Extra classes on the card itself, e.g. a grid span in the host's layout. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md",
        className,
      )}
    >
      <Link
        to={to}
        aria-label={label}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
              iconTint,
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="truncate text-[15px] font-medium text-muted-foreground">{label}</span>
        </span>
        {headerRight && <span className="relative z-10 shrink-0">{headerRight}</span>}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1 py-2">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <>
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {value}
            </span>
            {delta}
          </>
        )}
      </div>
    </div>
  );
}
