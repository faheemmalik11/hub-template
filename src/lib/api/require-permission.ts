import { ForbiddenError } from "./errors";
import { TABLE } from "@/config/tables";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Server-side permission check for the `*.functions.ts` routes.
 *
 * These run on the service-role client, which bypasses row level security, so nothing else stops
 * them. The answer comes from `person_may()` in SQL rather than being worked out again here: it
 * resolves the personal override, the role default, the protected account AND whether this client
 * still uses the feature at all. Two implementations of that rule is how they drift.
 *
 * Returns the caller's `app_users` row so a route that needs the id does not look it up twice and
 * risk the two lookups disagreeing.
 */
export async function requirePermission(
  db: Db,
  callerEmail: string,
  permissionKey: string,
  denialMessage: string,
): Promise<{ id: string }> {
  const { data: caller } = await db
    .from(TABLE.appUsers)
    .select("id, is_active")
    .ilike("email", callerEmail)
    .maybeSingle();
  const row = caller as { id: string; is_active: boolean } | null;
  if (!row || !row.is_active) {
    throw new ForbiddenError("Account is not active");
  }

  const { data: allowed, error } = await db.rpc("person_may", {
    p_email: callerEmail,
    p_capability: permissionKey,
  });
  if (error) throw new ForbiddenError(denialMessage);
  if (!allowed) throw new ForbiddenError(denialMessage);
  return { id: row.id };
}
