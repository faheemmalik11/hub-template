# OPOS-Whitelist (Open-Items Whitelist) — Issues

Screen: `http://localhost:7070/opos-whitelist`, the Zahlungen nav group's rule list for outgoing
bank movements that will never have a receipt (salaries, tax prepayments, private withdrawals,
rebookings, loan instalments), with a create dialog, an active toggle and a delete confirm.
Found via code review (`src/routes/opos-whitelist/index.tsx`, `src/lib/data/opos.ts`,
`useOposWhitelistRules` / `useCreateOposWhitelistRule` / `useUpdateOposWhitelistRule` /
`useDeleteOposWhitelistRule` / `useOposRuleHitCounts` / `useSetNoReceipt` in
`src/lib/data/queries.ts`, `src/components/bank/no-receipt-action.tsx`, migrations
`0029_pipeline_opos_whitelist.sql`, `0060_hub_trash_view.sql`, `0062_hub_trash_gobd_purge_and_admin_restore.sql`)
plus a live pass against the real dev database through the running app. **Read-only**: no rule was
created, toggled or deleted, since either would immediately change which transactions are hidden
from Offene Posten. Live state: 16 rules, all scope "Verwendungszweck", 3 of them with hits
(Darlehen 19, Tilgung 12, Umbuchung 6) and 13 with none; 41 transactions currently carry
`matching_status = 'ignoriert'`.

**What was checked and found sound**: soft-deleted rules do reach the trash. `opos_whitelist_rules`
is in `trash_eligible_tables()` and in `v_trash`'s UNION, so a deleted rule is listed under
`/papierkorb` by its `term` and can be restored by an admin.

Direct SQL was NOT available in this pass, so RLS statements below are read from the migration
files rather than from `pg_policies`.

Each item is tagged with which of these it falls under: **Current bug** (broken right now), **Future
bug** (works today only under a narrow/lucky assumption that a plausible near-future condition will
break), **Usability** (can someone get their task done efficiently), **UI** (the visual layer),
**UX** (the flow and feel of the interaction).

1. **The Treffer column cannot be read the way it invites you to read it: an overlapping rule always shows 0.** `match_opos_whitelist()` ends in `order by r.created_at, r.term limit 1`, so a transaction is credited to exactly ONE rule, the oldest that matches, and `whitelist_rule_id` records only that one. The hit count is a count of that column. Live, "Darlehen" has 19 hits and "Annuitaet"/"Annuität" have 0, but a loan posting reading "Darlehen Annuität" is hidden by both and counted only for the first. So "0 Treffer" means "no transaction picked this rule first", not "this rule does nothing", and the obvious housekeeping action the column suggests (delete the rules that catch nothing) can silently un-hide transactions the moment the older rule is the one that goes.
   _Categories: Current bug, Usability_

2. **The screen tells the user to run a Python script that does not exist in this repository.** The German hint under the heading ends: "Eine Regel zu deaktivieren gibt bereits ausgeblendete Buchungen NICHT automatisch frei (dafür: pipeline/apply*opos_whitelist.py --revert)." There is no `pipeline/` directory here (the ingestion pipeline is `pipeline_new/`, per CLAUDE.md), and no file named `apply_opos_whitelist.py` anywhere in the tree. Beyond the wrong path, the instruction points a bookkeeping user at a CLI they have no way to run: the one documented way to undo a rule's effect is outside the product. The per-transaction "Wieder aufnehmen" action on `/banktransaktionen` can release rows one at a time, and the hint does not mention it.
   \_Categories: Current bug, Usability*

3. **Deleting a rule leaves everything it hid hidden, and unattributable.** `useDeleteOposWhitelistRule` stamps `deleted_at`/`deleted_by` and sets `is_active = false`; `bank_transactions.whitelist_rule_id` still points at the deleted row, and `matching_status` stays `ignoriert`. From then on the transaction detail renders "durch Regel" (`noReceipt.detail.durchRegel`) with no way to say which one, the rule is gone from this screen so its hit count is gone with it, and the movements stay out of Offene Posten with no rule visible anywhere to explain why. The on-screen hint documents this consequence for **deactivation** only; deletion has the same effect and is not mentioned.
   _Categories: Current bug, Usability_

