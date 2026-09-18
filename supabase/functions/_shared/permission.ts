import { TABLE } from "./tables.ts";
// Resolve one permission key for the caller of an Edge Function.
//
// WHY THIS EXISTS SEPARATELY. Most Edge Functions here are called by an already-authenticated
// browser and rely on RLS for scoping. A few do something RLS cannot express -- move money, or in
// bank-disconnect's case reach out to BANKSapi and change what the Hub will ever import again --
// and those have to decide for themselves whether the caller may.
//
// The rule below is the same one `current_permissions()` applies in Postgres: a personal override
// in user_permissions wins, otherwise the role's default from role_permissions. Deliberately NOT a
// hardcoded role list: that would silently override the switches on Team & Rollen, so granting
// somebody the right there would not actually let them through here. This runs on the service-role
// client, which carries no JWT, so `has_permission()` (which reads auth.jwt()) cannot be used and
// the same rule is applied explicitly.
//
// payment-auth.ts contains this resolution too, specialised to `invoices.pay`. It is not refactored
// to call this: that file gates the money-moving endpoints and is not worth disturbing for a tidy.
// If the rule changes in Postgres, both copies change.

// deno-lint-ignore no-explicit-any
type Db = any;

export interface Caller {
  id: string;
  name: string | null;
  email: string;
}

export async function requirePermission(
  db: Db,
  email: string | null,
  permissionKey: string,
): Promise<Caller> {
  if (!email) throw new Error("no caller identity on the request");

  const { data: caller } = await db
    .from(TABLE.appUsers)
    .select("id, name, is_active, role_id")
    .ilike("email", email)
    .maybeSingle();
  const row = caller as unknown as {
    id: string;
    name: string | null;
    is_active: boolean;
    role_id: string | null;
  } | null;
  if (!row || !row.is_active) throw new Error("account is not active");

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
  if (!allowed) throw new Error(`this account does not have the '${permissionKey}' permission`);

  return { id: row.id, name: row.name, email };
}
