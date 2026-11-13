---
name: client-db-adopt-order
description: The order the template schema is applied to a client database that already has tables and rows, and why the obvious routes fail. Load this before running build-baseline.mjs, a schema file, or supabase/catalogue.sql against an existing client's database, or when an adoption attempt is producing hundreds of SQL errors. Covers why `create table if not exists` makes the baseline useless here, the five numbered steps in order, and why the vocabulary is done last and on its own.
---

# The order that works on a database that already exists

Measure first — **client-db-gap**. Prove every step on a disposable copy — **throwaway-db**. Live
stays read-only throughout; see **onboarding-a-client**.

## Two routes that do not work

**One schema file on its own.** Applying `supabase/schema/0002_permissions.sql` to this client's
database failed: it references `public.user_company_access`, which `0001_identity.sql` creates. The
numbered files assume the whole set, in order, on an **empty** database. One of them alone proves
nothing and usually will not even apply.

**The baseline. This is the important one.** `node scripts/codebase/build-baseline.mjs` then `psql
-f supabase/migrations/00000000000000_schema.sql` against the client's copy produced **644 errors**.
615 of them were `current transaction is aborted` — noise from the first real failure onward. The
first real error was an index on `app_users (crm_external_id)`, a column their `app_users` does not
have.

The cause is one line of SQL semantics:

> `create table if not exists` **skips** a table that already exists. It does not add the missing
> columns. The old table stays exactly as it was, and every later index, constraint, policy and
> trigger that names a new column then fails.

**The baseline is for empty databases only.** It checks nothing and refuses nothing. Use it for a
new client (`onboarding-a-client`, step 5b) and never against a database with tables in it.

## The five steps, in this order

Four files, then the catalogue. Each file is idempotent — `add column if not exists`, `create index
if not exists`, and a `do` block per constraint that swallows `duplicate_object` — so a half-finished
run can simply be run again.

| | File | Holds |
|---|---|---|
| 01 | `supabase/adopt/01-missing-tables.sql` | the tables the template has and the client does not. Tables, their columns, indexes, constraints and comments. No views, no functions, no RLS, no triggers, no rows |
| 02 | `supabase/adopt/02-missing-columns.sql` | the columns the shared tables are missing. Adds only. Never drops a column, never changes a type |
| 03 | views and functions | after the columns exist, because a view or function that reads a missing column cannot be created |
| 04 | policies | last of the four, because a policy names a table and a column that must already be there |
| 05 | `supabase/catalogue.sql` | the permission catalogue, the roles, the scheduled jobs |

The worked pair from the real run is in the client worktree:
`.worktrees/oliviabarbarinomokrus/supabase/adopt/`. Read their headers before writing the next
client's — they record every foreign key deliberately omitted, every `not null` relaxed and why, and
the five columns that are the template's column under an older name.

**A foreign key whose target table does not exist yet is left out of step 01 and added later.** Same
for a key whose target table is there in the wrong shape. Write the column, note the omission in the
file's header, and add the key once the target is adopted.

## The catalogue will fail more than once. That is normal

`supabase/catalogue.sql` failed three times in a row at Antonius, each fix revealing the next:

1. `roles.label` did not exist. Their table had `label_de` and `label_en` instead.
2. `roles.label_de` is `not null`, and the catalogue's insert supplies `name`, `label`,
   `assignable`, `administers`, `protected`, `sort_order` — no `label_de`. The insert was refused.
3. `public.scheduled_jobs` did not exist. The catalogue seeds rows into it.

Run it on the throwaway until it is clean, not on the copy you care about. When it seeds correctly
you can count the result:

```sql
select kind, count(*) from public.permissions group by 1 order by 1;
select count(*) from public.live_features();
```

At Antonius that was 84 permissions — 8 modules, 37 pages, 11 sections, 28 actions — and
`live_features()` returning 64.

## A seeded catalogue does not mean the app works

After the catalogue seeded, every screen still said "No access to this page" with an empty sidebar.
The cause was not permissions at all. Read **client-db-symptoms** before chasing that.

## The vocabulary is last, and it is its own step

The German stored values (`workflow_status`, `traffic_light`, `status`) are changed **after**
everything above, as a separate piece of work, because **the `book-keeping` pipeline writes those
same columns**. Change them in the Hub's database alone and the pipeline's next run writes German
back. The vocabulary step has to be coordinated with that repository, which is why it is not folded
into the four files.

`supabase/schema/RENAMES.md` is the checklist for it. `planning/12-adopting-an-existing-client.md`
has the staged plan this order belongs to.
