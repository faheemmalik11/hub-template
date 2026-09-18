# Consolidating the migrations, and one config folder

Two pieces of work that belong together: a clone should start from **one honest baseline** of the
database, and from **one place where every name is spelled**. Both are what make a new client's first
day a configuration exercise rather than an archaeology exercise.

Nothing here is started.

---

# Part 1: the migrations

## What is there now

- **249 files** in `supabase/migrations/`, in two numbering schemes: `0001_auth_foundation.sql`
  through `0091_*`, then timestamps from `20260701*` to `20260917150000_*`.
- Only **8 filenames** carry a German word, so renaming files is the small part of this job.
- `supabase/schema.sql` is stale: it is a **German-era snapshot**, taken before the rename to English
  table names, and `src/lib/data/tables.ts:12` already warns readers not to trust it.
- The database has **two owners**. The Hub's migrations create the app's own tables; the pipeline's
  `schema/` files create the ingestion tables in the same database. A baseline that recreates the
  pipeline's tables would fight the pipeline; one that omits them entirely leaves a new client with
  half a database.
- Two migrations still hard-code another project's host, recorded in `07-hub-template.md`. A squash
  is the moment that gets fixed properly rather than patched.

## Why squash at all

A new client runs 249 files to reach a state we can describe in one. Every file is a chance for an
`if not exists` to lie, for a policy to be created twice, or for a fix to be applied in an order it
was never tested in. Nobody reads them, and the one document that claims to describe the result is
already wrong.

## What a baseline must satisfy

1. **Generated, not written.** `supabase db dump` from a live, healthy project. Hand-writing a
   schema of this size guarantees a drift nobody notices until a client hits it.
2. **Byte-comparable.** Applying the baseline to an empty project must produce a dump identical to
   the source project's, modulo data. That comparison is the test, and it is the only one worth
   trusting.
3. **Client-free.** No project host, no client name, no seeded row belonging to one business. The
   cron host becomes a database setting read at run time.
4. **Ownership honest.** The Hub's own tables in the baseline; the pipeline's tables applied from the
   pipeline's `schema/`, as they are today. The baseline names the boundary in a comment at the top,
   so the next reader knows which side owns what.
5. **Existing clients untouched.** Their databases already have this state. The baseline is marked as
   applied for them, never run. `supabase migration repair --status applied <version>` is the tool,
   one client at a time, checked one at a time.

## The procedure

1. Dump the live schema of the most complete client, with `./scripts/dump-live-schema.sh`, which is
   the script that already exists for this.
2. Split the dump: what the Hub owns, what the pipeline owns. Drop the pipeline's half from the
   baseline and note where it comes from instead.
3. Scrub: hosts, client names, one-business seed rows. Replace the cron host with a setting.
4. Write `supabase/migrations/00000000000000_baseline.sql`, with a header saying what date it was cut
   from, what it deliberately excludes, and what replaced the literals.
5. Prove it: apply to a fresh empty project, dump, diff against step 1's dump. Iterate until the diff
   is empty.
6. Move the 249 files into `supabase/migrations/archive/`, out of the CLI's path but not out of the
   repository, because a question about why a column exists is answered by history.
7. For each existing client, mark the baseline applied. Never run it.
8. Refresh `supabase/schema.sql` from the same dump, so the file that claims to describe the schema
   finally does.
9. From then on, every new migration gets an English name in the timestamp scheme, saying what it
   does in words: `20261001120000_a_client_can_switch_off_a_page.sql`.

## What this is not

Not a rewrite of history for the clients who already ran it. Their databases are the truth; the
baseline only has to agree with them.

---

# Part 2: one config folder

## The rule

**No name is typed outside `src/config/`.** Not a table, not an Edge Function, not a bucket, not a
route, not a permission key. A name that no longer exists then fails to compile, rather than
returning a 404 in front of a client.

This is not a new idea in this codebase, it is an existing one applied evenly.
`src/lib/data/tables.ts` already does exactly this for tables, and says why in its header. Everything
else is scattered: `brand.ts`, `permissions.ts`, `checklist-config.ts`, `postfach-sections.ts`,
`config.server.ts` and `filename.ts` each live somewhere different, and the Edge Function names are
string literals at every call site.

## The modules

| Module | Holds | Today |
|---|---|---|
| `config/tables.ts` | every table and view | `src/lib/data/tables.ts`, moved |
| `config/functions.ts` | every Edge Function name | nowhere: 7 names typed as literals at each `functions.invoke` call, and more in migrations |
| `config/buckets.ts` | every storage bucket | literals |
| `config/routes.ts` | every route path, and the page key that belongs to it | nowhere |
| `config/permissions.ts` | every permission key | `src/lib/permissions.ts`, moved |
| `config/brand.ts` | name, logo, theme tokens | `src/lib/brand.ts`, moved, and later read from the database |
| `config/env.ts` | the two bootstrap values, read and validated once | read inline in `src/integrations/supabase/client.ts` |

## Why routes matter more than they look

The feature catalogue needs a map from a path to its page key, for the single route guard in
`04-hub-changes.md`. That map has to live somewhere, and `config/routes.ts` is where it belongs: one
table of path, page key and label key, read by the navigation, the guard and the breadcrumb trail
alike.

## The Deno twin

Edge Functions run on Deno and cannot import from `src/`, which is why
`supabase/functions/_shared/tables.ts` exists as a hand-kept copy. The same applies to any config an
Edge Function needs. Keep the twin small, and add a check that fails the build when the two lists
disagree, since a twin kept by discipline alone eventually drifts.

## Order

Config first, migrations second. The config folder is additive and reversible; the squash is neither,
and it is easier to verify a baseline when every name the app uses is already listed in one place.
