import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "../../lib/class-names";

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
        "flex min-w-0 flex-col justify-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-card/70",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5" title={label}>
        {Icon && (
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-white",
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
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-card/70"
    >
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white",
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
