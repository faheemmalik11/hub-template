# Area-based approval routing

## What was asked

Client requirement (verbatim, given directly by the user in this session — not a written
client thread): _"Approval routing. In a sister Hub approvals went up a management chain
(assistant → boss). In this client hub it's routed by area of responsibility instead, each department
head approves their own area (for example Hospitality, or this client real estate)."_

The client separately supplied the actual department heads
(`communication/threads/2026-08-04-department-heads-and-approvals/01-inbound-client.md`),
verbatim:

| Name            | Email                    | Area of responsibility |
| --------------- | ------------------------ | ---------------------- |
| Alexis Gonzalez | alexis.gonzalez@this client.de | Hospitality            |
| Saskia Christ   | saskia.christ@this client.de   | **All areas**          |
| Andreas Christ  | andreas.christ@this client.de  | **All areas**          |
| Lukas Oldach    | lukas.oldach@this client.de    | this client RE and projects   |

That thread's own "open questions" section — never answered by the client — is the actual gap
this feature closes:

1. How an "area of responsibility" maps onto a receipt at all — no field on `invoices`/
   `companies` carried one.
2. **How areas map onto the 5 companies.** The client was explicit: _"areas of responsibility
   are not companies."_
3. Whether "All areas" (Saskia, Andreas) requires **one** sign-off or **both**.
4. Whether amount thresholds apply.
5. How this relates to Petra/Vanessa's existing accounting pre-check duty.

The user explicitly asked this session to **decide** the area mapping itself, using the
documents already available, rather than go back to the client with more questions — see the
"Decisions made here" section below.

## Prior art this builds on (read before touching this feature again)

- **`supabase/migrations/0048_hub_approval_workflow.sql`** — ported a sister Hub's flat two-step
  named chain (`step_1_approver`/`step_2_approver` on a scoped `approval_rules` row, resolved by
  `resolve_approval_rule(invoice_id)`) as-is. Its own comment: _"this client's approvers are different
  people (four department heads) and their approval rules are still unspecified ... create them
  via the admin screen rather than inventing them."_ No approvers were ever seeded there, no
  fallback rule existed — every invoice resolved to a NULL chain until this feature.
- **`supabase/migrations/0078_this client_people.sql`** — already seeded these same 4 people (real
  emails) into `app_users`, with a free-text `area_of_responsibility` column, **but deliberately
  did not seed them into `approvers`** (used by `/freigabe-regeln`) — its own note #4: _"pointing
  an approval chain at people before the area question is settled would encode a guess."_ Its
  note #1 asked whether "area" = the `business_line` dimension (LTR/STR/DEV/SVC). **Moot now** —
  migration `0083` (this session, `docs/PROPERTY_COMPANY_ASSIGNMENT.md`) removed `business_line`
  entirely, so area is necessarily a new dimension regardless of that question's answer.
- **`app_users.area_of_responsibility` was removed** (migration
  `20260812130000_hub_drop_area_of_responsibility.sql`, 2026-08-12). It never actually drove
  company visibility as this doc previously claimed here — that claim was checked and found
  false: `has_company_access()`/`user_company_access` never referenced this column, and grepping
  `src/` turned up nothing reading it either. It was purely captured client free text, exactly as
  0078's own comment already said ("NOT yet used for routing"). This feature's
  **`approvers.area`/`covers_all_areas`** (canonical enum) remains the sole value that actually
  drives approval routing — unaffected by the removal.
- **`approvers` gained a real FK to `app_users`** the same day
  (`approvers.app_user_id`, migration `20260812131000_hub_approvers_app_user_link.sql`) — see
  `docs/ROLES_AND_ACCESS.md` §2.3/§3 item 1. Additive only: `name`/`role` are still what
  `approval_rules`/the resolution functions actually match against; this just gives the two
  tables a queryable link where none existed before, set by the create-from-employee flow in
  `/freigabe-regeln` and backfilled by exact name match for pre-existing rows.

## Decisions made here (judgment calls — not client-confirmed)

### 1. Company → area mapping

