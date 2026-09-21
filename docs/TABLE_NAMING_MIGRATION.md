# Table naming migration

Moving this Hub's database onto the vocabulary the book-keeping pipeline and its admin panel use:
`invoices` becomes `documents`, and nine other tables and five columns move with it.

Status: **APPLIED to the live database on 16.09.2026.** The Hub, the Edge Functions and the
pipeline all speak the new vocabulary. What is left is the bucket move, which is optional and
independent. The app and the
Edge Functions now name every table through one constant, which is a runtime-identical change. No
migration has been written and no database object has changed.

## Why

The panel provisions a tenant database with English names and queries `public.channels`,
`public.categories` and `public.tenant_settings` by name. It refuses to provision a database
holding tables it did not create, and stands that refusal down only once one of its own steps is
recorded in `public.schema_migrations`. this Hub has no such ledger yet (inventory section 9), so
the panel cannot set this client up at all.

The pipeline itself does not care. `book-keeping/src/adapters/db/schema_translation.py` wraps the
connection in a translating cursor, so it runs against either vocabulary.

ANOTHER CLIENT did this on 14 and 15 September 2026. Its write-up, `docs/another client's migration note`, is the
source for the traps listed here and is worth reading in full before the next client.

## The name map

From `book-keeping/src/adapters/db/schema_translation.py` (`LEGACY_TO_ENGLISH`). Keep the two in
step. Confirmed against the live schema, inventory section 1.

| was | becomes | present here |
| --- | --- | --- |
| invoices | documents | yes |
| invoice_files | document_files | yes |
| invoice_history | document_history | yes |
| invoice_line_items | document_line_items | yes |
| invoice_tax | document_taxes | yes |
| invoice_bank_accounts | document_bank_accounts | yes |
| imported_messages | imported_items | yes |
| folder_bookmarks | read_cursors | yes |
| bwa_categories | categories | yes |
| bwa_category_aliases | category_aliases | yes |
| receipt_channels | channels | **no, leave it out** |
| receipt_channel_folders | channel_folders | **no, leave it out** |

No target name exists yet, so there is no collision.

The two absent ones are the difference from ANOTHER CLIENT: this Hub has no channel tables. Ingestion
runs through `mail_settings` and the `ingest` Edge Function. `config/tenants/this Hub.json` in
book-keeping sets `storage.channel_config: "channels"`, which
`composition/registry/channel_config_sources.py` maps from `mail_settings`. **Open question:** how
the pipeline reads channels for this client, and whether the panel will want the channel tables
created separately.

### Columns

14 renames across 11 tables, read from `information_schema` rather than assumed. ANOTHER CLIENT's
hand-written draft got this wrong in six places, so this list is generated, not typed.

```
alter table public.bwa_categories              rename column name_de           to name;
alter table public.imported_messages           rename column gmail_message_id  to source_item_id;
alter table public.imported_messages           rename column invoice_id        to document_id;
alter table public.invoice_bank_accounts       rename column invoice_id        to document_id;
alter table public.invoice_files               rename column invoice_id        to document_id;
alter table public.invoice_history             rename column invoice_id        to document_id;
alter table public.invoice_line_items          rename column invoice_id        to document_id;
alter table public.invoice_tax                 rename column invoice_id        to document_id;
alter table public.invoice_transaction_matches rename column invoice_id        to document_id;
alter table public.invoices                    rename column gmail_message_id  to source_item_id;
alter table public.payment_orders              rename column invoice_id        to document_id;
alter table public.pipeline_runs               rename column ki_used           to ai_calls;
alter table public.processing_log              rename column gmail_message_id  to source_item_id;
alter table public.processing_log              rename column invoice_id        to document_id;
```

Note what is NOT here, against ANOTHER CLIENT's list: `bwa_category_aliases` has no `name_de`, and
`invoice_open_items`, `private_reclassifications` and `sharepoint_filing_failures` do not exist in
this database. `vermerk` exists nowhere. Do not copy ANOTHER CLIENT's statements across.

## Step 1: the snapshot (done)

`scripts/dump-live-schema.sh`, read only. Writes to `supabase/_backup/rename-snapshot/<UTC stamp>/`
with a `latest` symlink. `.gitignore` already covers `supabase/_backup/`.