4. **Half the umlaut terms need two rules, and nothing says so.** `opos_norm()` lowercases and collapses whitespace, deliberately keeping punctuation, but it does not fold umlauts or ß. So "Annuität" and "Annuitaet" are different terms, and the seeded list carries three hand-maintained spelling pairs to compensate: Annuitaet/Annuität, Übertrag/Uebertrag, Kontofuehrungsgebuehr/Kontoführungsgebühr. The create dialog's hint says nothing about it, so a new rule for a term with an umlaut catches only the spelling the person happened to type, and German bank booking texts use both, which is why the pairs exist.
   _Categories: Current bug, Usability_

5. **A rule cannot be corrected, only deleted and rebuilt.** `useUpdateOposWhitelistRule` accepts `term`, `scope`, `category` and `note`, and the only caller wires `is_active`. There is no edit dialog and no inline edit, so fixing a typo in a term, moving a rule from Verwendungszweck to Gegenkonto, or reclassifying its category all mean deleting the rule and creating a new one, which by #1 and #3 changes which transactions are attributed to what and leaves the old ones pointing at a dead rule.
   _Categories: Usability_

6. **Any non-empty string is accepted as a term, and the match is a plain substring.** The only validation is `if (!term.trim())`. `match_opos_whitelist()` uses `position(opos_norm(term) in opos_norm(field)) > 0`, so a two-character term matches nearly every booking text; with `scope = 'any'` it matches against reference, counterparty, IBAN and booking text concatenated. The trigger applies rules on every write to a transaction, so the blast radius is not limited to new movements. There is no preview of what a rule would catch before saving it, no confirmation step, and no cap, on a screen whose entire purpose is to remove things from the reviewer's field of view. `/zuordnungsregeln` already solves the equivalent problem with candidate previews.
   _Categories: Current bug, UX_

7. **Read from the migrations, not verified live: rules are global and any authenticated user may write them.** `opos_whitelist_rules` has no `company_id`, and `0029_pipeline_opos_whitelist.sql` creates `opos_whitelist_auth_insert … with check (true)` and `opos_whitelist_auth_update … using (true) with check (true)` for `authenticated`. So a user restricted to one company can create a rule that hides outgoing movements belonging to every company, and can deactivate or rewrite rules somebody else created. None of the mutations writes a `change_history` row either; the only trace is `created_by` / `deleted_by` on the row itself, so a rule's term or category can be changed with no record of who changed it or what it was. **Needs a `pg_policies` check before being acted on.**
   _Categories: Current bug_

8. **Six of the notes on screen are English developer text.** Live, the Notiz column reads "ATM / counter cash withdrawal", "Seen in dev: ATM withdrawal booking text", "Standard German bank fee booking text", "Bank quarterly fee posting", "Umlaut spelling", "Briefing Screen 10: loan installments". They are seed values from the migration rendered verbatim in a German UI, which CLAUDE.md's language rule excludes ("if a string is rendered to the user → German"), and two of them ("Seen in dev …") describe the development process rather than the rule.
   _Categories: UI_

