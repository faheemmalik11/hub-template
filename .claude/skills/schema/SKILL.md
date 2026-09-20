---
name: schema
description: The database this Hub runs on. Load this before adding or changing a table, column, view, policy or migration, before naming anything in SQL, and before reading supabase/migrations (which no longer describe the schema). Covers the file set in supabase/schema, the naming laws, where each kind of thing belongs, and how a change is proved.
---

# The schema

`supabase/schema/` is the schema. Thirteen numbered files, applied in order into an empty database:
68 tables, 11 views and 310 functions. It was rebuilt on 17.09.2026 from a live dump, cleaned of one client's data
and vocabulary, and proved by applying the whole set to a fresh database.

`supabase/migrations/` is the **history of the Hub this template came from**, 248 files. Do not read
it to learn what exists, and do not add to it. It is kept because a question about why a column
exists is answered there, and nowhere else.

`RENAMES.md` beside the schema lists every name, column and stored value that changed, and what it
was before. Read it before touching `tables.ts` or migrating a client.

## The files, and what belongs in each

| File | Holds |
|---|---|
| `0000_common` | extensions and small helpers: `is_folder_path`, `normalized_name`, `set_updated_at` |
| `0001_identity` | roles, app_users, company access, the caller helpers, the protected-account guards |
| `0002_permissions` | the catalogue tree, role and per-person grants, `feature_settings`, the resolver |
| `0003_master_data` | companies, properties, suppliers and their accounts, customers, categories, aliases, VAT rates |
| `0004_documents` | documents, files, history, line items, taxes, bank accounts |
| `0005_sources` | channels, folders, cursors, runs, processing log, AI usage, filing, filenames, tenant settings |
| `0006_bank` | providers, connections, accounts, transactions, matches, payment orders |
| `0007_rules` | assignment, approval, approvers, handover, account mapping, review scoring |
| `0008_workspace` | outgoing invoices, notifications, audit trail, tours, assistant usage |
| `0009_search` | the generated search columns, and the one line that names a language |
| `0010_access` | row level security for every table |
| `0011_functions` | the functions the screens call, and the helpers those call in turn |
| `0012_views` | the views the screens read |
| `0013_scheduled_jobs` | what runs on a timer, per client, as rows |
| `0014_triggers` | what the database does by itself |
| `0015_server_permissions` | `person_may()`, for callers with no session |

A new table goes in the file for its subject, not at the end of the last one.

## The order is not a preference

Functions come before views, because a view that calls a function cannot be created without it,
while a function that reads a view can: its body is not validated until it runs. They reference each
other, so this is the only order that works. `0011_functions.sql` sets
`check_function_bodies = off` for the same reason.

A change proved only against the database you have been editing proves nothing about this: apply
the baseline to an EMPTY database, every time.

## The naming laws

1. **English everywhere, including stored values.** `workflow_status` is `received`, `in_review`,
   `approved_final`. `traffic_light` is `green`, `yellow`, `red`. The screen reads German because
   the locale file says so, never because the database does.
2. **No client name, ever.** Not in a column, a value, a comment or a seeded row.
3. **No vendor name in a column.** The aggregator is a row in `bank_providers` and a handful of
   `provider_*` references. A column called after one company is a fork waiting to happen.
4. **No country's jargon.** Not `bwa_`, not `datev_`, not `opos_`. Say what it does:
   `category_account_mapping`, `handover_batches`, `open_item_whitelist_rules`.
5. **British spelling for the words we chose ourselves**: `cost_centre`, `normalized_name` stays as
   it is because it mirrors an existing column.

## The access laws

- **Every table has row level security on.** A table with RLS and no policy denies everyone, which
  is the safe end to fail at. `credentials` is the one table deliberately left with no select policy.
- **Policies ask for an area capability, never a page.** The ten names are listed at the top of
  `0010_access.sql`: `documents.read`, `master_data.write`, `bank.read`, `payments.write`,
  `rules.write`, `settings.manage` and so on. A client's menu can be arranged any way without a
  policy changing.
- **Every view carries `security_invoker = true`.** Without it a view runs as its owner and reads
  straight past RLS, which once leaked 102 other-company invoices to a restricted user in the Hub
  this template came from. A view added without that line is a data leak, not a style slip.
- **A policy is dropped before it is created.** Postgres ORs permissive policies together, so one
  stale `using (true)` makes every scoped policy beside it meaningless.

## What must never be hardcoded

These were all found and removed in the rebuild. Do not put them back:

- **Role names.** `is_admin()` reads `roles.administers`; the break-glass guards read
  `roles.protected`. A client can call its roles anything and add levels without a migration.
- **A review weighting.** `review_score_rules` and `review_confidence_bands` are tables, because a
  client decides what puts a document at the top of their list.
- **A sentence a person reads.** `v_trash` returns the naming parts as JSON; the app composes the
  words. A German label inside SQL is a client's language compiled into their database.
- **A language.** Only `0009_search.sql` names one, in a single variable, because a generated
  `tsvector` column cannot read a setting at run time.
- **A folder, a bucket or a schedule** where a setting will do.

## Two owners, one database

The Hub owns these tables. The ingestion pipeline owns its own, from `schema/*.sql` in the
`book-keeping` repository, in the same database. The rebuild settled one collision: both defined
`processing_log`, with different shapes, and `create table if not exists` silently kept the older
one. When adding a table, check it is not already the other side's.

## Proving a change

Never by reading. Always by running, and it is all local: see the `local-database` skill.

1. Apply the whole set to an empty database. All twelve files must apply clean, in order, first try.
2. `pg_dump --schema-only` before and after, and read the diff.
3. Every name in `src/config/tables.ts` must exist. Nothing the app reads may be missing.
4. For anything touching access: sign in as a restricted user and confirm they see less.

## Still open

- The catalogue seed, which is project data and names a client's own modules and pages.
- `pipeline_run_requests` and `pipeline_settings` are provisioned by the admin panel, not here.
- Nothing has been migrated for an existing client. Their databases are the truth; this schema only
  has to agree with them, and `RENAMES.md` is the list of what does not yet.