It exists because nothing in the repo describes this database correctly: `supabase/schema.sql` is a
German-era snapshot (`belege`, `lieferanten`), `src/integrations/supabase/types.ts` is 17 KB and
partial (`CLAUDE.md` wrongly calls it empty), and no migration here creates the pipeline's own
tables.

It uses `supabase db dump`, not the local `pg_dump`, which is version 16 against a newer server.

Snapshot taken 16.09.2026, `20260916T073545Z`. Baseline for the before-and-after proof:

| | count |
| --- | --- |
| functions | 237 |
| triggers | 53 |
| rls_policies | 118 |
| foreign_keys | 81 |
| views | 11 |
| tables | 63 |

## Step 2: the inventory and the classification (done)

`scripts/one-off/2026-09-16-rename-inventory.sql`, nine sections, all SELECTs, safe on live. Output
at `supabase/_backup/rename-snapshot/latest/inventory.txt`.

Two things it had to work around, both worth knowing if it is re-run: psql parses quoting inside
`\echo`, so an apostrophe in the note text is a syntax error, and `pg_get_functiondef` raises on an
aggregate, of which `public` holds four, so the `prokind = 'f'` filter sits in a MATERIALIZED CTE
where the planner cannot reorder it.

### Views: 11, of which 8 name a renamed word

All come down and go back up, in dependency order. `CREATE OR REPLACE VIEW` cannot rename a view's
own output columns.

- `v_invoices_review` and `v_invoices_search` both read `v_invoices_list`. Drop those two first.
- `v_trash` reads `v_trash_base`. Drop `v_trash` first.
- `v_customer_invoice_totals`, `v_supplier_duplicates` and `v_trash` name nothing renamed, but
  `v_trash` still has to come down because what it reads does.

`v_invoices_search` is not in any repo migration. It is another reason the dump is the only source.

### Functions: 35 to recreate, 0 to drop

A function body is stored as source and does not follow a rename. All 35 need recreating.

Unlike ANOTHER CLIENT, **no signature moves**: no OUT parameter and no RETURNS TABLE column carries a
renamed word, so `CREATE OR REPLACE` works for every one and nothing has to be dropped first. That
removes the trap where dropping indiscriminately took `has_module_access` with it.

### The string classification

`scripts/classify-rename-strings.ts` over the dump, then every row read by hand. 30 occurrences.
Worksheet at `supabase/_backup/rename-snapshot/latest/classification-worksheet.md`.

**Leave alone (8).** Permission scopes, confirmed against the catalogue in inventory section 7,
which holds exactly these six keys:

```
invoices.approve  invoices.approve_final  invoices.assign
invoices.book     invoices.override_workflow  invoices.pay
```

They appear in `enforce_invoice_write_permissions` (6), `enforce_match_payment_permission` (1) and
the `payment_orders_insert` RLS policy (1). Renaming one makes every policy behind it deny
everyone.

**This is the this Hub-specific trap.** ANOTHER CLIENT's permission module was the exact string
`'invoices'`, separable by equality. this Hub's scopes are dotted, so a `\binvoices\b` regex matches
*inside* every one of them, because a full stop is a word boundary. Never run a blind word
replacement over this schema.

**Rename (6), table names used as data:**

| where | literal |
| --- | --- |
| `purge_record` | `invoices` |
| `trash_eligible_tables` | `invoices`, `bwa_categories` |
| `trash_purge_eligible_tables` | `invoices` |
| `v_trash_base` | `invoices`, `bwa_categories` (emitted as `::text AS table_name`) |

**Rename (2), jsonb keys the Hub reads back:** `invoice_id` built in `notify_event_from_history`
and in `send_notification`. The Hub reads `payload.document_id`
(`src/lib/data/use-notification-items.ts`), so the trigger must emit the new key and the rows
already written need updating. `notification_events` holds **10 rows** with an `invoice_id` key.

The classifier labelled the `send_notification` one UNKNOWN because its `jsonb_build_object` sits
more than three lines above. That is the tool declining to guess, and it is correct behaviour.

**Cosmetic (14).** Column and function comments mentioning an old name. Safe to skip.

### Rows holding a table name

`change_history.table_name` holds **no rows** naming any table in the rename set (only
`app_users`, `approvers`, `filename_settings`, `ingest_exclusions`, `manual_bookings`,
`opos_whitelist_rules`, `role_permissions`). The UPDATE statements are therefore a no-op today, but
they stay in the migration: rows can appear between now and the cutover.

### Storage

