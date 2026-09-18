# BANKSapi Reconciliation — Implementation

_English reference for the BANKSapi bank-transaction reconciliation feature. German UI/DB/business
terms are translated in parentheses on first use._

> **Note (2026-08-15):** parts of this doc still describe the sandbox/Qonto era. Removing an
> account from the import (`excluded_at`), keeping a custom account name across syncs
> (`name_is_custom`) and de-duplicating IBAN-less products across two connections are documented in
> `docs/BANK_ACCOUNT_REMOVAL.md` — read that alongside §6/§9 here before changing `bank-sync`.

## 1. What was built

A read-only **reconciliation** (Abgleich = matching bank movements to invoices) module for the Hub.
It imports bank accounts and account movements (Umsätze) from **BANKSapi** into Supabase, then
matches each outgoing payment to an incoming invoice (Eingangsrechnung = incoming invoice /
Beleg = document / receipt) so staff can confirm or reject the link. Nothing here initiates a
payment — it only reads, matches, and displays.

All BANKSapi calls run **server-side in Supabase Edge Functions**; no BANKSapi secret ever reaches
the browser. The browser only calls our own Edge Functions and reads our own tables (guarded by
Row-Level Security, RLS).

## 2. Screens added (React / TanStack Router)

- **Banktransaktionen** (bank transactions) — `src/routes/banktransaktionen/index.tsx`: list of
  account movements with search, filters (account, direction, reconciliation status), and a
  **Jetzt synchronisieren** (sync now) button. Detail page `.../$id.tsx` shows candidate invoices
  with **Zuordnen** (assign / match) and **Ablehnen** (reject).
- **Bankverbindungen** (bank connections) — `src/routes/bankverbindungen/index.tsx`: connected
  accounts, connect flow, sync button, and the sync log.
- **Offene Posten** (open items) — `src/routes/offene-posten/index.tsx`: two tabs — **Offene
  Belege** (open receipts = invoices with no confirmed bank match) and **Fehlende Belege**
  (missing documents = outgoing bank debits with no invoice).
- **Zahlung & Abgleich** (payment & reconciliation) card added to the invoice detail page
  `src/routes/eingangsrechnungen/$nr.tsx`.
- Feature components: `src/components/bank/badges.tsx`, `src/components/bank/match-candidates.tsx`.
- Nav entries added in `src/components/layout/app-shell.tsx`.

## 3. Supabase tables added

Migration: `supabase/migrations/0001_bank_reconciliation.sql` (additive only — the existing
`belege` (documents) table is **not** altered).

- `bank_connections` — one BANKSapi bank access (Bankzugang).
- `bank_accounts` — an account/product (Bankprodukt) under a connection.
- `bank_transactions` — statement lines (Kontoumsätze = account movements). Generated `richtung`
  (direction) column: `ausgehend` (outgoing) when amount < 0, else `eingehend` (incoming).
  German full-text search column `fts`.
- `beleg_transaction_matches` — the many-to-many link between an invoice and a transaction
  (the source of truth for reconciliation state).
- `bank_sync_logs` — one row per sync event, **counts and ids only, no sensitive content**.

RLS: `authenticated` may read all bank tables; only the Edge Functions (service role) write the
bank tables; `authenticated` may insert/update `beleg_transaction_matches` (manual match). A DB
trigger keeps `bank_transactions.matching_status` in sync when a match is confirmed.

## 4. Edge Functions added (Deno)

Under `supabase/functions/`:

- `bank-sync` — imports accounts + transactions via the wrapper, runs matching, writes
  `bank_sync_logs`. Triggered by pg_cron or manually from the UI.
- `bank-connect` — starts a BANKSapi REG/Protect session and returns the webform URL.
- `bank-callback` — the REG/Protect redirect target; records the connection result.
- `_shared/banksapi.ts` — the wrapper (mock/live). `_shared/mappers.ts`, `_shared/matching.ts`,
  `_shared/supabase.ts`, `_shared/cors.ts`, `_shared/mock/*.json`.

## 5. How BANKSapi auth works

