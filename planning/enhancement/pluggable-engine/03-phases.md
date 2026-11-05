# Phases

Phases A, B, C and F are done; Phase E is done except one sub-item — all verified against the real
files, not just trusted from a prior summary. Phase D has not been started. A new phase, G, is
added at the end for a gap the "done" work exposed: the adapters exist, but nothing calls them yet.

## Phase A — the config namespace — DONE

- [x] Add the four accessor functions from `02-mechanism.md` to `supabase/schema/0011_functions.sql`.
      `tenant_locale_settings()`, `tenant_tax_regime()`, `tenant_banking_provider()`,
      `tenant_card_provider()` all exist there.
- [ ] Apply to an empty database (per the `local-database` skill), confirm `tenant_locale_settings()`
      etc. return the stated defaults with no row in `tenant_settings.config`. Not yet run against
      a real database this session — everything so far is typecheck/lint-verified only.

**Done when** every accessor function exists and returns today's hardcoded values with zero
client-side change. Functions exist; the live-database confirmation is still open.

## Phase B — core interfaces, unwired — DONE

- [x] `src/lib/locale/locale-parser.ts` — `ILocaleParser`, `createLocaleParser`, ported logic from
      `normalize.ts::parseFlexibleDate`/`parseFlexibleAmount`.
- [x] `src/lib/data/types.ts` — `TaxBreakdownLine`, `TaxBreakdown`, `Document.tax_breakdown?`.
- [x] `supabase/functions/_shared/banking-adapter.ts` — `GenericBankAccount`,
      `GenericBankTransaction`, `CardSpender`, `IBankingAdapter`, `ICardAdapter`.
- [x] `src/lib/tenant-config.server.ts` + `supabase/functions/_shared/tenant-config.ts` — the
      resolver pair, cached the same way `tenantCredential()` is.
- [x] Bonus, not originally scoped here: the two concrete adapters themselves,
      `supabase/functions/_shared/adapters/banksapi/adapter.ts` and
      `supabase/functions/_shared/adapters/pleo/adapter.ts`, implementing `IBankingAdapter` and
      `ICardAdapter`. See Phase G — these exist but nothing calls them yet.

**Done when** these files exist, typecheck, and nothing imports them yet — no behaviour changes
because nothing calls them. True as of this check.

## Phase C — finish the `provider_*` rename — DONE

Split in two, because one half was a safe mechanical rename and the other wasn't.

### C1 — the six files that are a plain rename — DONE

- [x] `mappers.ts`: `banksapi_access_id` → `provider_access_ref`, `banksapi_product_id` →
      `provider_account_ref`, `banksapi_hash` → `provider_hash`.
- [x] The same renames in `bank-connect`, `bank-callback`, `bank-disconnect`.
- [x] `payment-initiate`, `payment-callback`: `banksapi_access_id` → `provider_access_ref`,
      `banksapi_product_id` → `provider_account_ref`, `banksapi_payment_id` →
      `provider_payment_ref`, on `payment_orders` as well as the `bank_accounts`/
      `bank_connections` join inside `payment-initiate`.
- [x] A second table caught in the same pass, not originally listed: `outgoing_invoices`'s
      `voucher_number`/`voucher_date`/`voucher_status` → `invoice_number`/`invoice_date`/`status`,
      in `bank-sync.ts`'s outgoing-invoice matching query and in the unused `src/kit/` variant of
      the outgoing-invoices page.
- [x] A stale whole-table name, not a column: the Deno table registry's `invoiceTransactionMatches`
      (`invoice_transaction_matches`, a table that no longer exists at all) corrected to
      `documentTransactionMatches` (`document_transaction_matches`), and `bank-sync.ts`'s one call
      site updated.
- [ ] If a live client database still has the old column names: `alter table ... rename column`,
      run against that database specifically — not done, no live client database to run it against
      from this template.

**Done when** `grep -rn "banksapi_" supabase/functions` returns nothing from these six files.
Confirmed clean, except one header comment in `payment-callback/index.ts` mentioning
`banksapi_payment_id` in prose — left deliberately, outside the lines actually touched.

### C2 — `bank-sync.ts` — DONE, by redesign rather than restoring constraints

`bank-sync/index.ts` depended on `bank_accounts_iban_uniq` and
`bank_accounts_connection_id_banksapi_product_id_key`, neither of which exists in
`supabase/schema/` under any name. The decision taken: redesign the dedup logic around what the
schema actually enforces, not restore the missing constraints.

