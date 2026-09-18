/**
 * PROJECT CONFIG — the permission keys this Hub uses.
 *
 * PORTABILITY. Everything else in the permission system is generic: the tables, the
 * `current_permissions()`/`has_permission()` functions and their RLS policies are created by
 * `supabase/migrations/…_permissions_model.sql` and carry no project-specific keys. The catalogue
 * itself lives in two places that a new project replaces wholesale, and nowhere else:
 *
 *   1. this file — the keys the TypeScript refers to;
 *   2. `supabase/permissions.seed.sql` — the same keys with their labels and role defaults.
 *
 * The two are kept in step by `PERMISSION_KEYS` below being the literal list the seed inserts. No
 * other file in `src/` should contain a permission string; import from here so a rename is one
 * edit and a missing key is a type error rather than a silently-false check.
 */

export const PERMISSIONS = {
  invoicesBook: "invoices.book",
  invoicesApprove: "invoices.approve",
  invoicesApproveFinal: "invoices.approve_final",
  invoicesPay: "invoices.pay",
  invoicesAssign: "invoices.assign",
  invoicesOverrideWorkflow: "invoices.override_workflow",
  oposWhitelistWrite: "opos_whitelist.write",
  postfachSettings: "postfach.settings",
  bankAccountsRemove: "bank_accounts.remove",
  notificationsSettings: "notifications.settings",
  pageTeam: "page.team",
  pagePapierkorb: "page.papierkorb",
  pageDateibenennung: "page.dateibenennung",
  pageFreigabeRegeln: "page.freigabe_regeln",
  pageAuswertungen: "page.auswertungen",
  pageProtokoll: "page.protokoll",
  pageBankverbindungen: "page.bankverbindungen",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);
