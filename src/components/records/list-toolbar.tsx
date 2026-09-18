import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * The search + filter row above a master-data table.
 *
 * One search field and one slot. Everything that used to sit loose beside the search on these
 * screens, a pair of toggles and a two-part sort control, is now either behind the Filter button
 * passed into `actions` or on the table headers where sorting belongs.
 *
 * Entity-agnostic on purpose: suppliers, companies and any other list screen share this row, and
 * it carries no vocabulary of its own so it drops into another Hub unchanged.
 */
export function ListToolbar({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  leading,
  actions,
  className,
  dataTour,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  /**
   * Content pinned to the far left, ahead of the search. Bankkonten puts its tab strip here so the
   * tabs and the controls share one line instead of stacking. With nothing passed the row is
   * unchanged: search on the left, actions on the right.
   */
  leading?: ReactNode;
  /** Right-hand controls: the Filter button, and anything a screen adds beside it. */
  actions?: ReactNode;
  className?: string;
  dataTour?: string;
}) {
  return (
    <div
      data-tour={dataTour}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      {leading}
      {/* A fixed width from `sm` up, not `w-full max-w-sm`. As a full-width flex item the search
          claimed the whole row and pushed the buttons beside it onto a second line, which is
          exactly what the one-line header on the list screens is there to avoid. It still fills
          the width on a phone, where it has a row to itself. */}
      <div className={cn("relative w-full sm:w-64", leading && "sm:ml-auto")}>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className="pl-9"
        />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
