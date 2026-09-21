# OPOS-Whitelist

The rule list behind `/opos-whitelist` — outgoing bank movements that will never have a receipt (salaries,
tax prepayments, private withdrawals, rebookings, loan instalments) are matched by term and taken out
of Offene Posten and out of bank matching, so the receipts that really are missing stay visible.

Audit and the reasoning behind each change: `docs/audit/opos-whitelist/opos-whitelist/ISSUES.md`.

## How the matching actually works

All of this is database-side and owned by the **pipeline's** migration set, not by this repo
(vendored here as `supabase/migrations/0029_pipeline_opos_whitelist.sql`). Do not change it from a Hub migration without changing it upstream too.

- `opos_norm(text)` — lowercases, collapses runs of whitespace, trims. **Keeps punctuation and does
  not fold umlauts or ß**, so `Annuität` and `Annuitaet` are different terms.
- `match_opos_whitelist(reference, counterparty, iban, booking_text)` — returns **at most one** rule:
  `where is_active and deleted_at is null and position(opos_norm(term) in <the scope's field>) > 0
order by r.created_at, r.term limit 1`. Scope `any` matches against all four fields concatenated.
- `apply_opos_whitelist()` — a **BEFORE INSERT OR UPDATE OF payment_reference, counterparty_holder,
  counterparty_iban, booking_text, amount** trigger on `bank_transactions`. Outgoing only (tested on
  `amount < 0`, because the generated `direction` column is not yet computed in a before-row trigger).
  It never touches a `zugeordnet` row, and never overrides a human decision — which it recognises as
  `matching_status = 'ignoriert'` **with `whitelist_rule_id` null**.

Two consequences fall out of that and drive most of this screen's design:

1. **A transaction is credited to exactly one rule, the oldest that matches.** A Treffer count of 0
   can therefore mean "shadowed by an older rule", not "does nothing". `ueberdeckendeRegel()` in
   `src/lib/data/opos.ts` detects that case statically and the table labels it.
2. **Nothing re-runs the trigger when a rule changes.** Switching a rule off or deleting it writes
   none of the columns in that `UPDATE OF` list, so its transactions stay hidden. That is what
   `opos_reapply_whitelist()` exists for.

## What this repo adds

`supabase/migrations/20260819190000_hub_opos_whitelist_write_scope_and_reapply.sql`:

- `opos_whitelist_insert` / `opos_whitelist_update` — INSERT and UPDATE restricted to `admin`,
  `super_admin`, `supervisor` via `current_role_name()`. Replaces the pipeline's
  `with check (true)` / `using (true)` policies. SELECT stays open to all authenticated users.
  There is **no DELETE policy** on purpose: removal is a soft delete done as an UPDATE.
- `opos_reapply_whitelist(p_rule_id uuid default null)` — SECURITY DEFINER, same role gate. Re-runs
  `match_opos_whitelist()` over the rows a rule currently hides. A row whose rule no longer matches
  falls to whichever other active rule does, or back to `'offen'`. Only touches rows that are
  `matching_status = 'ignoriert'` **and** `whitelist_rule_id is not null`, so human decisions and
  reconciled payments are untouched. Returns the number of rows changed. Passing null re-evaluates
  every rule-hidden transaction. None of the columns it writes are in the trigger's `UPDATE OF` list,
  so it does not re-enter the trigger.
- Translates the 21 seeded English notes to German, matched on exact text so hand-edited notes survive.

Both migrations are **applied** on all three projects (2026-08-19) and verified afterwards against
`pg_policies` and `information_schema.routine_privileges`.

`supabase/migrations/20260819200000_hub_opos_reapply_revoke_anon.sql` is a follow-up: `opos_reapply_whitelist` had been granted EXECUTE to `anon` as well as
`authenticated`, because `revoke all … from public` does not remove the named grant Supabase's
default privileges create. Not exploitable (the function's own gate rejects a caller with no JWT),
but every sibling RPC here is authenticated-only and this one should be too.

## Front end

| Piece                                    | Where                                                 |
| ---------------------------------------- | ----------------------------------------------------- |
| The screen                               | `src/routes/opos-whitelist/index.tsx`                 |
| Rule hooks, impact preview, reapply      | `src/lib/data/queries.ts`                             |
| Vocabulary, term rules, shadow detection | `src/lib/data/opos.ts`                                |
| German and English strings               | `src/lib/i18n/locales/{de,en}.ts` (`oposWhitelist.*`) |

Notable helpers in `src/lib/data/opos.ts`:

- `OPOS_TERM_MIN_LENGTH` (3) — a term shorter than this is refused in the dialog.
- `oposNorm(term)` — the client-side mirror of `opos_norm()`.
- `asciiSchreibweise(term)` — the ASCII spelling of a term containing ä/ö/ü/ß, or null. The create
  dialog offers to save it as a second rule.
- `ueberdeckendeRegel(rule, all)` — the older rule that will always be credited ahead of this one, or
  null. True when an older rule's normalised term is a substring of this one's **and** it reads the
  same field or `any`.

Hooks in `src/lib/data/queries.ts`:

- `useOposWhitelistRules`, `useCreateOposWhitelistRule`, `useUpdateOposWhitelistRule`,
  `useDeleteOposWhitelistRule({ id, reason })` — the last one requires a reason (`pflichtGrund`),
  matching the `trash_require_delete_reason` trigger the table carries.
- `useOposRuleHitCounts` — paged via `fetchAllRows`.
- `useOposTermImpact(scope, term, enabled)` — how many outgoing transactions a term would match.
  An **estimate**: `ilike` does not collapse whitespace the way `opos_norm()` does.
- `useReapplyOposWhitelist()` — calls the RPC; invalidates the rule caches and `invalidateMatchState`.

Create, edit and delete each write a `change_history` row, best-effort (a logging failure warns to
the console rather than reporting a successful save as failed).

## Order that matters

**Delete the rule before releasing its transactions.** `opos_reapply_whitelist` re-evaluates against
rules that are still active, so calling it while the rule is still live re-matches every one of its
transactions back to itself and changes nothing. `DeleteRuleDialog` deletes first, then reapplies,
and reports a release failure as its own warning rather than as a failed deletion.

## Still open

- **another client's role mapping.** `current_role_name()` is a different function there (no `app_users`
  table; it reads `has_role(auth.uid(), …)`), and every authenticated user who is not `superadmin`,
  `admin` or `team` resolves to `assistant`. So another client's `buchhaltung`, `zahlung`, `freigabe` and
  `user` accounts cannot manage whitelist rules. Consistent with the other policies in this series,
  but `buchhaltung` is plausibly a role that should be allowed to — a product decision, not a bug.
- **`opos_norm()` still does not fold umlauts.** Fixing it there would remove the need for paired
  rules entirely, but the function is shared with the ingestion pipeline and changing it from a Hub
  migration would put the two out of step and silently widen what every existing rule catches.
  It belongs in the `book-keeping` repo, applied to both sides at once.
- **The impact preview is an estimate**, and says so on screen.
- **No bulk edit / no rule import.** Each rule is created and corrected one at a time.