Four buckets. Invoice file rows point at **two** of them, which ANOTHER CLIENT did not have to deal with:

| bucket | file rows |
| --- | --- |
| receipts | 2738 |
| belege-files | 5 |

`config/tenants/this Hub.json` has `archive_bucket: "receipts"` and the upload channel on
`bucket: "receipts"`. `supabase/functions/pleo-receipts/index.ts:21` hardcodes `const BUCKET =
"receipts"`. A bucket cannot be renamed, so moving to `documents` is a copy job. `belege-files` and
its 5 rows need a decision of their own.

## Step 3: one home for every table name (done)

`src/lib/data/tables.ts` holds all 74 tables and views.
`supabase/functions/_shared/tables.ts` is the Deno copy, 28 names, because Edge Functions cannot
import from `src/`. **The two are kept in step by hand and a rename touches both.**

### The key is the new name, the value is the old one

```ts
documents: "invoices",
//  ^ what the code says    ^ what PostgREST is sent
```

The app and the functions already speak the bookkeeping vocabulary. The database has not moved.
When the migration runs, **only the right-hand side of ten pairs changes**, in these two files, and
no *table* call site is touched a second time.

**Correction (cutover, 16.09.2026): that covers table names only.** The four renamed COLUMNS were
never centralised, because there is nowhere natural to put them: they appear inside PostgREST
select strings, domain types and payload keys, not behind one constant. The cutover therefore also
needed a 156-reference sweep across 30 files. See "Step 3b" below. Plan for that on the next
client rather than being surprised by it.

The ten mid-move pairs:

| key (the code) | value (the database, today) |
| --- | --- |
| documents | invoices |
| documentFiles | invoice_files |
| documentHistory | invoice_history |
| documentLineItems | invoice_line_items |
| documentTaxes | invoice_tax |
| documentBankAccounts | invoice_bank_accounts |
| importedItems | imported_messages |
| readCursors | folder_bookmarks |
| categories | bwa_categories |
| categoryAliases | bwa_category_aliases |

Everywhere else the two sides already agree.

**Nothing else moves, and the set was checked against two independent sources**, not just the
rename map:

- `book-keeping/schema/0001` to `0005`, the DDL a new tenant is provisioned with. Every name it
  shares with this Hub now matches a key here.
- ANOTHER CLIENT's own `src/lib/data/tables.ts`, which is already post-migration, so its keys are the
  target vocabulary. It still spells `invoiceTransactionMatches`, `invoiceOpenItems`,
  `outgoingInvoices`, `bwaAccountMapping`, `processingLog`, `pipelineRuns` and every `v_*` view
  unchanged, which is why those keep their names here too.

Names that look like they should move but do not: `invoiceTransactionMatches`, the
`outgoingInvoice*` tables, `bwaAccountMapping`, and all 11 views.

**431 table references across 39 files** now go through the constant, and 83 of them were then
moved onto the new key names:

- 387 `.from("x")` call sites
- 27 PostgREST embedded resources inside select strings (`invoices!inner(id)`, `customers(*)`,
  `app_users!bank_connections_connected_by_fkey(...)`), converted to template literals
- the filters that reference an embed by name (`.is("invoice_files.deleted_at", null)`)
- table names used as data: `src/routes/papierkorb/index.tsx` (`record.table_name === TABLE.invoices`)
  and the exclusion-preview source in `src/lib/data/queries.ts`

### Proof it changed nothing

`bun run typecheck` and `bun run build` pass. Beyond that, a check resolves every `TABLE.x` and
`${TABLE.x}` in the new source back to its string and compares the result against the committed
version, file by file: **431 references, 0 differences.** Whatever each file sent to PostgREST
before, it sends now.

`bun run lint` reports 24 errors in `vite.config.ts`. That file is untouched by this work and
already failed `prettier --check` on `dev`, so the failure predates the change. Every file this
pass touched is lint clean.

### Two things found on the way

**`v_bank_transactions_list` does not exist on this database.** Migration
`0066_hub_view_security_invoker.sql` says it "only ever existed on a sister Hub's live database", and
the live schema confirms it. Two call sites ask for it and fail against PostgREST today:
`src/lib/data/queries.ts` (the bank reconciliation KPI tile, `has_suggested_match` count) and
`supabase/functions/notify-dispatch/index.ts`. They are kept working exactly as before through a
separate `MISSING_TABLE` constant, which names the problem instead of hiding it. **This needs a
decision of its own: create the view, or drop the two call sites.** It is not part of the rename.

