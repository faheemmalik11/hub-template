# Feature: Manual bank-transaction import (CSV / XLSX / PDF)

The third of three `bank_transactions` inflows. Reference for what the client asked for, what is
implemented, and what is still open.

> **Source:** `communication/threads/2026-08-04-scope-clarification/` (client thread, confirmed
> 2026-08-04) and `communication/work-log/2026-08-05-immonetz-vs-staey-differences.md` (item 5,
> listed this as unbuilt). See also `communication/work-log/2026-08-05-pleo-vs-banksapi.md` for
> the three-inflow model this feature completes.

> **TL;DR** — Bank transactions have three inflows into one table, `bank_transactions`,
> discriminated by `source` (`'banksapi' | 'pleo' | 'manual'`, migration `0071`). BANKSapi and
> Pleo were already built; this feature adds the third: **client-side CSV/XLSX parsing** with a
> column-mapping wizard, plus **AI-based PDF extraction** (§6 — added afterwards, once real files
> turned out to mostly be PDF statements rather than CSV/XLSX exports), feeding TanStack Start
> **server functions** (`src/lib/api/bank-manual-import.functions.ts`,
> `src/lib/api/bank-statement-ai.functions.ts`) that validate, classify, deduplicate and write the
> rows. **XML (CAMT.053) is not implemented yet** — the upload step accepts CSV/XLSX/PDF and shows
> a message that XML import is coming later. No real bank export files were available while
> building the CSV/XLSX path — the parser and column-guessing heuristics are built against the
> client's plain-English description, not verified samples.
>
> **Architecture note:** the first cut of this feature used a Supabase Edge Function
> (`supabase/functions/bank-manual-import`), matching how BANKSapi/Pleo integrate. That was
> replaced with an in-app server function before ever going live — it required a separate
> `supabase functions deploy` step that was easy to forget (and was in fact forgotten, causing the
> first real upload attempt to 404), where a TanStack Start `createServerFn` ships with the app's
> own build/deploy and needs nothing extra. See §3 for how it stays secure without that deploy step
> or new RLS policies.
>
> **Scope note:** PDF/AI extraction (§6) was never part of the client's original ask — they said
> "XML, CSV, or Excel." It was added because the files actually on hand turned out to be mostly
> PDF statements. It sends bank-statement content (IBANs, amounts, counterparty names) to OpenAI,
> a third-party US service — worth a deliberate client heads-up, not a silent addition. See §6 for
> the compliance/reliability caveats.

---

## 1. What was asked

> "We also need the option to upload account data for bank accounts that cannot be connected via
> BANKSapi, using XML, CSV, or Excel files, so that the transactions can be imported and processed
> accordingly." — `communication/threads/2026-08-04-scope-clarification/02-inbound-client.md`

The client confirmed the account/upload constraint explicitly (thread 4): a manual upload targets
one specific bank account (mirrored by `bank_accounts`), not just a company. They also flagged the
feature as reusable across their other projects.

Decisions made before implementation (see the plan this doc traces back to):

- No sample files were available → the parser had to be generic/flexible, not tuned to one bank's
  export format.
- The user picks (or creates) a specific `bank_accounts` row before uploading.
- The UI lives inside the existing `/banktransaktionen` page as a dialog, not a separate route.

## 2. Data model

- `bank_transactions.source` (`'banksapi' | 'pleo' | 'manual'`) and `.external_id` — migration
  `0071_transaction_sources.sql`. Unique index `(source, external_id) where external_id is not
null` is the dedup key for pleo/manual rows.
- `bank_accounts.provider_id = null` → `connect_route = 'ebics_or_manual'` via the trigger in
  migration `0028_pipeline_bank_providers.sql`. This is exactly the account set the import wizard
  offers — accounts BANKSapi cannot/does not reach.
- `bank_transactions.company_id` is auto-derived from `account_id → bank_accounts.company_id` by
  the trigger in migration `0025_pipeline_bank_transaction_company.sql`. Neither the RPC nor the
  Edge Function set `company_id` directly — setting `account_id` is enough.
