import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PermissionMatrix } from "../../components/access/permission-matrix";
import type { AccessRole } from "../../components/access/types";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import type { TeamAdapter } from "../../adapters/team";
import type { TeamPageLabels } from "./labels";

// What each role grants. Changing a cell moves everyone holding that role.
export function RolesPermissionsTab({
  adapter,
  labels,
}: {
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const catalogueQuery = adapter.usePermissionCatalogue();
  const rolesQuery = adapter.useRoles();
  const rolePermissionsQuery = adapter.useRolePermissions();
  const [isSaving, setIsSaving] = useState(false);

  const roles = useMemo<AccessRole[]>(
    () =>
      // The owner role is forced on by the database, so its column could only be noise.
      (rolesQuery.data ?? [])
        .filter((role) => role.name !== "super_admin")
        .map((role) => ({ id: role.id, label: labels.roleLabel(role.name) })),
    [rolesQuery.data, labels],
  );

  const roleNameById = useMemo(
    () => new Map((rolesQuery.data ?? []).map((role) => [role.id, role.name])),
    [rolesQuery.data],
  );

  if (catalogueQuery.isLoading || rolesQuery.isLoading || rolePermissionsQuery.isLoading) {
    return <TableSkeleton rows={6} columns={4} />;
  }
  if (catalogueQuery.isError || rolesQuery.isError || rolePermissionsQuery.isError) {
    return (
      <ErrorState
        error={catalogueQuery.error ?? rolesQuery.error ?? rolePermissionsQuery.error}
        onRetry={() => {
          catalogueQuery.refetch();
          rolesQuery.refetch();
          rolePermissionsQuery.refetch();
        }}
      />
    );
  }

  async function toggleCell(roleId: string, key: string, value: boolean) {
    setIsSaving(true);
    try {
      await adapter.setRolePermission({
        roleId,
        roleName: roleNameById.get(roleId) ?? "",
        key,
        value,
      });
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <p className="max-w-3xl text-sm text-muted-foreground">{labels.rolesMatrixNote}</p>
      <PermissionMatrix
        className="mt-4"
        permissions={catalogueQuery.data ?? []}
        roles={roles}
        grantedByRole={rolePermissionsQuery.data ?? {}}
        disabled={isSaving}
        permissionColumnLabel={labels.permissionColumnLabel}
        categoryLabel={labels.categoryLabel}
        onToggle={toggleCell}
      />
    </div>
  );
}
