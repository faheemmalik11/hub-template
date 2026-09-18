# Removing a bank account ("Konto entfernen") + custom account names

_What the client asked for, what is implemented, and what is still open. Companion to
`docs/BANKSAPI_RECONCILIATION_IMPLEMENTATION.md` (the import/matching module as a whole) and
`docs/BANKSAPI_GO_LIVE.md` (mock → live switch and the demo-data cleanup)._

## 1. What triggered this

On 2026-08-15, after connecting the real Sparkasse Rhein-Haardt access, the client reported:

> A private loan account belonging to Andy and me (account ending in 5383 13) was also
> synchronized, and my Mastercard appears twice. This is probably because I had to go through the
> connection process twice. The first attempt was interrupted, but apparently some of the data had
> already been synchronized.
>
> However, I'm unable to delete any of the accounts. The bank accounts probably also still need to
> be named properly. I have already assigned the respective companies to them.

Three separate defects, all confirmed against the live database:

1. **There was no delete.** `src/lib/api/bank-accounts.functions.ts` only had `createBankAccount`
   and `updateBankAccount`, `bank_accounts` is not part of the trash system
   (`trash_eligible_tables()`, migration `20260813110000`), and RLS on the table is SELECT-only for
   `authenticated` (migration 0059) — so there was no path to removing an account, from the UI or
   otherwise.
2. **A delete would not have stuck anyway.** The bank re-delivers every product the access covers
   on every hourly sync, and `bank-sync`'s IBAN-reuse branch deliberately _revives_ a soft-deleted
   account when it does (it even logs `account_revived`). `deleted_at` therefore means "gone unless
   the bank sends it again" — the opposite of what a private account needs.
3. **Renaming did not survive.** `accountRow()` in `supabase/functions/_shared/mappers.ts` writes
   `account_name` from the bank's own label on every sync. The Sparkasse labels six of these
   accounts `Sichteinlagen` and five `Sonstige Darlehen`, so renaming them is the only way to tell
   them apart — and every rename was reset within the hour.

## 2. Diagnosis of the client's specific data (2026-08-15)

Read from the live database (`xsgbdtdwhrrhoeximeon`) before anything was changed:

|              |                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connections  | **two**, both `active`, both syncing: `2df1d196…` (access `febc8217…`, created 13.08. 10:25, delivers **11** products) and `fc5e16c2…` (access `12f0a6e7…`, 10:48, delivers **12**) |
| Accounts     | **14** distinct rows (not 23 — IBAN-carrying products were already merged across the two connections by `bank-sync`)                                                                |
| Duplicate    | BusinessCard, `banksapi_product_id = 5584110050006733`, rows `011da5a3…` (10:41) and `384e229b…` (10:56), **29 transactions each**                                                  |
| Private loan | `5c0a5f0f…`, IBAN ending `…538313`, `Sonstige Darlehen`, no company assigned, **0 transactions**                                                                                    |

Two findings that shaped the fix:

- **The two connections are overlapping but not identical consents** — a different set of accounts
  was ticked in each webform run. 11 accounts hang off the first, 3 only off the second. So
  "delete the connection from the interrupted attempt" is _not_ available: it would take real
  accounts with it. Both connections stay.
- **Only the card duplicated, because a credit card has no IBAN.** `bank-sync` de-duplicates
  products across connections by normalized IBAN; the uniqueness constraint it falls back on,
  `(connection_id, banksapi_product_id)`, does not span connections. So the card was inserted once
  per connection, each copy carrying its own 29 movements. Verified before removing one: both rows
  hold the **same 29 `banksapi_hash` values**, the same `company_id`, and neither has an invoice
  match, outgoing-invoice match or attached receipt.

## 3. What is implemented

### 3.1 Data model — `supabase/migrations/20260815120000_bank_account_exclusion.sql`

Four columns on `bank_accounts`:

- `excluded_at timestamptz` — set = **never import this product again**. Distinct from `deleted_at`
  (migration 0028), which the sync may undo. The row itself is the tombstone the sync matches
  against, which is why removal keeps it rather than deleting it.
- `excluded_by text` — email of the admin who removed it (text, not an FK: an `app_users` row may
  later be removed and that must not erase who did this).
- `exclusion_reason text` — free text, shown in the UI.
- `name_is_custom boolean not null default false` — set = a human chose `account_name` and the feed
  must not overwrite it.

Plus the partial index `bank_accounts_excluded_idx`, which `bank-sync` reads on every run.

### 3.2 `bank-sync` — `supabase/functions/bank-sync/index.ts`