- **Migration `0082_manual_bank_import.sql`** extends `upsert_external_transactions(p_rows jsonb)`
  (originally added in `0073`, previously pleo-only) to `upsert_external_transactions(p_rows
jsonb, p_account_id uuid default null)`. `p_account_id` applies to the whole batch (one upload =
  one account) and is `coalesce`d on conflict so a pleo re-sync (which never passes it) can never
  clear it. Also carries `counterparty_iban`/`counterparty_bic` through, which `0073` dropped
  silently — without it, manual rows could never benefit from IBAN-based auto-categorisation
  (`0069`) or the OPOS whitelist's `iban` scope (`0029`).
- `bank_accounts`/`bank_transactions` are `SELECT`-only for `authenticated` under RLS (migration
  `0059_hub_roles_access_trash.sql`, `bank_accounts_select`/`bank_transactions_select` policies,
  no `INSERT`/`UPDATE`). RLS was **not** widened to allow direct writes — both "create a manual
  account" and "import transactions" go through the server functions' service-role client instead
  (§3), the same choice already made for `src/lib/api/employees.functions.ts`.

## 3. Backend

**`src/lib/api/bank-manual-import.functions.ts`** (new) — two `createServerFn`s, following the
exact pattern already established by `employees.functions.ts` (service-role write + its own
explicit access check, `.middleware([requireSupabaseAuth])`, `AppError` subclasses on failure):

- `createManualBankAccount({company_id, account_name, iban, bic?, bank_name?})` — inserts a
  `bank_accounts` row (`is_own_account: true`, `provider_id: null`). Field rules and normalization
  are shared with the Bankkonten dialog via `src/lib/data/bank-account-fields.ts`, called here with
  `{requireCompany: true, requireIban: true}` — see `docs/BANK_ACCOUNT_FORM.md`. On the IBAN unique-constraint
  conflict (`bank_accounts_iban_uniq`, migration `0028`), returns `{ok: false, conflict: true,
existingAccount}` — a **returned discriminated result, not a thrown error** — so the frontend can
  offer "select it instead."
- `importManualBankTransactions({account_id, filename, rows})` — classifies each row's
  `transaction_type` via `classifyTransactionType()` (`src/lib/bank-import/classify.ts`, a
  line-for-line port of `supabase/functions/_shared/transaction-type.ts` — the same rules
  `bank-sync` uses, duplicated because Deno and this app's Node/Cloudflare server runtime can't
  share a module directly), computes `external_id` (§4), and upserts in batches of 500 through
  `upsert_external_transactions`.

**Parsing is 100% client-side.** Neither function ever receives a raw file — only rows the browser
has already parsed and column-mapped. They own everything that must not drift with a stale browser
tab: `external_id` synthesis, `transaction_type` classification, and hardcoding `source =
"manual"` (a client-supplied `source` is never trusted).

**Auth and authorization — no RLS change, no new policy.** `requireSupabaseAuth`
(`src/integrations/supabase/auth-middleware.ts`, already used by 5 other `.functions.ts` files —
confirmed live, not the dead code an earlier audit once flagged) verifies the caller's JWT and
exposes `context.claims`. The handler then uses `supabaseAdmin` (service-role, bypasses RLS) to do
the actual write — so it **must** re-authorize itself, since nothing else will. `checkCompanyAccess()`
replicates `has_company_access(p_company)`'s exact SQL semantics (migration 0059: deactivated
caller → deny; no grants recorded at all → unrestricted; otherwise require a live `can_view` grant
for that company) in application code, because the SQL function reads `auth.jwt()`, which is empty
under a service-role connection with no forwarded user session — calling it via the admin client
would silently answer "unrestricted" for everyone. This mirrors `employees.functions.ts`'s
`requireActiveAdmin` helper rather than inventing a new pattern.

**Why not just add an RLS INSERT policy instead?** That was considered and explicitly rejected —
service-role + an explicit in-function check is the pattern already proven and audited in this
codebase (`employees.functions.ts`), and it keeps `bank_accounts`/`bank_transactions` unable to be
written directly by any _other_ client code that forgets to check company access, whereas an RLS
policy alone can't validate the merge-safe upsert semantics `upsert_external_transactions` (0073)
exists specifically to protect (never overwriting `matching_status`, `category_id`, etc.).

## 4. `external_id` synthesis (dedup)

Computed server-side (not trusted from the client) in `assignExternalIds()`:

