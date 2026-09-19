import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/class-names";
import type { NotificationTone } from "./types";

const TONE_BADGE: Record<NotificationTone, string> = {
  default: "bg-brand-wash text-brand-dark",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

export function NotificationSection({
  title,
  tone = "default",
  initialVisible = 3,
  seeAllLabel,
  collapseLabel,
  seeAllTopLabel,
  onSeeAll,
  flat = false,
  children,
  className,
}: {
  title: string;
  tone?: NotificationTone;
  initialVisible?: number;
  seeAllLabel?: (hidden: number) => string;
  collapseLabel?: string;
  seeAllTopLabel?: string;
  onSeeAll?: () => void;
  flat?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  const visible = expanded ? rows : rows.slice(0, initialVisible);
  const hidden = rows.length - visible.length;

  const header = (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        flat ? "border-b border-border bg-muted/50 px-4 py-2.5" : "mb-2",
      )}
    >
      <h2 className="flex items-center gap-2 text-xs font-bold tracking-wider text-foreground uppercase">
        {title}
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums",
            TONE_BADGE[tone],
          )}
        >
          {rows.length}
        </span>
      </h2>
      {onSeeAll && seeAllTopLabel && (
        <button
          type="button"
          onClick={onSeeAll}
          className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {seeAllTopLabel}
        </button>
      )}
    </div>
  );

  const list = (
    <>
      {visible}
      {hidden > 0 && seeAllLabel && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {seeAllLabel(hidden)} <ChevronDown className="size-4" aria-hidden />
        </button>
      )}
      {expanded && rows.length > initialVisible && collapseLabel && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex w-full cursor-pointer items-center justify-center gap-1 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {collapseLabel} <ChevronDown className="size-4 rotate-180" aria-hidden />
        </button>
      )}
    </>
  );

  if (flat) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card [&:not(:first-child)]:mt-4",
          className,
        )}
      >
        {header}
        <div className="divide-y divide-border/60">{list}</div>
      </section>
    );
  }

  return (
    <section className={className}>
      {header}
      <div className="divide-y divide-border rounded-xl border border-border bg-card">{list}</div>
    </section>
  );
}
