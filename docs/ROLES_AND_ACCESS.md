# Feature: Roles & Access Control ("Roles, team & settings" — Briefing Screen 17)

Reference for the roles/permissions system: what the client's briefing asks for, what is
already implemented on this branch (`bank-reconcilation-phase-2`), and what is still
missing to fully match the spec.

> **Source:** `FUNKTIONSBRIEFING-EN.md.pdf` (Functional Briefing — Immonetz Finance
> Workflow, EN, 2026-07-15), Part 2 Screen 17, and Appendix A7 ("Roles & rights").
> Related screens: Screen 6 (Approval workflow), Screen 16 (Natural-language search),
> Screen 18 (Delete & trash), Appendix A6 (status model).

> **TL;DR** — Company-scoped RBAC is **built and enforced via Supabase RLS**: four
> roles, per-company access grants, an admin-only Team screen, and a trash/restore
> system. `must_change_password` is now enforced at login too (migration 0048).
>
> **⚠️ Critical bug found and fixed via a real user report (migration 0053):** the
> `invoices`/`bank_transactions` tables' own RLS was correct, but the actual screens
> read through views (`v_invoices_list`/`v_invoices_review`,
> `v_bank_transactions_list`), and **every view in this project was silently
> bypassing RLS entirely** — a Postgres default (views run as their _owner_, here a
> superuser, for permission purposes, unless `security_invoker = true` is set; this
> project's views never had it). A real employee (Anja, granted access to exactly
> one company) was seeing **102 other-company invoices and 1445 other-company bank
> transactions** — i.e. the two most-used screens in the whole app were not
> respecting company scoping at all. Confirmed this predates this branch (migration
> 0046 only ever fixed the tables' own policies, never the views on top of them) and
> was simply never exercised by a real restricted user until now. Fixed by adding
> `security_invoker = true` to every view in the project; re-verified live —
> Anja now sees exactly her granted company's rows (0 leaked), admin still sees
> everything (no regression). See §2.1a below for the full write-up.
>
> Verified live: migrations 0046–0053 applied to the dev project
> (`txxqvvpvrylnqbpscmpv`), self-checked (including a real end-to-end RLS test — a
> simulated restricted session correctly saw only its granted company — and a real
> end-to-end login → set-password → RPC call against the live Auth API), `tsc`/
> `eslint`/`vite build` all clean. What's **not** built yet: property-level access
> grants, write-side RLS (INSERT/UPDATE), a dynamic/extensible role hierarchy, and
> unifying the approval chain (`Approver`/`approval_rules`) with the new `app_users`/
> `roles` identity model. **The GoBD compliance question this doc previously flagged
> is resolved:** `purge_record()` now rejects `invoices` outright (migration 0049) —
> an admin can no longer permanently hard-delete a receipt, only soft-delete/restore
> it. `restore_record()` is also now admin-only, matching `purge_record()` and the
> admin-only "Verwaltung" nav grouping. See `docs/TRASH_AND_DELETE.md` §2.1 for the
> full detail; both are cross-referenced there and here since they're one underlying
> fact relevant to both docs.
>
> **2026-08-10 — cross-app verification against the Immonetz Hub sibling app:** this
> app's own RLS was clean (no equivalent of the `auth_read` regression found on
> Immonetz — see below), but two gaps surfaced. `apply_assignment_rule_bulk()` was
> `anon`/`PUBLIC`-executable (not just `authenticated`) on this project too — same
> root cause as Immonetz, fixed here by
> `20260810062807_revoke_anon_execute_apply_assignment_rule_bulk.sql`. `/auswertungen` also had
> no route-level guard (only nav-hidden from the assistant role) — added an
> `AuswertungenGuard` wrapper matching `TeamGuard`'s pattern. See §2.7 for the full
> write-up, including what was found and fixed on the Immonetz side for reference.

---

## 1. What the briefing asks for

### 1.1 The four roles (Appendix A7)

| Role                                            | Who                    | May                                                                                                           |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Super admin**                                 | Developer (Fabian)     | Technical operation, AI consumption, all instances. **Not visible to the client.**                            |
| **Admin / management**                          | Philipp                | See everything. Create employees, assign rights, define the approval path and rules. May skip approval steps. |
| **Supervisor** _(optional, intermediate level)_ | e.g. a department head | Approve what is assigned to them.                                                                             |
| **Assistant / accounting**                      | Anja                   | Capture receipts, check, assign, set notes, forward to the supervisor.                                        |

### 1.2 The rules (Screen 17 + Appendix A7)

- **Every person sees only their assigned companies** (and possibly properties) — no
  more. Applies everywhere: lists, search, evaluations.
- **The role structure is dynamic**: intermediate levels (e.g. department heads) must
  be creatable **without changing code** — and it stands on the **same structure as
  the approval chain** (Screen 6): build both once, not twice.
- **Offboarding:** deactivated, not deleted — otherwise a departed person's past
  approvals and notes disappear from the log.
- **One interface, no separate admin portal.** The role hides what a user may not do;
  there's no separate admin app.
- **Menu order** (defined by Fabian): Overview → Incoming invoices → Suppliers →
  Properties → Outgoing invoices → Customers → Evaluations; management/admin areas
  hang below that, visible depending on the role.
- **Only management sees the evaluation/BWA** — the assistant does not see it at all.
- The **grievance being fixed**: today every logged-in user may see everything
  (`using (true)` RLS) — untenable with six companies of real figures.
- **Default visibility decision** in the appendix: Philipp = all companies, Julia =
  only JPGB. This is the anchor for the "no grants recorded" fallback behaviour (see
  §3 below).

### 1.3 Cross-references from other screens

- **Screen 6 (Approval workflow):** actions depend on the role — the assistant sees
  "check · comment · approve to supervisor"; the boss additionally sees "final
  approval" and "skip step". Whoever may not approve doesn't see the button at all.
  A **deputy** must be storable for absences (otherwise the whole flow stalls while
  the one approver is on vacation), plus an escalation after X days or an
  amount threshold above which approval isn't required.
- **Screen 16 (Search):** must respect access rights — an employee finds only what
  they're allowed to see anyway. Explicitly **not a build priority yet** (Fabian),
  but built anyway (ported from immonetz at the developer's request) — see
  `docs/NATURAL_LANGUAGE_SEARCH.md`. It does respect access rights: both its RPCs
  and its grounding queries run through the caller's own RLS-scoped client, same
  as every other read on this screen.
- **Screen 18 (Trash):** deleting must leave history (who, when); this is a
  cross-cutting rule, not specific to roles, but the Team/Trash areas are grouped
  together in the nav as "admin areas."
- **Part 3 ("what you start with"):** the **complete status values (Appendix A6)**
  and the **role/rights model (Appendix A7)** are both called out as _foundational
  decisions to get right before building interface_ — "instead of 'everyone may do
  everything'."

---

## 2. What is implemented (this branch)

### 2.1 Database (`supabase/migrations/0046_roles_access_trash.sql`)

- Single-tenant cleanup: dropped the generic multi-tenant scaffold (`tenants` table,
  `tenant_id` columns), reseeded exactly the four roles from A7 (`super_admin`,
  `admin`, `supervisor`, `assistant`) into `public.roles`.
- Access-check helpers (`SECURITY DEFINER`, granted to `authenticated` only):
  - `current_app_user_id()` — resolves the caller's `app_users` row by JWT email.
  - `current_role_name()` / `is_admin()` — role-based check for admin-only actions.
  - `has_company_access(p_company uuid)` — the core grant check: denies a deactivated
    account outright; treats `p_company is null` as always visible (the catch-all
    "unassigned" bucket must stay visible to every reviewer); treats **no grants
    recorded for a user as unrestricted** (matches the briefing's "Philipp = all"
    default and avoids locking existing users out the moment the migration lands).
- `app_users` / `user_company_access`: admin-only read/insert/update RLS policies.
- `SELECT` policies rewritten to `has_company_access(company_id)` on every
  company-scoped table: `companies`, `invoices`, `outgoing_invoices`, `customers`,
  `bank_accounts`, `bank_transactions`, `manual_bookings`, `approval_rules`,
  `assignment_rules`, `datev_handover_batches`, `datev_routes`, `lexoffice_config`,
  `lexoffice_sync_log` (both dropped entirely by migration `0086` — see below),
  `property_companies` (migration `0083`, replacing
  `property_assignment`/`business_line`). Cross-company master data (`suppliers`,
  `bwa_categories`, `properties`) stays visible to every authenticated
  role — deliberate, since a supplier can invoice several companies.
- `companies` write policies are admin-only (`companies_admin_insert/update`); every
  other table's INSERT/UPDATE is **left untouched** (still open to any authenticated
  user) — an explicitly disclosed follow-up, not an oversight (see §3).
- Trash: `outgoing_invoices` gets the `deleted_at/deleted_by/delete_reason` columns
  it was missing (every other trash-eligible table already had them). Two RPCs:
  `restore_record(table, id)` and `purge_record(table, id)` — **both admin-only as of
  migration 0049** (see `docs/TRASH_AND_DELETE.md` §2.1 for the full detail: purge
  additionally rejects `invoices` outright for GoBD reasons, and 0050 closes an
  `anon`-executable gap `get_advisors` surfaced on both RPCs after 0049 landed).
  `purge_record` logs a JSON snapshot to `change_history` before the hard delete.
  - **Gotcha found during the migration self-check, worth knowing before writing
    similar dynamic-SQL RPCs on this project:** `FOUND` is **not** reliably set after a
    dynamic `EXECUTE '...' USING ...` UPDATE here — confirmed empirically (an UPDATE
    that demonstrably changed a row still left `FOUND = false`). `restore_record()`
    uses `GET DIAGNOSTICS v_rows = ROW_COUNT` instead, which is unambiguous for any
    DML, static or dynamic. Don't rely on `FOUND` after a dynamic `EXECUTE` in this
    codebase without testing it first.