9. **Every deletion writes the same hardcoded English reason.** `useDeleteOposWhitelistRule` sets `delete_reason: "removed via UI"`, with no way for the person to give one. `/papierkorb` renders `delete_reason` in its Grund column, so every whitelist rule ever removed appears there under the same non-German, non-informative string. immonetz recorded the same column being unusable from the other direction (`immonetz/docs/audit/papierkorb/trash/ISSUES.md` #2, half the reasons empty); here it is filled with a constant.
   _Categories: UI, Usability_

10. **The hit counts load without paging, so they will start under-reporting silently.** `useOposRuleHitCounts` runs `.select("whitelist_rule_id").not("whitelist_rule_id","is",null)` with no `.limit()` and no `fetchAllRows`, then counts client-side. `fetchAllRows` exists in the same file specifically to work around the platform's per-request row cap (see its own comment), and this is the query most likely to cross it: it grows by one row per hidden transaction forever, 41 today, and the failure mode is a Treffer column that quietly goes stale rather than an error.
    _Categories: Future bug_

11. **The list has no filter, no sort and no author information.** 16 rows ordered by category then term, with no way to show only active rules, only rules with hits, or only one category, and no column for `created_by` / `created_at` although both are stored and the create path fills them. A deactivated rule is distinguishable only by opacity, which is also how the mobile card renders it.
    _Categories: Usability, UI_

## Resolution (2026-08-19)

| #   | Finding                                                            | Status                                                                                                                        |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Treffer column unreadable, an overlapping rule always shows 0      | **Fixed (surfaced, not changed)** — shadowed rules are labelled; the matcher's tie-break is deliberately untouched            |
| 2   | Screen names a Python script that does not exist                   | **Fixed** — hint rewritten; the capability itself now exists in-product (`opos_reapply_whitelist` + "Buchungen neu bewerten") |
| 3   | Deleting a rule leaves everything it hid hidden and unattributable | **Fixed** — delete dialog offers to release, and the deletion is logged to `change_history`                                   |
| 4   | Umlaut terms need two rules and nothing says so                    | **Fixed (UI)** — dialog offers the ASCII twin; `opos_norm()` deliberately unchanged                                           |
| 5   | A rule cannot be corrected, only deleted and rebuilt               | **Fixed** — edit dialog                                                                                                       |
| 6   | Any non-empty string accepted, no preview                          | **Fixed** — 3-character minimum plus a live impact count                                                                      |
| 7   | Rules are global and any authenticated user may write them         | **Fixed and applied** — confirmed live first                                                                                  |
| 8   | Six notes on screen are English developer text                     | **Fixed and applied** — all 21 seed notes translated                                                                          |
| 9   | Every deletion writes the same hardcoded English reason            | **Fixed** — reason is required                                                                                                |
| 10  | Hit counts load without paging, will under-report silently         | **Fixed** — `fetchAllRows`                                                                                                    |
| 11  | No filter, no sort, no author information                          | **Fixed** — search, three filters, sortable headers, Angelegt column                                                          |

The term-truncation finding immonetz recorded as its #11 did not apply here: this repo's table never
truncated the Suchbegriff cell. It does now wrap explicitly, matching the other two Hubs.

**Applied 2026-08-19 and verified afterwards on all three projects.** `pg_policies` now shows
`opos_whitelist_insert` / `opos_whitelist_update` gated on `current_role_name()` with the old
`with check (true)` pair gone, `opos_whitelist_auth_read` still open; `opos_reapply_whitelist(uuid)`
exists as SECURITY DEFINER; and 0 rows anywhere still carry any of the 21 original English notes.

One defect surfaced only by that post-apply check and is fixed by a follow-up migration
(`…200000_*_opos_reapply_revoke_anon.sql`, also applied): `opos_reapply_whitelist` had been granted
EXECUTE to **`anon`** as well as `authenticated`. `revoke all … from public` in the first migration
is the usual incantation but does not cover it — Supabase's default privileges grant EXECUTE on a
new function in `public` to `anon` and `authenticated` as named roles, and revoking from the PUBLIC
pseudo-role leaves a named grant intact. Every sibling RPC in these databases
(`opos_set_no_receipt`, `opos_clear_no_receipt`, `opos_set_category`, `restore_record`,
`match_opos_whitelist`) is authenticated-only, so this one was the outlier. It was not exploitable —
the function's own gate reads `current_role_name()`, which resolves through the JWT and is NULL for
an anonymous caller, so the call raised `42501` before touching a row — but the in-function check
should not have been the only thing standing between an unauthenticated request and a function that
rewrites `matching_status` across every company. All three now read
`authenticated, postgres, service_role`, matching their siblings exactly.

### What was checked live before changing anything

The original pass read the RLS from the migration files and marked #7 "needs a `pg_policies` check
before being acted on". That check was done, against all three projects, and it confirms the finding
rather than softening it — every one of them carries:

```
opos_whitelist_auth_insert   INSERT  {authenticated}  with_check: true
opos_whitelist_auth_update   UPDATE  {authenticated}  qual: true  with_check: true
```

Other measurements taken at the same time, which move some of the numbers in the text above:

- **28 rules now, not 16.** The seeded set has grown in all three.
- **Immonetz holds 0 bank transactions**, so every Treffer there is 0 for that reason alone.
  Stäy: 41 hidden of 2759. Eiffler: 12 hidden of 65.
- **All 21 distinct seed notes are byte-identical across the three databases**, so one translation
  table covers all of them.
- **No rule in today's seeded set is shadowed by another** (checked by running the rule below over
  the live terms). The overlap the Treffer column can hide is real but latent: it appears the first
  time somebody adds a longer term than one already there.