- [x] Accounts: the one branch that used `.upsert(row, { onConflict: "connection_id,..." })` against
      a non-existent constraint now does explicit update-or-insert via `rowByConnProduct`, a lookup
      the function already built from its own full-table read. Every other account-writing branch
      in the file already worked this way; this made the last one consistent with it.
- [x] Transactions: `onConflict: "account_id,banksapi_hash"` → `onConflict: "provider_hash"`,
      matching the real global unique index (`bank_transactions_provider_hash`).
- [x] Several comments claiming constraints that were never real (`bank_accounts_iban_uniq` as a
      "partial index", the composite key) removed rather than updated to new names, since they were
      factually wrong before this pass touched them, not made stale by it.

**Known, accepted residual risk from this choice, not resolved:** transaction dedup is now global
across all accounts instead of per-account. If `provider_hash` ever collides across two different
accounts, the second would silently fail to insert. No evidence this happens; not proven it can't.

**Done when** `bank-sync` runs clean against an empty database built from `supabase/schema/`. Not
yet run against a real database — typecheck and `deno check` clean, nothing executed.

## Phase D — wire `TaxBreakdown`

- [ ] Extraction: wherever a document's VAT is currently extracted as one `vat_rate` (the AI
      extraction path feeding `documents`), also write one `document_taxes` row per distinct rate
      found.
- [ ] `src/components/documents/badges.tsx`: when `tax_breakdown.length > 1`, show each rate instead
      of the single-rate badge the comment at line 184 already flags as wrong for that case.
- [ ] Leave `vat_rate`, the rules engine (`assignment_rules.target = 'vat_rate'`) and the VAT-rules
      screen untouched — they already assume one rate and that assumption is correct for the common
      case.

**Done when** a multi-rate document (seed one for the test) shows both rates on screen, and every
existing single-rate document renders exactly as before.

## Phase E — extract the card-vendor types — MOSTLY DONE

- [x] `PleoSpender`, `PleoEmployee` and the `usePleoEmployees` hook moved out of
      `src/data/bank/bank.ts` into `src/data/bank/pleo-card-adapter.ts`.
- [x] `src/data/bank/index.ts` needed no change — it already imported from `./bank`, which now
      re-exports from the new file in its place. No importing file anywhere else changed.
- [ ] `src/components/bank/banksapi-state.ts`'s `BanksapiState` is still named after the vendor,
      not the badge it reports. Not done — the type, the function, and the one importer
      (`bank-accounts-table.tsx`) all still say `Banksapi*`.

**Done when** `grep -n "Pleo" src/data/bank/bank.ts` returns nothing (true — it returns only the two
re-export lines and three unrelated pre-existing comments) and the bank-accounts screen still
renders the same connection badges. The `BanksapiState` rename is the one item left in this phase.

## Phase F — `normalize.ts` and `format.ts` read the resolver — DONE

