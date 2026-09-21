import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { AccessPermission, AccessRole } from "./types";

/**
 * What each ROLE grants by default — permissions down, roles across.
 *
 * Props-only by design (see `types.ts`): the host supplies the catalogue, the roles, the current
 * grants and a callback. Nothing here knows a permission key or a role name, so another project
 * reuses it with its own model unchanged.
 *
 * LAYOUT. Not a plain full-width table. With seventeen rows and three narrow columns, a table
 * stretched to the viewport leaves the boxes stranded a screen away from the label they belong to,
 * and tracing a row across that gap is exactly the error this screen must not invite. So: the
 * whole thing is width-capped, the role columns sit immediately after the text, each row highlights
 * on hover, and rows are grouped under their category with the role names repeated at each group
 * head — which is what keeps the columns identifiable once you have scrolled past the first one.
 */
export function PermissionMatrix({
  permissions,
  roles,
  grantedByRole,
  onToggle,
  disabled = false,
  permissionColumnLabel,
  categoryLabel = (c) => c,
  className,
}: {
  permissions: AccessPermission[];
  roles: AccessRole[];
  /** role id → permission keys that role grants. */
  grantedByRole: Record<string, string[]>;
  onToggle: (roleId: string, key: string, next: boolean) => void;
  disabled?: boolean;
  permissionColumnLabel: string;
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

  if (groups.length === 0 || roles.length === 0) return null;

  return (
    <div className={cn("max-w-4xl space-y-5", className)}>
      {groups.map(([category, entries], groupsIndex) => (
        <section
          key={category}
          data-tour={`permission-group-${category}`}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          {/* The role columns are a fixed 28rem-plus wide, and the section clips. Below that width
              they were simply unreachable on a phone, so the block scrolls sideways instead. */}
          <div className="overflow-x-auto">
            <div className="min-w-[38rem]">
              <header className="flex items-end gap-4 border-b border-border bg-muted/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-foreground">
                    {categoryLabel(category)}
                  </div>
                  {/* Only the first group needs to say what the left column is; repeating it under every
                  heading would be noise, but the ROLE names do have to repeat, or a column six rows
                  down is unidentifiable without scrolling back up. */}
                  {groupsIndex === 0 && (
                    <div className="text-sm text-muted-foreground">{permissionColumnLabel}</div>
                  )}
                </div>
                {roles.map((r) => (
                  <div
                    key={r.id}
                    className="w-28 shrink-0 text-center text-sm font-medium text-foreground"
                  >
                    {r.label}
                  </div>
                ))}
              </header>

              <div className="divide-y divide-border">
                {entries.map((p, rowsIndex) => (
                  <div
                    key={p.key}
                    data-tour={groupsIndex === 0 && rowsIndex === 0 ? "permission-row" : undefined}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-medium leading-snug text-foreground">
                        {p.label}
                      </div>
                      {p.description && (
                        <div className="mt-1 text-sm leading-snug text-muted-foreground">
                          {p.description}
                        </div>
                      )}
                    </div>
                    {roles.map((r) => (
                      <div key={r.id} className="flex w-28 shrink-0 justify-center">
                        <Checkbox
                          checked={(grantedByRole[r.id] ?? []).includes(p.key)}
                          disabled={disabled}
                          onCheckedChange={(checked) => onToggle(r.id, p.key, checked === true)}
                          aria-label={`${r.label}: ${p.label}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
