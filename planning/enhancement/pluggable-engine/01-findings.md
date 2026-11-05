# Findings

Each row is a claim from the original audit, checked against the actual code.

## 1. Tenant configuration

**Claim:** no table drives business locale or vendor choice per client; introduce `tenant_settings`.

**Reality:** it exists. `supabase/schema/0005_sources.sql`:

```sql
create table if not exists public.tenant_settings (
    single_row boolean primary key default true,
    config jsonb not null default '{}'::jsonb,
    secrets jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint tenant_settings_one_row check (single_row)
);
```

One row per deployed database, a JSONB `config`, and an audit trigger into
`tenant_settings_history`. There is already a reader precedent, `public.run_now_enabled()` in
`0011_functions.sql`:

```sql
select coalesce((select (config -> 'run' ->> 'run_now_enabled')::boolean
                   from public.tenant_settings where single_row), false)
```

**Gap:** `config` has no `locale`, `tax` or `banking`/`cards` namespace yet, and nothing reads one.
Vendor choice is still `Deno.env.get("BANKSAPI_MODE")` (`supabase/functions/_shared/banksapi.ts:682`),
an environment variable, not a row — the one part of this claim that is real.

## 2. Vendor-prefixed bank columns

**Claim:** `banksapi_access_id` and friends leak a vendor's name into the schema; migrate to a
generic column plus a JSONB metadata field.

**Reality:** the rename is already decided and the target schema already has it.
`supabase/schema/RENAMES.md`:

> `bank_*.banksapi_*` → `provider_ref`, `provider_access_ref`, `provider_account_ref`,
> `provider_payment_ref`, `provider_user`, `provider_hash`

`supabase/schema/0006_bank.sql` already defines `bank_connections`/`bank_accounts`/
`bank_transactions` with `provider_ref`, `provider_access_ref`, `provider_account_ref`,
`provider_hash`, and a generic `metadata jsonb` / `raw_data jsonb` column each. `src/lib/data/types.ts`
already types `BankAccount`/`BankTransaction` with the generic names.

**Gap:** three call sites in `supabase/functions/_shared/mappers.ts` still write the old names
(`banksapi_access_id`, `banksapi_product_id`, `banksapi_hash`), and seven Edge Functions still read
and write them: `bank-connect`, `bank-callback`, `bank-disconnect`, `bank-sync`, `payment-initiate`,
`payment-callback`, plus `mappers.ts` itself. `bank-sync/index.ts` also names two unique-constraint
targets after the old columns (`connection_id,banksapi_product_id`, `account_id,banksapi_hash`) in
its `onConflict` strings. The schema and the frontend types already agree with each other; only the
Edge Functions still disagree with both.

**The same rename, on a table `RENAMES.md` doesn't mention.** `payment_orders` isn't a `bank_*`
table, but the schema already carries the identical rename on it — `provider_access_ref`,
`provider_account_ref`, `provider_payment_ref` — while `payment-initiate/index.ts` and
`payment-callback/index.ts` still read and write `banksapi_access_id`, `banksapi_product_id`,
`banksapi_payment_id`. `RENAMES.md`'s entry undersells its own scope: the rename it documents as
`bank_*.banksapi_*` actually reaches a table whose name doesn't start with `bank_` at all.

**Separately, and more serious than one more file to rename:** `bank-sync/index.ts`'s own comments
depend on two unique constraints — `bank_accounts_iban_uniq` and
`bank_accounts_connection_id_banksapi_product_id_key` — that govern real dedup logic (shared IBANs
across products, webform-retry duplicates, card products with no IBAN). **Neither exists anywhere
in `supabase/schema/`** (confirmed by grep, zero hits). Renaming the columns in this file's
`onConflict` strings would not fix it — Postgres rejects an upsert whose `onConflict` target has no
matching constraint under any name. This needs a real decision (restore the constraints under the
new names, or redesign the dedup logic) before `bank-sync.ts` can be touched; it is not a mechanical
rename like the other six files.

## 3. Flat `vat_rate`

**Claim:** a single flat field cannot express a multi-rate invoice (a hotel bill at 7% on the room,
19% on breakfast); replace it with a `TaxBreakdown` model.

**Reality:** the model already exists, unused. `supabase/schema/0004_documents.sql`:

```sql
create table if not exists public.document_taxes (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    rate numeric(5, 2),
    net numeric(14, 2),
    vat_amount numeric(14, 2),
    created_at timestamptz not null default now()
);
```