**The type checker earned its keep already.** A first pass wrote `TABLE.vBankTransactionsList` for
the phantom view and `tsc` rejected it, which is the exact benefit this step is for: a name that is
not there fails to compile instead of 404-ing in production.

## Step 4: the migration (written, not applied)

`supabase/migrations/20260916120000_english_table_names.sql`, 3076 lines, and its rollback
`20260916120001_english_table_names_rollback.sql.txt`, kept as `.txt` so it cannot run by accident.

**Both are generated** by `scripts/generate-rename-migration.ts` from the snapshot, never written
by hand. Re-run it if the schema moves before the migration is applied. Every count it emits
matches the inventory: 10 tables, 14 columns, 11 views, 35 functions.

Seven sections: the tables, the columns, the views down, the functions, the views back up, the
table names stored as data, the panel ledger. It ends outside the transaction with
`notify pgrst, 'reload schema'`.

The generator masks the six permission scopes **as bare tokens, not only quoted ones**, because
they also appear unquoted in code comments ("requires invoices.book"). None of the six suffixes is
a real column on `invoices`, checked against `information_schema`, so masking the bare token cannot
hide a genuine `table.column` reference. Verified in the output: 9 scope occurrences intact, 0
renamed.

Audited by section, the only surviving old names are the rename sources themselves (section 1 and
2) and the `where table_name = ...` clauses in section 6. **Sections 4 and 5 contain none**, which
is the proof the rewrite reached every function body and view definition.

The rollback carries the previous function and view definitions verbatim, taken from the same dump,
rather than a note asking somebody to find them. It clears the ledger rows but leaves the empty
`schema_migrations` table, which is harmless: the panel reads "no recorded steps" as not set up.

## Step 5: the rehearsal (done, passed)

Two databases loaded from the same snapshot into a throwaway `pgvector/pgvector:pg17` container,
one migrated and one left alone. Not `supabase start`, which replays all 240 migrations into an
empty database and will not survive it.

The snapshot needs a small prelude to load standalone: the four roles (`anon`, `authenticated`,
`service_role`, `postgres`), an `auth` schema with `uid()`, `jwt()` and `users`, and the `vector`
extension. With that, it loads with **0 errors**.

### What the rehearsal caught

**A dependency that would have failed the migration on the live database.**
`is_direct_debit(v_invoices_review)` takes the view's row type as a parameter, the PostgREST
computed-field pattern. Postgres refuses to drop a view while such a function exists:

```
ERROR: cannot drop view v_invoices_review because other objects depend on it
DETAIL: function is_direct_debit(v_invoices_review) depends on type v_invoices_review
```

The generator now drops it before the views and puts it back with them, with its owner and grants.
`drop view ... cascade` would also have "worked" and silently taken the function with it.

### Result

| object | before | after |
| --- | --- | --- |
| functions | 237 | 237 |
| triggers | 53 | 53 |
| rls policies | 118 | 118 |
| foreign keys | 81 | 81 |
| views | 11 | 11 |
| tables | 63 | 64 |

The one extra table is the panel's ledger. Diffing the table lists shows exactly the 10 renames
plus `schema_migrations`, nothing lost and nothing else added.

Functional checks on the migrated copy:

- all 11 views execute
- `has_permission('invoices.pay')` returns **false rather than raising**, so the permission scope
  survived
- `trash_eligible_tables()` returns `documents` and `categories`, so the table names stored as data
  were rewritten
- the ledger recorded `0003_master_data` and `0004_documents`, the same two as ANOTHER CLIENT
- both `is_direct_debit` overloads are back
- zero old table names remain

**The rollback was tested as a round trip.** Applied on top of the migrated copy it returns the
schema to the control exactly: columns, foreign keys, functions, policies, triggers and views all
identical, with only the empty ledger table left behind.

## The pipeline branch decides the cutover (16.09.2026)

The rename does not work against every branch of `book-keeping`. Checked with `git diff dev
onboarding-v3`:

| | `dev` | `onboarding-v3` |
| --- | --- | --- |
| `src/adapters/db/schema_translation.py` | **does not exist** | 17-entry `LEGACY_TO_ENGLISH` + translating cursor |
| `ENGLISH_SCHEMAS` in `registry/manifest.py` | **not present** | `("documents",)` |
| `schema/0001` to `0005` provisioning DDL | **does not exist** | present, 386 lines |
| `this Hub.json` `storage.channel_config` | `mail_settings` | `channels` |
| `this Hub.json` `naming_settings_from_hub` | `true` | absent |

