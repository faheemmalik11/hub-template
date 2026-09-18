# Bankverbindungen (Bank Connections) — Issues

Screen: `http://localhost:7070/bankverbindungen`, the Zahlungen nav group's BANKSapi access list:
which bank consents exist, which accounts each delivers, their status and last sync, plus the
sync log panel.
Found via code review (`src/routes/bankverbindungen/index.tsx`, `src/components/bank/sync-log-panel.tsx`,
`connect-bank-dialog.tsx`, `badges.tsx`, `useBankConnections` / `useBankSyncLogsPage` /
`useTriggerSync` / `useStartBankConnect` in `src/lib/data/queries.ts`, migrations
`0003_hub_bank_reconciliation.sql`, `0035_hub_bank_sync_cron.sql`, `0059_hub_roles_access_trash.sql`,
`0080_single_ingest_cron.sql`) plus a live pass against the real dev database through the running
app. **Read-only**: no bank was connected, and "Jetzt synchronisieren" was deliberately never
clicked, since `BANKSAPI_MODE` is live here and a sync talks to the real bank. Live state: two
connections, both "Sparkasse Rhein-Haardt Bad Dürkheim", both Aktiv/Live, last sync 18.08.2026
22:30, delivering 2 and 10 accounts.

**What was checked and found sound**, so a future session does not re-derive it: the sync log panel
is properly built. `useBankSyncLogsPage` filters by event/level/connection server-side, pages with
an exact count, uses `keepPreviousData`, and polls on an interval that is passed as `false` rather
than `0` when disabled. The connection status pill has a German label for all four states the CHECK
constraint allows (`active`, `pending`, `error`, `expired`).

Direct SQL was NOT available in this pass, so RLS statements below are read from the migration
files rather than from `pg_policies`.

Each item is tagged with which of these it falls under: **Current bug** (broken right now), **Future
bug** (works today only under a narrow/lucky assumption that a plausible near-future condition will
break), **Usability** (can someone get their task done efficiently), **UI** (the visual layer),
**UX** (the flow and feel of the interaction).

1. **Six of the sync log's own vocabulary items print as raw English identifiers in the German UI.** Observed verbatim on screen: the event column shows `outgoing_match_run` and `accounts_excluded_skipped`, and the Details column shows "11 accounts*linked", "0 outgoing_matches_auto", "0 transactions_classified", "0 outgoing_matches_candidate" beside properly translated siblings ("4 neue Umsätze", "3 Vorschläge", "22 Konten"). `de.ts` has six `bankverbindungen.syncEvent.*` keys (`sync*started`, `accounts_fetched`, `transactions_fetched`, `match_run`, `sync_finished`, `error`) and five `bankverbindungen.counts.*` keys (`accounts`, `transactions*new`, `transactions_total`, `matches_auto`, `matches_candidate`); the Edge Function emits more than that. Both lookups use `{ defaultValue: … }`, so a missing key never throws and never shows up in review, it just leaks the identifier onto the operational screen a person consults when a sync went wrong.
   \_Categories: Current bug, UI*