BANKSapi has **no single API key**. The "key" is an HTTP Basic Auth pair
(`tenant/clientId` : `client-secret`) used to mint short-lived (~2h) Bearer tokens:

- **Client token** — `POST /auth/oauth2/token`, Basic Auth, `grant_type=client_credentials`.
  Used for tenant-level endpoints (e.g. providers).
- **User token** — `POST /auth/oauth2/token`, Basic Auth, `grant_type=password` +
  `username`/`password` of a tenant user. Used for customer endpoints (bank accesses, accounts,
  transactions).

The wrapper caches both tokens and refreshes before expiry. Gotchas baked in: always `.trim()` the
token (a trailing space causes 500s); the user token must be a POST with a `grant_type=password`
body; `Customer-IP-Address` must be a public IPv4.

## 6. How sandbox sync works

`bank-sync` (logged in as the tenant user) calls `GET /customer/v2/bankzugaenge` (bank accesses).
The response is an object keyed by access id; each access carries `bankprodukte` (bank products).
**Every** product becomes a `bank_accounts` row. For those that expose a `get_kontoumsaetze`
relation it also calls `.../{accessId}/{productId}/kontoumsaetze` and imports the movements; the
rest carry `hasTransactions: false` and only their movement fetch is skipped (asking a product for
movements it has no link for fails the whole run). Products without transaction support — an
Investmentdepot, a Bausparvertrag — used to be dropped from the response entirely, which left an
account the customer had connected missing from the Hub with nothing on screen to explain why.
Rows are mapped into `bank_accounts` / `bank_transactions`, then matching runs against open
invoices.

Each product's `kreditinstitut` is written to `bank_accounts.bank_name`, and on an existing row only
when that column is still empty — the Bankkonten dialog lets a human type one, and the hourly sync
must not overwrite it.

### Incremental fetch (the `from` cursor)

`GetTransactions` accepts `from` as an **ISO 8601 timestamp**, per the BANKS/Connect OpenAPI spec:

> `from` — "Only return transactions with a booking date after this Date/Time (ISO 8601 formatted
> timestamp); may be used with `to` to specify a time window", example `2022-02-20T00:00:00`.

The sync sent a bare `YYYY-MM-DD`, which BANKSapi refuses with a 404. The `catch` then retried with
no filter at all, so **every run re-downloaded the provider's full default window**: the live logs
showed `transactions_total: 1173, transactions_new: 0` on every hourly run, 23 seconds each, plus
one rejected request per account. Fixed by sending `${date}T00:00:00` (`fromTimestamp()` in
`banksapi.ts`).

The cursor itself is ours, computed per account in `bank-sync`: the newest `booking_date` already
stored for that account, minus a 7-day overlap for backdated postings; null on first sync = full
history. Correctness never depended on the filter — `bank_transactions` is deduped on
`(account_id, banksapi_hash)` with `ON CONFLICT DO NOTHING`, so the overlap and any re-fetch are
absorbed. The filter is purely about not re-downloading what we already have.

The unfiltered fallback is still there, but it is now remembered for the run (one wasted request
instead of one per account) and reported: `transactions_fetched` carries a message saying the filter
was refused, instead of failing silently. Other documented parameters not currently used: `to`,
`bookingStatus` (default `booked`; `pending` is EBICS-only), `tag`, `filter`.

## 7. How to switch mock / live mode

Controlled by the `BANKSAPI_MODE` secret on the Edge Functions:

- `mock` (default) — returns local fixtures (`_shared/mock/*.json`); **no network, no secrets**.
- `live` — real BANKSapi calls; requires the Basic Auth + tenant-user secrets.

```bash
# mock (safe default)
supabase secrets set BANKSAPI_MODE=mock
# live (real calls; set the real secrets too)
supabase secrets set BANKSAPI_MODE=live \
  BANKSAPI_BASIC_USERNAME='<tenant/clientId>' BANKSAPI_BASIC_PASSWORD='<client-secret>' \
  BANKSAPI_TEST_USER='<user>' BANKSAPI_TEST_USER_PASSWORD='<password>'
supabase functions deploy bank-sync --use-api
```