### How each finding was addressed

**The Python script (`pipeline/apply_opos_whitelist.py --revert`).** The instruction was not merely
pointing at a wrong path — the capability genuinely did not exist in the product. It does now.
`apply_opos_whitelist()` already releases a transaction the moment its rule stops matching; it just
never re-ran, because its trigger is `BEFORE INSERT OR UPDATE OF payment_reference,
counterparty_holder, counterparty_iban, booking_text, amount` and deactivating a rule writes none of
those columns. The new `opos_reapply_whitelist(p_rule_id uuid default null)` re-runs that same
decision on demand through the same matcher, and a "Buchungen neu bewerten" button in the header
calls it. The hint text no longer names any script, and points at the per-transaction "Wieder
aufnehmen" action for the single-row case.

Dry-run on Stäy's live data before shipping, read-only: re-evaluating all 41 currently-hidden rows
changes 0 of them (correct — every rule is still active and still matches, so the operation is a
no-op and therefore idempotent). Simulating "Darlehen" being switched off shows all 19 of its
transactions releasing back to Offene Posten, 0 falling to another rule. That is exactly the
behaviour that was previously unreachable without the missing script.

**The Treffer column.** The matcher's `order by r.created_at, r.term limit 1` is unchanged — it is
pipeline-owned and a transaction genuinely should be credited to one rule. What is new is that the
screen now says when a 0 is structural. `ueberdeckendeRegel()` in `opos.ts` computes, without
reading a single transaction, whether an **older** rule's normalised term is contained in this one's
on the same field (or on `any`, which reads every field concatenated). If it is, the older rule
always matches first and this rule can never score, so the row shows
"Zählt nie: „…“ ist älter und greift zuerst".