**ANSWERED 16.09.2026: the server runs `onboarding-v3`.** So the translating cursor is there and
the rename is viable. `CLAUDE.md` in this repo still says the pipeline runs `dev`; that is stale
and should be corrected.

It mattered because `dev` has no translation layer at all and names `public.invoices` literally.
Had the host been on `dev`, renaming the tables would have broken every run with **no config
change able to repair it**, since that branch has never heard of `documents`.

### The channels question, answered

Earlier this doc asked how the pipeline reads channels for this Hub. The branches disagree:

- `dev` sets `channel_config: "mail_settings"`, which matches the database, where `mail_settings`
  exists and `channels` does not.
- `onboarding-v3` sets `channel_config: "channels"`, and its `CHANNEL_CONFIG` registry has exactly
  one entry, `channels -> adapters.db.channels`. `channel_config_sources.RENAMED` maps the old
  `mail_settings` name onto that same module, so there is no `mail_settings` reader left.
- That module opens with `select to_regclass('public.channels')`, so it degrades rather than
  crashing, but this Hub has no such table and would offer no sources.

**In practice this is not broken.** `onboarding-v3` is what the server runs, and
`public.pipeline_runs` shows real work over the last 14 days: the mailbox source processed 43
documents and the upload source 9, most recently 15.09.2026. So sources are resolving from
somewhere despite there being no `channels` table, and provisioning the channel tables is not a
prerequisite for the rename. Worth understanding before the panel is pointed at this client, but
it does not block the cutover.

## Step 7: the column gap (measured and cleared)

A rename moves tables, not columns. Comparing the live schema against `onboarding-v3`'s
provisioning DDL, mapped through the rename so both sides speak the target vocabulary:

**Seven tables a new tenant gets that this Hub does not have at all:** `channels`, `channel_state`,
`channel_folders`, `credentials`, `credential_reads`, `tenant_settings`,
`tenant_settings_history`.

**Eight tables present but short of columns:**

| table | columns a new client gets that this Hub lacks |
| --- | --- |
| documents | content_hash, document_types, drive_named_at, llm_calls, llm_input_tokens, llm_output_tokens, note, private_hold, rules_version |
| document_files | content, web_url |
| imported_items | created_at, id |
| companies | filing_binding |
| properties | filing_binding |
| suppliers | fax, website |
| document_bank_accounts | created_at |
| supplier_bank_accounts | created_at |

this Hub also has 89 columns across 15 tables that the DDL does not create. Those are local
features, not a gap.

### Verdict: nothing here breaks a run

Every missing column was checked against the pipeline's actual write path. **None of them can
raise for this tenant.** The gap costs data that is never recorded, not a failed run, so it does
not block the cutover.

| what is missing | why it is safe |
| --- | --- |
| the 9 `documents` columns | both write paths call `_only_columns_this_schema_has` (`receipt_store.py:1908` and `:2494`), which drops fields this Hub's table does not have. Its own docstring says so. |
| `document_files.content` | no insert ever names it. this Hub dropped it deliberately in migration 0023 when the bytes moved to Storage. |
| `document_files.web_url` | guarded: `if web_url and self._has_column("invoice_files", "web_url")` (`:691`) |
| `imported_items.id`, `created_at` | the inserts name an explicit column list (`:1870`, `:1926`) and neither appears in it |
| `suppliers.fax`, `website` | guarded by `_has_column("suppliers", column)` (`:1167`) |
| `companies`/`properties.filing_binding` | only read by `adapters/outbound/filing_targets.py`, selected through the `filing_targets` config key, which this Hub leaves empty |
| `documents.drive_named_at` | only written by `mark_renamed()`, reached from the `rename` stage. this Hub runs `file, return_not_relevant, bank_sync, datev_bounce, track`. No `rename`. |
| `document_bank_accounts`/`supplier_bank_accounts.created_at` | those inserts name explicit column lists that do not include it |

`private_hold` deserved a second look, since it decides whether private post is held back. this Hub
has no equivalent column under any name and the Hub never references it, so the feature is simply
not in use here.

**Correction (16.09.2026): do NOT add them.** An earlier draft of this section said the `llm_*`
counters and `content_hash` were worth adding later for the token spend and for dedup. Checked
properly, they would be dead columns here.