The wrapper interface is identical in both modes, so sync/matching/UI don't change — only the data
source does. `mock` is the permanent fallback / kill-switch.

## 8. `BANKSAPI_ENV=sandbox` vs `production` → `is_sandbox`

`is_sandbox` marks **test data vs. production data**, independent of mock/live:

```
is_sandbox = (BANKSAPI_ENV !== "production")
```

- `BANKSAPI_ENV` unset or `sandbox` → every imported row gets `is_sandbox = true` (mock **and**
  BANKSapi-sandbox data).
- `BANKSAPI_ENV=production` → `is_sandbox = false` (only for the real bank).

This makes cleanup before go-live trivial: `delete from bank_transactions where is_sandbox = true;`
(and the other bank tables). The **Bankverbindungen** screen shows "Sandbox / Mock" vs "Live" from
this flag.

## 9. Idempotency — `(account_id, banksapi_hash)`

`bank_transactions` has a unique constraint on `(account_id, banksapi_hash)`. `bank-sync`:

1. de-duplicates within the batch by `hash` (BANKSapi can return the same movement twice —
   identical `hash`, differing only by `identifier.bookingRef`), then
2. inserts with `upsert(..., { onConflict: "account_id,banksapi_hash", ignoreDuplicates: true })`
   → `ON CONFLICT DO NOTHING`.

Result: running **Jetzt synchronisieren** twice never grows the count (second run reports "0 neue
Umsätze" = 0 new movements), and same-account duplicates are structurally impossible.

## 10. How to run the sync from the UI

Open **Banktransaktionen** (or **Bankverbindungen**) → click **Jetzt synchronisieren**. A toast
reports how many new movements and match suggestions were created. The button invokes the deployed
`bank-sync` function via `supabase.functions.invoke("bank-sync")` — no secrets in the browser.

## 11. How to verify imported accounts and transactions

- UI: **Bankverbindungen** lists connections + accounts and the **Sync-Protokoll** (sync log);
  **Banktransaktionen** lists the movements (filter by account/direction/status).
- SQL (read-only):
  ```sql
  select count(*) from bank_accounts;
  select count(*), min(buchungsdatum), max(buchungsdatum) from bank_transactions;
  -- duplicate check (see §12): expect NO same-account duplicates
  select banksapi_hash, count(distinct account_id) accounts, count(*) rows
  from bank_transactions group by banksapi_hash having count(*) > 1;
  ```

## 12. Known sandbox behavior

- The BANKSapi **Demo Provider may return the same `hash` across different accounts** — it serves
  the same demo statement to more than one demo account. Those appear as duplicate hashes with
  **different `account_id`** (in the query above, `accounts == rows`). This is expected demo noise.
- **Same-account duplicates must not exist** — the `(account_id, banksapi_hash)` constraint + batch
  dedup guarantee it. If you ever see a hash duplicated within one `account_id`, that's a real bug.
- **Real production Qonto should not behave like the demo provider** — each real account has its own
  unique movements, so cross-account hash collisions should not occur. Do not "fix" the demo
  behaviour by de-duplicating on `hash` alone (that would be wrong for real data).

## 13. What is NOT built yet

- **Payment initiation** (Überweisung = bank transfer) — deliberately out of scope; read/match/
  display only.
- **Final Qonto production connection** — currently on the BANKSapi sandbox/demo provider.
- **Role-based payment permissions** — no role/permission model yet (who may approve/pay).
- **DATEV handoff** (export to the DATEV accounting system) — not implemented.

## 14. Next steps

1. Prove the clean baseline/idempotency on the sandbox (truncate test rows → re-sync → "0 neue
   Umsätze").
2. Connect the real Qonto account (set `BANKSAPI_ENV=production` + real secrets), purge sandbox
   rows first.
3. Improve matching against real supplier invoices; tune thresholds.
4. Decide the role/permission model before any payment features.
5. See `docs/BANKSAPI_SANDBOX_ONBOARDING.md` for the sandbox access/onboarding details.