### 2.1a ⚠️ Views were bypassing RLS entirely (`supabase/migrations/0053_view_security_invoker.sql`)

Reported by a real user: after granting `Anja` (assistant) access to exactly one
company via `/team`, she still saw invoices from every company on the
Eingangsrechnungen screen.

**Root cause, confirmed step by step:**

1. Querying the `invoices` table directly, as her real session, correctly narrows
   to her one granted company plus unassigned (`company_id is null`, the deliberate
   "watch-all" default) rows — `invoices_select`'s `has_company_access(company_id)`
   policy (migration 0046) works exactly as designed.
2. But `useBelegeListe`/`useBelegeKanban` (`queries.ts`) — the actual hooks behind
   the Eingangsrechnungen list/kanban screens — don't query `invoices` directly.
   They query `v_invoices_review`, a thin wrapper over `v_invoices_list` (migration
   0042), both plain views over `invoices`.
3. **Every view in this project (`v_invoices_list`, `v_invoices_review`,
   `v_bank_transactions_list`, `v_trash`, `v_supplier_duplicates`) was created
   without `security_invoker = true`** (the Postgres 15+ view option; this project
   runs Postgres 17). Without it, a view's access to its underlying table runs as
   the _view's owner_ for permission-checking purposes — here `postgres`, a
   superuser — **not** as the querying user. Superusers bypass RLS unconditionally,
   so `has_company_access()` was never evaluated at all for anyone reading through
   these views. Confirmed via `pg_class`: all 5 views, `relowner = postgres`,
   `reloptions` empty (no `security_invoker`).
4. Verified live, quantitatively, before the fix: Anja (1 real company grant) saw
   **102 other-company invoices** via `v_invoices_review` and **1445 other-company
   bank transactions** via `v_bank_transactions_list` — the exact view the bank
   reconciliation screen reads. Both of these are the single most-used screens in
   the app. This predates this branch entirely: migration 0046 only ever touched
   the _tables'_ RLS policies, never the views layered on top, and nothing
   exercised this with a real restricted grant until now (every real
   `user_company_access` row before this session was either absent or created and
   removed within a test).

**Fix:** `alter view ... set (security_invoker = true)` on all 5 views. This makes
each view evaluate the underlying table's RLS as the calling user, identical to
querying the base table directly — semantics-preserving for admin/super_admin
(still unrestricted, since they have no grants recorded) and a real fix for anyone
with an actual grant. `v_supplier_duplicates` was included for consistency even
though `suppliers` isn't company-scoped (`using (true)` policies) — a no-op today,
kept uniform so a future company-scoped view doesn't have to remember to opt in.

**Re-verified live after the fix:** Anja now sees exactly 1 invoice (her company)
and 0 leaked via `v_invoices_review`, 31 bank transactions (her company) and 0
leaked via `v_bank_transactions_list`. Admin's totals via both views are unchanged
(138 invoices, 1575 bank transactions) — no regression. `v_trash`'s own total
(27) also unchanged for admin — see `docs/TRASH_AND_DELETE.md` for why this
specific view's exposure was low-impact today (admin-only screen, admins
currently unrestricted) even though the same root cause applied to it too.

**No frontend code changes were needed** — this was purely a database-level fix;
`useBelegeListe`/`useBelegeKanban`/every other hook reading these views needed no
changes once the views themselves correctly enforced RLS.

### 2.1b Full read-scoping sweep, every company-scoped surface (2026-08-04)

Following the view fix (§2.1a), a complete sweep was run to make sure no other
surface has the same class of leak — not just the two the user happened to hit.

- **All 13 company-scoped tables from migration 0046** tested directly, live, under
  Anja's real single-company grant (`JPGB`): `invoices`, `outgoing_invoices`,
  `bank_transactions` (all three re-confirmed clean after the fix), plus
  `customers`, `bank_accounts`, `manual_bookings`, `approval_rules`,
  `assignment_rules`, `datev_handover_batches`, `datev_routes`,
  `lexoffice_config`, `lexoffice_sync_log`, `property_assignment`, `companies` —
  **0 leaked rows on every single one.** For the tables that returned 0 total rows
  visible to her, real non-zero counts were independently confirmed as admin first
  (2 customers, 2 manual_bookings, 1 datev_handover_batch, 4 datev_routes, 2
  lexoffice_config rows, 17 lexoffice_sync_log rows) — so those were genuine
  narrows, not vacuous passes against empty tables. **Update (2026-08-06):**
  LexOffice was removed entirely from this app (see `docs/AUSGANGSRECHNUNGEN_UPLOAD.md`);
  migration `0086` drops both `lexoffice_config` and `lexoffice_sync_log` — the 2 live
  `lexoffice_config` rows referenced tax/company codes that didn't match any real Stäy
  company, a likely cross-client credential that this table drop removes from this
  database (any live-key rotation on the LexOffice/immonetz side is outside this repo).
- **Every `SECURITY DEFINER` function in the schema audited** (bypasses RLS by
  design, so each one is an independent candidate for exactly this class of bug).
  Cross-referenced against every RPC actually called from the frontend
  (`grep -oP '\.rpc\("\K[a-z_]+' src/lib/data/queries.ts`): the read-facing ones
  used to populate the incoming-invoices screen (`invoices_kpis`,
  `invoices_facets`) and everything else that returns rows to a list/table
  (`assignment_rule_preview`, `manual_bookings_expanded`,
  `resolve_assignment_rule`, `resolve_approval_rule`, etc.) are all
  `SECURITY INVOKER` (`prosecdef = false`) — they run as the calling user, so they
  inherit RLS automatically rather than needing their own internal check.
  `invoices_kpis`/`invoices_facets` re-verified live: Anja's KPI total (36 open
  items) and facet lists (property codes, years, months) are both derived only from
  her visible invoices, versus admin's unrestricted total (138) — correctly scoped.
- **No admin/service-role client used for a read path**: grepped every
  `src/lib/api/*.functions.ts` server function for `supabaseAdmin` — the three
  usages (`employees.functions.ts`, `lexoffice.functions.ts`,
  `datev-handover.functions.ts`) are all narrow, write-side, or explicitly
  column-hiding (e.g. reading `lexoffice_config.api_key`, a column deliberately
  withheld from `authenticated` by grant, never exposed back to the client) —
  none of them return a company-scoped list to an unauthorized caller.
- **⚠️ One write-side finding, not fixed here — a concrete instance of the
  already-disclosed gap in §3 item 3 ("write-side RLS is still open"):**
  `apply_assignment_rule_bulk()` is `SECURITY DEFINER` and iterates every
  `invoices` row matching a rule's scope — including rules with `company_id is