Checked against the live terms plus a synthetic set: `Darlehen Annuität` is correctly reported as
shadowed by the older `Darlehen` (the audit's own example); `Mietzahlung` on Verwendungszweck is
correctly **not** shadowed by `Miete` on Gegenkonto (different field); `Lohnsteuer` **is** shadowed
by an older `Lohn` scoped to "Beliebiges Feld"; inactive rules never shadow.

**Deleting a rule.** The delete dialog now shows how many transactions the rule is hiding and offers
to release them, pre-ticked whenever that count is above zero. The order is load-bearing and was
wrong in the first draft of this work: the rule must be deleted **first**, because
`opos_reapply_whitelist` re-evaluates against rules that are still active — running it while the
rule is still live re-matches every one of its transactions to itself and changes nothing. Delete
then release. If the release step fails after the delete succeeded, that is reported as its own
warning ("Regel gelöscht, aber …") rather than as a failed deletion, and the header action retries it.

**Umlauts.** `opos_norm()` is deliberately left alone. Folding umlauts there would be the deeper fix,
but that function belongs to the pipeline's own migration set and is shared with the ingestion side,
so changing its matching semantics from a Hub migration would put the two copies out of step and
would silently widen what every existing rule catches on live data. Instead the create dialog detects
a term containing ä/ö/ü/ß and offers, as an unticked checkbox, to also create the ASCII spelling —
which is precisely what the seeded set does by hand for Annuitaet/Annuität, Übertrag/Uebertrag and
Kontofuehrungsgebuehr/Kontoführungsgebühr.

**Editing.** One `RuleDialog` component now serves both "anlegen" and "bearbeiten"; the update hook
already accepted term/scope/category/note and simply had no caller.

**Validation and preview.** A term must be at least `OPOS_TERM_MIN_LENGTH` (3) characters, enforced
in the dialog and on the save button. `useOposTermImpact` counts, live and debounced, how many
outgoing transactions the term would match, and warns in amber past 20% of the ledger. It is an
estimate and is labelled "geschätzt": it uses `ilike`, which does not collapse runs of whitespace the
way `opos_norm()` does. Cross-checked on Stäy: typing "Darlehen" predicts 19 of 2569 outgoing
transactions, which is exactly the hit count the database's own matcher records for that rule.
Switching the field to "Beliebiges Feld" correctly widens the count (338 → 340 for "202"), which also
exercises the quoted multi-column `or()` path.

**Write scope.** Insert and update are now restricted to `admin`, `super_admin` and `supervisor` via
`current_role_name()`, matching the `bank_connections` migration from earlier in this series. There
is deliberately no DELETE policy: removal is a soft delete performed as an UPDATE, so the one update
policy governs editing, toggling and deleting alike. Reads stay open to every authenticated user on
purpose — "why is this booking not in Offene Posten?" is a question any bookkeeper must be able to
answer, and this list is the answer. The screen hides its write controls for everyone else rather
than letting them hit a 403, and says why.

**Audit trail.** Create, edit and delete each write a `change_history` row (`opos_whitelist_rules` /
record id), best-effort: the rule write has already committed by the time the log runs, so a failure
there warns to the console instead of reporting a save that actually succeeded as failed.

**Delete reason.** The hardcoded `"removed via UI"` is gone; the dialog requires a reason and refuses
to submit without one. `opos_whitelist_rules` already carries the `trash_require_delete_reason`
trigger, so this is the same rule the database enforces, surfaced one step earlier as a sentence
rather than a Postgres error.

**Hit counts.** `useOposRuleHitCounts` now pages through `fetchAllRows` instead of issuing one
unbounded select, so it cannot silently under-report once the hidden-transaction count crosses the
platform's per-request cap.

**The list itself.** Search over term and note, filters for category / active state / has-hits, a
"Angelegt" column showing `created_at` and `created_by`, a visible "N von M Regeln" count, and
sortable Kategorie / Suchbegriff / Treffer / Angelegt headers with `aria-sort`. Category sorts in the
briefing's vocabulary order (the same order the create dialog offers), not alphabetically by German
label, so the table and the dialog share one mental model; term is the tie-break everywhere so the
order is total.

### Files

- `supabase/migrations/20260819190000_hub_opos_whitelist_write_scope_and_reapply.sql` — RLS scope,
  `opos_reapply_whitelist()`, seed-note translation. **Applied.**
- `supabase/migrations/20260819200000_hub_opos_reapply_revoke_anon.sql` — the anon grant. **Applied.**
- `src/routes/opos-whitelist/index.tsx` — the whole screen
- `src/lib/data/queries.ts` — `useOposTermImpact`, `useReapplyOposWhitelist`, `logOposRuleChange`,
  `invalidateOposRules`, paged hit counts, delete-with-reason
- `src/lib/data/opos.ts` — `OPOS_TERM_MIN_LENGTH`, `oposNorm`, `asciiSchreibweise`, `ueberdeckendeRegel`
- `src/lib/data/types.ts` — `OposWhitelistRule.created_by`
- `src/lib/i18n/locales/{de,en}.ts`

**Worth knowing about the role gate, checked after applying.** `current_role_name()` is not the same
function in all three. immonetz and Stäy resolve it from `app_users`/`roles` by JWT e-mail; **Eiffler
has no `app_users` table at all** and resolves it from `has_role(auth.uid(), …)`, mapping
`superadmin → super_admin`, `admin → admin`, `team → supervisor`, and _every other authenticated
user → `assistant`_. It returns the same vocabulary either way, so the policies behave identically,
and nobody is locked out: Eiffler has 2 superadmin + 4 team accounts that can write, Stäy 5 of 7.

The consequence on Eiffler is worth a decision though: its `buchhaltung`, `zahlung`, `freigabe` and
`user` roles (9 accounts) all resolve to `assistant` and therefore **cannot** manage whitelist rules.
That is consistent with every other RLS policy written in this series, so it was left as is — but
`buchhaltung` is plausibly the role that should be managing these rules, and widening the gate is a
product decision rather than a bug fix.
