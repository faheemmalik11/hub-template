import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell } from "lucide-react";

import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { cn } from "../../lib/class-names";
import type { NotificationItem } from "./types";

const TONE_CLS: Record<string, string> = {
  default: "bg-brand-wash text-brand-dark",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

export function NotificationBell({
  items,
  unseenCount,
  onOpened,
  onItemClick,
  title,
  emptyText,
  ariaLabel,
  seeAllLabel,
  seeAllTo,
}: {
  items: NotificationItem[];
  unseenCount: number;
  onOpened: () => void;
  /** Fired when a row is followed: the host acknowledges that item at its current count. */
  onItemClick?: (item: NotificationItem) => void;
  title: string;
  emptyText: string;
  ariaLabel: string;
  /** Way out of the dropdown into the full list. Both required to render the footer link. */
  seeAllLabel?: string;
  seeAllTo?: string;
}) {
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) onOpened();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="size-4.5" />
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.62rem] font-semibold tabular-nums text-white">
              {unseenCount > 99 ? "99+" : unseenCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className={cn(
          "min-w-72 max-w-[calc(100vw-2rem)] overflow-visible border-t-4 border-t-primary shadow-xl",
          "relative before:absolute before:right-5 before:h-0 before:w-0 before:content-['']",
          "data-[side=bottom]:before:-top-2 data-[side=bottom]:before:border-x-8 data-[side=bottom]:before:border-b-8 data-[side=bottom]:before:border-x-transparent data-[side=bottom]:before:border-b-primary",
          "data-[side=top]:before:-bottom-2 data-[side=top]:before:border-x-8 data-[side=top]:before:border-t-8 data-[side=top]:before:border-x-transparent data-[side=top]:before:border-t-primary",
        )}
      >
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.key} asChild className="cursor-pointer">
              <Link
                to={item.link.to}
                search={item.link.search as never}
                onClick={() => onItemClick?.(item)}
              >
                <span className="min-w-0 flex-1 truncate text-sm" title={item.label}>
                  {item.label}
                </span>
                <span
                  className={cn(
                    "ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
                    TONE_CLS[item.tone ?? "default"],
                  )}
                >
                  {item.count}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        {seeAllLabel && seeAllTo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to={seeAllTo} className="justify-between text-sm font-medium">
                {seeAllLabel}
                <ArrowRight className="size-3.5 opacity-60" aria-hidden />
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
