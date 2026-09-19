import { useMemo } from "react";

import { Badge } from "../../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Separator } from "../../ui/separator";
import { Skeleton } from "../../ui/skeleton";
import { ErrorState } from "../../components/feedback/query-states";
import type { AccessPermission } from "../../components/access/types";
import type { ProfileAdapter, ProfileUser } from "../../adapters/profile";
import type { ProfileLabels } from "./labels";

/**
 * Role and permissions, to read only.
 *
 * Only what the person holds is listed. The full catalogue is still fetched, because it is what
 * turns a stored key like `invoices.pay` into a sentence, but the rows they do not hold are left
 * out: this screen answers "what may I do", and a long list of unticked boxes answers a different
 * question in a way that reads like a form they are not allowed to fill in.
 */
export function AccessCard({
  user,
  adapter,
  labels,
}: {
  user: ProfileUser;
  adapter: ProfileAdapter;
  labels: ProfileLabels;
}) {
  const catalogueQuery = adapter.usePermissionCatalogue();
  const accessLabels = labels.access;
  const catalogue = useMemo(() => catalogueQuery.data ?? [], [catalogueQuery.data]);

  const listed = useMemo(() => {
    const held = new Set(user.permissions);
    return catalogue.filter((permission) => held.has(permission.key));
  }, [catalogue, user.permissions]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, AccessPermission[]>();
    for (const permission of listed) {
      if (!byCategory.has(permission.category)) byCategory.set(permission.category, []);
      byCategory.get(permission.category)!.push(permission);
    }
    return [...byCategory.entries()];
  }, [listed]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{accessLabels.title}</CardTitle>
        <CardDescription>{accessLabels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{accessLabels.roleLabel}</span>
            <Badge variant="secondary">{accessLabels.roleLabelText(user.roleName)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{accessLabels.permissionsLabel}</span>
            <span className="text-sm font-medium text-foreground">
              {accessLabels.permissionCount(listed.length)}
            </span>
          </div>
        </div>

        <Separator />

        {catalogueQuery.isError ? (
          <ErrorState error={catalogueQuery.error} onRetry={catalogueQuery.refetch} />
        ) : catalogueQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{accessLabels.empty}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{accessLabels.readOnlyNote}</p>
            {groups.map(([category, permissions]) => (
              <div key={category}>
                <div className="text-sm font-semibold text-foreground">
                  {accessLabels.categoryLabel(category)}
                </div>
                <ul className="mt-1.5 grid list-disc gap-x-6 gap-y-1 pl-5 marker:text-muted-foreground sm:grid-cols-2">
                  {permissions.map((permission) => (
                    <li
                      key={permission.key}
                      title={permission.description ?? undefined}
                      className="text-sm leading-snug text-foreground"
                    >
                      {permission.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