- **Exclusion is honoured.** The run loads every excluded row up front into two sets (by normalized
  IBAN and by `banksapi_product_id` — a product is recognised by whichever it has). A matching
  product is skipped before anything happens to it: no account row write, no balance, and above all
  **no transaction fetch**. Excluded rows are also removed from the reuse candidates (`rowByIban`,
  `realRows`) so the revive path can never hand one back. A skipped product is logged once per
  connection as `accounts_excluded_skipped`.
- **IBAN-less products de-duplicate across connections.** New map `rowByProductId` (oldest row wins,
  so repeated syncs keep collapsing onto the same one). A card delivered by a second access now
  updates the existing row — balance/BIC/currency only — instead of inserting a second one.
  `connection_id` and `banksapi_product_id` are deliberately left alone: moving the row to the other
  connection would just re-open the duplicate from the other side on the next run. Movements from
  both accesses land on the one account and still dedupe on `(account_id, banksapi_hash)`.
- **Custom names survive.** Before the upsert, the row that `(connection_id, banksapi_product_id)`
  will hit is looked up; if it carries `name_is_custom`, `account_name` is dropped from the payload.
- The transaction loop now `continue`s when a product has no entry in `accountIdByProduct` instead
  of dereferencing `undefined!` — that is what keeps an excluded account's movements out.

### 3.3 Server functions — `src/lib/api/bank-accounts.functions.ts`

- `excludeBankAccount({ accountId, reason? })` → `{ purgedTransactions, purgedMatches, purgedFiles }`.
  Sets the tombstone and **purges the account's `bank_transactions`**. Every dependent row is
  `ON DELETE CASCADE` (verified against the live schema: `invoice_transaction_matches`,
  `outgoing_invoice_transaction_matches`, `invoice_files`, all on `transaction_id`), so one delete
  takes matches and attached receipts with it — hence the counts in the return value. Counting runs
  in chunks of 100 ids because `.in()` goes into the query string and one account here already has
  419 movements.
- `restoreBankAccount({ accountId })` — clears the tombstone. The account comes back empty and the
  next sync re-imports its history from scratch (the incremental cursor is derived per account from
  its newest `booking_date`, so an empty account pulls everything again).
- Both are **admin-only** (`requireActiveAdmin`, local copy of the helper in
  `employees.functions.ts`) _and_ company-scoped (`checkCompanyAccess`) — removal purges data, so it
  is a stronger gate than editing, which stays company-scoped only.
- `createBankAccount` sets `name_is_custom: true` (a human typed the name). `updateBankAccount` sets
  it only when the submitted name actually **differs** from the stored one — saving the dialog just
  to assign a company must not freeze the bank's useless label on an account nobody renamed.

### 3.4 UI

- `src/components/bank/remove-bank-account-dialog.tsx` — confirm dialog with an optional reason,
  destructive styling, `Trash2` trigger next to the existing edit pencil on `/bankkonten` (desktop
  table and mobile card). Rendered only for admins, so nobody else runs into a 403.
- `src/routes/bankkonten/index.tsx` — new `RemovedAccounts` section (admin-only, hidden when empty)
  listing removed accounts with who removed them, when, why, and a **Wiederherstellen** button. They
  are listed rather than hidden outright so it stays visible _why_ an account the bank keeps
  delivering never appears in the table above.
- `useBankAccounts()` (`src/lib/data/queries.ts`) filters `excluded_at is null` centrally — it feeds
  the Bankkonten table, the transaction filters and the import pickers, and a removed account has to
  be gone from all of them. `useExcludedBankAccounts()` is the one hook that shows them again.
- Strings in `de.ts`/`en.ts` under `bankkonten.entfernen.*` and `bankkonten.entfernt.*`.

### 3.5 One-off cleanup

`scripts/one-off/2026-08-15-bank-cleanup-duplicate-card-and-private-loan.sql` excludes the private
loan account and deletes the younger duplicate card row. It **guards** rather than trusts: if a
match, a receipt, or a movement that exists only on the row being dropped has appeared since it was
written, the delete aborts with an exception.

**Order matters** — the script is step 3 of 3:

1. Apply migration `20260815120000_bank_account_exclusion.sql`.
2. `supabase functions deploy bank-sync --project-ref xsgbdtdwhrrhoeximeon` — the _deployed_
   function is what pg_cron runs hourly (`bank-sync-hourly`, migration 0035). Until it carries the
   exclusion check and the product-id de-duplication, the next tick undoes the cleanup.
3. Run the script.

## 4. What is deliberately NOT built