2. **Both connections are called the same thing, and the column meant to distinguish them cannot.** The Bank/Provider column renders `bank_name ?? provider_name`, which is "Sparkasse Rhein-Haardt Bad Dürkheim" for both live rows. The only difference visible on screen is the account preview underneath, and those account names are themselves duplicates ("Sichteinlagen", "Sonstige Darlehen", see `docs/audit/bankkonten/bank-accounts/ISSUES.md` #3). Nothing else on the row is an identity: no created date, no BANKSapi access id, no holder. So on the screen whose job is "which accesses do we have", the two rows are indistinguishable, and neither the log's connection filter nor the "Verbindung" column in the log below can be read back to a specific one either.
   _Categories: Current bug, Usability_

3. **A connection that delivers no accounts is filtered out of the list entirely, including the ones that most need attention.** `connections` keeps only rows with at least one non-excluded account. The comment explains it as pruning abandoned webforms, which it does, but the filter cannot tell an abandoned `pending` row from a connection in `error`, an `expired` consent whose accounts were removed, or a live connection whose last account an admin excluded. All of them vanish from the only screen that lists connections, while bank-sync keeps running against them (`accounts_excluded_skipped` in the live log is that path). The four-state status pill and its "Fehler"/"Abgelaufen" labels can therefore only ever render for connections that are currently healthy enough to deliver.
   _Categories: Current bug, Usability_

4. **There is no per-connection action of any kind: no re-authorise, no disconnect, no sync.** The row is read-only, and the only controls on the page are "Bank verbinden" (always a brand new connection) and a global "Jetzt synchronisieren". Bank consents under PSD2 are time-boxed, which is exactly why `status` carries `expired` and the pill has a German label for it; when that happens the screen can name the problem and offers nothing to fix it except starting again, which produces another indistinguishable row next to the old one (#2), and no way to retire the dead one. Deleting or deactivating a connection is not possible from the UI at all.
   _Categories: Current bug, Usability_

5. **Read from the migrations, not verified live: every authenticated user sees every bank connection.** `0059_hub_roles_access_trash.sql` re-scoped `bank_accounts` and `bank_transactions` to `has_company_access(company_id)` and left `bank_connections` on its original `bank_connections_read … using (true)` from `0003_hub_bank_reconciliation.sql`. The table has no `company_id` column, so it could not have been scoped the same way without a schema change, and the omission is invisible in a diff of the RLS section. `useBankConnections` selects `*`, so `banksapi_access_id`, `banksapi_user` and the `metadata` jsonb reach the browser of any logged-in user, including one restricted to a single company. The BANKSapi credentials themselves stay server-side, so this is exposure of the access handles and the bank relationship, not of the key. **Needs a `pg_policies` check before being acted on.**
   _Categories: Current bug_

6. **The page opens with a back link to a screen the user did not come from.** The first element is `← Banktransaktionen`, justified by a comment saying "This screen is reached from Bank transactions and is not in the nav". It is in the nav: `nav.bankverbindungen → /bankverbindungen` sits in the Zahlungen group in `src/components/layout/app-shell.tsx`. So the comment is stale and the affordance is wrong for the normal route in, which is the menu.
   _Categories: Current bug, UX_

7. **The sync log's numbers and the Hub's own screens disagree, with nothing reconciling them.** The live summary line reads "22 Konten · 11 accounts*linked · 1279 Umsätze gesamt", while `/bankkonten` shows 12 accounts and `/banktransaktionen` shows 2,756 transactions. Both are defensible (the log counts what BANKSapi returned per connection, including products the Hub excludes; the transaction total does not include the manual imports), and neither screen says so. This is the panel somebody reads to answer "did the sync work", and its headline figures cannot be checked against anything else in the app.
   \_Categories: Usability*

8. **The sync log grows forever, and this screen is its only reader.** `bank_sync_logs` gets rows from every sync run, hourly per the cron in `0035_hub_bank_sync_cron.sql` / `0080_single_ingest_cron.sql`, at roughly ten rows per run (live: nine events for the 22:30 run). Nothing prunes it: no retention policy, no scheduled cleanup, no "older than" filter in the panel, and the table is not in the trash/purge machinery. The panel pages properly so it will not fall over, but the oldest entries are unreachable in practice and nothing is ever reclaimed. Same shape as the `processing_log` problem recorded on immonetz's `/protokoll` (`immonetz/docs/audit/protokoll/processing-log/ISSUES.md`).
   _Categories: Future bug_

9. **"Jetzt synchronisieren" is an unconfirmed, unscoped, real-world action available on two screens.** The same button exists here and on `/banktransaktionen`; both call `useTriggerSync`, which invokes the `bank-sync` Edge Function for every connection. With `BANKSAPI_MODE` live that is a call to the bank, and with two connections there is no way to sync just the one that looks stale. The button gives no indication of which mode it is about to run in, although the row right beside it does distinguish Live from Sandbox per connection.
   _Categories: Usability, UX_

---

## Resolution

Fixed in this pass, verified live at `http://localhost:7070/bankverbindungen` against the real dev
database (two active connections to the same Sparkasse, delivering 2 and 10 accounts).

| #   | Status                               | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Fixed**                            | The missing `syncEvent.*` and `counts.*` keys were added, in both locales. Which ones were missing came from the live table rather than the source: `select distinct event` and `jsonb_object_keys(counts)` turned up `outgoing_match_run`, `accounts_excluded_skipped`, `callback_received`, `accounts_linked`, `outgoing_matches_auto`, `outgoing_matches_candidate`, `transactions_classified`. Verified: the event filter's options are now all German, including "Rückmeldung der Bank" and "Entfernte Konten übersprungen".                                                                                                                                                   |
| 2   | **Fixed**                            | Each row now carries the date the access was created under the bank name, which is the one thing that differs between the two "Sparkasse Rhein-Haardt Bad Dürkheim" rows (15:48 vs 15:25 on 13 Aug). Deliberately not the `banksapi_access_id` — that handle is what the log was leaking, and it means nothing to a reader.                                                                                                                                                                                                                                                                                                                                                         |
| 3   | **Fixed**                            | The `filter(accounts > 0)` is gone. Every connection is listed, and one delivering nothing is marked "Liefert keine Konten" in amber with a tooltip naming the three cases, plus a count above the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4   | **Not addressed**                    | Still no per-connection re-authorise, disconnect or sync. A feature rather than a repair: `bank-sync` is invoked with `body: {}` and syncs everything, so per-connection scoping needs the Edge Function to accept a connection id. The Eiffler Hub has built the disconnect half; porting it is the obvious next step.                                                                                                                                                                                                                                                                                                                                                             |
| 5   | **Fixed, applied and verified live** | The audit asked for a `pg_policies` check before acting. Done, and the audit was right: `bank_connections_read` and `bank_sync_logs_read` were both `using (true)`, here and on both sibling Hubs. Migration `20260819160000_bank_connections_rls_scope.sql` scopes both to `current_role_name() in ('admin','super_admin','supervisor')` — a role gate, because neither table has a `company_id` and neither can meaningfully get one (one Sparkasse consent here delivers accounts belonging to four different companies). Applied to this database. The nav entry is gated to the same set and the route has a `BankverbindungenGuard`, so a pasted URL does not open it either. |
| 6   | **Fixed**                            | The `← Banktransaktionen` back-link is gone. The comment justifying it was stale: the screen _is_ in the nav.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | **Not addressed**                    | The log's headline figures still cannot be reconciled with `/bankkonten` and `/banktransaktionen`. Both are defensible and neither screen says so; explaining the difference means deciding what the log is _for_, which is a product question.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | **Not addressed**                    | `bank_sync_logs` still grows without bound. A retention policy deletes operational history, so it is a decision rather than a fix — flagged, not taken.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | **Partly fixed**                     | The duplicate button remains and still syncs everything (#4), but it now confirms, and the dialog states the scope and the mode: with a live consent it says in as many words that this fetches real data from the bank. The mode is derived from the connections (`every(c => c.is_sandbox)`), not guessed.                                                                                                                                                                                                                                                                                                                                                                        |

### Also found while verifying, not in the original audit

**The sync log printed the BANKSapi access handle on screen, live on this Hub.** `countsSummary()`
rendered every key of the `counts` jsonb as "<value> <label>", and `bank-callback` writes rows whose
counts are not counts:

```
event  = callback_received
counts = {"accessId": "12f0a6e7-…-b1e53ba39078", "baReentry": "ACCOUNT_CREATED"}
```

so the Details column read `12f0a6e7-…-b1e53ba39078 accessId · ACCOUNT_CREATED baReentry`. The
panel's existing defensive filter explicitly allowed strings through, which is precisely how this
got out. Under the old `using (true)` policy it was visible to every authenticated user.

Fixed in two steps, because the first was not enough: `countsSummary` now renders only numeric
values — and that alone just moved the leak, since the row then falls back to its `message`, which
`bank-callback` fills with the whole query string including the same id. A `maskHandles()` pass now
shortens any UUID in a rendered message to its last four characters. Verified: the row now reads
`bank-callback query: ?accessId=…9078&baReentry=ACCOUNT_CREATED`, and no full UUID appears anywhere
on the page.

### Verified live

- Both connections render with distinct "Eingerichtet" lines; the event filter is fully German.
- Filtering to "Rückmeldung der Bank" shows the four callback rows with the handle masked.
- No `← Banktransaktionen` link on the page.

### Not done

- No committed e2e spec for this screen.
- "Jetzt synchronisieren" was still never clicked: `BANKSAPI_MODE` is live here and a sync talks to
  the real bank.

---

## Later: this screen no longer exists

Bank connections were merged into `/bankkonten`; `/bankverbindungen` is now a redirect and the nav
entry is gone. Every connection is a group header on the accounts table, carrying its status, mode,
setup date, last sync and account count, and the sync log and sync button sit beside a new sync
health line on that page. See `docs/BANKKONTEN.md`.

Status changes to the table above:

- **#9** moves from "partly fixed" to fixed. Both remaining sync buttons (`/bankkonten` and
  `/banktransaktionen`) are now the same `TriggerSyncButton` component, so the confirmation and the
  live/sandbox wording cannot differ between them.
- **#4** is unchanged and is the main open item: there is still no disconnect and no re-authorise,
  because `supabase/functions/` has no disconnect function to call. The group row is where they
  belong once the Eiffler Hub's Edge Function is ported.
- **#7** and **#8** are unchanged.
