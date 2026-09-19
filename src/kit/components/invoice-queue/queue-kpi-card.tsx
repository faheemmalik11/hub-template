import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "../../lib/class-names";

export type QueueTone = "warning" | "success" | "danger" | "neutral";

const TONE_NUMBER: Record<QueueTone, string> = {
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
  neutral: "text-foreground",
};

const TONE_ICON: Record<QueueTone, string> = {
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
};

const TONE_RULE: Record<QueueTone, string> = {
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  neutral: "bg-border",
};

export function QueueKpiCard({
  label,
  description,
  count,
  amount,
  tone,
  icon: Icon,
  to,
  search,
  onSelect,
  active,
}: {
  label: string;
  description: string;
  /** Already formatted by the host, so the core stays free of locale helpers. */
  count: string;
  amount: string;
  tone: QueueTone;
  icon: ComponentType<{ className?: string }>;
  /** Link target, for a page that keeps its filter in the URL. */
  to?: string;
  search?: Record<string, unknown>;
  /** Used instead of `to` where the filter is local component state. */
  onSelect?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TONE_ICON[tone])}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 truncate text-xs font-semibold text-foreground">{label}</span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", TONE_NUMBER[tone])}>{count}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{amount}</span>
      </div>

      <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>

      {!active && (
        <span className={cn("absolute inset-x-0 bottom-0 h-0.5", TONE_RULE[tone])} aria-hidden />
      )}
    </>
  );

  const cardClassName = cn(
    "relative flex min-w-0 flex-col overflow-hidden rounded-xl border px-3 pt-2.5 pb-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "border-brand-dark bg-brand-tint ring-1 ring-brand-dark"
      : "border-border bg-card hover:border-brand-dark/30 hover:bg-brand-tint/40",
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} aria-pressed={active} className={cardClassName}>
        {content}
      </button>
    );
  }

  return (
    <Link to={to ?? ""} search={search as never} aria-pressed={active} className={cardClassName}>
      {content}
    </Link>
  );
}