- [x] `src/lib/bank-import/normalize.ts`: `normalizeTable` takes an `ILocaleParser` parameter
      instead of calling `parseFlexibleDate`/`parseFlexibleAmount` directly. The one call site
      (`manual-import-dialog.tsx`) passes `createLocaleParser(DEFAULT_LOCALE_SETTINGS)` — a
      hardcoded default for now, not yet resolved from `tenantLocaleSettings()` per import. That
      wiring (the parser depending on the tenant's actual config instead of a constant) is still
      open — see Phase G.
- [x] `src/lib/data/format.ts`: the hardcoded `new Intl.NumberFormat("de-DE", ...)` replaced with
      `createLocaleParser(DEFAULT_LOCALE_SETTINGS).formatCurrency`. Same caveat: still the default
      constant, not the resolver.
- [x] Separate, related fix found and done in the same pass: `ParseIssue.reason` was a hardcoded
      German sentence built inside `normalize.ts`, never read from `src/lib/i18n/locales/*`. Changed
      to `code: ParseIssueCode` + `rawValue: string` (matching the shape the unused `src/kit/`
      copy of this file already had right), with `bank.manualImport.preview.issueCode.*` keys added
      to both locale files.
- [ ] Noted, not acted on: a second, independent copy of this same normalize logic exists at
      `src/kit/lib/bank-import/normalize.ts` (used by the unused `BankImportWizard.tsx`). Not
      touched — may be the intentional "kit" reusable-widget pattern, not confirmed either way.

**Done when** a CSV with German-formatted amounts imports identically to today — true, nothing
reads from tenant config yet so behaviour is unchanged — and the resolver is the only place a
locale default lives. Not fully true yet: `DEFAULT_LOCALE_SETTINGS` is still a hardcoded constant
passed at each call site, not read from `tenant_locale_settings()`. See Phase G.

## Phase G — close the loop: make the adapters and resolver actually get called

**Small half done.** `bank-connect`, `bank-disconnect`, `payment-initiate` and `payment-callback`
now call `resolveBankingAdapter()` instead of `getBanksapi()`/`getBanksapiForPayments()` directly.
This needed more than swapping an import: `IBankingAdapter` only covered `listAccounts`/
`listTransactions` (bank-sync's needs), so it gained `mode`, `paymentMode`, `createAccessSession`,
`deleteAccess`, `initiatePayment` and `getPaymentStatus`, each implemented on `banksapiAdapter()`
against the existing `BanksapiWrapper`/`BanksapiPaymentWrapper`. The two payment methods still read
their own independent `BANKSAPI_PAYMENT_MODE` switch through `paymentMode`, deliberately kept apart
from `mode` (the read-side switch), matching the separation `client.ts` already documents.

Still open:
- `bank-sync` still calls `getBanksapi()` directly — see the large/risky item below, deliberately
  not bundled into the above.
- `resolveCardAdapter()`/`pleoCardAdapter()` — nothing calls them yet.
- The locale parser in `normalize.ts`/`format.ts` is wired to `createLocaleParser`, but always with
  the hardcoded `DEFAULT_LOCALE_SETTINGS`, never with `tenantLocaleSettings()`.

**Large, high-risk, a separate future phase on its own — do not treat as part of the same pass:**
`bank-sync.ts`'s actual account and transaction logic (the matching, the dedup maps, the whole
function body) operates throughout on BANKSapi-specific fields — `produktId`, `bankprodukte`,
`kontoumsaetze` shapes — not on `GenericBankAccount`/`GenericBankTransaction`. Migrating that
function to genuinely run through `IBankingAdapter` instead of calling the BANKSapi client
directly means rewriting most of the function's body against the generic shape, not adding one
import. Given Phase C2 only just finished reworking this exact function's dedup logic, doing a
second large rewrite of it immediately after is itself a risk worth weighing separately, not
bundling in.

**Done when** `grep -rn "getBanksapi\b" supabase/functions` only turns up the one function that
*implements* `banksapiAdapter()` itself, every other Edge Function calls through the resolver, and
`bank-sync` against the mock provider behaves identically to before this phase.

## Verification, before any phase is called done

- Typecheck, lint clean. True for every change made. `build` still not run.
- **Apply `supabase/schema/` to an empty database, first try, in order — done.** All 17 files apply
  clean against a genuinely fresh local database (a stale `supabase start` backup gave a false
  failure on the first attempt; cleared with `supabase stop --no-backup` and restarted). `node
  scripts/gap-report.mjs` against that database: 71/71 tables match, views match, no missing
  functions.
- **The four config accessor functions — done.** Queried directly against the fresh database;
  each returns exactly the stated default with no row in `tenant_settings.config`.
- **`bank-sync` against the mock provider — done, and it found three more real bugs** (finding 8:
  `connectionRow()`'s `provider_id`, the connect-route trigger's stale field name and join column,
  and a partial-index/`onConflict` incompatibility), all fixed. Run three times in a row afterward:
  `accounts: 2` stable, `transactions_new: 5` then `0` then `0`, zero duplicate
  `(connection_id, provider_account_ref)` pairs found in the table. The C2 dedup rewrite holds under
  a real repeated sync.
- No existing client fork's behaviour changes without an edit to `tenant_settings.config`. True by
  construction and now also true in practice — the fresh database behaved exactly as documented
  with zero rows in `tenant_settings.config`.

Test environment: a throwaway local Supabase stack (`SUPABASE_PROJECT_ID=hub_template`, ports offset
by +100 in a temporary `config.toml` edit to avoid colliding with another project already running
on this machine), torn down with `--no-backup` afterward, `config.toml` and `supabase/migrations/`
confirmed back to their committed state. One permanent addition: `supabase/functions/_shared/
banksapi.ts` now exists again as a one-line re-export shim (`export * from
"./adapters/banksapi/client.ts"`) — the local stack would not start without it, for a reason not
fully root-caused, and the shim costs nothing while matching this repo's own redirect-don't-delete
pattern (e.g. the `/ausgangsrechnungen` route).