`document_line_items.vat_rate` carries the same idea per line. Both tables are registered in
`src/config/tables.ts` (`documentTaxes`, `documentLineItems`).

**Gap:** nothing outside `tables.ts` reads or writes either table. `documents.vat_rate` stays the
flat summary field it is today — `src/components/documents/badges.tsx:184-192` already documents
the limitation this causes. The fix is additive: wire `document_taxes` into extraction and display
for documents that actually carry more than one rate; `vat_rate` keeps answering the common
single-rate case, which most of the rules engine and the VAT-rules screen already assume.

**Refinement, found while scaling this past VAT:** `document_taxes` as it stands (`rate`, `net`,
`vat_amount`) cannot distinguish two taxes that share a rate — GST + PST, or a federal/provincial
split at an identical percentage. A true any-country model needs one more column, `component`
(nullable text), to name which tax a row is when the rate alone is not unique. See `02-mechanism.md`.

## 4. `Pleo*` types inside the core data layer

**Claim:** vendor-specific types should live behind an adapter, not in shared domain files.

**Reality:** confirmed, real. `src/data/bank/bank.ts:159-186` defines `PleoSpender` and
`PleoEmployee` directly, imported onward through `src/data/bank/index.ts`. `BanksapiState`
(`src/components/bank/banksapi-state.ts`) is a smaller instance of the same thing, naming the
vendor in a UI-layer type for what is really a three-state connection badge.

**No DB-level gap.** `bank_transactions.source` is already a generic provenance column
(`'banksapi' | 'pleo' | ...`), so the rows themselves do not name a vendor in their shape — only the
frontend's derived TypeScript types do.

## 5. Env-based vendor switch

**Claim:** `BANKSAPI_MODE` should be a database setting, resolved at the point of use, not an
environment variable baked in at deploy time.

**Reality:** confirmed, real, and it is the one finding with no existing schema support at all —
see gap in finding 1. `supabase/functions/_shared/banksapi.ts:682`:

```ts
export function getBanksapi(): BanksapiWrapper {
  const mode = (Deno.env.get("BANKSAPI_MODE") ?? "mock").toLowerCase();
  return mode === "live" ? liveWrapper() : mockWrapper();
}
```

This mock/live switch is a different axis from vendor choice (BANKSapi vs. a future aggregator) and
should stay separate: `mock`/`live` picks which implementation of *the same* vendor answers calls
for testing; a `tenant_settings.config.banking.provider` key picks *which* vendor. Collapsing the
two would make "turn on sandbox for testing" and "the client switched banking providers" the same
kind of change, and they are not.

## 6. No compile-time guard against this whole bug class

Not one of the five original claims — found while fixing finding 2. There is no ORM anywhere in
this stack. Every Edge Function calls `supabase-js` with raw strings
(`db.from(table).select("banksapi_access_id, ...")`), and per `CLAUDE.md` the generated `Database`
type covers 7 of 65 tables. So a column renamed in `supabase/schema/` but not in an Edge Function —
exactly what happened to `bank_connections`, `bank_accounts`, `bank_transactions` and
`payment_orders` — compiles clean and only fails at request time, in production, as a Postgres
error with no red flag anywhere before that. `src/config/tables.ts` solves this for *table* names
(a renamed table breaks the build); nothing solves it for *column* names inside a `select(...)`
string or an `onConflict` target.

This is bigger than Phase C. Fixing the four known occurrences doesn't prevent a fifth from being
written tomorrow. Worth its own decision, separate from the phases below: either extend the
generated `Database` type's coverage so these selects can be typed, or accept the risk and rely on
grep-before-rename discipline the way this audit just did it.

## 7. `normalize.ts` hardcodes German prose in business logic — RESOLVED

Found while fixing finding 2's locale work. `ParseIssue.reason` was a German sentence built inline
(`"Buchungstag fehlt oder unlesbar (...)"`) inside `src/lib/bank-import/normalize.ts`, not read from
`src/lib/i18n/locales/*`. The unused `src/kit/lib/bank-import/` copy of the same file already had the
right shape — `code: ParseIssueCode` + `rawValue: string` — letting the UI translate instead of the
parser dictating the language.

