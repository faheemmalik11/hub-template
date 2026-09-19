import { useMemo } from "react";

import { Checkbox } from "../../ui/checkbox";
import { cn } from "../../lib/class-names";
import type { AccessPermission, AccessToggle } from "./types";

export function PermissionChecklist({
  permissions,
  held,
  onToggle,
  disabled = false,
  readOnlyNote,
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

  const heldKeys = useMemo(() => new Set(held), [held]);

  if (groups.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {disabled && readOnlyNote && <p className="text-sm text-muted-foreground">{readOnlyNote}</p>}
      {groups.map(([category, entries]) => (
        <div key={category}>
          <div className="text-sm font-semibold text-foreground">{categoryLabel(category)}</div>
          <div className="mt-1.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {entries.map((p) => (
              <label
                key={p.key}
                title={p.description ?? undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={heldKeys.has(p.key)}
                  disabled={disabled}
                  onCheckedChange={(checked) => onToggle(p.key, checked === true)}
                  aria-label={p.label}
                />
                {}
                <span className="min-w-0 text-sm font-medium leading-snug text-foreground">
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