null` (i.e. rules that apply across every company) — with no check that the
  _caller_ has access to the companies it's about to modify. The
  `/zuordnungsregeln` screen it's called from has no role gate, so **any**
  authenticated employee, including one restricted to a single company, can
  trigger a bulk-apply that writes to other companies' invoices they cannot even
  see. This is a write-side risk, not a read leak — she still can't view the
  result — but it's a real boundary violation worth closing eventually. Flagged
  here rather than fixed, since fixing write-side RLS broadly was already an
  explicitly deferred, larger-scoped decision (§3 item 3), not something to do
  piecemeal under a "test the read path" pass.
- Sweep was read-only (`SELECT` only) against the live DB — no test fixtures or
  data mutations, nothing to clean up afterward.

### 2.2 `supabase/migrations/0047_trash_view.sql`

- `public.v_trash` — a plain view unioning every trash-eligible table into
  `(table_name, id, label, deleted_at, deleted_by, delete_reason)`. Row visibility
  follows each underlying table's own RLS — but only correctly since migration 0053
  added `security_invoker = true` (see §2.1a); before that it had the identical
  owner-bypass exposure as every other view in the project.

### 2.3 Front end

| Concern                                                               | File                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session → role/company-access resolution                              | `src/lib/auth.tsx`                                                                                                                                                                                          |
| Employee & access data hooks                                          | `src/lib/data/queries.ts` (`useEmployees`, `useCreateEmployee`, `useUpdateEmployeeProfile`, `useUpdateEmployeeRole`, `useSetCompanyAccess`, `useSetEmployeeActive`, `useResetEmployeePassword`, `useRoles`) |
| Domain types                                                          | `src/lib/data/types.ts` (`Employee`, `TrashRecord`)                                                                                                                                                         |
| Team screen                                                           | `src/routes/team/index.tsx`                                                                                                                                                                                 |
| Trash screen                                                          | `src/routes/papierkorb/index.tsx`                                                                                                                                                                           |
| Employee creation/profile updates/password resets (need service role) | `src/lib/api/employees.functions.ts` (`createEmployee`, `updateEmployeeProfile`, `resetEmployeePassword`)                                                                                                   |
| Nav role-gating                                                       | `src/components/layout/app-shell.tsx`                                                                                                                                                                       |
| Approvers picker sourced from real employees                          | `src/routes/freigabe-regeln/index.tsx`                                                                                                                                                                      |

- `AuthProvider` loads `app_users` (by email) alongside the Supabase session, mirrors
  the RLS "no active grants recorded = unrestricted" convention, and forces a sign-out
  if the account is deactivated (a live Auth session must not survive an offboarded
  account, even though RLS would deny almost everything anyway).
- `/team` (admin-only, UX-gated + RLS-gated): list employees with name, email, role,
  granted companies, active/inactive. **Edits happen behind a single pencil-icon "Edit"
  modal** (name + email + role + company access together), not inline table controls —
  matching the pencil-icon-opens-modal convention already used on the Approvers tab.
  Create a new employee (name + email + role + companies; real Supabase Auth login via
  a server function using the service-role client, since only server code can hold it;
  a one-time temp password shown exactly once); deactivate/reactivate (`AlertDialog`
  confirmation, per this repo's standing convention for destructive actions).
  - **`app_users.name` is now a required field**, not optional — every employee needs
    a real display name because it's what shows up as the approver's identity
    elsewhere in the app (see the Approvers-tab integration below). The two bootstrap
    accounts (Philipp Netz `buchhaltung@netz.immo`, admin; Anja `anja@gmail.com`,
    assistant) were seeded this way.
  - **Editing an employee's email goes through `updateEmployeeProfile`, never a plain
    `app_users` row update.** `app_users.email` is what `has_company_access()`/
    `current_role_name()` match against `auth.jwt() ->> 'email'` — if the DB row
    changed but the real Supabase Auth login email didn't, the two fall out of sync
    and the employee silently stops resolving to any role on their next request. The
    server function updates the real Auth account (`auth.admin.updateUserById`) and
    the `app_users` row together, with a best-effort revert of the Auth side if the DB
    write then fails, so the two never drift.
  - **Reset password (key-icon action, active employees only)**: `resetEmployeePassword`
    generates a fresh random temp password (same `tempPassword()` helper as
    `createEmployee`) and flips `must_change_password` back to `true` so the employee is
    forced onto `SetNewPasswordScreen` on their next login. Server-side only (needs the
    service-role Admin API, same reason as `createEmployee`). Gated both in the UI
    (button disabled when `!employee.is_active`) and server-side (the function itself
    409s with `EMPLOYEE_INACTIVE` if the target isn't active) — an inactive account
    can't log in at all regardless of password, so resetting one would be misleading;
    reactivate first.
    - **Also creates the missing Auth account for rows that never had one.** Some
      `app_users` rows predate `createEmployee` — seeded directly in the DB, e.g. the
      two bootstrap accounts (`buchhaltung@netz.immo`/admin, `anja@gmail.com`/
      assistant) — and have `auth_user_id = null`. Live-caught while testing this
      feature: calling `auth.admin.updateUserById(null, ...)` for such a row fails deep
      inside `supabase-js` with an opaque `"Expected parameter to be UUID but is not"`.
      `resetEmployeePassword` now branches on `auth_user_id`: if set, updates that
      account's password (`auth.admin.updateUserById`); if null, creates a brand-new
      Auth account for the employee's email (`auth.admin.createUser`, same call
      `createEmployee` makes) and writes the new `auth_user_id` back onto the
      `app_users` row in the same update that flips `must_change_password`. From the
      admin's point of view "this employee has no working login" and "this employee's
      login needs replacing" are the same problem, so one action covers both instead of
      a dead-end error requiring a separate, unbuilt "create login" flow.
    - **The plaintext password is never stored or re-revealable** — same
      one-time-display convention as `createEmployee`, shown once in the same
      `TempPasswordDialog` (with reset-specific copy) and gone after that; there is
      deliberately no "reveal the current password" feature. Supabase Auth stores only
      a bcrypt hash (`auth.users.encrypted_password`, the internal `auth` schema, never
      queried by this app) — the plaintext exists only in-memory for the duration of
      this one request and in the response it hands back, nowhere else.
- `/papierkorb`: lists `v_trash`, restore and purge actions.
- Nav: an admin-only "Verwaltung" group (Team + Papierkorb); `/auswertungen` hidden
  from the assistant role (mirrors A7 exactly — "only management sees the
  evaluation/BWA").
- **Approvers tab (`/freigabe-regeln`) now picks its "who approves" name from real
  Team employees (`useEmployees()`), not free text.** Previously you could type any
  name into the Approvers list; now the create/edit dialog is a `<Select>` of actual
  onboarded employees, with `Approver.role` ('assistant' | 'manager', a coarser
  two-tier enum from the original Screen 6 build) auto-derived from the employee's
  real `AppRole` (`approverRoleForEmployeeRole()`: assistant → assistant,
  admin/super*admin/supervisor → manager) instead of picked separately. **This is
  partial progress on §3 gap #1, not the full fix**: `Approver.name` is still a plain
  string, not a foreign key to `app_users` — the picker just guarantees that string
  can only ever be populated \_from* a real employee's name, it doesn't turn the two
  tables into one identity model. `approvers.app_user_id` (added 2026-08-12, see §3
  item 1) now lets the dialog's edit view resolve the matching employee exactly by ID
  instead of by name when the link exists, so a renamed employee no longer breaks the
  re-edit lookup **for approvers created after the FK existed (or backfill-matched)**
  — a pre-existing approver whose name has since drifted from its `app_users` match and
  was never backfilled still falls back to the old name-match behavior.
- **Deactivating an approver is a real, live-tested footgun, partially closed.**
  `useApprovers()` filters `.eq("is_active", true)` at the query level — deactivating
  someone removes them from every picker (step 1/2, deputy, act-as, assignment) and
  from the Approvers tab list _entirely_, not a dim/greyed-out row (the `opacity-50`
  class on an inactive `ApproverRow` is dead code; an inactive row can never reach that
  component). Deactivating does **not** touch any existing `approval_rules` row that
  already names them as `step_1_approver`/`step_2_approver` — those keep resolving via
  `resolve_approval_rule()` exactly as before, since that function only checks the
  _rule's_ own `is_active`/`deleted_at`, never the approver's. Confirmed live on this
  project: deactivating the only two approvers left 7 active rules pointing at
  deactivated names, and every invoice on those rules silently lost its "responsible
  approver" display (`$nr.tsx`'s `responsibleApprover` lookup returned `null` for
  everyone, since it looked up against the same active-only list). Fixed with a
  second hook, `useAllApprovers()` (no `is_active` filter, used _only_ for this
  lookup — every picker correctly keeps using the active-only `useApprovers()`), so
  `$nr.tsx` can now tell "no one assigned" apart from "someone's assigned but
  deactivated" and shows an explicit amber warning
  (`belege.detail.workflow.verantwortlicherInaktiv`) for the latter instead of
  silently showing nothing. **Not fixed**: the stale `approval_rules` row itself —
  the warning tells you it's wrong, but nothing edits the rule or clears the
  deactivated name automatically. Reactivating the approver or manually re-pointing
  the rule to someone else are the only two ways to actually resolve it.

### 2.4 Fail-safe ordering (found in a self-review pass, already fixed)

`has_company_access()`'s "no grants recorded = unrestricted" default is exactly right
for normal operation (see §2.1), but it has one sharp edge: **any code path that ends
up with zero recorded grants mid-operation — even transiently, even due to an
unrelated failure — makes that person unrestricted, not locked out.** Three places
originally got the failure-ordering backwards and were corrected:

- **`useSetCompanyAccess` (`queries.ts`)** used to delete all of an employee's existing
  grants, then insert the new set. If the insert failed after the delete succeeded, the
  employee was left with zero grants — i.e. briefly unrestricted — instead of their
  prior, narrower access. Fixed to **insert the new grants first, then delete only the
  old ones no longer in the new set**: a failed insert leaves the old grants fully
  intact; a failed delete leaves a safe superset (old ∪ new), never "everything." (The
  "delete" half of this was itself later found to be a no-op under RLS and replaced
  with a soft-delete — see §2.8; the ordering guarantee described here still holds,
  just via `upsert`-then-`update` instead of `insert`-then-`delete`.)
- **`createEmployee` (`employees.functions.ts`)** used to insert the new `app_users`
  row as `is_active: true` before writing its `user_company_access` grants. If the
  grants insert failed, the account already existed, was already active, and had zero
  grants — unrestricted. Fixed to create the row `is_active: false`, insert the grants,
  and only then flip `is_active: true` as the last step — `has_company_access()` denies
  an inactive account outright regardless of grants, so a failure anywhere in the
  middle just leaves the employee unable to log in yet (recoverable from the Team
  screen), never briefly able to see everything.
- **`visibleToRole` (`app-shell.tsx`)** used to default role-restricted nav entries
  (the admin-only "Verwaltung" group) to _visible_ whenever the role hadn't resolved
  yet. Not a data-access issue (RLS + the route guard both still block a non-admin),
  but a non-admin could see the Team/Papierkorb links flash on before bouncing off a
  redirect. Fixed: only _unrestricted_ entries (no `roles` array) default to visible
  during that window; role-restricted entries default to hidden until the role is
  positively known to qualify.

### 2.4a `change_history` had no RLS policies — role/access mutations were silently failing (`supabase/migrations/0051_change_history_rls.sql`)

Discovered via a real user report while testing an unrelated feature (deleting an
outgoing invoice), but the root cause hit **this** feature too: `change_history`
(the generic audit log `insertChangeHistory()` writes to) had RLS **enabled with
zero policies**, so every direct client insert into it unconditionally 403'd
(`42501`). `useUpdateEmployeeRole`, `useSetCompanyAccess`, and `useSetEmployeeActive`
(§2.3) each perform their real row mutation first — which succeeds, since
`app_users`/`user_company_access` have correct admin-only RLS policies — and only
then call `insertChangeHistory()` to log it. That second call was throwing, which
surfaced as a whole-mutation error in the Team screen even though the role
change/access grant/activation toggle had **already committed**. So: a role change
made in `/team` likely _did_ take effect even if the UI showed a failure toast — the
audit-log entry is what was actually missing, not the change itself.
`restore_record()`/`purge_record()` (§2.1) never hit this: they write to
`change_history` from inside a `SECURITY DEFINER` function, which bypasses RLS —
only the direct client-side path was broken. Fixed with `auth_read`/
`auth_write_insert` policies (`true`/`true` for `authenticated`), mirroring
`invoice_history`'s existing, working policies exactly. See
`docs/TRASH_AND_DELETE.md` §2.1 for the full write-up (one underlying bug, relevant
to both docs). Verified live: a simulated authenticated insert that previously
403'd now succeeds.

### 2.4b Full RLS regression pass (this branch, live on `txxqvvpvrylnqbpscmpv`)

Run after 0051 (and `docs/TRASH_AND_DELETE.md`'s 0052) landed, against the real dev
project, each check going through the actual enforcement path (`set local role
authenticated; set local request.jwt.claims = '...'`, the same mechanism PostgREST
itself uses per request — not just an application-layer assumption):

- `is_admin()`/`current_role_name()`/`has_company_access()` verified correct for
  `admin` (sees all 7 companies, `is_admin()=true`) and `assistant` (sees all 7 with
  zero grants recorded — the unrestricted default).
- **Real temporary grant** on Anja (`assistant`): `IMOS` granted (`can_view=true`),
  `NOGR` explicitly denied (`can_view=false`) — narrowed her visible company count
  from 7 to exactly 1, `has_company_access` matched both cases precisely, and
  `has_company_access(null)` (the "watch-all" case for an unassigned invoice) stayed
  `true` even while restricted. A **soft-deleted** grant confirmed to not count
  (stays unrestricted). Grant removed immediately after; verified
  `user_company_access` back to 0 rows, matching the pre-test baseline.
- **Deactivated-user case**, tested against Anja's real account (toggled
  `is_active=false`, tested, reactivated immediately — a fabricated `app_users` test
  row isn't possible, `auth_user_id` has a real FK to `auth.users`): `is_admin()`,
  `has_company_access(null)`, and `has_company_access(<any company>)` all correctly
  `false`; 0 companies visible. Confirms A7's "deactivated, not deleted" rule denies
  even the watch-all fallback that would otherwise apply to an unrestricted user.
- **Write-policy gating confirmed** for a non-admin (`assistant`): cannot insert a
  `companies` row (explicit RLS violation error), cannot deactivate another
  employee via `app_users` (RLS silently filters the `UPDATE` to 0 affected rows —
  same silent-failure mechanism as the two bugs above, but here it's the _intended_
  behavior), cannot insert her own `user_company_access` grant.
- `restore_record`/`purge_record` (§2.1) both confirmed to reject a non-admin caller
  with `insufficient_privilege`.

### 2.5 `must_change_password` enforcement (`supabase/migrations/0048_clear_must_change_password.sql`)

A new employee's one-time temp password (`createEmployee`) previously stayed usable
forever — the flag was recorded but nothing checked it. Closed:

- **`clear_must_change_password()` RPC** — a narrow, self-service `SECURITY DEFINER`
  function that clears the flag on the _caller's own_ `app_users` row (matched by
  `auth.jwt() ->> 'email'`, same convention as `has_company_access()`). A dedicated
  RPC rather than a new self-`UPDATE` RLS policy on `app_users` on purpose: every
  existing write policy on that table is admin-only (migration 0046), and a general
  self-`UPDATE` policy would let any authenticated user edit any of their own columns
  — a much bigger surface than this one flag needs.
- **`auth.tsx`** now fetches `must_change_password` alongside role/company access and
  exposes `mustChangePassword` + a `completePasswordChange(newPassword)` action that
  does both steps in order: `supabase.auth.updateUser({ password })` (sets the real
  password on the live session), then the RPC (clears the flag). If the RPC step
  fails after the password already changed, that's reported as an error and the user
  stays on the set-password screen next load — annoying, never a security gap, and
  retryable with the password they just set.
- **`auth-gate.tsx`** blocks on this ahead of `AppShell`: `ready → !user → LoginScreen`,
  `ready → user → mustChangePassword → SetNewPasswordScreen`, only then the real app.
  No window where the app is briefly reachable with the temp password still active.
- **Verified against the live Auth API, not just read through**: logged in as Anja
  with her real temp password, called `PUT /auth/v1/user` to set a new password, then
  the RPC — confirmed `must_change_password` flipped to `false` in the DB. Her
  temporary password from earlier in this conversation is now **invalid** as a side
  effect of that verification; a fresh one was generated and she was reset to
  `must_change_password = true` so she still gets the real first-login flow instead of
  inheriting a leftover test password.

### 2.6 Already built in an earlier phase (not new on this branch, but relevant)

- **Approval workflow** (migrations 0035/0036, `Approver`/`ApprovalRule` types,
  `useApprovers`/`useApprovalRules`/`useResolveApprovalRule` in `queries.ts`):
  two-stage chain, deputy (`deputy_name`), escalation (`escalation_days`), payment
  handoff (`payment_handler`), return-with-query. (**Skip-step and "already approved" were
  removed** when the invoice detail's workflow bar became the navigation: both were manager-only,
  both landed on `freigegeben_vorgesetzter`, and both did to the invoice exactly what a plain
  approval does. A manager clicks the step circle instead. See `docs/WORKFLOW_BAR_NAVIGATION.md`
  §2.1. Their `invoice_history` types survive so old rows still render.)
- **Full status model** (Appendix A6): `WORKFLOW_REIHENFOLGE` in
  `src/lib/data/format.ts` already has all eight values (`eingegangen` →
  `abgeschlossen`, incl. `rueckfrage`, `freigegeben_assistenz`,
  `freigegeben_vorgesetzter`) plus a separate `abgelehnt`/`nicht_relevant` handling —
  the docs `docs/PROJECT-ROADMAP.md` / `docs/CODEBASE_AUDIT.md` calling this
  "not started" are **stale**.

### 2.7 Cross-app verification against Immonetz Hub, 2026-08-10 — two shared gaps found and fixed here, one regression found and fixed on Immonetz only

The Immonetz Hub sibling app (`docs/PROJECT-ROADMAP.md`'s lineage, its own Supabase project
`txxqvvpvrylnqbpscmpv`) has its own copy of this doc and its own roles/access implementation.
Comparing the two live, side by side, surfaced drift in both directions.

- **This app's `companies`/`invoices`/`property_assignment` RLS was confirmed clean** — Immonetz
  had regained a leftover `auth_read USING (true)` permissive SELECT policy alongside the
  correctly-scoped one on those three tables (Postgres OR's permissive policies together, so
  `true OR has_company_access(...)` always wins), silently defeating company scoping on its two
  most-used screens. Confirmed via `pg_policies` that this app has no equivalent duplicate policy
  on any table — this was isolated to Immonetz's DEV project, fixed there via
  `20260810110000_fix_stale_auth_read_rls_policies.sql`. Nothing to do here; recorded for context
  since a future session on this app should know the same class of bug was checked for and ruled
  out on this date, not just left unexamined.
- **`apply_assignment_rule_bulk()` was executable by `anon`/`PUBLIC`, not just `authenticated`, on
  this project too** — found via `get_advisors` (identical finding on both apps, not a
  divergence). The function is `SECURITY DEFINER` with no internal caller check, so this meant an
  unauthenticated caller with only the public anon key could invoke it via
  `/rest/v1/rpc/apply_assignment_rule_bulk` and bulk-write invoices across every company a rule
  matches — worse than §3 item 3 below describes ("any authenticated employee"). The original
  grant only ever added EXECUTE for `authenticated`, never revoked the default PUBLIC grant every
  new Postgres function gets. Fixed by `20260810062807_revoke_anon_execute_apply_assignment_rule_bulk.sql`,
  revoking EXECUTE from `anon`/`PUBLIC` only — `authenticated` is unaffected, and this does **not**
  touch the already-documented, deliberately-deferred authenticated-write-side gap in §3 item 3.
- **`/auswertungen` had no route-level guard** — only nav-hidden from the assistant role (UX-only,
  per this doc's own framing of nav gating). An assistant typing the URL directly could still
  reach the BWA screen, which A7 says they should not see "at all." Added an `AuswertungenGuard`
  wrapper (same `ready`/redirect pattern as `TeamGuard`) to `src/routes/auswertungen/index.tsx`,
  redirecting the `assistant` role to `/`. Same fix applied on Immonetz.
- Both fixes re-verified live after applying: `apply_assignment_rule_bulk`'s grantees are exactly
  `service_role`/`authenticated`/`postgres` (no `anon`/`PUBLIC`); `tsc --noEmit` and
  `bun run lint` clean for every file this pass touched.
- **Not done in this pass**: the still-open authenticated-write-side RLS gap (§3 item 3) and every
  other item in §3 — this was a targeted fix for concretely-verified live bugs, not a pass at the
  larger deferred items.

### 2.8 Revoking company access silently no-op'd — `useSetCompanyAccess` used a hard `DELETE` against a table with no delete policy (2026-08-12)

Found via a real user report: editing an employee, deselecting every company (meant to reset
them to unrestricted per §2.1's "no grants = everything" default), and saving appeared to
succeed — success toast, dialog closed — but the employee's `allowed_company_ids` still showed
the prior grants, and re-opening the edit dialog showed them still checked.

Root cause: `user_company_access` has admin `select`/`insert`/`update` RLS policies but
**no delete policy** (migration `0059_hub_roles_access_trash.sql` §4) — the table is meant to be
soft-deleted via its `deleted_at` column, which `has_company_access()` already filters on
(`deleted_at is null`). `useSetCompanyAccess` (`queries.ts`) was still calling a plain
`.delete()` to prune/clear grants. Under PostgREST/RLS, a `DELETE` with no matching policy
deletes **zero rows and raises no error** — so both the "remove companies no longer selected"
path and the "clear everything" path silently did nothing, while the mutation reported success
and even logged a (false) "Firmenzugriff auf uneingeschränkt zurückgesetzt" `change_history`
entry. §2.4b's regression pass exercised a soft-deleted grant directly via SQL and confirmed
`has_company_access()` correctly ignores it — it just never went through this actual app
mutation path, so the hard-delete bug wasn't caught there.

Fixed: `useSetCompanyAccess` now `upsert`s the new grant set (`onConflict: "user_id,company_id"`,
resetting `deleted_at: null` in case a company is re-granted after being revoked), then revokes
anything no longer selected with an `UPDATE ... SET deleted_at = now()` instead of `DELETE` —
same insert/upsert-before-revoke ordering as the §2.4 fail-safe fix, still guaranteeing a failed
upsert leaves prior grants untouched and a failed revoke leaves a safe superset, never
"everything." No RLS/migration change needed — the existing admin `update` policy already covers
this.

---

## 3. What's still missing / open

1. **`Approver` is name-based, not identity-based — the approval chain and the new
   roles system are still two disconnected models, just less disconnected than
   before.** `Approver.role` is `"assistant" | "manager"` (a coarse label on its own
   table), not a foreign key to `app_users`/`roles`. The Approvers tab's picker now
   _sources_ the name from a real employee and auto-derives this label from their
   `AppRole` (§2.3) — so a fresh approver can no longer be a made-up name unrelated to
   any real account — but the underlying tables are still separate: `Approver.name` is
   a plain string, matched by equality everywhere it's used (`approval_rules.step_1/