`registry/db_schemas.py` maps `"documents": _invoices`, so this tenant runs
`adapters/db/receipt_store.py` (`PostgresReceiptStore`), the same store the old `invoices` schema
used, with the translating cursor switched on. The `llm_calls`, `llm_input_tokens` and
`llm_output_tokens` writes live in `incoming_receipt_store.py`, which serves the separate
`incoming_receipts` schema and never runs for this Hub. The same goes for the `content_hash` dedup:
`duplicate_detection.find()` is called from that store and queries
`incoming_receipts.content_sha256`, a table and column that do not exist here at all.

So the provisioning DDL creates columns that only one of the two stores fills. Adding them to this
database would record nothing. **Before adding any column from the gap list, check which store the
tenant's `storage.database` resolves to.**

## The four open decisions, settled 16.09.2026

| question | answer | what it turned into |
| --- | --- | --- |
| pipeline branch on the server | `onboarding-v3` | the rename is viable, no extra deploy needed |
| `v_bank_transactions_list` | create it | migration `20260916110000`, done |
| `invoice_tags` | rename it | **nothing to do, the table does not exist** |
| `belege-files` bucket | move it | script + migration `20260916140000`, done |

### `invoice_tags` does not exist

It was created by a repo migration at some point and dropped again since. Neither `invoice_tags`
nor `tags` is in the live schema, so there is nothing to rename. This is the repo-is-not-the-schema
trap once more: the migration history says the table was created, the database says otherwise.

### The missing view, created

`supabase/migrations/20260916110000_bank_transactions_list_view.sql` creates
`v_bank_transactions_list` from a sister Hub's own definition
(`0056_bank_transactions_suggested_match_filter.sql`), which is where the reading code came from.
`has_suggested_match` is `exists` over both match tables for a row with status `kandidat` or
`auto`, because `matching_status` only flips to `zugeordnet` once a match is confirmed and there
was otherwise no way to filter for "has a suggestion awaiting review".

**Created `with (security_invoker = true)` from the start.** Migration 0066 exists because this
exact view, without that option, ran as its superuser owner and showed one employee 1445
other-company bank transactions. It also adds the two partial indexes the predicate needs.

Rehearsed: applies clean on the snapshot, and the rename applies on top of it, so the two compose.
The view carries all 38 `bank_transactions` columns plus `has_suggested_match`, reports
`security_invoker=true`, and the query the Hub actually runs executes.

With the view real, `MISSING_TABLE` has been deleted. `vBankTransactionsList` is an ordinary entry
in both `tables.ts` files now.

### The bucket move

`scripts/move-buckets-to-documents.ts`, dry run unless given `--commit`, nothing ever deleted.