I read the tax advisor's cost-centre workbook in full
(`communication/threads/2026-08-04-companies-and-cost-centers/assets/kostenstellen-steuerberater-2025-10.xlsx`,
`Gesamtüberblick` + one sheet per company). It confirms cost centres are 1:1 with properties,
scoped by owning company — no area dimension there either. But its own per-property notes are
informative: almost every property is annotated `"this client Mieter"` / `"this client Anmietung"` — **this client
leases and operates units it does not own**, across buildings owned by the other four
companies. That reads as an operating/hospitality model (tenant-facing, serviced units),
distinct from the other companies' real-estate-ownership role — reinforced by their names:
"Baufi" (financing), "VV" (Vermögensverwaltung/asset management), "Immobilien" (real estate).

**Decision:**

| `companies.area` | Companies                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| `hospitality`    | this client GmbH (`STAY`), this client Gronau GmbH (`STGR`)                                 |
| `stay_re`        | My Baufi AG (`MYBA`), Impuls VV GmbH (`IMPV`), Infio Immobilien GmbH (`INFI`) |

**This is inferred, not stated by the client.** It's stored as a plain, editable column (see
`/gesellschaften/$id`, "Zuständigkeitsbereich" field) — correcting it later is a one-field edit
per company, not a schema change. **Recommend confirming with the client before this routes a
real invoice.**

### 2. "All areas" resolution

Either Saskia or Andreas alone is sufficient — consistent with how a specific-area head's single
sign-off already suffices elsewhere in this design. Not requiring both avoids inventing an
unstated dual-approval rule the client never asked for.

### 3. No amount thresholds

None were given. `approval_rules.min_amount` (already existed, defaults to 0) stays available
for a future per-rule exception, but nothing new here uses it — area-based routing applies
uniformly regardless of invoice amount.

### 4. Petra/Vanessa — seeded as plain approvers, not modeled further