2_approver`, the approval UI's button-visibility logic in `format.ts`/`$nr.tsx`),
   not a stable ID. Renaming an employee in `/team` does not cascade to existing
   `Approver.name`/`approval_rules` rows that were already set from their old name.
   The briefing explicitly says the role structure "stands on the same structure as
   the approval chain (Screen 6): build both once, not twice" — a real
   `approvers.app_user_id` FK is still the single biggest remaining gap here.
   - **Partial progress (2026-08-12, migration `20260812131000_hub_approvers_app_user_link.sql`):**
     `approvers.app_user_id` now exists, nullable, `references app_users(id) on delete set
null`, unique where non-null, backfilled by exact case-insensitive name match. Set
     going forward by the create-from-employee flow in `ApproverDialog`
     (`src/routes/freigabe-regeln/index.tsx`) — only on create, never on edit, matching
     the existing "identity is fixed at creation" convention there. Also used to make the
     dialog's own DISPLAY-only "current real role" lookup (`existingEmployee`) exact
     instead of name-matched, when available. **Still not the full fix**: `name`/`role`
     remain the columns `approval_rules`/`resolve_approval_rule`/`resolve_area_approver`
     actually match against — dropping them in favour of joining through this FK
     everywhere is the larger piece of work this migration deliberately deferred (see its
     own header comment and `docs/APPROVAL_ROUTING.md`).
   - **Now read for role display (2026-08-26):** `useTeamRoleForApprover()`
     (`src/lib/data/queries.ts`) resolves an approver to their real `AppRole` via
     `app_user_id` first, falling back to the display name and then, when neither matches,
     to the coarse `Approver.role` tier. Used wherever the UI IDENTIFIES a person rather
     than deciding what they may do: the Genehmiger tab's Rolle column and mobile card,
     the deputy picker, the rule step-approver picker, the "Handelnd als" line and its
     super-admin picker on the invoice detail screen (and Immonetz's "Zugewiesen an"
     list). Before this, an Admin read as "Vorgesetzter" everywhere, because the tier was
     printed as if it were the person's role. The tier still governs the chain and still
     derives from `AppRole` via `approverRoleForEmployeeRole()` — nothing about routing
     changed.
2. **No property-level access grants.** A7 says "per company (**and possibly
   property**)"; `user_company_access` only has a `company_id` grant — there is no
   property-scoped restriction. Fine for the current default (nobody has asked for
   sub-company scoping yet), but the data model doesn't support it if requested.
3. **Write-side RLS is still open.** INSERT/UPDATE on every company-scoped table
   (except `companies`) has no `has_company_access()` check — any authenticated user
   can currently write to any company's invoices/transactions/etc. Migration 0046's
   own comment flags this as deliberately deferred, "needs per-screen judgment" (e.g.
   Screen 3's assign-a-company-to-an-unassigned-invoice flow must not be blocked by
   the very check that results from that assignment). **Concrete instance found
   during the §2.1b sweep:** `apply_assignment_rule_bulk()` (`/zuordnungsregeln`,
   no role gate) is `SECURITY DEFINER` and will bulk-update invoices across every
   company a rule's scope matches, including company-unscoped rules, regardless of
   the calling employee's own `user_company_access` grants. **Update 2026-08-10:**
   this function was also `anon`/`PUBLIC`-executable (no authentication required at
   all) until `20260810062807_revoke_anon_execute_apply_assignment_rule_bulk.sql` closed that
   specific surface (see §2.7) — the authenticated-caller gap described here is
   unchanged and still open.
   **Exception, closed 2026-08-06:** `approvers`/`approval_rules` INSERT/UPDATE are
   now gated behind `is_admin()` (migration `0088_approval_rls_admin_only.sql`) —
   not `has_company_access()` (these tables aren't meaningfully company-scoped the
   same way), but no longer open to any authenticated user either. See
   `docs/APPROVAL_ROUTING.md`.
4. **Roles are a fixed, hardcoded list of four — not the "dynamic" hierarchy the
   briefing asks for.** Migration 0046's own comment says as much: "a small
   closed list, not a user-manageable table." Adding an intermediate level today
   means a new migration, not an admin action in the UI.
5. ~~**Natural-language search (Screen 16) doesn't respect access rights yet** —
   because it doesn't exist yet.~~ **Resolved:** built (see
   `docs/NATURAL_LANGUAGE_SEARCH.md`), ahead of Fabian's stated "do not build yet"
   priority — worth flagging to the client for that reason, not for access rights.
   It does respect access rights: `invoices_filtered_search`/`invoices_filtered_aggregate`
   are `security invoker` on `v_invoices_review`, and the grounding queries
   (candidate companies/properties/categories) run through the caller's own
   RLS-scoped client — a restricted employee's AI search results, and even the
   candidate lists the model can pick from, are already scoped to what they can see.
6. **Menu order** doesn't yet match Fabian's specified order (Overview → Incoming
   invoices → Suppliers → Properties → Outgoing invoices → Customers → Evaluations,
   admin areas below) — worth a pass once the nav stabilizes; not a security gap,
   just a UX-polish item explicitly called out in the briefing.
7. **No UI to manage the four roles themselves** (rename, add) — consistent with
   point 4; only individual employees' role assignment is editable, not the role
   list.
8. **No `UNIQUE` constraint on `app_users.email`.** Nothing currently stops two rows
   from being created for the same email (case variations included, since every
   lookup is `lower(email) = lower(...)`) — not hit yet, but worth a constraint
   before this table sees real multi-admin usage.

---

## 4. Suggested order for closing the gaps

1. Unify `Approver`/`approval_rules` with `app_users`/`roles` (item 1) — the largest, most spec-relevant remaining gap; touches the approval UI's button visibility logic in `format.ts`/`$nr.tsx`.
2. Add write-side `has_company_access()` checks table by table, in the order the briefing's screens are used (Screen 1–3 intake first, since that's the highest-traffic write path).
3. Only then consider property-level grants and a dynamic role hierarchy (items 2, 4) — both are explicitly "when needed" in the briefing, not blocking today's single real customer (Philipp) plus a handful of named employees.

---

## Super admin is now visible in Team & Rollen (2026-08-13)

**This reverses A7's original "`super_admin` is invisible to the client entirely".** The role is
still never _assignable_, but the row is now listed, because its display name has to be editable
somewhere and there was no other screen for it.

- `useEmployees()` no longer filters `super_admin`. The exclusion moved to the consumers that must
  not offer it: both approval-rule pickers in `src/routes/freigabe-regeln/index.tsx` (an approver,
  a rule step or a deputy must never be the super admin) and the accounting-rights table
  (the three capability columns in `src/routes/team/index.tsx`, which render a dash for the
  super admin instead of switches).
- In Team & Rollen the row is **pinned to the top and highlighted**. Only `name` is editable.
  Email, role, company access and the three accounting capabilities are read-only, and the
  deactivate toggle is disabled in the deactivate direction only.
- **`AssignableRole` still excludes it**, and `updateEmployeeRole`'s zod enum rejects it.

### Enforcement is in the database, not the UI

Migrations `20260813120000_super_admin_guard.sql` and `20260813140000_super_admin_guard_hardening.sql`
add `guard_super_admin_row()` on `app_users`, because `app_users_admin_update` is
`using (is_admin())` with no column restriction — any admin can PostgREST-update the table
directly, so a `disabled` prop is not a boundary. The trigger rejects:

| Action                                 | Blocked                       |
| -------------------------------------- | ----------------------------- |
| Deactivating a super admin             | yes (`before update`)         |
| Changing a super admin's role          | yes (`before update`)         |
| **Promoting** any row _to_ super_admin | yes (`before update`)         |
| **Deleting** a super admin row         | yes (`before delete`)         |
| Renaming a super admin                 | **no** — deliberately allowed |

Email and password live in `auth.users`, out of the trigger's reach, so they are guarded in the
server functions instead: `assertNotSuperAdmin()` in `src/lib/api/employees.functions.ts` rejects
both `updateEmployeeProfile` (which moves the Supabase Auth login email) and
`resetEmployeePassword`. Both reach the service-role Admin API, so either would be a full takeover
of the one unrestricted account.

### Company scoping

`has_company_access()` grants the super admin unrestricted access **by role**
(`20260813140000` on immonetz / `20260813150000` on staeyhub), rather than relying on it happening
to have no `user_company_access` rows. Before that, a single grant row created by any other route
would have silently turned the one unrestricted account into a company-restricted one, with no UI
left to clear it because the company picker is hidden for that row.

The deactivated check still runs **first**, so a deactivated super admin is denied even the
watch-all bucket. And because the role now short-circuits company scoping, granting it is guarded
on all four verbs: `before update` and `before delete` (`..._guard_hardening`) plus `before insert`
(`..._no_insert`) — `app_users_admin_insert` is `with check (is_admin())` with no column
restriction, so without the insert trigger any admin could add a second row carrying their own
email and the super_admin role, and `current_role_name()` resolves the caller by
`lower(email) … limit 1` with no `auth_user_id` involved.

## Role-gated routes now explain themselves instead of bouncing (2026-08-25)

Six gated routes returned `<Navigate to="/" />` when the role did not match: `/team`,
`/freigabe-regeln`, `/auswertungen`, `/protokoll`, `/bankverbindungen`, `/dateibenennung`. An
assistant clicking any of them landed back on the dashboard with no message, which is
indistinguishable from a click that did not register and from a broken route. `/papierkorb` had
already been fixed this way (see its own `PapierkorbGuard` comment); the other six were missed.

Implemented: `src/components/layout/kein-zugriff.tsx` exports a shared `KeinZugriff` panel, the same
shape Papierkorb uses (shield icon, heading, explanation, "Zur Übersicht" button). Each guard now
returns it instead of redirecting:

| Route                                              | Guard                  | Variant   |
| -------------------------------------------------- | ---------------------- | --------- |
| `/team`, `/freigabe-regeln`, `/dateibenennung`     | `!isAdmin`             | `admin`   |
| `/auswertungen`, `/protokoll`, `/bankverbindungen` | `role === "assistant"` | `manager` |

`variant` selects the wording only (`zugriff.textAdmin` / `zugriff.textManager` in
`src/lib/i18n/locales/`). The gating logic itself is unchanged, and RLS remains the real boundary.
`/papierkorb` keeps its own more specific text under `papierkorb.guard`, since it can name what is
being withheld. Same change applied on Immonetz.

## The two-person rule, and `can_approve`/`can_pay` becoming real (2026-08-28)

Item 5 of `OPEN-TASKS.txt`: "split approving from paying, so Petra approves and Saskia pays,
matching the bank's two-person rule."

### What was already there

More than expected. An assistant's approval lands on `freigegeben_assistenz` and only a manager's
reaches `freigegeben_vorgesetzter` (`nextLegalActions`, `format.ts`); payment was already gated at
three layers — the UI, `requirePaymentRole` in the Edge Function, and `payment_orders_insert`'s own
RLS policy. `approvers.payment_handler` ('boss' | 'account*holder') even models \_who* pays.

### What was missing

1. **Nothing compared the approver against the payer.** `payment-initiate` never read the approval
   history before authorising. Demonstrated live on 28.08.2026: acting as Saskia Christ (manager +
   Admin), final-approving invoice `34 2480 0900 0861` and then finding "Jetzt bezahlen" enabled on
   the same screen, seconds later, by the same person.
2. **`can_book`/`can_approve`/`can_pay` were inert.** Added by `20260812150000`, written by the Team
   screen, read by nothing. The comment at `team/index.tsx:436` cited a function `accountingRightsFor`
   that does not exist in the repo. All three were `false` for all 8 users, and Admins were drawn
   as permanently on-and-disabled, so the role most likely to hold bank access could never be
   excluded from paying.
3. **`payment_handler` renders a sentence and gates nothing**, and is null for all 7 approvers. Its
   default wording is "After approval, the supervisor transfers the money themselves" — the product
   described one person doing both as normal.

### What is implemented (migration `20260828180000_two_person_rule.sql`)

- **`invoices.approved_by`** — `uuid references app_users(id) on delete set null`, written by
  `runApprovalAction` when the target status is `freigegeben_vorgesetzter` and set back to null on
  every other transition, so a rejected-then-reapproved invoice never names the first approver.
  `invoice_history.data.handelnd_als` already recorded this as _text_; an audit trail is not a key.
- **`current_can_pay()`** — `security definer`, resolves the caller by JWT email, `authenticated`
  only. Mirrors `current_role_name()`'s convention.
- **`payment_orders_insert`** now reads
  `has_company_access(company_id) and current_can_pay() and not exists (… i.approved_by = caller)`.
- **`requirePaymentRole`** returns the caller's `{id, name}` instead of void, and additionally
  requires `can_pay`. `refuseIfApprover()` and `isDirectDebit()` are new in the same shared module;
  `payment-initiate` calls both. The Edge Function's job here is the readable error — RLS is the
  boundary.
- **`nextLegalActions`** takes `canApprove` (defaulted `true`, so every other caller is unchanged)
  and returns `[]` without it.
- **`isForcedByRole`** (`team/index.tsx`) now forces only `super_admin`. Admins' rights became real
  stored values, so they are withdrawable — otherwise the rule cannot be applied to the people it
  is about.

### The backfill is load-bearing

Both columns default to false and were false for all 8 users, so switching the gate to them without
a backfill would have locked everyone out of approving and paying on deploy. The migration
reproduces today's effective permissions exactly: `can_pay` for supervisor/admin/super_admin (the
roles `requirePaymentRole` already accepted), `can_approve` for everyone wired into `approvers`.
Result — Andreas, Saskia, Faheem: all three rights; Alexis, Lukas: approve + pay; Petra, Test User,
Vanessa: approve only.

### Verified live, in a rolled-back transaction

Against `xsgbdtdwhrrhoeximeon`, each case going through the real enforcement path
(`set local role authenticated` + a `request.jwt.claims` email, the same mechanism PostgREST uses):

| Case                                                 | Result                  |
| ---------------------------------------------------- | ----------------------- |
| Saskia (the approver) inserts a `payment_orders` row | refused — RLS violation |
| Alexis (a different supervisor) inserts the same row | allowed                 |
| Petra (assistant, `can_pay = false`) inserts it      | refused — RLS violation |

Transaction rolled back; the invoice's `workflow_status`/`approved_by` and the `payment_orders`
count were re-checked afterwards and are unchanged. `payment-initiate` and `payment-cancel`
redeployed (both import the changed shared module — note this means **cancelling** an attempt now
also requires `can_pay`, which the backfill preserves for every role that could cancel before).

### Still open

- **Petra cannot give the final approval.** She is `assistant`, so `nextLegalActions` sends her
  approval to `freigegeben_assistenz`. The literal "Petra approves, Saskia pays" split needs her
  promoted to `supervisor` on the Team screen — a configuration decision, not a code one.
- **`payment_handler` is still display-only.** With `can_pay` now real, it is either redundant or
  should become the per-rule override of it. Decide and then wire it or drop it; leaving a control
  that looks like it routes payments but does not is the exact problem this pass just fixed twice.
- **Direct debit** is now refused by `payment-initiate` and disabled in the UI, but there is no RLS
  clause for it — a direct PostgREST insert would still create the draft row. Lower risk than the
  approver case (the transfer itself goes through the Edge Function), but not symmetrical.

## Permissions replace role checks entirely (2026-08-28)

**This resolves §3 item 4** ("roles are a fixed, hardcoded list — not the dynamic hierarchy the
briefing asks for") and closes the gap A7 opened: _"the role structure is dynamic: intermediate
levels must be creatable without changing code."_

### The problem

Every capability and every screen was gated by a hardcoded role string, in nine places:
`nextLegalActions`' `actingAs.role === "manager"`, `requirePaymentRole`'s role list,
`JetztBezahlenSection`, the invoice detail's `istSuperAdmin` override mode and its assign control,
`app-shell`'s `ADMIN_ROLES`/`NOT_ASSISTANT` arrays, the six route guards, the OPOS-whitelist write
check and the notification-settings check.

Worst of them was in the data layer: `useEmployees` rewrote an admin's stored capability to `true`
before the UI saw it, so turning Saskia's Payment switch off wrote `false` to the database and
still read back as on. The screen and the database disagreed and the screen won.

### The model

| Table              | Holds                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions`      | the catalogue — one row per grantable thing                                                                                                                          |
| `role_permissions` | what a role grants by default. Editable, so a new intermediate level is an admin action, not a migration                                                             |
| `user_permissions` | per-person override, **either direction**. `granted = false` REVOKES what the role would give — that is what makes "Saskia is an Admin but must not pay" expressible |

