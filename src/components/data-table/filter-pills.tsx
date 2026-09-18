import { X } from "lucide-react";

import { activeFilters, type FilterField } from "@/components/data-table/filter-fields";
import { cn } from "@/lib/utils";

/**
 * What is currently filtering the screen, as removable chips.
 *
 * The trigger's badge says HOW MANY filters are on; it cannot say which, and a reader who has to
 * open the popover to find out why their figures look wrong is being asked to remember state the
 * screen already knows. Each chip also clears its own field, so switching one filter off no longer
 * means opening the panel to do it.
 *
 * Fed from the same `FilterField[]` the popover renders, so the chips cannot drift from the
 * controls — see `activeFilters`.
 */
export function FilterPills({
  fields,
  extra,
  className,
}: {
  fields: FilterField[];
  /** Chips for state that is not a `FilterField`, e.g. the period. */
  extra?: { key: string; label: string; valueLabel?: string; clear?: () => void }[];
  className?: string;
}) {
  const chips = [...(extra ?? []), ...activeFilters(fields)];
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full bg-muted py-1 px-2.5 text-sm text-foreground"
        >
          {/* A chip without its own value is a statement, not a field: the resolved period reads
              "Jan 1 – Dec 31, 2025", never "Period: Period". */}
          {c.valueLabel && <span className="text-muted-foreground">{c.label}:</span>}
          <span className="font-medium">{c.valueLabel ?? c.label}</span>
          {c.clear && (
            <button
              type="button"
              onClick={c.clear}
              aria-label={`${c.label} ${c.valueLabel ?? ""}`.trim()}
              className="ml-0.5 grid size-4 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