Not an active bug: the one consumer, `manual-import-preview-step.tsx`, only ever rendered a
translated issue *count*, never `.reason` itself. Still fixed, since the field's shape
(`rowIndex` + a message) only makes sense if a per-row detail view was intended, and that view would
have shipped German text regardless of locale. Changed `ParseIssue` to the kit's `code`/`rawValue`
shape, added `bank.manualImport.preview.issueCode.*` keys to both locale files, `normalize.ts`
updated to push codes. Typecheck and lint clean.

## 8. Three live bugs, found only by actually running `bank-sync` — RESOLVED

Not reachable by typecheck, lint, or `deno check` — all three are column/function-body mismatches
against the real schema that only fail at request time against a real Postgres database, exactly
the risk finding 6 describes. Found by applying `supabase/schema/` to a genuinely empty local
database and invoking `bank-sync` against the mock provider for real.

- **`mappers.ts::connectionRow()` wrote `provider_id`.** `bank_connections` has no such column —
  only `bank_provider_id` (a FK, different type) and `provider_ref` (text). Fixed to write
  `provider_ref`, matching what `access.providerId` actually is.
- **`set_bank_account_connect_route()`'s trigger body still said `new.provider_id`**, left over from
  before `bank_accounts.provider_id` (a FK) became `provider_ref` (text). It also joined
  `bank_providers p where p.id = new.provider_id`; corrected to `p.provider_ref = new.provider_ref`,
  the column `bank_providers` actually carries for this. In `supabase/schema/0011_functions.sql`.
- **`bank_transactions_provider_hash` was a partial unique index** (`where provider_hash is not
  null`). PostgREST's `upsert(..., { onConflict })` can only target a full unique index/constraint,
  not a partial one with a predicate — so finding 2's own fix (`onConflict: "provider_hash"`) was
  syntactically right and still failed at the database. Dropped the partial clause; standard SQL
  already treats every `NULL` as distinct from every other `NULL`; in a unique index, so dropping
  `where provider_hash is not null` changes nothing about how many `NULL` rows are allowed — it only
  removes the index's incompatibility with `onConflict`. In `supabase/schema/0006_bank.sql`.

**Two more, found testing `payment-initiate`/`payment-callback` the same way, both fixed:**
- `payment-initiate/index.ts` checked `invoice.workflow_status !== "freigegeben_vorgesetzter"` — a
  value the current `documents_workflow_status_known` constraint doesn't even allow. Every payment
  would have been refused, permanently, against this schema. Fixed to `"approved_final"`.
- The same function wrote `initiated_by: actor` where `actor` is the caller's email string, into
  `payment_orders.initiated_by`, a `uuid` FK to `app_users.id`. Fixed to `caller.id` (already
  resolved correctly earlier in the same function via `requirePaymentRight`, just not reused here).
- `supabase/config.toml` had `[functions.bank-callback] verify_jwt = false` but no matching entry
  for `payment-callback`, even though that function's own header comment says it's public for the
  same reason. Confirmed by testing: Kong rejected the request before the function ever ran. Added
  the missing `[functions.payment-callback]` entry.

## 9. The workflow-status i18n keys never followed the English rename — found, not yet fixed

`src/lib/data/format.ts`'s own code (`workflowLabelDe`, and its comment describing how the live UI
looks the status up via `useTranslation`) expects i18n keys named after the English
`workflow_status` enum (`documents.workflow.approved_final`). The actual keys stored in both
`src/lib/i18n/locales/en.ts` and `de.ts` are still the pre-rename German names — `eingegangen`,
`in_pruefung`, `rueckfrage`, `freigegeben_assistenz`, `freigegeben_vorgesetzter`, `bezahlt` — across
at least five separate key blocks (badges, history list, tooltips, action hints). Confirmed by
grep: zero occurrences of `"approved_final"` anywhere in `en.ts`. Since i18next falls back to the
raw key string when a key is missing, every workflow status badge in the app, and the persisted
audit-trail label (`workflowLabelDe`), currently renders the literal English enum value instead of
a translated label. Roughly 30-40 key renames across both files to fix properly — found via the
same payment-initiate/payment-callback testing session that found finding 8's bugs, deferred rather
than fixed in the same pass so it could be scoped and sequenced deliberately.

**Proven, not just fixed:** `bank-sync` run three times in a row against the mock provider —
`accounts: 2` stable across all three, `transactions_new: 5` then `0` then `0`, zero duplicate
`(connection_id, provider_account_ref)` pairs in the actual table afterward. The dedup rewrite from
finding 2 holds under a real repeated sync, not just under typecheck.