Effective = personal override where one exists, otherwise the role default. Resolved once by
`current_permissions()` and read by everything: the browser (`useAuth().can(key)`), RLS
(`has_permission(key)`), and the Edge Functions (which re-apply the same two-step lookup explicitly,
since the service-role client has no JWT for `auth.jwt()` to read).

### Portability

Deliberately split so another Hub can take this whole system:

| File                                          | Contains                                   | Portable?                                         |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `supabase/migrations/…_permissions_model.sql` | tables, functions, triggers, RLS           | **verbatim** — contains no permission keys at all |
| `supabase/permissions.seed.sql`               | the catalogue + role defaults for THIS Hub | replace per project. Idempotent, re-runnable      |
| `src/lib/permissions.ts`                      | the same keys as TypeScript constants      | replace per project                               |

No other file in `src/` contains a permission string — everything imports `PERMISSIONS`, so a
rename is one edit and a typo is a type error rather than a silently-false check.

### The keys today

`invoices.book`, `invoices.approve`, `invoices.approve_final`, `invoices.pay`, `invoices.assign`,
`invoices.override_workflow`, `opos_whitelist.write`, `notifications.settings`, and one
`page.*` key per gated route (`team`, `papierkorb`, `dateibenennung`, `freigabe_regeln`,
`auswertungen`, `protokoll`, `bankverbindungen`).