- **Removing a connection.** There is still no way to delete a `bank_connections` row or revoke the
  BANKSapi access behind it. It would not have helped here (both consents carry accounts that exist
  nowhere else) and doing it properly means deleting the access at BANKSapi too — the wrapper in
  `supabase/functions/_shared/banksapi.ts` has no such call (`deleteRegProtectSessions` is
  unrelated), and BANKSapi's support for `DELETE /customer/v2/bankzugaenge/{accessId}` is
  unverified. A local-only "remove connection" would be a lie: `bank-sync` recreates any connection
  `getBankAccesses()` still returns.
- **Consolidating onto one connection.** If the client ever re-runs the webform granting _all_
  accounts in a single pass, the older access could then be dropped — but that needs the point
  above first. Until then, two connections syncing side by side is correct and costs nothing beyond
  a slightly longer sync.
- **Bulk rename.** Names are set one at a time in the existing edit dialog.

Known edge, deliberately left alone: `createManualBankAccount`
(`src/lib/api/bank-manual-import.functions.ts`) resolves an IBAN conflict by handing back the
existing row ("select it instead" rather than a dead-end error). If someone manually creates an
account for an excluded IBAN they get the excluded row back as the upload target, and a statement
imported onto it would land in an excluded account. That takes a deliberate human action against
the exact IBAN somebody else removed on purpose, so it is not guarded — worth a check there if
exclusion ever gets used at scale.

## 4b. Display fixes on the same screen (2026-08-15)

Three defects the client's screenshot surfaced while reviewing `/bankkonten`. All display-only —
no schema change, no backfill.

- **"Kreditinstitut" was empty on every row.** `bank_name` is written by `connectionRow()`
  (`_shared/mappers.ts:19`) onto `bank_connections`; `accountRow()` never writes it, so every
  BANKSapi-fed account has `bank_name = NULL` (0 of 12 populated). The page now falls back to the
  connection's `bank_name ?? provider_name`. Deliberately a _display_ fallback: copying the value
  onto each account row would put `bank-sync` back in the business of overwriting a hand-edited
  field every hour — the same trap that made renaming impossible (§1.3).
- **"BANKSapi: Kein Provider" on accounts that are connected.** The badge read
  `banksapi_provider_id`, which belongs to the _connect_ step (FK → `bank_providers`, a table with
  0 rows here) and which `bank-sync` never writes — 0 of 12 accounts have it. What proves an
  account is on the feed is `connection_id` + `banksapi_product_id`, present on all 12. The badge
  is now three-state: **Verbunden** (on the feed) / **Verknüpfbar** (provider on file, not yet
  connected) / **Kein Provider**.
- **Broken placeholders.** `bankkonten.summary` and `bankverbindungen.weitereKonten` used single
  braces (`{konten}`) where i18next needs `{{konten}}`, so they rendered literally as
  `{konten} accounts · {gesellschaften} companies`. Fixed in both locales. Worth grepping for
  `"[^"]*\{[a-zA-Z_]+\}[^"]*"` after adding keys — these were the only two left.

## 5. Open / to verify

- The client still has to **name the accounts** — six `Sichteinlagen` and five `Sonstige Darlehen`
  are indistinguishable in every picker until he does. That now sticks; before this change it did
  not, which is very likely why he thought naming was not possible.
- **VR Bank is not connected yet** (client: no transactions on it, not urgent).
- **The front-end still has to ship.** The database and `bank-sync` side is live (§6), but "Konto
  entfernen", the Entfernte-Konten section and the `excluded_at` filter in `useBankAccounts()` only
  reach the client once the Hub itself is deployed.

## 6. Rollout — done 2026-08-15, verified in production

All three steps ran against `xsgbdtdwhrrhoeximeon` on 2026-08-15, in order, each verified:

1. **Migration applied** — all four columns plus `bank_accounts_excluded_idx` present.
2. **`bank-sync` deployed**, then triggered manually (run `7be752cf…`): 23 accounts, 0 new
   transactions, no log row above `info`. The cross-connection de-duplication proved itself before
   the cleanup even ran — the keeper card row `011da5a3…` was updated by _both_ accesses while the
   duplicate `384e229b…` was left untouched at its previous timestamp, and no 15th account appeared.
3. **Cleanup script run.** End state: **12 live accounts + 1 excluded**, exactly one BusinessCard row
   still carrying its 29 movements, loan account `…538313` excluded with 0 transactions.

A confirming sync afterwards (run `57ebd4f9…`) logged
`accounts_excluded_skipped {"accounts": 1}` against connection `2df1d196…` and reported
**22 accounts, down from 23** — which also settles the open question above: only access `febc8217…`
delivers the loan product, `12f0a6e7…` does not. The card is still a single row and the excluded
account still holds zero transactions.

What remains is the front-end deploy — see §5.
