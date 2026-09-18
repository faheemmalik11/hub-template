import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Fact = {
  label: string;
  /** Falls back to an em dash when empty, so a missing value never renders as a blank gap. */
  value: string | null | undefined;
  /** Rendered instead of `value` when the value needs to be a link or carry a control. */
  node?: ReactNode;
  mono?: boolean;
  /**
   * Take the full width in a two-column list.
   *
   * For the values that cannot survive half a card: a full address, a URL, anything that would
   * otherwise wrap to three lines and drag its neighbour's row down with it.
   */
  wide?: boolean;
};

/**
 * Label above value, one under the other.
 *
 * Reading down a column of values with the labels greyed above them is faster than reading a
 * two-column label/value table, because the values line up on one edge and the labels stay out of
 * the way until they are needed.
 *
 * `columns={2}` pairs the facts left and right instead. Master-data cards run to eight or nine
 * short fields, and stacked they push everything below them off the first screen for values that
 * use a third of the width available. Two columns halve the card's height without making any
 * single value harder to read. It stays one column below `sm`, where there is no width to split.
 */
export function FactList({
  facts,
  columns = 1,
  className,
}: {
  facts: Fact[];
  columns?: 1 | 2;
  className?: string;
}) {
  if (columns === 2) {
    return (
      <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2", className)}>
        {facts.map((fact) => (
          <div key={fact.label} className={cn("min-w-0", fact.wide && "sm:col-span-2")}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{fact.label}</dt>
            <dd
              className={cn(
                "mt-0.5 break-words text-base text-foreground",
                fact.mono && "font-mono",
              )}
            >
              {fact.node ?? (fact.value?.trim() ? fact.value : "—")}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn("space-y-3.5", className)}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{fact.label}</dt>
          <dd className={cn("mt-0.5 text-base text-foreground", fact.mono && "font-mono")}>
            {fact.node ?? (fact.value?.trim() ? fact.value : "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