### Behaviour is unchanged on deploy

The seed transcribes the role gating that was in the code, and the per-person capability rows come
from the `can_book`/`can_approve`/`can_final_approve`/`can_pay` columns rather than from roles —
those columns already held the answer, and rebuilding them from roles would have re-introduced the
mapping this removes. Verified effective sets afterwards: admins and the super admin hold
everything; supervisors hold approve, final approve, pay, the OPOS write and the three
non-assistant pages; assistants hold approve only.

`app_users.can_*` are now unread by any code. Left in place deliberately — the seed reads them to
build the override rows, so dropping them belongs in a later migration once no environment needs
re-seeding from scratch.

### Verified live, in a rolled-back transaction

| Case                                                            | Result  |
| --------------------------------------------------------------- | ------- |
| Saskia (the approver) inserts a `payment_orders` row            | refused |
| Alexis (supervisor, inherits `invoices.pay` from his role)      | allowed |
| Alexis with `invoices.pay` revoked **for him personally**       | refused |
| Petra (assistant) granted `invoices.pay` **for her personally** | allowed |

The last two are the point: who may pay is now changed on Team & Rollen, never in code.
Transaction rolled back; the invoice and `payment_orders` re-checked and unchanged afterwards.
`payment-initiate` and `payment-cancel` redeployed.

