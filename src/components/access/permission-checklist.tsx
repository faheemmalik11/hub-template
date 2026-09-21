import { useMemo } from "react";

import { HintTooltip } from "@/kit/components/data-table";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { AccessPermission, AccessToggle } from "./types";

/**
 * What ONE subject may do, as checkboxes grouped by category.
 *
 * Props-only by design — see `types.ts`. The host passes the catalogue, the currently-held set and
 * a toggle callback; this file has no idea what a permission means or where it is stored.
 *
 * Checkboxes rather than switches: a switch reads as "turn this feature on", a checkbox as "this
 * one is included", and a permission list is a selection, not a set of appliances.
 */
export function PermissionChecklist({
  permissions,
  held,
  onToggle,
  disabled = false,
  readOnlyNote,
  lockedKeys,
  lockedNote,
  categoryLabel = (c) => c,
  className,
}: {
  permissions: AccessPermission[];
  /** Keys currently in force for this subject. */
  held: string[];
  onToggle: AccessToggle;
  /** Locks every box — used for a subject whose access is not editable (e.g. an owner account). */
  disabled?: boolean;
  /** Shown instead of nothing when `disabled`, so a locked list explains itself. */
  readOnlyNote?: string;
  /** Individually unavailable keys: the person editing does not hold them, so may not grant them. */
  lockedKeys?: string[];
  lockedNote?: string;
  categoryLabel?: (category: string) => string;
  className?: string;
}) {
  const groups = useMemo(() => {
    const byCategory = new Map<string, AccessPermission[]>();
    for (const p of permissions) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category)!.push(p);
    }
    return [...byCategory.entries()];
  }, [permissions]);

  const heldSet = useMemo(() => new Set(held), [held]);
  const lockedKeySet = useMemo(() => new Set(lockedKeys ?? []), [lockedKeys]);

  if (groups.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {disabled && readOnlyNote && <p className="text-sm text-muted-foreground">{readOnlyNote}</p>}
      {!disabled && lockedNote && lockedKeySet.size > 0 && (
        <p className="text-sm text-muted-foreground">{lockedNote}</p>
      )}
      {groups.map(([category, entries]) => (
        <div key={category}>
          <div className="text-sm font-semibold text-foreground">{categoryLabel(category)}</div>
          <div className="mt-1.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {entries.map((p) => {
              const locked = disabled || lockedKeySet.has(p.key);
              return (
                <label
                  key={p.key}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    checked={heldSet.has(p.key)}
                    disabled={locked}
                    onCheckedChange={(checked) => onToggle(p.key, checked === true)}
                    aria-label={p.label}
                  />
                  {/* Label only. The description is a two-line block per row, and at seventeen rows
                    it turned a checklist into a wall of prose — the labels are written to stand on
                    their own. Still one hover away, and still rendered in full by PermissionMatrix,
                    which has the room for it. */}
                  <HintTooltip onlyWhenClipped={false} label={p.description ?? undefined}>
                    <span className="min-w-0 text-sm font-medium leading-snug text-foreground">
                      {p.label}
                    </span>
                  </HintTooltip>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
