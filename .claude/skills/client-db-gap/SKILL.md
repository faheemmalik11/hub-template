---
name: client-db-gap
description: How to measure the distance between an existing client's database and this template's schema, read-only, before anything is planned or written. Load this when a client who already has a Hub is being moved onto the template, when asked how big that move is, or before writing any SQL for their database. Covers scripts/codebase/gap-report.mjs, what each of its five sections means and does not mean, the manual queries behind them, and the column gap the report does not show. Measuring only — applying is in client-db-adopt-order.
---

# Measuring a client's database against the template

Nothing is planned before this runs. The distance is different for every client: measured from table
counts alone, one existing client was 11 tables away from the template and another 75.

Everything here only reads. See the **onboarding-a-client** skill for the rule that live stays
read-only, and for how to copy their database down first. Measure the copy where you can.

```bash
node scripts/codebase/gap-report.mjs "postgresql://…"
```

## The five sections

| Section | What it compares | What it does not tell you |
|---|---|---|
| `tables` | `pg_tables` against every `create table if not exists public.<x>` in `supabase/schema/*.sql` | whether a shared name holds the same columns |
| `views` | `pg_views` against `create or replace view public.<x>` | whether a view that exists returns the same columns |
| `functions` | `pg_proc` names against `create or replace function public.<x>`, first 20 missing | signatures, bodies, or which of them the screens actually call |
| `stored vocabulary` | the German values in `workflow_status`, `traffic_light`, `status` against their English replacements | any other column that holds a German value |
| `permission model` | whether `permissions`, `role_permissions`, `user_permissions`, `feature_settings`, `feature_requirements` exist, and whether `permissions` has `parent_key`, `kind`, `default_enabled`, `locked` | which keys are in their catalogue, or who is granted what |

The report reads the schema files as text. A table created any way other than
`create table if not exists public.<name>` is invisible to it.

## The gap it does not report, and the one that broke the run

**Names matching is not shapes matching.** At Antonius-Apotheke, 38 table names were identical in
both databases. 20 of those 38 tables held fewer columns than the schema declares — 159 columns
short in all. That gap is what actually stops the work, and the report says nothing about it.

Ask for it directly, per table:

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'app_users'
 order by 1;
```

against the columns the same table is given across `supabase/schema/*.sql`. Do this for every shared
table before writing anything, not for the ones you suspect.

## The second thing to check by hand: who the app thinks the person is

`app_users.id` does not have to equal `auth.users.id`. In this client's database it does not.

That turned out to be harmless, because `public.current_permissions()`
(`supabase/schema/0002_permissions.sql`) finds the person by email, not by id:

```sql
from public.app_users u
where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
```

Harmless **here**. Check the join before assuming it, and check whether anything else in their
database joins on the id instead:

```sql
select count(*) from public.app_users u join auth.users a on a.id = u.id;
```

## The manual version of the whole report

```sql
-- their tables
select tablename from pg_tables where schemaname = 'public' order by 1;
-- their views
select viewname from pg_views where schemaname = 'public' order by 1;
-- their functions
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' order by 1;
-- row counts, so you know which gaps carry real data
select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;
```

The row counts matter for planning. Drift in an empty table is cheap. Drift in a table with rows in
it needs a person to decide.

## What the numbers looked like once

Antonius-Apotheke, 13 Nov 2026, measured and not assumed:

- 41 tables theirs, 92 in the template, **38 names identical**.
- Three tables of theirs unmatched: `payment_runs`, `payment_run_items`, `payment_run_files`. The
  template calls that family `payment_files`.
- `permissions` held 13 keys and lacked `kind`, `parent_key`, `default_enabled` and `locked`.
- `roles` lacked `label`, `administers`, `protected` and `created_at`, and had `label_de` and
  `label_en` as `not null`.
- `app_users` had `full_name` where the template has `name`, and lacked `picture_url`,
  `must_change_password`, `auth_user_id` and nine more columns.

The last line is the one that cost the most time. Read **client-db-symptoms** for why a missing
`app_users` column looks exactly like a permission problem.

## After measuring

The order the work is then done in is **client-db-adopt-order**. Prove each step on a disposable
copy first: **throwaway-db**.
