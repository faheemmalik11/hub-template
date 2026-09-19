import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "../../lib/class-names";
import type { NotificationTone } from "./types";

const TONE_ICON: Record<NotificationTone, ComponentType<{ className?: string }>> = {
  default: Info,
  warn: TriangleAlert,
  danger: CircleAlert,
};

const TONE_ICON_WRAP: Record<NotificationTone, string> = {
  default: "bg-brand-wash text-brand",
  warn: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
};

const TONE_UNREAD_BG: Record<NotificationTone, string> = {
  default: "bg-sky-50/60 hover:bg-sky-50",
  warn: "bg-amber-50/60 hover:bg-amber-50",
  danger: "bg-red-50/60 hover:bg-red-50",
};

const TONE_UNREAD_BAR: Record<NotificationTone, string> = {
  default: "bg-sky-600",
  warn: "bg-amber-600",
  danger: "bg-red-600",
};

const TONE_UNREAD_BADGE: Record<NotificationTone, string> = {
  default: "bg-sky-100 text-sky-700",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

export function NotificationRow({
  tone = "default",
  icon,
  title,
  description,
  sourceLabel,
  timestamp,
  actionLabel,
  link,
  onFollow,
  onMarkRead,
  markReadLabel,
  unreadLabel,
  unread = false,
  read = false,
  className,
}: {
  tone?: NotificationTone;
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  sourceLabel?: string;
  timestamp?: string;
  actionLabel?: string;
  link?: { to: string; search?: Record<string, unknown> };
  onFollow?: () => void;
  onMarkRead?: () => void;
  markReadLabel?: string;
  unreadLabel?: string;
  unread?: boolean;
  read?: boolean;
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 transition-colors",
        unread ? TONE_UNREAD_BG[tone] : link && "hover:bg-muted/40",
        className,
      )}
    >
      {link && (
        <Link
          to={link.to}
          search={link.search}
          onClick={onFollow}
          aria-label={title}
          className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      {unread && (
        <span
          className={cn("absolute inset-y-0 left-0 w-0.5", TONE_UNREAD_BAR[tone])}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          TONE_ICON_WRAP[tone],
          read && "opacity-50",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            unread ? "font-semibold text-foreground" : "font-normal text-foreground",
            read && "text-muted-foreground",
          )}
        >
          {title}
          {unread && unreadLabel && (
            <span
              className={cn(
                "ml-1.5 inline-block rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide uppercase",
                TONE_UNREAD_BADGE[tone],
              )}
            >
              {unreadLabel}
            </span>
          )}
        </p>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}
        {(sourceLabel || timestamp) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {sourceLabel}
            {sourceLabel && timestamp && <span aria-hidden> · </span>}
            {timestamp}
          </p>
        )}
      </div>
      <div className="relative z-20 flex shrink-0 items-center gap-1 self-center">
        {onMarkRead && unread && (
          <button
            type="button"
            onClick={onMarkRead}
            aria-label={markReadLabel}
            title={markReadLabel}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check className="size-4" aria-hidden />
          </button>
        )}
        {link && actionLabel ? (
          <span className="pointer-events-none hidden items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-brand-dark sm:inline-flex">
            {actionLabel} <ChevronRight className="size-4" aria-hidden />
          </span>
        ) : link ? (
          <span
            className="pointer-events-none grid size-7 place-items-center text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          >
            <ChevronRight className="size-4" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
