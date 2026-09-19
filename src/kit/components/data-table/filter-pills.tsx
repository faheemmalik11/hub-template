import { X } from "lucide-react";

import { cn } from "../../lib/class-names";
import { activeFilters, type FilterField } from "./filter-fields";

export function FilterPills({
  fields,
  extra,
  className,
}: {
  fields: FilterField[];
  extra?: { key: string; label: string; valueLabel?: string; clear?: () => void }[];
  className?: string;
}) {
  const chips = [...(extra ?? []), ...activeFilters(fields)];
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-muted py-1 px-2.5 text-sm text-foreground"
        >
          {chip.valueLabel && <span className="text-muted-foreground">{chip.label}:</span>}
          <span className="font-medium">{chip.valueLabel ?? chip.label}</span>
          {chip.clear && (
            <button
              type="button"
              onClick={chip.clear}
              aria-label={`${chip.label} ${chip.valueLabel ?? ""}`.trim()}
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
