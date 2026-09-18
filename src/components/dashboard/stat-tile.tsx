import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const CHIP = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-tint text-brand-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

/** One figure of a dashboard stat card: icon and label on top, the number below, the whole entry
 *  a link into the screen the number comes from. Deliberately NOT a boxed card: the panel is the
 *  card, and boxes inside boxes read as clutter. Used by the processing, bank and unpaid cards so
 *  the three read as one family. */
export function StatTile({
  to,
  search,
  icon: Icon,
  iconCls,
  label,
  value,
  valueCls,
  className,
}: {
  to: string;
  search?: Record<string, unknown>;
  icon?: LucideIcon;
  iconCls?: string;
  label: string;
  value: string;
  valueCls?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={cn(
        "flex min-w-0 flex-col justify-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-wash",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5" title={label}>
        {Icon && (
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
              iconCls,
            )}
          >
            <Icon className="size-3" />
          </span>
        )}
        <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
      </span>
      <span
        className={cn(
          "text-2xl font-semibold tracking-tight tabular-nums text-foreground",
          valueCls,
        )}
      >
        {value}
      </span>
    </Link>
  );
}

/** Full-width variant: icon and label left, number right. For cards whose labels are whole
 *  phrases; halving those columns truncates them into guesswork. */
export function StatRow({
  to,
  search,
  icon: Icon,
  iconCls,
  label,
  value,
  valueCls,
}: {
  to: string;
  search?: Record<string, unknown>;
  icon: LucideIcon;
  iconCls: string;
  label: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-wash"
    >
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
          iconCls,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={label}>
        {label}
      </span>
      <span
        className={cn("shrink-0 text-base font-semibold tabular-nums text-foreground", valueCls)}
      >
        {value}
      </span>
    </Link>
  );
}
