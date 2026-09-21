# The schema

These numbered files **are** the schema. Read them here; they are written to be read.

`../migrations/00000000000000_schema.sql` is the same content concatenated into one file, because
that is what the Supabase CLI applies. It is generated:

```bash
node scripts/build-baseline.mjs
```

**Edit a numbered file, never the baseline**, then run the script. The two cannot disagree, because
one is built from the other.

## The order matters, and it is not obvious

`0011_functions.sql` comes before `0012_views.sql`. A view that calls a function cannot be created
without it; a function that reads a view can, because `check_function_bodies = off` defers the check
until it runs. They reference each other, so this is the only order that works.

Applying a change to the database you already have proves nothing about that. Apply the baseline to
an **empty** database, every time.

## Applying it

```bash
SUPABASE_PROJECT_ID=hub_template supabase start     # applies the baseline
psql "$DB" -f supabase/catalogue.sql                # then the project data
```

The catalogue is deliberately not part of the baseline: the schema is the same for every client, and
the catalogue is the one file each client replaces.

## Where the history went

The 248 migrations of the Hub this template was copied from are not here. They were never applied
by this template and did not describe their own result: the rename of 16.09.2026 alone rewrote 35
function bodies and 11 views. A question about why a column exists is answered by
`git log` on this repository, at commit 415caa8 and before it.

## Proving a change

Always by running, never by reading, and always locally. See the `local-database` skill.

1. Edit the numbered file, run `node scripts/build-baseline.mjs`.
2. Apply the baseline to an empty database. It must apply clean, in one pass.
3. `pg_dump --schema-only` before and after, and read the diff.
4. Every name in `src/config/tables.ts` must exist.
