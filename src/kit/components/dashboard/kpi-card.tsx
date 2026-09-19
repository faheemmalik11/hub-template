import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../lib/class-names";

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
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl bg-card p-3 shadow-xs transition-shadow hover:shadow-md",
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
              "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white",
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