Migration `0048`'s own fallback-rule seed was written and then commented out, verbatim: _"needs
real approver names, which this client has not confirmed yet."_ Those names now exist
(`communication/threads/2026-08-04-companies-and-cost-centers/01-inbound-client.md`, already
used by `0078` for `user_company_access`). Migration `0087` seeds Petra Kistner and Vanessa Zelt
into `approvers` (`role='assistant'`, no area) and completes that exact fallback-rule seed —
one company-wide rule per company, step 1 = whichever of them thread 1 assigned to that company,
step 2 = auto-resolve by area. This is **not** the same as modeling Petra's stated cross-company
duty ("mail handling, bank transfers, and preliminary invoice checks FOR ALL COMPANIES" — 0078
note #3, still open, still unaddressed). It only gives her a plain step-1 slot for the 3
companies she owns, same shape every other approver already has.

## Schema — `supabase/migrations/0087_area_based_approval.sql`

- **`companies.area`** (`'hospitality' | 'stay_re'`, nullable) — business area. NULL = not yet
  assigned; routing for that company's invoices then leaves `step_2_approver` at whatever the
  rule itself set (typically NULL), never guesses.
- **`approvers.area`** (same enum, nullable) + **`approvers.covers_all_areas`** (boolean) — the
  department-head side. Mutually exclusive (`approvers_area_shape` CHECK); both require
  `role='manager'` (`approvers_area_requires_manager`/`approvers_all_areas_requires_manager`); at
  most one active exact-match approver per area (`approvers_one_active_per_area` partial unique
  index).
- **`resolve_area_approver(p_area text) returns approvers`** — exact area match if an active one
  exists, else any active `covers_all_areas` approver, else no row. NULL input never guesses.
- **`approval_rules.skip_step_2`** (boolean, default false) — disambiguates "not configured, use
  area auto-resolve" from "deliberately single-step." Needed because `0048` already used a NULL
  `step_2_approver` to mean "single-step chain" — overloading that further would have silently
  removed the ability to configure a genuine single-step rule.
- **`resolve_approval_rule(invoice_id)` — signature unchanged**, `returns approval_rules`. If the
  winning rule left `step_2_approver` empty and did not set `skip_step_2`, the _resolved row's_
  `step_2_approver` now falls back to the area-based department head for the invoice's company.
  An explicit `step_2_approver` on the rule always wins over this fallback. This is deliberately
  additive at the SQL level: `nextLegalActions`/`approvalQueryTarget` (`src/lib/data/format.ts`)
  and `$nr.tsx`'s responsible-approver/payment-handoff logic all already read `step_2_approver`
  off the _resolved_ row, never off the raw table — so none of them needed a code change.
- Seed data: the 4 department heads, Petra/Vanessa, the 5 companies' `area`, and one fallback
  `approval_rules` row per company (see "Decision 4" above).

**Not done in this migration, on purpose:**

- **RLS** — ✅ closed by `supabase/migrations/0088_approval_rls_admin_only.sql` (2026-08-06):
  `approvers_insert`/`approvers_update`/`approval_rules_insert`/`approval_rules_update` are now
  gated behind `is_admin()`, same pattern `0059` already uses for `companies`/`app_users`. SELECT
  stays open (resolving an approval chain must work regardless of the acting user's own admin
  status). `/freigabe-regeln`'s nav entry is gated to `ADMIN_ROLES` in the same pass
  (`src/components/layout/app-shell.tsx`), matching how `/team`/`/papierkorb`/`/dateibenennung`
  are already gated.
- **Inviting Alexis Gonzalez and Lukas Oldach.** Per `0078`, they still have no Supabase-auth
  login and no `user_company_access` grants (deliberately — _"granting a guess would be wrong"_).
  This migration makes them a valid **routing target**; they cannot open the app or click approve
  until invited via `/team` and granted access to their companies (this client GmbH + this client Gronau for
  Alexis; My Baufi + Impuls VV + Infio for Lukas).
- Petra's cross-company duty as its own modeled concept (see Decision 4).

## Frontend

- **`/freigabe-regeln`, Genehmiger tab**: a combined "Zuständigkeitsbereich" select (Hospitality
  / this client RE and projects / All areas / — none —) on the approver create/edit dialog, disabled
  (with an explanatory hint) unless the selected employee's role maps to `manager`. Split into
  `area`/`covers_all_areas` only at save time — see `areaLabelKey()` in
  `src/routes/freigabe-regeln/index.tsx`.
- **`/freigabe-regeln`, Regeln tab**: the Step 2 picker is now three-way — a specific approver
  name (explicit override), "Automatisch nach Zuständigkeitsbereich" (the new default for a new
  rule; saves `step_2_approver=null, skip_step_2=false`), or "— einstufige Kette —" (deliberately
  single-step; saves `skip_step_2=true`).
- **`/gesellschaften/$id`**: a "Zuständigkeitsbereich" field, view + edit, using the existing
  `useUpdateGesellschaft` hook (plain additive field, no hook changes needed).
- **`/eingangsrechnungen/$nr`**: the responsible-approver line now shows the resolved area next
  to the name (e.g. "Alexis Gonzalez · Hospitality") when the resolved approver is area-routed.

## ⚠️ Superseded in part: the chain names accounts now (2026-09-01)

Migrations `20260901160000` … `20260901160500` moved the approval chain off the `approvers` table
and onto `app_users`. **Read `docs/ROLES_AND_ACCESS.md` § "The approval chain names accounts" before
acting on anything below this line.** What changed for THIS feature specifically:

- **`approvers.area` / `covers_all_areas` → `app_users.area` / `covers_all_areas`.** Same two
  values, same meaning, same partial unique index ("at most one active owner per exact area").
- **`resolve_area_approver(text)` was dropped and replaced by `resolve_area_user(text)`**, which
  returns `SETOF public.app_users`. The body is otherwise identical, `SETOF` included and for the
  same reason.
- **`resolve_approval_rule(uuid)` keeps its signature and return type** and now fills
  **`step_2_user_id`** instead of `step_2_approver`. The three-way step 2 on the Regeln tab
  (Automatic by area / a fixed person / single-step chain) and `skip_step_2` are unchanged.
- **`companies.area` is untouched**, and so is the company → area mapping below. Decision 1 and
  Decision 2 remain this project's inference and are still unconfirmed by the client.
- **The `approvers_area_requires_manager` CHECK constraints could not come across** — "may give the
  final approval" is a permission lookup, not a column. It is validation in Team & Rollen instead:
  the Area select is disabled for anybody without `invoices.approve_final`.
- **The Genehmiger tab is gone.** The area of responsibility is set on Team & Rollen, in the pencil
  drawer, next to the permission checklist.
- **`approvers.payment_handler` did not come across at all**, and the payment-handoff sentence on
  the invoice detail screen was removed with it.

The `approvers` table keeps all its rows and is no longer read by anything in `src/`.

## Approver lifecycle — deactivate vs. trash (migration `20260813110000`)

> **Historical from 2026-09-01.** This section describes the `approvers` table, which is frozen.
> An account has one switch (`is_active`) and no trash, so the two-state distinction below no
> longer applies to the live chain.

An approver can now be **deactivated** (`is_active = false`, "away right now") _or_ **trashed**
(the `deleted_at`/`deleted_by`/`delete_reason` trio, "this entry should not exist"). The two are
independent, and trashing deliberately leaves `is_active` alone — see
`docs/TRASH_AND_DELETE.md` §2.1 for why (`restore_record()` only clears the trash trio, so
clearing `is_active` here would strand a restored approver with no UI to switch them back on).
Consequences for anything that routes on approvers:

- **"Unavailable" means `!is_active || deleted_at != null`.** Checking `is_active` alone misses
  every trashed approver, and checking `deleted_at` alone misses every deactivated one.
  `useApprovers()` filters both; `useAllApprovers()` filters neither, and exists so a screen can
  tell "nobody is responsible" apart from "somebody is, but they are hidden".
- **Neither state edits `approval_rules`.** A rule keeps naming a hidden approver indefinitely,
  and `resolve_approval_rule()` keeps returning that name. `/eingangsrechnungen/$nr` therefore
  reports the two cases separately (`verantwortlicherInaktiv` / `verantwortlicherGeloescht` —
  the fix differs: reactivate vs. restore from the Papierkorb) and suppresses the overdue banner
  in both, since a hidden approver's escalation clock is moot. The rule dialog blocks saving a
  rule whose step 1/2 approver is in either state (`freigabeRegeln.feld.genehmigerInaktiv` /
  `genehmigerGeloescht`) — the FK is satisfied by a hidden row, so nothing else would catch it.
- **Re-adding a hidden approver revives their row rather than inserting a second one.**
  `approvers.name` is UNIQUE and the target of three FKs, so the name _is_ the identity;
  `useCreateApprover` updates the existing row, clears the trash trio and sets `is_active = true`.
  It merges rather than overwrites: `deputy_name`, `escalation_days`, `payment_handler` and the
  `area`/`covers_all_areas` pair fall back to the stored value **only when the key is absent from
  the payload** — never when it is explicitly `null`. That distinction matters because the two
  callers differ. `ensureApproversExist()` sends only `name`/`role`/`app_user_id`, so its revive
  must not wipe the stored `area` that `resolve_area_approver()` routes on; `ApproverDialog` sends
  every optional key, prefilled from that same row by `selectEmployee()` (which is also what makes
  the dialog show what will actually come back), so a field cleared there is a deliberate clear and
  writes through. The `area` pair is additionally only restored while the revived `role` is still
  `manager` — `role` is recomputed from the person's _current_ app role, and
  `approvers_area_requires_manager` would reject an area on someone since downgraded to assistant.
  A trashed row is brought back via the `restore_record()` RPC before the update, so the revive
  produces the same `change_history` `'restored'` entry as any other restore. A revive can still
  trip `approvers_one_active_per_area` if somebody else took the area meanwhile — surfaced as the
  normal area-conflict toast.
- **Approvers can be trashed and restored, never purged** — `approvers_deputy_name_fkey` is
  `ON DELETE SET NULL`, so a hard purge would silently blank somebody's deputy.

## Verification

- Migration self-checks (8 probes, all rolled back) cover: exact-area match, all-areas fallback,
  the mutual-exclusivity constraint, an explicit `step_2_approver` beating area auto-resolve, the
  NULL-input guard on `resolve_area_approver`, and both `skip_step_2` states on
  `resolve_approval_rule`.
- **First real `supabase db push` attempt (2026-08-06) caught a genuine bug in `0087`**, fixed
  same-day: `resolve_area_approver` was originally declared `returns public.approvers` (a single
  composite) instead of `returns setof public.approvers`. A non-`SETOF` function called in a
  `FROM` clause always produces exactly one row in Postgres — all-`NULL` when the underlying
  query matched nothing — instead of zero rows, so self-check 7h's
  `EXISTS(SELECT 1 FROM resolve_area_approver(null))` came back true even though nothing
  actually matched. The whole `0087` transaction rolled back on that error (nothing partial was
  left live). Fixed by declaring it `SETOF`. **✅ `0087` applied successfully on the second
  attempt** — all 8 self-checks passed.
  ```sql
  select name, role, area, covers_all_areas from approvers order by name;
  select code, name, area from companies order by code;
  select id, company_id, step_1_approver, step_2_approver, skip_step_2 from approval_rules where deleted_at is null;
  select (resolve_approval_rule(id)).step_2_approver from invoices limit 5;
  ```
- **That same push attempt then caught a second bug, in `0088`'s own self-check**: 3b assumed
  `approval_rules`'s read policy was still named `approval_rules_read` with `qual = 'true'` — it
  isn't. Migration `0059` (pre-existing, unrelated to this work) already rewrote it to
  `approval_rules_select`, scoped by `has_company_access(company_id)`, as part of that
  migration's general company-scoped-read sweep. `approvers` itself was never touched by `0059`
  and correctly kept `approvers_read`/`true`. Fixed the self-check to look for the right policy
  name and expectation for each table rather than assuming both were still `true`. **`0088` not
  yet re-applied** — this was a self-check bug, not a problem with the actual INSERT/UPDATE
  gating (self-check 3a, which verified that part, passed).
- `supabase/migrations/0088_approval_rls_admin_only.sql` (2026-08-06): gates `approvers`/
  `approval_rules` INSERT/UPDATE behind `is_admin()`. Self-checks confirm the policy expressions
  themselves reference `is_admin()` and that SELECT stayed untouched — a true "does a non-admin
  session get rejected" check can't run inside the migration itself (it runs as the service
  role, which bypasses RLS entirely; `0059` hit the same limitation for its own `is_admin()`
  policies). The migration file's trailing comment has a manual verification snippet to run as
  a real non-admin session.
- `bun run lint && bun run build`.
- Not click-tested in a browser. Worth checking once deployed: `/freigabe-regeln` shows Alexis/
  Lukas/Saskia/Andreas/Petra/Vanessa with the right areas; a new rule defaults its Step 2 to
  "Automatic"; `/gesellschaften/$id` for this client GmbH shows "Hospitality"; an invoice detail page
  for a this client GmbH invoice at `freigegeben_assistenz` shows Alexis Gonzalez as the responsible
  approver; the `/freigabe-regeln` nav entry only appears for admin/super_admin; a non-admin
  attempting to write to `approvers`/`approval_rules` directly gets rejected by RLS.

## Still open

- ~~`approvers` is a second people-table~~ **Closed 2026-09-01** — see the superseded note above.
- Client confirmation of the company→area mapping (Decision 1) and the "either one sufficient"
  reading of "All areas" (Decision 2) — both are this session's inference, not settled fact.
- Inviting Alexis and Lukas via `/team` + granting their `user_company_access`.
- Petra's cross-company pre-check duty as its own modeled concept (0078 note #3).
- Amount-threshold-based area routing, if the client ever wants tiered approval by value.