1. **Provider reference present** (reserved for a future CAMT.053 `AcctSvcrRef`/`NtryRef` — no
   CSV/XLSX format the wizard maps today produces one): `sha256(account_id + "|" + provider_ref)`.
2. **Otherwise** (every CSV/XLSX row today): the batch is **stably sorted** by
   `(booking_date, amount, currency, normalized payment_reference, normalized counterparty_iban,
normalized booking_text)`, and rows sharing that key are numbered `0, 1, 2, ...` within the
   sorted group. `external_id = sha256(account_id + date + amount + currency + reference + iban +
occurrence_index)`. Sorting first (not row order) means re-uploading the same file with rows in
   a different order still produces the same ids — genuinely idempotent.

**Known limitation, not solved:** two genuinely distinct transactions that share date, amount,
currency, reference and counterparty IBAN only dedup correctly if uploaded **together in one
batch**. Splitting them across two separate uploads can make the second upload's row collide with
`occurrence_index 0` from the first and silently update it instead of inserting a second row. The
preview step (`manual-import-preview-step.tsx`) flags same-batch look-alikes with a warning
banner (`findSuspectedDuplicates()`, `src/lib/bank-import/duplicates.ts`) so a user can eyeball
them before importing, but this does not close the cross-upload gap.

## 5. Frontend

**Parsing** — `src/lib/bank-import/` (pure logic, no React):

- `csv.ts` — `papaparse` (delimiter auto-detected: German exports mix `,`/`;`).
- `xlsx.ts` — `xlsx` (SheetJS "CE" build), **pinned to the exact version `0.18.5`** in
  `package.json` (no `^` range) rather than trusting `latest`, since SheetJS's npm-published
  builds have had provenance concerns in the past.
- `column-guess.ts` — keyword table pre-filling the mapping step from German header names
  (`"Buchungstag"→booking_date`, `"Betrag"→amount`, `"Verwendungszweck"→payment_reference`, …).
  Always user-editable, never authoritative on its own.
- `normalize.ts` — applies a confirmed `ColumnMapping` to parsed rows: flexible date parsing
  (ISO or `DD.MM.YYYY`/`DD.MM.YY`), flexible German/plain amount parsing (`"1.234,56"` and
  `"1234.56"` both handled, decimal separator inferred by whichever of `,`/`.` appears last), and
  a debit/credit column pair as an alternative to a single signed amount column.
  Unparseable rows are skipped and reported as `ParseIssue`s, never silently dropped.
- `mapping-storage.ts` — remembers a confirmed mapping in `localStorage`, keyed by a fingerprint
  of the header row, so a repeat upload from the same bank's export skips re-mapping.
- `duplicates.ts` — `findSuspectedDuplicates()`, the preview-step warning described in §4.
- **No CAMT.053/XML parser exists yet.** `parse-file.ts#detectFormat()` only recognizes
  `.csv`/`.txt`/`.xlsx`/`.xls`; the upload step's format hint tells the user XML import is coming
  in a later version.

**Wizard** — `src/components/bank/manual-import-*.tsx`, opened from a new "Manuell importieren"
button in `src/routes/banktransaktionen/index.tsx` (`ManualImportDialog`, next to the existing
BANKSapi sync/connect buttons). Five steps, state owned by `manual-import-dialog.tsx`:
`account → upload → mapping → preview → result`.

- `manual-import-account-step.tsx` / `manual-import-account-form.tsx` — pick an existing
  `connect_route === "ebics_or_manual"` account, or create one. This was long the only working way
  to create a `bank_accounts` row by hand: the Bankkonten dialog's own "Neues Konto" always failed
  on a `not null` `connection_id` until migration `20260901100000`. The form itself is now
  `BankAccountFormFields` (`docs/BANK_ACCOUNT_FORM.md`).
- `manual-import-upload-step.tsx` — drag-and-drop or file picker, format detected by extension.
- `manual-import-mapping-step.tsx` — column mapping (skipped entirely once XML lands, since
  CAMT.053 is schema-rigid and needs no user mapping).
- `manual-import-preview-step.tsx` — row/date-range/sum summary, skipped-row count (from the
  client-side normalize step — see the note below on where row validation now lives), the
  suspected-duplicate warning, a capped table preview (first 100 rows). Each row has a remove
  button (a trash icon, last column) — removing a row here means it is simply never sent to the
  import call, nothing is written for it. Local `useState` holds the working row list, seeded from
  `result.rows` on mount; `onImport` receives that (possibly-trimmed) list rather than the
  original.