### Edge cases, verified live (2026-08-28)

Each case run against `xsgbdtdwhrrhoeximeon` through the real enforcement path
(`set local role authenticated` + a `request.jwt.claims` email), inside a rolled-back transaction.

| Case                                                               | Result                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| A newly created supervisor, with no `user_permissions` rows        | inherits all 7 of the role's permissions          |
| A per-person `granted = false` on something the role grants        | revoked                                           |
| A per-person `granted = true` on something the role does not grant | granted                                           |
| A deactivated account                                              | 0 permissions, even the ones its role grants      |
| An `app_users` row with `role_id = null`                           | 0 permissions                                     |
| A JWT email with no `app_users` row                                | 0 permissions                                     |
| Deleting an `app_users` row                                        | its overrides cascade, 0 orphans                  |
| Changing someone's role                                            | re-derives immediately, no per-person rows needed |

Two defects were found by this pass and fixed:

- **`guard_super_admin_permissions` cancelled every DELETE**, not just the super admin's. `NEW` is
  NULL in a `BEFORE DELETE` trigger and returning NULL cancels the operation, so the closing
  `return new` silently removed zero rows and reported success — the same shape as the
  `user_company_access` bug in §2.8. Fixed in `20260828210000`; verified that a normal override now
  deletes and the super admin's still does not.
