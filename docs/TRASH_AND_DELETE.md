# Feature: Delete & Trash ("Delete & trash" — Briefing Screen 18)

Reference for the trash/soft-delete system: what the client's briefing asks for, what
is already implemented on this branch (`bank-reconcilation-phase-2`), and what is
still missing or risky against the spec.

> **Source:** `FUNKTIONSBRIEFING-EN.md.pdf`, Part 2 Screen 18, and Appendix A8
> ("Special cases & edge cases" → "In filing & data maintenance"). Related screens:
> Screen 3 (the "archive a wrongly ingested receipt" warning note — a **different**
> mechanism from trash, see §1.3), Screen 17 (Team — the admin-only nav grouping
> trash sits under).

> **TL;DR** — Soft-delete-with-history was already this codebase's convention for
> most entities before this branch; what this branch adds is the missing **other
> half**: a real **restore** path (didn't exist anywhere before), a final **purge**
> (hard-delete) path, a **unified trash view** across every soft-deletable table, and
> the one entity that was missing the columns entirely (`outgoing_invoices`), plus a
> UI action to actually reach it. The GoBD compliance question this doc originally
> flagged as open (§3.1 in earlier revisions) has been **resolved**: purge is blocked
> for `invoices` at the RPC level — see §2.1. Restore is now admin-only, matching
> purge (§2.1). What's left is narrower and lower-stakes — see §3.
>
> **Live bug caught and fixed while testing the new outgoing-invoice delete action:**
> `change_history` had RLS enabled with **zero policies**, so every direct client
> insert into it — including several mutations that predate this branch
> (`useConfirmOutgoingMatch`/`useRejectOutgoingMatch`) and several from earlier in
> this branch (`useUpdateEmployeeRole`/`useSetCompanyAccess`/`useSetEmployeeActive` in
> `/team`) — was silently 403ing. See §2.1 (migration 0051).

---

## 1. What the briefing asks for

### 1.1 Screen 18 — "Delete & trash"

- **What it's for:** something uploaded wrongly or created twice must be deletable —
  **but traceably, not without a trace.** Deleted items land in a trash with history
  instead of simply disappearing.
- **What you see:** the deleted records (receipts, suppliers, …) with the time and
  the person who deleted them.
- **What you can do:** delete records (e.g. a wrongly uploaded receipt or a duplicate
  supplier); afterwards upload a new document; look in the trash to see what was
  deleted, when, by whom.
- **The rules:**
  - **Deleting leaves a history** — what is out stays traceable, not disappeared
    without a trace.
  - For a wrongly ingested but _not relevant_ receipt, the **warning note from
    Screen 3** applies instead ("We are archiving it — take care of it otherwise,
    nothing further happens in the system.") — see §1.3, this is a distinct
    mechanism.
- **What to watch out for:** for receipts and suppliers, deletion-with-history is
  already provided for — **it should apply uniformly for all record types.**

### 1.2 Appendix A8 — "In filing & data maintenance"

| Case                         | Rule                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Correction of the assignment | Must **rename and move the Drive file along with it** — otherwise database and Drive drift apart.  |
| Name collision               | **Append a counter**, do not overwrite.                                                            |
| Umlauts in codes (KLMÜ4)     | Transliteration (→ KLMUE4) for URLs and DATEV import.                                              |
| **Receipt deleted**          | **Clean up in Drive as well. GoBD: do not hard-delete receipts — only deactivate + keep history.** |

### 1.3 Screen 3's _separate_ "archive" mechanism (not trash)

Screen 3 defines a different action for a receipt that was ingested by mistake but
isn't itself wrong data: **"Archive a wrongly ingested receipt: with a warning note
to the responsible person."** This is **not** a delete — the row stays, keeps its
full history, and is flagged so a human deals with it outside the system. It is
implemented today as `invoices.archived_at` / `archived_by` / `archive_note`
(`useArchiveBeleg` in `queries.ts`) and is **deliberately distinct** from
`deleted_at`/the trash system — an archived invoice does **not** show up in
`v_trash`. Don't conflate the two when reading the briefing or the code.

As of this branch, the incoming-invoice detail screen
(`src/routes/eingangsrechnungen/$nr.tsx`) action bar shows **only "Archivieren,"** not
a separate "Löschen" (soft-delete) button — an explicit product decision to avoid
offering two overlapping destructive-ish actions on the same screen for the one
record type where purge is disallowed anyway. This does **not** remove soft-delete
from invoices as a _capability_: `useSoftDeleteBeleg` is still used internally by the
"Verwerfen" (discard "not a document") action for items still `zu_pruefen`, and any
invoice can still be soft-deleted directly (or reached via `/papierkorb` if it already
has a `deleted_at`) — there is just no longer a general-purpose delete button on the
detail screen for a _reviewed_ invoice. Restore is unaffected: a soft-deleted invoice
is still fully restorable from `/papierkorb`.

### 1.4 Operation, law & limits (Part 3)

> "No expanding the receipt scope" and the GoBD line above both sit in the
> briefing's explicit **"what is NOT built"** guardrail section — i.e. these aren't
> throwaway remarks, they're limits the client called out on purpose.

---

## 2. What is implemented

### 2.1 Database

**Pre-existing convention** (before this branch): most entities already had
`deleted_at` / `deleted_by` / `delete_reason` columns and a soft-delete mutation
capturing a reason at delete time — e.g. `useSoftDeleteBeleg`, `useSoftDeleteLieferant`,
`useSoftDeleteCustomer`, `useSoftDeleteAssignmentRule`, `useSoftDeleteBwaCategory`,
`useSoftDeleteManualBooking`, `useSoftDeleteApprovalRule` (all in
`src/lib/data/queries.ts`). This branch didn't invent soft-delete; it closed the gaps
around it:

- **`supabase/migrations/0046_roles_access_trash.sql`**
  - Adds `deleted_at` / `deleted_by` / `delete_reason` to **`outgoing_invoices`** —
    the one user-facing entity that was missing the trio entirely.
  - `restore_record(p_table text, p_id uuid)` — a generic RPC (`SECURITY DEFINER`)
    against a fixed allow-list, originally 13 tables (`invoices`, `suppliers`,
    `customers`, `outgoing_invoices`, `manual_bookings`, `approval_rules`,
    `assignment_rules`, `ingest_exclusions`, `opos_whitelist_rules`, `bwa_categories`,
    `properties`, `companies`, `business_line`) — **now 13, but not the same 13:
    `business_line` was dropped by migration `0083` (leaving 12) and `approvers` was
    added by `20260813110000`**, see the notes near the end of this file. Clears the
    three trash columns and writes a
    `change_history` row (`type = 'restored'`). Uses `GET DIAGNOSTICS ROW_COUNT`
    rather than `FOUND` — the migration's comment notes `FOUND` was empirically
    unreliable after a dynamic `EXECUTE ... USING UPDATE` on this project.
  - `purge_record(p_table text, p_id uuid)` — same allow-list, **admin-only**
    (`is_admin()`), only ever operates on an already-soft-deleted row. Writes a
    **JSON snapshot** of the row to `change_history` (`type = 'purged'`) _before_
    deleting it, so the audit trail survives the row itself.
  - Both RPCs: `REVOKE ... FROM PUBLIC`, `GRANT ... TO authenticated` only.

- **`supabase/migrations/0047_trash_view.sql`**
  - `public.v_trash` — a plain view unioning all trash-eligible tables (originally
    13, then 12 — `business_line` dropped by migration `0083` — and 13 again since
    `approvers` joined in `20260813110000`) into one normalized
    shape: `(table_name, id, label, deleted_at, deleted_by, delete_reason)`,
    filtered to `deleted_at is not null`. `label` is a per-table best-effort human
    string (`name`, `invoice_number`, `code`, `voucher_number`, …, falling back to
    `id`). **Correction to this doc's original claim** ("not `SECURITY DEFINER`, so
    it inherits each underlying table's own RLS"): being non-`SECURITY DEFINER`
    only describes _functions_ — the equivalent concept for a _view_ is the
    `security_invoker` option, which this view did **not** have set until migration
    0053 (see below). Until then, it silently ran as its owner (`postgres`, a
    superuser) for RLS purposes, bypassing company-scoping on its `invoices`/
    `outgoing_invoices`/`manual_bookings`/`approval_rules`/`assignment_rules`
    branches entirely — the same root cause documented in full in
    `docs/ROLES_AND_ACCESS.md` §2.1a (found via a real user report on a _different_
    view, `v_invoices_review`). For `v_trash` specifically this was low-impact in
    practice: `/papierkorb` is admin-only in the nav, and every real admin/
    super_admin currently has zero `user_company_access` grants recorded (the
    "unrestricted" default), so no admin was actually seeing anything narrower they
    shouldn't have — but the view was structurally wrong regardless, and would have
    mattered the moment a company-scoped role ever got trash access. Fixed
    alongside the other views in migration 0053.

- **`supabase/migrations/0049_trash_gobd_purge_and_admin_restore.sql`** and
  **`0050_trash_rpc_grant_hardening.sql`** — close three gaps this doc previously
  flagged as open, per an explicit decision from the app's owner (not a unilateral
  call — both were compliance/permission questions):
  - **GoBD (was §3.1):** `purge_record()` now rejects `p_table = 'invoices'` outright,
    with a specific error message ("GoBD requires receipts to be deactivated and
    kept, never hard-deleted. Restore it or leave it in the trash."), raised _before_
    the generic allow-list check since invoices genuinely is restore-eligible — only
    purge is disallowed for it. The old `purge_invoice()` special-case call from
    `purge_record()` is gone (nothing else calls `purge_invoice()`, confirmed by
    grep); invoices can now only ever be soft-deleted and restored, never purged.
  - **Restore permission (was §3.5):** `restore_record()` now requires `is_admin()`,
    matching `purge_record()` and matching what `/papierkorb`'s admin-only nav
    placement already implied. Verified live: a simulated `assistant` session
    (`anja@gmail.com`) gets `insufficient_privilege` calling `restore_record`.
  - **Centralized allow-list (partial, was §3.3):** `trash_eligible_tables()` and
    `trash_purge_eligible_tables()` (the eligible list minus an explicit exclusion
    set — `invoices` here, joined by `approvers` in `20260813110000`) are now the
    single source of truth `restore_record()`/`purge_record()` both read, instead of
    each holding its own copy of the array literal. `v_trash`'s `UNION ALL`
    (migration 0047) and the frontend's `TABLE_FILTERS` still can't read this
    dynamically (different columns per table; a static UI constant has no natural
    round trip to a SQL array) — see §3.2 below for what's left.
  - **0050** additionally fixes two things `get_advisors` (security) surfaced after
    0049 landed: `trash_eligible_tables()`/`trash_purge_eligible_tables()` had a
    mutable `search_path` (fixed with `set search_path = public`), and — more
    notably — **`restore_record`/`purge_record` were still callable by the `anon`
    (unauthenticated) role** despite their own `REVOKE ... FROM PUBLIC`. Root cause:
    Supabase grants `EXECUTE` directly to `anon`/`authenticated` at function-creation
    time, which a `PUBLIC`-only revoke never touches — a real gotcha, not specific to
    this migration (the same pattern reproduces for prior functions in the project
    too, e.g. `is_admin`, `has_company_access`; fixing those is out of scope here).
    Both functions' own `is_admin()` check already denied an unauthenticated caller
    (`auth.jwt()` is null for `anon`), so this was never an _active_ hole, but 0050
    revokes `EXECUTE ... FROM anon` explicitly rather than relying on the internal
    check alone. Verified live via `has_function_privilege()`: `anon` → `false`,
    `authenticated` → `true`, for all four functions.
  - Verified live end-to-end via simulated JWTs (`set local request.jwt.claims`):
    admin (`buchhaltung@netz.immo`) soft-deleting and then trying to purge a real
    invoice gets rejected with `insufficient_privilege`, then successfully restores
    it (transaction rolled back afterward, no live data touched); a non-admin
    (`anja@gmail.com`) gets rejected calling `restore_record` at all.

- **`supabase/migrations/0051_change_history_rls.sql`** — `change_history` had RLS
  **enabled with zero policies**, so every direct client insert into it (via
  `insertChangeHistory()` in `queries.ts`) unconditionally 403'd — not something
  specific to this branch's new outgoing-invoice delete, but discovered _because_ of
  it (a real user hit `POST /change_history` → `42501` trying to delete an outgoing
  invoice). Since the row mutation itself (e.g. `app_users.role_id`) runs first via
  its own correctly-configured RLS policy and only the trailing audit-log write
  failed, this surfaced as a whole-mutation error even though the real change had
  already committed — affecting `useConfirmOutgoingMatch`/`useRejectOutgoingMatch`
  (predate this branch) and `useUpdateEmployeeRole`/`useSetCompanyAccess`/
  `useSetEmployeeActive` (this branch's `/team` screen) too, not just the delete
  button that surfaced it. `restore_record()`/`purge_record()` never hit this since
  they write to `change_history` from inside a `SECURITY DEFINER` function, which
  bypasses RLS. Fixed with `auth_read`/`auth_write_insert` policies (`true`/`true`
  for `authenticated`), mirroring `invoice_history`'s existing, working policies
  exactly. Verified live: a simulated authenticated insert that previously 403'd now
  succeeds (transaction rolled back, no test row left behind).

- **`supabase/migrations/0052_outgoing_invoices_update_policy.sql`** — a second,
  compounding gap on the _exact same_ user report: `outgoing_invoices` had **no
  UPDATE policy at all**, only `outgoing_invoices_select`. Every sibling
  company-scoped table (`invoices`, `manual_bookings`, `customers`,
  `approval_rules`) already has `for update to authenticated using (true) with
check (true)`, per migration 0046's disclosed "write-side RLS deliberately left
  open for this pass" note — `outgoing_invoices` simply never got it, because
  nothing wrote to it directly from the client until `useSoftDeleteOutgoingInvoice`
  (this branch). An RLS-filtered `UPDATE` with no matching policy affects **0 rows
  and throws no error** in Supabase's client, so the delete showed a success toast
  while genuinely changing nothing — confirmed live by checking the user's actual 3
  outgoing invoices, none of which had `deleted_at` set despite the "deleted"
  toast. Fixed by adding the identical policy shape used on every sibling table.
  After the fix, the user's real retried delete succeeded end-to-end through the
  live app (confirmed independently during the test pass below — a real
  `outgoing_invoices` row with a real `deleted_by` showed up in `v_trash`,
  restorable from `/papierkorb`).

- **`supabase/migrations/20260813110000_approvers_soft_delete.sql`** — `approvers`
  gains the `deleted_at`/`deleted_by`/`delete_reason` trio, a partial index on
  `deleted_at is not null`, an `approvers` branch in `v_trash` (restated in full,
  `security_invoker` preserved) and a place in `trash_eligible_tables()`. Until then
  an approver could only be **deactivated**, never removed, so a mistaken entry stayed
  in the list forever — deactivation ("away right now") and deletion ("this should not
  exist") are different intents. **Trash-eligible but deliberately not purge-eligible:**
  `approvers.name` is the target of three FKs (`approval_rules_step_1/2_approver_fkey`,
  `NO ACTION`, and `approvers_deputy_name_fkey`, `ON DELETE SET NULL` — so purging
  somebody used as a deputy would _succeed_ and silently blank that deputy), so
  `trash_purge_eligible_tables()` became an explicit exclusion list (`invoices`,
  `approvers`) rather than "everything except `invoices`". The migration also restores
  the `set search_path` that `0083` dropped from `trash_eligible_tables()`.
  - **Deletion does not touch `is_active`**, on purpose: `restore_record()` only clears
    the trash trio, so a restored approver would otherwise come back deactivated —
    invisible in the Genehmiger tab (which reads the active-only `useApprovers`) and no
    longer in the trash either, with no UI anywhere to switch them back on. Every read
    path filters `deleted_at`, so nothing leaks. Consumers must therefore treat
    "unavailable" as `!is_active || deleted_at != null`, not `!is_active` alone —
    `eingangsrechnungen/$nr.tsx` reports the two cases separately (the fix differs:
    restore vs. flip the switch), and `freigabe-regeln`'s rule dialog blocks saving a
    rule whose step approver is in either state.
  - **A second way out of the trash exists, and it still goes through `restore_record()`.**
    Re-adding a trashed approver by name revives that row rather than inserting a
    second one (`approvers.name` is UNIQUE and the target of three FKs, so the name is
    the identity — see `docs/APPROVAL_ROUTING.md`). `useCreateApprover` calls the RPC
    first when `deleted_at` is set, precisely so this path writes the same
    `change_history` `'restored'` row as `/papierkorb` does, instead of quietly nulling
    the trio itself.

- **`supabase/migrations/20260813130000_purge_record_approvers_message.sql`** — with
  `approvers` excluded from `trash_purge_eligible_tables()`, `purge_record()` fell into
  its generic branch and raised "table approvers is not trash-eligible", which is
  factually wrong: `approvers` _is_ trash-eligible, only the purge is disallowed. Adds a
  dedicated branch with an accurate message, exactly as `0049`/`0062` did for
  `invoices`. Reachable only by a direct RPC caller — the Papierkorb UI hides the button
  for both tables (`NICHT_PURGEBAR`).

### 2.1a End-to-end verification pass (this branch, live on `txxqvvpvrylnqbpscmpv`)

Following both fixes above, a full DB-level regression pass was run against the live
dev project (not a local/staging copy) — every check exercised the exact enforcement
path a real request goes through (`set local role authenticated; set local
request.jwt.claims = '...'`, matching what PostgREST itself does per request), not
just application-layer assumptions:

- **`restore_record`/`purge_record` round-tripped successfully on all 13
  trash-eligible tables** — 12 via disposable `ZZTEST`-prefixed fixture rows created
  and fully cleaned up (soft-delete → visible in `v_trash` → `restore_record` →
  `change_history` "restored" logged → soft-delete again → `purge_record` → row
  gone → `change_history` "purged" logged with a JSON snapshot), plus a 13th check
  against one real, already-deleted `invoices` row (restored, confirmed purge is
  still rejected for it even when not-currently-deleted, then put back to its exact
  original `deleted_at`/`deleted_by`/`delete_reason` — no lasting change).
- **Edge cases, all correctly rejected**: invalid table name, `NULL` args, a
  not-currently-deleted row, `purge_record('invoices', ...)` (rejected _before_ the
  existence check, so it fails the same way whether the id is real or made up),
  and both RPCs called by a non-admin (`insufficient_privilege`).
- **`business_line` finding (not a bug, documented for the record):** its round
  trip failed at the "soft-delete, then check `v_trash`" step — because
  `business_line` has **only a `SELECT` policy**, no `UPDATE` at all, matching its
  own code comment ("read-only master data," `queries.ts`) and confirmed there is no
  create/update/delete mutation or UI for it anywhere in the app. `restore_record`/
  `purge_record`/`v_trash` all work correctly on it _if_ a row is ever soft-deleted
  by privileged means, but there is currently no real path — user or RLS — for that
  to happen. It is technically trash-eligible machinery with nothing that can ever
  reach it; harmless, but worth knowing if `business_line` ever gets a real edit UI.
  **Update (migration `0083`): `business_line` was dropped entirely** (replaced by
  direct property↔company assignment, see `docs/PROPERTY_COMPANY_ASSIGNMENT.md`) —
  this finding is now moot, kept here only as the historical record. The trash
  allow-list (`trash_eligible_tables()`) no longer lists it; `property_companies`,
  its replacement, follows `property_assignment`'s old precedent instead — admin-
  writable with its own soft-delete UI/hooks, not part of the generic trash system.
- **`app_users`/`user_company_access`/`companies` write policies hold**: a
  simulated `assistant` (Anja) session cannot insert a company (`new row violates
row-level security policy`), cannot deactivate another employee (RLS silently
  filters the `UPDATE` to 0 rows — the _same_ silent-failure class as the two bugs
  above, but here it's the intended behavior, not a bug), and cannot insert her own
  `user_company_access` grant.
- **Company-access narrowing verified with a real temporary grant**: granting Anja
  `IMOS` only (`can_view=true`) and explicitly denying `NOGR` (`can_view=false`)
  correctly narrowed her visible company list from 7 to 1, `has_company_access`
  matched exactly, and `has_company_access(null)` ("watch-all," an unassigned
  receipt) stayed `true` even while restricted. A **soft-deleted** grant (own
  `deleted_at` set) correctly does **not** count, leaving her unrestricted. Grant
  removed immediately after; `user_company_access` confirmed back to 0 rows.
- **Deactivated-user edge case** verified against Anja's real account (toggled
  `is_active=false`, tested, immediately reactivated — no fabricated `app_users` row
  was possible since `auth_user_id` has a real FK to `auth.users`): `is_admin()`,
  `has_company_access(null)`, and `has_company_access(<company>)` all correctly
  return `false`, and she sees 0 companies — the "deactivated, not deleted" rule
  (Appendix A7) denies even the watch-all/unrestricted fallback.
- **`change_history`**: `anon` (unauthenticated) confirmed unable to insert (RLS
  violation) and sees 0 rows on `SELECT` (no policy grants `anon` read access,
  deliberately — only `authenticated`).
- Final state diffed against the pre-test baseline: `companies` (7),
  `user_company_access` (0), `app_users` (4) all unchanged; every table's `v_trash`
  count matched exactly except a legitimate `+1` on `outgoing_invoices` — the user's
  own real, successful delete (see above), not test data.

### 2.2 Front end

| Concern       | File                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Trash screen  | `src/routes/papierkorb/index.tsx`                                                                            |
| Data hooks    | `src/lib/data/queries.ts` (`useTrash`, `useRestoreRecord`, `usePurgeRecord`, `useSoftDeleteOutgoingInvoice`) |
| Domain type   | `src/lib/data/types.ts` (`TrashRecord`)                                                                      |
| Nav placement | `src/components/layout/app-shell.tsx` (admin-only "Verwaltung" group, alongside Team)                        |

- `/papierkorb`: admin-only (UX-gated via `isAdmin` + backed by RLS on every
  underlying table — same "UX guard, RLS is the real boundary" pattern as `/team`).
  Lists `v_trash`, filterable by table via a `Select` (`TABLE_FILTERS` — a
  **hand-maintained duplicate** of the RPCs' allow-list, see §3.2), sorted by
  `deleted_at desc`. Columns: type, label, deleted-at, deleted-by, reason.
- **Restore**: icon button, no confirmation dialog (restoring isn't destructive) →
  `restore_record` RPC → success/error toast → broad query invalidation
  (`invalidateTrashState` in `queries.ts` invalidates `trash` plus every list screen
  a restore could plausibly affect: `belege`, `lieferanten`, `kunden`,
  `outgoing_invoices`/`outgoing_invoice`, `gesellschaften` — deliberately broad
  rather than risking a silently stale list elsewhere). The invalidation keys for
  outgoing invoices were fixed on this pass: they previously pointed at
  `"ausgangsrechnungen-liste"`, which was never a real React Query key —
  `useOutgoingInvoices`/`useOutgoingInvoice` actually key on
  `"outgoing_invoices"`/`"outgoing_invoice"`, so a restore/purge touching an
  outgoing invoice was silently not refreshing its list before this fix.
- **Purge ("endgültig löschen")**: icon button behind an `AlertDialog` confirmation
  (per this repo's standing rule that every destructive action needs one) →
  `purge_record` RPC → same invalidation. **For `invoices` rows specifically**, the
  purge button is replaced with a locked/disabled indicator (a `Lock` icon with a
  tooltip explaining the GoBD restriction) rather than a button that can only ever
  fail server-side — restore is still offered normally for these rows.
- **`useSoftDeleteOutgoingInvoice(invoiceId)`** (new): the missing delete action for
  outgoing invoices (§3.4 in earlier revisions, now closed). Soft-deletes via
  `deleted_at`/`deleted_by`/`delete_reason` and logs to the generic `change_history`
  table (`insertChangeHistory`, since `outgoing_invoices` deliberately has no
  dedicated history table — see the comment above `insertChangeHistory` in
  `queries.ts`). Wired into `src/routes/ausgangsrechnungen/index.tsx`'s list row as a
  `Trash2` icon button (LexOffice was removed entirely — migration `0086` — so this
  now sits next to the file-view action instead of a LexOffice link), behind an
  `AlertDialog` with an optional reason `Input`, mirroring the
  `useSoftDeleteLieferant` pattern in `lieferanten/$id.tsx`. `useOutgoingInvoices`/
  `useOutgoingInvoice` now filter `deleted_at is null`, so a deleted outgoing invoice
  correctly drops out of every screen that reads it (the list itself, `kunden/$id`,
  `kunden/index`, `offene-posten`, `auswertungen`) and only reappears via
  `/papierkorb`.

---

## 3. What's still missing / risks

### 3.1 No Drive-side cleanup on delete/purge

A8 also says a deleted receipt must be **"cleaned up in Drive as well."** Neither
`restore_record`/`purge_record` nor the Hub in general touch Google Drive — the
Drive-side file lives in the external ingestion pipeline (out of this repo, per
`docs/PIPELINE-OVERVIEW.md`), so this is a **cross-system gap the Hub alone can't
close**: it needs either a pipeline-side listener on `change_history`
(`type = 'purged'`) or a documented manual step. Not tracked anywhere today. Lower
urgency now that invoices can never be purged (§2.1) — the Drive file for a
soft-deleted-but-not-purged invoice is arguably fine to leave alone until/unless a
purge path for receipts is ever reconsidered.

### 3.2 The allow-list is still hand-duplicated in two places (down from four)

`restore_record()`/`purge_record()` now share one source of truth
(`trash_eligible_tables()`/`trash_purge_eligible_tables()`, migration 0049), but
`v_trash`'s `UNION ALL` (migration 0047) and `TABLE_FILTERS` in
`src/routes/papierkorb/index.tsx` still each hold their own copy of the 13-table
list, for structural reasons that don't have a cheap fix: `v_trash` needs a distinct
`select` per table (different label columns), and a frontend constant has no natural
way to read a Postgres array at build/type-check time. Adding a 14th trash-eligible
table still means remembering both spots by hand; a mismatch still fails loudly for
the RPCs but silently for the UI filter. Not urgent — revisit only if this list
actually needs to grow.

### 3.3 No bulk restore/purge

The briefing doesn't explicitly ask for it, and the list is simple/flat (no
per-row selection UI), so this is a minor note rather than a gap — worth revisiting
only if the trash list grows large in practice.

---

## 4. Suggested order for closing the remaining gaps

1. Track the Drive-cleanup gap (§3.1) as a cross-repo follow-up with whoever owns
   the pipeline side, rather than trying to solve it from the Hub alone — lower
   priority now that it only affects soft-deleted (never purged) invoices.
2. Centralize the remaining two spots of the allow-list (§3.2) opportunistically,
   next time a table needs to be added to it — not urgent on its own.
3. Bulk restore/purge (§3.3) — only if the list grows large enough to need it.