- `manual-import-result.tsx` — inserted/updated counts.

**Hooks** — `src/lib/data/queries.ts`: `useCreateManualBankAccount()` (resolves to
`CreateManualBankAccountResult | CreateManualBankAccountConflict` — the caller checks `.ok`, no
thrown error for the conflict case) and `useManualBankImport()` (invalidates
`bank_transactions`/`bank_transactions_page` via the existing `invalidateMatchState()` helper, plus
`bank_accounts`/`bank_sync_logs*`). Both call the server functions directly
(`createManualBankAccountFn({data: body})`), same shape as the existing `useCreateEmployee()`.

**Note on row validation:** the Edge Function version individually skipped and counted malformed
rows server-side. The server function instead validates the whole batch with a zod schema
(`ImportManualTransactionsSchema`) and rejects the request outright if any row is malformed —
consistent with every other endpoint in this codebase (`staey-backend-api`'s mandatory-validation
convention). This is safe because row-level normalization/skipping already happens **client-side**
in `normalizeTable()` before the request is ever sent — by the time a row reaches the server it
should already be well-formed, so an all-or-nothing check here is a defense-in-depth boundary, not
the primary UX path (that's still the preview step's issue list).

All wizard copy is German, added under `bank.manualImport.*` in
`src/lib/i18n/locales/{de,en}.ts`.

## 6. PDF extraction via OpenAI

Real bank statements the client has on hand turned out to be mostly PDF, not CSV/XLSX exports —
this path fills that gap. It is a **separate, later addition**, not part of the original
client-confirmed scope (§1 only says "XML, CSV, or Excel").

**`src/lib/api/bank-statement-ai.functions.ts`** — one `createServerFn`,
`extractBankStatementFromPdf({filename, pdfBase64})`:

- Sends the PDF (base64 inline, capped at ~20MB decoded) to the **OpenAI Responses API**
  (`https://api.openai.com/v1/responses`, model from `OPENAI_MODEL` env, default `gpt-4.1`) as an
  `input_file` content part, alongside a prompt (`EXTRACTION_PROMPT`) describing exactly the
  fields and sign convention this app needs.
- Uses OpenAI **Structured Outputs** (`text.format: {type: "json_schema", strict: true}`) so the
  response is guaranteed to match `RESPONSE_SCHEMA` — `{statement_notes: string[], transactions:
[...]}`, one object per row with the same fields as `NormalizedRow` (`src/lib/bank-import/types.ts`)
  plus two things a deterministic CSV/XLSX parse never has to worry about: `confidence: "high" |
"low"` (a field WAS found but is uncertain — blurry scan, ambiguous layout) and
  `missing_fields: ExtractionField[]` (a field was NOT found in the source document at all).
  `booking_date`/`amount` are nullable in this schema specifically so the model can say "genuinely
  absent" instead of fabricating a plausible-looking value — every other required-field convention
  in this app (`NormalizedRow`, the CSV/XLSX validator) treats them as always-present, but an AI
  reading a real PDF needs an honest way to say it doesn't know.
- Re-validates the parsed JSON with a zod schema (`ExtractionResponseSchema`) before trusting it —
  defense-in-depth, since strict mode reduces but does not eliminate the chance of a malformed
  response.
- One code path handles both **digital (text) and scanned (image) PDFs** — the Responses API's
  file input reads both without the caller needing to distinguish them; no separate OCR/text-layer
  detection was built.
- Requires `OPENAI_API_KEY` (added directly to `.env`, same as `PLEO_API_KEY`/`BANKSAPI_API_KEY` —
  never sent to the browser, read server-side only).

**Frontend wiring** — `manual-import-upload-step.tsx` detects `.pdf` via
`detectFormat()` (`src/lib/bank-import/parse-file.ts`), reads the file as base64
(`src/lib/bank-import/file-to-base64.ts`), and calls the server function directly — **the mapping
step is skipped entirely** (the model already returns named fields, there are no raw columns to
map). `manual-import-dialog.tsx` tracks this via an `aiExtraction: {rows: AiExtractedRow[], notes}
| null` state field (`null` = a normal CSV/XLSX upload) and renders a COMPLETELY SEPARATE preview
component for it.

