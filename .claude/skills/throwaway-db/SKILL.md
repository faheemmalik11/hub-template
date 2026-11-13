---
name: throwaway-db
description: How to prove SQL against a disposable copy of a client's database before it touches anything that matters — create a database on the local stack, restore the dump into it, apply, iterate to zero errors, drop it. Load this before applying any adoption file, migration or catalogue to a client's database, or when an earlier attempt left a half-applied mess and you need a clean start. Covers what a fresh database in the stack lacks, the iterate loop, and running several attempts at once without collisions.
---

# Proving SQL on a database you are happy to destroy

A file that applies cleanly to a database you have been editing proves nothing. The only proof is a
fresh restore that the file applies to in one run, with no errors. That takes about a minute and it
is why the adoption files in **client-db-adopt-order** can be trusted.

Live is read-only throughout. The dump and the local stack are set up in **onboarding-a-client**,
steps 4 and 5; this skill is what happens inside that stack afterwards.

## One stack, many databases

The client's local Supabase stack runs one Postgres. Every attempt gets its own database in it, and
the stack itself is never restarted.

```bash
PG="postgresql://postgres:postgres@127.0.0.1:55322"   # this client's db port, from config.toml

psql "$PG/postgres" -c "create database try1"
```

A new database in that cluster is almost bare. Measured:

- the cluster roles **are** there — `postgres`, `anon`, `authenticated`, `service_role` — because
  roles belong to the cluster, not to a database.
- the extensions are **not**. The stack's own database has `pgcrypto`, `uuid-ossp`, `pg_trgm`,
  `pg_cron`, `pg_stat_statements`, `supabase_vault`, `vector`. A new one has only `plpgsql`.
- the `auth` and `storage` schemas are **not** there, and `supabase db dump` does not bring them:
  it dumps `public`.

So give it the prerequisites first:

```sql
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
```

Without those, a policy that names `auth.uid()` is refused at creation time and the restore fails
for a reason that has nothing to do with the client. In this client's database no table in `public`
has a foreign key into `auth`, so the stub table is enough — check that before relying on it.

## The loop

```bash
psql "$PG/try1" -f dump/schema.sql
psql "$PG/try1" -f dump/data.sql

psql "$PG/try1" -v ON_ERROR_STOP=1 -f supabase/adopt/01-missing-tables.sql
psql "$PG/try1" -v ON_ERROR_STOP=1 -f supabase/adopt/02-missing-columns.sql
```

`ON_ERROR_STOP=1` is what makes the output readable. Without it one failure aborts the transaction
and every statement after it reports `current transaction is aborted` — 615 of those in one real
run, hiding the single error that mattered.

Fix the file, drop the database, make a new one, run again. Do not patch the database by hand and
carry on: the next client, and the live database, will only ever see the file.

```bash
psql "$PG/postgres" -c "drop database try1"
```

`drop database` refuses while anything is connected to it. Close psql sessions and Studio's tab
first, or add `with (force)`.

## Several at once

Name the database after the attempt, not after the client: `try1`, `try2`, `catalogue3`. They cost
nothing and they make it obvious which one is stale. Running three in the same stack does not
collide — separate databases share only the cluster's roles.

Do not start a second Supabase stack for this. Ports are the thing that collides, and
**onboarding-a-client** step 4 explains why a second stack is the expensive way to get a second
database.

## What the throwaway proves, and what it does not

It proves a file **applies**: every statement runs, in order, on a real copy of the client's data,
with their row counts and their constraint violations.

It does not prove **behaviour**. `auth.uid()` is a stub here that returns null, so RLS and
permission answers from a throwaway are meaningless. Test those on the restored copy in the stack's
own `postgres` database, where the real Supabase `auth` schema is, and wrap each test in
`begin` / `rollback` — see **client-db-symptoms** for why that wrapping is not optional.

## When you are done

Drop every attempt database. A forgotten `try4` holding a copy of a client's supplier and invoice
data is client data sitting on your machine for no reason.

```bash
psql "$PG/postgres" -t -A -c "select datname from pg_database where datname like 'try%'"
```