- **Capabilities were role-defaulted for nobody.** The first seed put the four capability
  permissions in `user_permissions` only, because that is where the answer lived (the `can_*`
  columns), so an employee created _after_ the migration inherited the pages their role grants and
  none of the capabilities. A fresh supervisor resolved to exactly
  `opos_whitelist.write, page.auswertungen, page.protokoll, page.bankverbindungen` — no approve, no
  pay. Fixed in `20260828220000`, which gives each role its capabilities and then deletes the
  per-person rows that merely restate the role default. 32 override rows collapsed to 4 (the super
  admin's, which the trigger protects) and every user's effective set was byte-identical before and
  after.

### The seed is idempotent, and guarded

`supabase/permissions.seed.sql` had a stale duplicate INSERT that re-created all 32 redundant
override rows on every run — caught by re-running it and diffing the row count. Now:

- the catalogue upserts, role defaults use `on conflict do nothing`;
- the legacy `can_*` backfill is skipped when those columns do not exist (a project that starts on
  this model), skipped when they are all false (added but never populated — writing them out would
  create `granted = false` rows that MASK the role defaults and leave everyone with nothing), and
  otherwise writes only rows that DEVIATE from the role default;
- a `raise exception` fires if no role default matched at all, because a project whose `roles` table
  uses different names would otherwise seed silently empty and lock every screen for everybody.

Verified: run, prune, re-run, run again — 4 rows each time, effective permissions unchanged.

## Write-side enforcement: capabilities now hold at the data layer (2026-08-28)

**This closes §3 item 3**, the write-side gap open since migration 0046.

### What was wrong

`invoices_update` was `using (true) with check (true)`. Every capability except payment was therefore
advisory — the permission model hid the buttons and PostgREST accepted the write anyway. Only
`payment_orders` was genuinely protected, because that table's own INSERT policy carries a
permission clause.

Demonstrated live, as Petra (holds `invoices.approve` and nothing else):

```
update invoices set workflow_status='freigegeben_vorgesetzter' ...  -> UPDATE 1
update invoices set paid_at=now() ...                               -> UPDATE 1
```

She reached the payable state and marked an invoice paid, holding neither `invoices.approve_final`
nor `invoices.pay`.

### What was built (`20260828230000_enforce_invoice_write_permissions.sql`)

1. **Row filter** — `invoices_update` now scopes to `has_company_access(company_id)`, mirroring the
   SELECT policy. The intake flow that migration 0046 deferred this for still works:
   `has_company_access(NULL)` is true, so an unassigned receipt passes USING, and the new row passes
   WITH CHECK if the caller can see the company they picked.
2. **Transition guard** — a `BEFORE UPDATE` trigger mapping each state change to the permission it
   needs. A row filter cannot express this: it is about which columns changed and to what, not which
   rows are visible.

| Change                                                                                | Requires                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `paid_at` null → set                                                                  | `invoices.pay`                                  |
| `assigned_to` changed                                                                 | `invoices.assign`                               |
| → `freigegeben_vorgesetzter`, `abgeschlossen`                                         | `invoices.approve_final`                        |
| → `in_pruefung`, `rueckfrage`, `freigegeben_assistenz`, `abgelehnt`, `nicht_relevant` | `invoices.approve`                              |
| → `bezahlt`                                                                           | allowed only when `paid_at` is set              |
| → `uebergeben_datev`                                                                  | allowed only when `datev_handed_over_at` is set |
| anything else (e.g. resetting to `eingegangen`)                                       | `invoices.override_workflow`                    |

`invoices.override_workflow` stands in for any of these — that is exactly what the "Status
korrigieren" action is.

**Two subtleties worth keeping in mind before editing this trigger.**

- **The service role is exempt on purpose.** The pipeline, the Edge Functions and the cron jobs write
  with the service-role key and carry no JWT; RLS does not apply to them either. The guard returns
  early when no caller email resolves, rather than blocking every background write. Those paths do
  their own authorization — `payment-initiate` checks `invoices.pay` and the two-person rule before
  it ever writes.
- **`bezahlt` and `uebergeben_datev` are derived states.** `trg_advance_workflow_on_payment` and
  `trg_advance_workflow_on_datev_handover` issue their own UPDATE in response to `paid_at` /
  `datev_handed_over_at`, which re-enters this guard under the same session — so both must be
  allowed. Allowing them _unconditionally_ would let anyone write `workflow_status='bezahlt'` with no
  payment behind it, hence the source-column condition.

### Verified live

| Case                                                       | Result                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Petra → `freigegeben_vorgesetzter`                         | refused, "requires the final-approval permission"     |
| Petra sets `paid_at`                                       | refused, "requires the payment permission"            |
| Petra changes `assigned_to`                                | refused, "requires the assign permission"             |
| Petra writes `workflow_status='bezahlt'` with no `paid_at` | refused, "derived from paid_at"                       |
| Petra → `rueckfrage` (she holds approve)                   | allowed                                               |
| Petra edits an ordinary field                              | allowed                                               |
| Alexis → `freigegeben_vorgesetzter` (holds final approval) | allowed                                               |
| Saskia sets `paid_at` (holds pay)                          | allowed, and the derived `bezahlt` followed correctly |
| Service role sets both at once                             | allowed — pipeline unaffected                         |

The manual "bezahlt" switch on the invoice detail is now disabled without `invoices.pay`, so the UI
refuses before the database has to.

### Still open

- **The super admin remains a role string in two places**, both deliberate: `guard_super_admin_row`
  and `guard_super_admin_permissions` force its rows true in the database. It is the break-glass
  account; a permission it could revoke from itself is not a break-glass account.
- **No UI for `role_permissions` yet.** Editing what a ROLE grants is a direct table write today.
  The per-person switches on Team & Rollen work; a role-template editor is the natural next screen,
  and is what would let an admin create the "intermediate level" A7 asks for without SQL.
- **`AppRole` is still a fixed four-value union** used for display (the badge in the user menu, the
  role dropdown). Nothing decides on it any more, but adding a fifth role still needs a migration
  plus that union widening.

---

## The approval chain names accounts (2026-09-01)

Migrations `20260901160000` … `20260901160500`. This closes §3 item 1, which has been the largest
open gap in this document since the roles model was built.

### What was wrong

`approvers` was a second people-table. You created somebody under Team & Rollen, then registered
them a second time on Freigabe-Regeln's "Genehmiger" tab before they could appear in a chain. The
two were joined by string: `approvers.name` is UNIQUE and was the target of three foreign keys
(`approval_rules.step_1_approver`, `step_2_approver`, `approvers.deputy_name`), so the NAME was the
identity. Renaming somebody under Team & Rollen did not follow.

It also stored a stale copy of a permission. `approvers.role` (`assistant | manager`) was written
from `invoices.approve_final` by `approverTierFor()` at the moment the row was created and never
refreshed — and `approvers_area_requires_manager` was a real CHECK constraint standing on that copy.

Three further defects fell out of the same design:

- **An account missing from `approvers` silently had no approval buttons.** `useActingAs()` matched
  the login name against that table and resolved to `null` otherwise, which removed the buttons, the
  nav badge and the attention panel. The screen said "you are not set up as an approver", which was
  a true sentence about a state nobody expected to be in.
- **`invoices.assigned_to` was a name with no foreign key.** An assignment ADDS an actor
  (`nextLegalActions`), so renaming somebody silently revoked every assignment they held.
- **The "Acting as" picker was offered to every Admin** (it was gated on `invoices.override_workflow`)
  and written into `invoice_history` as `handelnd_als`, an assertion about who acted that nothing
  server-side ever checked.

### The shape now

| Was                                         | Is                                            |
| ------------------------------------------- | --------------------------------------------- |
| `approvers` row per chain member            | any `app_users` row                           |
| `approvers.role` (`assistant`/`manager`)    | the `invoices.approve_final` permission       |
| `approvers.deputy_name` → `approvers(name)` | `app_users.deputy_user_id` → `app_users(id)`  |
| `approvers.escalation_days`                 | `app_users.escalation_days`                   |
| `approvers.area` / `covers_all_areas`       | `app_users.area` / `covers_all_areas`         |
| `approvers.payment_handler`                 | **gone** — see below                          |
| `approval_rules.step_1/2_approver` (text)   | `step_1/2_user_id` → `app_users(id)`          |
| `invoices.assigned_to` (text)               | `invoices.assigned_user_id` → `app_users(id)` |
| `resolve_area_approver(text)`               | `resolve_area_user(text)`                     |

Nothing is dropped. `approvers` keeps every row, every trash entry and its own FKs; the two
`step_N_approver` columns and `invoices.assigned_to` keep their values. All are commented
HISTORICAL. The FKs to `approvers(name)` were deliberately KEPT — the columns stop being written,
existing values still satisfy them, and keeping them leaves `purge_record()`'s stated reason for
refusing to purge an approver true.

**`payment_handler` did not come across.** It fed exactly one hint sentence on the invoice screen
("After approval, the supervisor transfers the money themselves"), it is a property of a company or
a rule rather than of a person, and the client asked for it to go. The sentence went with it. The
old values stay on the frozen `approvers` rows.

### The one constraint that could not come along

`approvers_area_requires_manager` said only a manager may own an area. On `app_users` the equivalent
question is "does this person hold `invoices.approve_final`", a cross-table permission lookup a
CHECK cannot express. It is now validation in Team & Rollen: the Area select is disabled, with a
reason, for anybody without that permission. `20260901160000` §6 reports any account already in the
state the constraint used to forbid, as a notice rather than a refusal.

`resolve_area_user()` deliberately does **not** filter on that permission. Both possible failures
are dead ends — filtering leaves step 2 empty so nobody can act, not filtering resolves somebody who
sees no button — but the second at least names a person the screen can explain.

### The super admin holds everything, and now an admin cannot take it away

`user_permissions` was guarded (`guard_super_admin_permissions`). `role_permissions` was **not**: its
write policy is plain `is_admin()`, so any admin could PostgREST-delete the super_admin role's
defaults and lock the owner account out of the screens that undo it. The super admin held everything
only because the seed happened to grant it — a data state, not a rule.

`20260901160300` makes `current_permissions()` short-circuit on the role name. The same branch is
restated in `src/lib/api/require-permission.ts`, which runs on the service-role client and never
calls that function, so it has no JWT for `auth.jwt()` to read.

This became load-bearing in this pass: "Acting as" is now super-admin-only, and break-glass an admin
can quietly disarm is not break-glass.

### Acting as: super admin only, and the choice wins

The picker is gated on `role === "super_admin"`. **Admins lose it.**

There was a trap in the migration. The old code matched the login name FIRST and only fell back to
the override — which worked purely because the super admin was deliberately kept OUT of the
approvers table. The directory is the employee list now and the super admin is in it, so a
name-first rule would have made the picker silently do nothing. The explicit choice therefore wins,
defaulting to yourself.

It grants nothing. Every write is still checked against the SIGNED-IN account by
`enforce_invoice_write_permissions()`, and the super admin holds the whole catalogue, so the picker
can never reach a step that account could not already take.

Its first option reads **"Super Admin"**, not "(nobody)". That option is how you enter
`superAdminModus` (every ladder step clickable as a manual correction); labelling it by the mechanism
rather than the situation left the reader unsure which of the two states they were in.

### Acting as previews the person, it does not lend them your rights

`useActingCapabilities()` (`queries.ts`) resolves the permissions of the person in the picker, not
of the signed-in account, and **every permission-gated control on the invoice screen asks it** —
book, approve, approve_final, pay, assign, override_workflow. One rule, no exceptions. Reading them
from `useAuth()` offered the super admin every button while the label said "Handelnd als Test User",
and the write it produced recorded `handelnd_als: Test User` for a step that person could never have
taken — exactly the false audit line the old free-for-all picker used to produce.

This was fixed twice. The first pass covered only the two approval capabilities, which left a super
admin previewing an account with no rights at all still able to edit fields, release payments and
correct statuses. The gate has to be one function every control shares, or the next control added
inherits the defect.

**It is a preview, not a sandbox.** The database still checks the SIGNED-IN account on every write,
so acting as somebody with fewer rights does not make the write safer. The direction that matters is
the other one, and it is covered: the UI no longer offers a button whose history entry would claim
somebody took a step they could not. The way back to your own authority is to pick "Super Admin",
which is one click and says so.

While the employee list is loading the answer is NO rather than a fallback to the signed-in
account's rights: a flash of buttons that should not be there is worse than a flash of none, because
it is clickable. Only the super admin can act as somebody else, and only an admin can read
`useEmployees()`, so the two gates line up.

`keineAktionenGrund` gained a `keinRecht` / `keinRechtPerson` branch. `nextLegalActions` returns an
empty list for a missing `invoices.approve` before it looks at the chain at all, so without it the
reader was told "no step is available" — true, and silent about the one thing that would fix it.

`chain_people()` gained `role_name` (migration `20260901160600`) so both pickers on the invoice
screen can print the role beside the name — as the approval-rule steps and the deputy select
already did — and can exclude the owner account, which the picker's own first entry represents.
That is one column past what `20260901160200` justified (`approvers` exposed only its own coarse
tier, not the real app role); the alternative was two data paths showing roles to admins and bare
names to everyone else. The trade is stated in that migration's header.

### Assignment: a real reference, and it notifies

`invoices.assigned_user_id` references `app_users(id)`. The picker stays on the Workflow tab, gated
on `invoices.assign`, and an assignment still ADDS an actor and never removes one — which is what
makes it the escape hatch when a rule names somebody who cannot act.

It now also **notifies**. `20260901160500` extends the existing `notify_event_from_history()`
producer with a `zuweisung` event addressed to the assignee, which the bell, `/benachrichtigungen`
and `notify-dispatch` already knew how to carry. The bell shows one row per assigned receipt,
linking to that receipt, under the group already named `zugewiesen`.

**That migration also fixes something that would have failed silently.** The producer resolved its
recipient by looking the name up in `approvers`. Freezing that table leaves existing rows in place,
so this keeps working for everybody already in it and fails for NOBODY on the day it ships — which
is exactly what made it dangerous: from then on, anyone created under Team & Rollen has no approvers
row and would never receive a query or rejection notification, with nothing in any log to say why.
The recipient now comes from `data.recipient_user_id`, written by the app, falling back to a name
match against `app_users` for rows written earlier.

### The trap in the write guard

`enforce_invoice_write_permissions()` uses an INVERTED check: anything changing outside a named set
of governed columns counts as receipt content and requires `invoices.book`. That is the right way
round — a column added later is protected by default — and it means `assigned_user_id` HAD to be
added to `v_ignore`, or assigning would silently have started demanding the booking permission on
top of `invoices.assign`. Verified against a scratch Postgres before the migrations were handed
over; see "Verified" below.

### Screens

- **Freigabe-Regeln** lost its Genehmiger tab and is one list. 1456 → 683 lines.
  `ensureApproversExist()` is gone: the step columns are real references, so anybody on Team &
  Rollen is a valid step the moment they exist. The three-way step 2 (Automatic by area / a fixed
  person / single-step chain) is unchanged. A new amber warning fires when an explicit step 2 does
  not hold `invoices.approve_final`.
- **Team & Rollen** gained `ApprovalSettingsSection` in the pencil drawer: Area of responsibility,
  Deputy, Escalate after. Saved on the spot like the permission checklist, not staged like role and
  company access.
- **Invoice detail** keeps "Acting as" for the super admin, loses the payment-handoff sentence, and
  resolves the responsible person, the deputy and the assignee by id.
- **Ping recipients** are now every active account. They used to be the approver rows that happened
  to have `app_user_id` set, so anybody never registered — or whose legacy row was never linked —
  could not be pinged at all.

### Verified

The six migrations were applied in order against a throwaway Postgres seeded to mirror this
database's shape, and the outcomes checked rather than assumed:

- backfill: person properties, the two-hop deputy resolution, both chain steps, and
  `invoices.assigned_user_id`, including a deliberately unmatched assignment name that correctly
  stayed frozen and produced a notice rather than a failure;
- `resolve_approval_rule` filled step 2 by area, with the exact area owner beating the all-areas
  fallback, and still returned a genuine NULL (asserted through `to_jsonb`, not `IS NOT NULL` —
  composite row-is-null semantics make the naive check pass even when 0089's bug is present);
- the producer on all four paths: assignment notifies, self-assignment does not, un-assignment does
  not, and a legacy name-only `rueckfrage` still resolves;
- the write guard: holding only `invoices.assign` allows assigning and refuses content edits;
  without it, assigning is refused — including a stray write to the frozen `assigned_to`; the
  no-JWT service-role path stays exempt.

One self-check of mine was wrong and was corrected rather than the code: 4b asserted that an unknown
area resolves to nothing, which `resolve_area_approver` never guaranteed either — an all-areas
account covers any area with no exact owner. It now asserts the invariant that matters, that an
unowned area never resolves to the owner of some _other_ area.

Front end: `tsc` clean, `eslint` clean, `vite build` succeeds.

### Still open after this

- `invoice_history` `zuweisung`/`rueckfrage` rows written before these migrations carry only a
  display name. Both readers handle that, and the legacy path goes quiet on its own as rows age out.
- The `approvers` table and the `Approver` type still exist, unread. Deleting them is a follow-up
  once nothing references the type.
- Escalation is still display only: a banner on the invoice detail, no queue and no notification.
  Deliberate, and confirmed with the client during this pass.
