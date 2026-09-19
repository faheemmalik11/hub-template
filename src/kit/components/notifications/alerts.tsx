import { Fragment, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, CircleAlert, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "../../lib/class-names";
import { HighlightedText } from "./highlight";
import type { NotificationItem, NotificationTone } from "./types";

const TONE_CHIP: Record<NotificationTone, string> = {
  default: "border-brand-soft bg-brand-wash text-brand-dark hover:border-brand",
  warn: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300",
  danger: "border-red-200 bg-red-50 text-red-800 hover:border-red-300",
};

/** Count pill per tone, same palette the bell rows use. */
const TONE_BADGE: Record<NotificationTone, string> = {
  default: "bg-brand-wash text-brand-dark",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

const TONE_ORDER: Record<NotificationTone, number> = { danger: 0, warn: 1, default: 2 };

export function sortBySeverity(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort(
    (a, b) => TONE_ORDER[a.tone ?? "default"] - TONE_ORDER[b.tone ?? "default"],
  );
}

const TONE_ICON: Record<NotificationTone, typeof Info> = {
  default: Info,
  warn: TriangleAlert,
  danger: CircleAlert,
};

const TONE_ICON_CLS: Record<NotificationTone, string> = {
  default: "text-brand",
  warn: "text-amber-600",
  danger: "text-red-600",
};

function ToneIcon({
  tone,
  icon,
}: {
  tone: NotificationTone;
  icon?: ComponentType<{ className?: string }>;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return <Icon className={cn("size-4 shrink-0", TONE_ICON_CLS[tone])} aria-hidden />;
}

/** One row of compact alert chips, worst first, capped at `max`; the rest hide behind "see all". */
export function AlertStrip({
  items,
  max = 3,
  seeAllLabel,
  seeAllTo,
  onItemClick,
  onDismiss,
  dismissLabel,
  className,
}: {
  items: NotificationItem[];
  max?: number;
  /** Omitted where the strip can never overflow, e.g. a fixed pair of configuration warnings. */
  seeAllLabel?: string;
  seeAllTo?: string;
  /** Fired when a chip is followed: the host acknowledges that item at its current count. */
  onItemClick?: (item: NotificationItem) => void;
  /** Renders a small close button per chip: discard without visiting the screen. */
  onDismiss?: (item: NotificationItem) => void;
  dismissLabel?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  const sorted = sortBySeverity(items);
  const shown = sorted.slice(0, max);
  const rest = sorted.length - shown.length;

  return (
    // ONE ALERT PER LINE, ALL THE SAME WIDTH. Side by side the chips competed for the same glance
    // and each was cut to a fragment. Stacked, each gets a line of its own. w-fit sizes the column
    // to its WIDEST row and the rows then stretch to fill it, so the block reads as one set of
    // cards with a straight right edge rather than a ragged staircase of different widths.
    <div className={cn("flex w-fit max-w-full flex-col items-stretch gap-1.5", className)}>
      {shown.map((item) => {
        const tone = item.tone ?? "default";
        return (
          <div
            key={item.key}
            className={cn(
              "flex min-w-0 items-center rounded-lg border transition-colors",
              TONE_CHIP[tone],
            )}
          >
            <Link
              to={item.link.to}
              search={item.link.search as never}
              hash={item.link.hash}
              onClick={() => onItemClick?.(item)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                onDismiss ? "pr-1" : "pr-3",
              )}
            >
              <ToneIcon tone={tone} icon={item.icon} />
              {}
              <span className="min-w-0 text-[13px] leading-snug font-medium">
                <HighlightedText text={item.message ?? item.label} highlight={item.highlight} />
              </span>
              <ChevronRight className="size-4 shrink-0 opacity-50" aria-hidden />
            </Link>
            {onDismiss && (
              <button
                type="button"
                aria-label={dismissLabel}
                title={dismissLabel}
                onClick={() => onDismiss(item)}
                className="mr-1.5 cursor-pointer rounded-md p-1 opacity-50 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
      {}
      {rest > 0 && seeAllTo && (
        <Link
          to={seeAllTo}
          className="flex items-center gap-1 self-start rounded-lg px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {seeAllLabel} (+{rest})
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function AlertList({
  items,
  emptyText,
  onItemClick,
  isRead,
  readLabel,
  className,
}: {
  items: NotificationItem[];
  emptyText: string;
  onItemClick?: (item: NotificationItem) => void;
  /** Whether an item was already acknowledged; read rows are dimmed and labelled. */
  isRead?: (item: NotificationItem) => boolean;
  readLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <div className={cn("py-6 text-sm text-muted-foreground", className)}>{emptyText}</div>;
  }
  const sorted = sortBySeverity(items);
  const unread = sorted.filter((item) => !(isRead?.(item) ?? false));
  const read = sorted.filter((item) => isRead?.(item) ?? false);
  const ordered = [...unread, ...read];

  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {ordered.map((item, index) => {
        const tone = item.tone ?? "default";
        const isReadRow = index >= unread.length;
        return (
          <Fragment key={item.key}>
            {index === unread.length && unread.length > 0 && readLabel && (
              <div className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {readLabel}
              </div>
            )}
            <Link
              to={item.link.to}
              search={item.link.search as never}
              hash={item.link.hash}
              onClick={() => onItemClick?.(item)}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className={cn("mt-0.5 shrink-0", isReadRow && "opacity-40")}>
                <ToneIcon tone={tone} icon={item.icon} />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm leading-snug",
                  isReadRow ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                <HighlightedText text={item.message ?? item.label} highlight={item.highlight} />
              </span>
              {(item.atLabel || item.dateLabel) && (
                <span className="shrink-0 text-right text-xs leading-tight text-muted-foreground">
                  {item.atLabel && <span className="block">{item.atLabel}</span>}
                  {item.dateLabel && (
                    <span className="block text-muted-foreground/70 tabular-nums">
                      {item.dateLabel}
                    </span>
                  )}
                </span>
              )}
              {!item.message && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                    isReadRow ? "bg-muted text-muted-foreground" : TONE_BADGE[tone],
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}