**AI preview step** (`manual-import-ai-preview-step.tsx`, distinct from the read-only
`manual-import-preview-step.tsx` the CSV/XLSX path uses) is **editable**: any cell whose field is
in that row's `missingFields` renders as an `<Input>` instead of plain text, pre-highlighted red.
Filling it in (validly) removes it from `missingFields` and clears the highlight; clearing it again
puts it back. Each row also has a remove button, same as the CSV/XLSX preview — an obviously wrong
AI-read row (or a duplicate, or one the user just doesn't want) is removed from the working list
entirely, not merely skipped, so it can never end up half-filled-in and imported by accident. The
"Importieren" button is disabled while any REMAINING row is still missing `booking_date`
or `amount` — those two are the only fields checked, matching the CSV/XLSX path's own required-
field set, so a statement missing e.g. `counterparty_iban` on every row (common for card payments)
never blocks import. Distinct warning banners stack independently: a red one for rows still
missing a required field (blocks import), an amber one for `confidence: "low"` rows OR rows with a
missing _optional_ field (informational only), and the existing amber duplicate-suspect banner —
three independent signals, never conflated into one. `statement_notes` render in a violet banner at
the top regardless.

**Deduplication** works unchanged for rows that end up with both `booking_date` and `amount` filled
in: PDF rows almost never have a bank-assigned reference the way CAMT.053 would, so they fall into
the same content-hash + occurrence-index fallback in `assignExternalIds()`
(`bank-manual-import.functions.ts`, §4) as plain CSV/XLSX rows. The AI preview step's own
`findSuspectedDuplicates()` call runs against a version of the edited rows with any still-null
`booking_date`/`amount` defaulted to `""`/`0` purely for the duplicate-hint computation — those
placeholder rows are also flagged red for missing-required anyway, so the duplicate hint on them is
moot; import is blocked either way until they're filled in.

**Known risks, not solved:**

- **Reliability.** AI extraction of numbers from a scanned or oddly-formatted statement can be
  wrong in ways a deterministic CSV parser cannot — a misread digit, a swapped sign, a merged row.
  The `confidence`/`statement_notes` signals and the preview step are the only safety net; there is
  no cross-check against a second extraction pass or a checksum/total-balance verification.
- **Compliance.** Every PDF uploaded here is sent to OpenAI. This has not been explicitly
  discussed with the client as a change from the original "structured file only" scope — flag it
  to them rather than treating this doc as sufficient sign-off.
- **Cost and latency.** No token/cost tracking exists; a long multi-page statement costs more and
  takes longer (up to the 120s timeout in the server function) than a short one, with no user-facing
  estimate beforehand.
- **Model drift.** `OPENAI_MODEL` defaults to `gpt-4.1` picked at the time this was built — verify
  it's still available/appropriate as OpenAI's lineup changes, and that Structured Outputs is still
  supported by whatever model is configured.

## 7. What's still open

- **No real client-provided export files were ever available.** Every parsing/column-guessing
  decision here is built against the client's plain-English description ("XML, CSV, or Excel"),
  not verified samples. Expect a follow-up pass — especially encoding (CSV parsing assumes UTF-8;
  German banks sometimes export Windows-1252/Latin-1) and column-name variants — once the client
  sends actual files.
- **CAMT.053 XML import is not implemented.** Deferred as a fast-follow since it's schema-rigid
  enough to add later without disturbing the CSV/XLSX path, and there was nothing to validate a
  parser against yet.
- **Cross-upload duplicate collision** (§4) is a known, unresolved edge case — flagged in the
  preview UI, not solved.
- **Large-file payload size** is untested against this app's server-function request-size limits
  (Cloudflare Workers, per `wrangler.json` in the build output) — a multi-year daily-transaction
  CSV could be several thousand rows sent as one request body. If this becomes a real problem, the
  wizard already knows the row count after parsing and could chunk the `import` call client-side.
- `docs/PIPELINE-OVERVIEW.md` §"Step 2 — Bank transactions + matching" still describes bank
  transactions as unbuilt ("Today: Nothing…") — stale from before BANKSapi/Pleo/this feature
  landed; not fixed as part of this change.
