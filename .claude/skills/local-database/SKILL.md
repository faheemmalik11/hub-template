---
name: local-database
description: How to bring this schema up locally and test against it, with no cloud project and no client data. Load this before applying migrations, rebuilding the schema, dumping or diffing it, or running the app against a database. Covers the Supabase CLI stack, the project-id quirk, the pipeline's half of the schema, the known from-scratch failures, and the dump-and-diff loop.
---

# Testing the database locally

Everything here runs on your machine, costs nothing and touches no client. There is no reason to
test schema work against a live project.

Requires Docker running, plus the `supabase` CLI, `psql` and `pg_dump`.

## Bring the stack up

```bash
SUPABASE_PROJECT_ID=hub_template supabase start
```

**The env var is not optional.** `supabase/config.toml` reads `project_id = "env(SUPABASE_PROJECT_ID)"`,
and without it the CLI names its containers after the literal string, then cannot find them again.
The symptom is `No such container: supabase_db_env_SUPABASE_PROJECT_ID_`.

It prints the local URLs and keys. They are the standard demo keys, identical on every machine, and
they are not secrets. The database is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Apply migrations yourself, not through `start`

`supabase start` applies `supabase/migrations/` automatically and **tears the whole stack down on the
first error**, which leaves nothing to inspect. To work on the schema, take the folder out of the
CLI's path first:

```bash
mv supabase/migrations supabase/_migrations_hold && mkdir supabase/migrations
SUPABASE_PROJECT_ID=hub_template supabase start
```

then drive it with psql, which stops where it breaks and keeps the database up:

```bash
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
for f in $(ls supabase/_migrations_hold/*.sql | sort); do
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" || echo "FAILED $f"
done
```

Put the folder back when you are done.

## The schema has two owners

The Hub's migrations create the app's tables. The **pipeline** creates the ingestion tables, from
`schema/*.sql` in the `book-keeping` repository, and the Hub's later migrations assume they are
there. A local database is only complete once both have been applied, the pipeline's after the
Hub's.

## Known from-scratch failures, as of 17.09.2026

Running all 248 migrations into an empty database gives **245 applied and 3 failures**. None is
mysterious, and all three say something about the schema rather than about the tooling:

| File | Error | What it means |
|---|---|---|
| `20260828220000_capability_role_defaults.sql` | `relation "public.role_permissions" does not exist` | ordering: it writes to a table created a day later, in `20260829150000_permissions_model.sql`. It only ever worked because the live database already had the table |
| `20260829091000_storage_upload_policies.sql` | `must be owner of relation objects` | `storage.objects` belongs to `supabase_storage_admin`, so this needs that role locally. Not a defect in the migration |
| `20260916160000_hub_edits_channels.sql` | raises `channels/channel_folders are missing` | deliberate, and correct: it refuses rather than half-applying when the pipeline's tables are not there yet |

Applying the pipeline's schema afterwards hits one collision worth knowing: `0004_documents.sql`
fails on `create index ... processing_log (run_id)`, because the Hub's `0002_base_schema.sql`
already created `processing_log` **without** `run_id`, so the pipeline's `create table if not
exists` silently skipped its own newer definition. Two owners, one table name, two shapes.

## Dump and diff, which is how a schema change is proved

```bash
pg_dump --schema-only --no-owner --no-privileges "$DB" > /tmp/before.sql
pg_dump --schema-only --no-owner --no-privileges "$DB2" > /tmp/after.sql
diff -u /tmp/before.sql /tmp/after.sql
```

An empty diff is the only proof that a rebuilt schema matches the one clients already run. Reading
the migrations is not proof: the English rename alone rewrote 35 function bodies and 11 views, so
the files no longer describe the result.

`src/lib/data/tables.ts` is the second check. Every name in it must exist in the database, and
nothing the app reads may be missing.

## Running the app against it

Put the printed local URL and publishable key into `.env` as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. That is the whole bootstrap, see `planning/08-startup.md`.

## Tearing down

```bash
SUPABASE_PROJECT_ID=hub_template supabase stop
SUPABASE_PROJECT_ID=hub_template supabase stop --no-backup
```