this Hub has **two** source buckets where ANOTHER CLIENT had one: `receipts` (2738 file rows, what the
pipeline writes) and `belege-files` (5, what the Hub's upload screen wrote). Both go to
`documents`. `outgoing-invoice-files` and `profile-pictures` stay put.

Because two sources can hold the same path, the script refuses to copy anything until such a clash
is resolved by hand, rather than silently overwriting one with the other.

`supabase/migrations/20260916140000_files_point_at_the_documents_bucket.sql` then points
`document_files.storage_bucket` and the storage policies at the new bucket. It checks that the
rename has run first. `belege-files` stays in the insert policy until the old buckets are deleted,
so an upload already in flight does not fail.

Two things it deliberately does NOT carry, because they live elsewhere: `archive_bucket` and the
upload channel's bucket in `config/tenants/this Hub.json`, and `BUCKET` in
`supabase/functions/pleo-receipts/index.ts`, which needs that function redeployed.

## Step 3b: the columns, which the table constant does not cover (done)

Flipping the ten values made `tsc` fail, which is how this surfaced: `src/integrations/supabase/types.ts`
still declared the old names, and behind it 156 references still said `invoice_id`.

Two things were needed:

1. **The generated types.** 33 occurrences renamed. The file declares 7 of 63 tables, so it catches
   only a fraction of the problem, but a stale name in it fails the typecheck. It now carries a
   header saying what it is and that it is partial. `CLAUDE.md` calling it "empty" is wrong.
2. **156 column references across 30 files**, renamed whole-word only:
   `invoice_id` to `document_id`, `gmail_message_id` to `source_item_id`, `name_de` to `name`,
   `ki_used` to `ai_calls`.

**Whole-word matching is what makes this safe.** `p_invoice_id` and `outgoing_invoice_id` keep
their names, because the underscore before the match is a word character so there is no boundary
there. That matters: RPC parameter names are not columns and the migration never renames them, so
renaming them in the app would break `resolve_approval_rule`, `link_invoice_transaction`,
`request_approval_ping` and `is_invoice_reconciled`. Verified afterwards: 2 `p_invoice_id` and 19
`outgoing_invoice_id` untouched, 0 old column names left.

`name_de` to `name` was checked for a collision first. `BwaCategory` has `name_de` and `name_en`
and no `name`, and `name_en` is a this Hub-only extra that the pipeline's DDL does not create, so it
stays.

Verified: typecheck, lint and build all pass, and every identifier the app names inside a query
string was checked against the post-rename schema from the rehearsal database. Eight came back
unknown and all eight are legitimate non-columns: five foreign-key hints for PostgREST embeds, two
embed aliases, and `is_direct_debit`, the computed field on `v_invoices_review`.

## The cutover, as it actually went (16.09.2026)

Applied with `supabase db push`. Migrations `20260916110000` and `20260916120000` went in;
`20260916140000` refused, by design, because the bucket copy has not run. It stays pending.

Verified against the live database afterwards:

| check | result |
| --- | --- |
| new table names | 10 of 10 |
| old names left | 0 |
| views executing | all 12, with real rows |
| `has_permission('invoices.pay')` | `false`, not an error |
| documents / document_files | 670 / 2,744 |
| categories / imported_items | 106 / 1,430 |
| tables carrying `document_id` | 9 |
| notification payloads still on `invoice_id` | 0 |
| `trash_eligible_tables()` | `documents`, `categories` |
| panel ledger | `0003_master_data`, `0004_documents` |

And through PostgREST with the browser's own key: `documents`, `document_files`, `categories`,
`imported_items` and `v_bank_transactions_list` all return 200, `invoices` returns 404. The schema
cache reloaded on its own from the `notify pgrst` at the end of the migration.

`v_bank_transactions_list` returns 3043 rows. It had never existed, so the bank reconciliation KPI
tile and notify-dispatch had been failing silently since they were written.

### What went wrong on the day

The Hub was deployed from `dev` before the migrations were applied, so the app ran against an
unmigrated database for a few minutes and every screen 404ed. The sequence assumed the migration
would go first. **On the next client, apply the migrations before the app deploy, or hold the
deploy until the push has finished.**

The other cause was mine: the plan said the app-side cutover was ten values in two files. That was
true of table names only, and the column sweep (step 3b) was not found until the typecheck failed
during the cutover itself. It should have been done days earlier, in the same pass as step 3.

## Still to do

6. **Cut over in one window:** Hub code flipped, migration applied, Edge Functions deployed, Hub
   deployed, then `storage.database` set from `invoices` to `documents` in
   `config/tenants/this Hub.json`. Step 5 is not optional: `ENGLISH_SCHEMAS` in
   `composition/registry/manifest.py` holds only `documents`, and `composition_root.py:41` wraps the
   translating cursor only when `speaks_english(cfg.storage.database)`. Left on `invoices`, every
   pipeline run fails.
7. **The column gap.** A rename moves tables, not columns. ANOTHER CLIENT found ten tables short of
   columns the provisioning DDL now creates, two of them load-bearing. Compare the live schema
   column by column against `book-keeping/schema/0001` to `0005` and write a second migration.
8. **The bucket move**, if `documents` is wanted here too.

## Open questions

- Does `invoice_tags` become `document_tags`? It is this Hub-only and carries the prefix, and the
  pipeline's map does not mention it.
- How does the pipeline read channels for this client, given `storage.channel_config: "channels"`
  and no channel tables in the database?
- What happens to `belege-files` and its 5 file rows.
- Whether the panel's `updateExistingTables` is the intended route for the column gap rather than a
  hand-written migration. ANOTHER CLIENT left this unsettled.

## Corrections to other docs, to make when this lands

- `CLAUDE.md` says the generated `Database` type is empty. It is not, it is partial.
- `CLAUDE.md` and `the pipeline's own documentation` describe the schema as pipeline-owned and read-only from
  here. This repo holds 240 migrations and applies them.
- `supabase/schema.sql` is a German-era snapshot and should be replaced with the real one.
