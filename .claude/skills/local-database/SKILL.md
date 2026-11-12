---
name: local-database
description: How to bring this schema up locally and test against it, with no cloud project and no client data. Load this before applying migrations, rebuilding the schema, dumping or diffing it, or running the app against a database. Not needed just to look at screens — see the map skill's "Running it" section for VITE_SEED mode, which needs no database at all. Covers the Supabase CLI stack, the project-id quirk, the pipeline's half of the schema, the known from-scratch failures, and the dump-and-diff loop.
---

# Testing the database locally

Everything here runs on your machine, costs nothing and touches no client. There is no reason to
test schema work against a live project.

**Only needed for schema work, or for testing against real data/RLS/permissions.** To just look at
screens with no database at all, `VITE_SEED=1 npm run dev` is the whole story — see the **map**
skill's "Running it" section and `src/seed/README.md`.

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

**Port already taken by another project's own Supabase stack** (`docker ps` shows
`supabase_db_<other-project>`): don't stop someone else's running stack. Add a temporary `[api]`/
`[db]`/`[studio]`/`[inbucket]`/`[analytics]` port block to `supabase/config.toml` instead, well
clear of the default range (e.g. 65321+), then revert it with `git checkout -- supabase/config.toml`
once done — check `git diff` shows it gone, since a concurrent session can leave it staged.

## The schema lives in `supabase/schema/*.sql`, one baseline migration is generated from it

`supabase/migrations/00000000000000_schema.sql` is not hand-written: `node
scripts/codebase/build-baseline.mjs` concatenates the numbered files in `supabase/schema/` into it.
Edit the numbered files, not the migration, then regenerate the baseline before testing.

`supabase start` applies `supabase/migrations/` automatically and **tears the whole stack down on the
first error**, which leaves nothing to inspect. To see exactly which file breaks, take the baseline
out of the CLI's path and apply the numbered files one at a time instead:

```bash
node scripts/codebase/build-baseline.mjs   # regenerate after any schema/*.sql change
mv supabase/migrations supabase/_migrations_hold && mkdir supabase/migrations
SUPABASE_PROJECT_ID=hub_template supabase start

DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
for f in $(ls supabase/schema/*.sql | sort); do
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" || echo "FAILED $f"
done
```

Put `supabase/migrations` back when done: `rm -rf supabase/migrations && mv supabase/_migrations_hold
supabase/migrations`.

## The schema has two owners

The Hub's own schema creates the app's tables. The **pipeline** creates the ingestion tables, from
`schema/*.sql` in the `book-keeping` repository, and the Hub's later migrations assume they are
there. A local database is only complete once both have been applied, the pipeline's after the
Hub's.

## Known from-scratch failures, as of 12.11.2026

Running all 42 files in `supabase/schema/` into an empty database applies clean, zero failures,
confirmed by actually running the loop above. Two real ordering bugs existed in this set until
12.11.2026 and are now fixed, kept here as the shape a future one will take:

- `0010_access.sql` enabled RLS on `crm_webhook_events` in a loop that ran before
  `0031_crm_webhook_events.sql` created the table — the whole file was wrapped in one transaction, so
  the table-creation failure rolled back every other table's policy in that same loop too, not just
  the one that doesn't exist yet. Fixed by moving that table's policies into `0031` itself, after the
  table, the same way `0024_payment_files.sql` already handles its own newer tables.
- A table created after `0010_access.sql` runs can't rely on `0010`'s generic per-area RLS loop at
  all, for the reason above. Each such file writes its own policies directly, same pattern as
  `0024_payment_files.sql`'s own `do $$ ... $$` block.

Only the **pipeline's own schema** (`book-keeping` repo, applied after the Hub's) has not been
re-verified against this baseline — treat anything about it below as unconfirmed until re-checked.

Applying the pipeline's schema afterwards used to hit one collision worth knowing, file names from
before the `supabase/schema/` reorganization: the pipeline's own `processing_log` creation failed
because the Hub's own (`supabase/schema/0005_sources.sql` today) already created `processing_log`
without the pipeline's `run_id` column, so its own `create table if not exists` silently skipped its
newer definition. Not re-verified against the pipeline's current schema since the reorganization —
check this collision is still real, not assume it from this note.

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
`VITE_SUPABASE_PUBLISHABLE_KEY` — see `planning/08-startup.md`. A schema with no data in it still
shows a blank nav: apply `supabase/catalogue.sql` (the permission catalogue, mandatory, otherwise no
page resolves), then `supabase/seed-local.sql` (sample data and the two local login accounts,
`owner@example.com` and `clerk@example.com` — also create them in auth via the local stack's admin
API or Studio, the SQL file alone doesn't).

## Tearing down

```bash
SUPABASE_PROJECT_ID=hub_template supabase stop
SUPABASE_PROJECT_ID=hub_template supabase stop --no-backup
```
