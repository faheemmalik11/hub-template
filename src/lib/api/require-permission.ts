import { ForbiddenError } from "./errors";
import { TABLE } from "@/config/tables";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Server-side permission check for the `*.functions.ts` server routes.
 *
 * Applies the same rule `current_permissions()` applies in SQL — a personal override wins,
 * otherwise the role's default — but resolves it explicitly, because these routes run on the
 * service-role client, which has no JWT for `auth.jwt()` to read.
 *
 * Returns the caller's `app_users` row so a route that needs the id (createEmployee's `created_by`)
 * does not look it up a second time and risk the two lookups disagreeing.
 */
export async function requirePermission(
  db: Db,
  callerEmail: string,
  permissionKey: string,
  denialMessage: string,
): Promise<{ id: string }> {
  const { data: caller } = await db
    .from(TABLE.appUsers)
    .select(`id, is_active, role_id, ${TABLE.roles}(name)`)
    .ilike("email", callerEmail)
    .maybeSingle();
  const row = caller as {
    id: string;
    is_active: boolean;
    role_id: string | null;
    roles: { name: string } | null;
  } | null;
  if (!row || !row.is_active) {
    throw new ForbiddenError("Account is not active");
  }

  // The super admin holds the whole catalogue, unconditionally. The same branch
  // current_permissions() takes in SQL (migration 20260901160300), restated here because this path
  // never calls it: these routes run on the service-role client, which carries no JWT for
  // auth.jwt() to read. Without it, an admin who deleted the super_admin role's rows from
  // role_permissions -- which nothing stops, that table has no guard of its own -- would lock the
  // owner account out of the server routes too.
  if (row.roles?.name === "super_admin") return { id: row.id };

  const { data: override } = await db
    .from(TABLE.userPermissions)
    .select("granted")
    .eq("user_id", row.id)
    .eq("permission_key", permissionKey)
    .maybeSingle();

  let allowed = (override as { granted: boolean } | null)?.granted ?? null;
  if (allowed === null) {
    const { data: fromRole } = await db
      .from(TABLE.rolePermissions)
      .select("permission_key")
      .eq("role_id", row.role_id)
      .eq("permission_key", permissionKey)
      .maybeSingle();
    allowed = !!fromRole;
  }
  if (!allowed) throw new ForbiddenError(denialMessage);
  return { id: row.id };
}
