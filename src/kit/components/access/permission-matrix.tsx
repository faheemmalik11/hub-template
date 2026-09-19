import { useMemo } from "react";

import { Checkbox } from "../../ui/checkbox";
import { cn } from "../../lib/class-names";
import type { AccessPermission, AccessRole } from "./types";

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
  const gruppen = useMemo(() => {
    const nach = new Map<string, AccessPermission[]>();
    for (const p of permissions) {
      if (!nach.has(p.category)) nach.set(p.category, []);
      nach.get(p.category)!.push(p);
    }
    return [...nach.entries()];
  }, [permissions]);

  if (gruppen.length === 0 || roles.length === 0) return null;

  return (
    <div className={cn("max-w-4xl space-y-5", className)}>
      {gruppen.map(([kategorie, eintraege], gruppenIndex) => (
        <section
          key={kategorie}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          {}
          <div className="overflow-x-auto">
            <div className="min-w-[38rem]">
              <header className="flex items-end gap-4 border-b border-border bg-muted/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-foreground">
                    {categoryLabel(kategorie)}
                  </div>
                  {}
                  {gruppenIndex === 0 && (
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
                {eintraege.map((p) => (
                  <div
                    key={p.key}
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
