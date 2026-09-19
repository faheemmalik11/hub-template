import { TABLE } from "@/config/tables";
// Shared by every server function that writes a company-scoped row (bank_accounts,
// bank_manual_import, ...) via the service-role client. Extracted out of
// bank-manual-import.functions.ts once a second file (bank-accounts.functions.ts) needed the same
// check — see that file's history for the original.

// bank_accounts/bank_transactions/app_users/user_company_access aren't in the generated Database
// type (see CLAUDE.md), so reads go through an untyped client, same convention used everywhere
// else server functions touch these tables.
type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Replicates has_company_access(p_company)'s exact semantics (migration 0059) in application
 * code, since that SQL function reads auth.jwt() -- unavailable to a service-role connection with
 * no forwarded user session. Resolves the caller's own app_users row by email (from the verified
 * JWT claims), same lookup requireActiveAdmin uses in employees.functions.ts.
 *
 * `companyId: null` returns true, same as has_company_access(null) -- the "watch-all" bucket for
 * rows not yet assigned to a company (e.g. a freshly BANKSapi-synced account, or unassigning one).
 */
export async function checkCompanyAccess(
  db: Db,
  callerEmail: string,
  companyId: string | null,
): Promise<boolean> {
  const { data: me } = await db
    .from(TABLE.appUsers)
    .select("id, is_active")
    .ilike("email", callerEmail)
    .maybeSingle();
  if (!me || !(me as { is_active: boolean }).is_active) return false;

  if (companyId === null) return true;

  const { data: grants } = await db
    .from(TABLE.userCompanyAccess)
    .select("company_id, can_view")
    .eq("user_id", (me as { id: string }).id)
    .is("deleted_at", null);

  const rows = (grants ?? []) as { company_id: string; can_view: boolean }[];
  // No grants recorded at all = unrestricted (matches has_company_access's documented default).
  if (rows.length === 0) return true;
  return rows.some((g) => g.company_id === companyId && g.can_view);
}
