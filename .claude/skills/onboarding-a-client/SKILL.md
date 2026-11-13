---
name: onboarding-a-client
description: How a client gets onto this codebase — a brand-new one with an empty database, or an existing Hub that already has its own database and its own history. Load this before creating a client worktree, copying a live database down to a local stack, branding a client's Hub, or planning the move of an existing client onto the template. Covers the two paths, the read-only rule for live data, running several local stacks side by side, and the measurement that has to come first. First written while bringing Antonius-Apotheke across, 13 Nov 2026.
---

# Onboarding a client

Two different jobs share this page, and the first question is which one you are doing.

| | **New client** | **Existing Hub** |
|---|---|---|
| Their database | empty, you create it | exists, holds their history, and `book-keeping` writes to it |
| The work | apply the baseline and the catalogue | bring the template to them, in stages |
| How long | an afternoon | weeks, and it is staged for that reason |
| Written procedure | `planning/14-setting-up-a-new-client.md` | `planning/12-adopting-an-existing-client.md` |
| Steps below | 1, 2, 3, 4, **5b**, 7 | 1, 2, 3, 4, **5, 6**, 7 |
| The danger | none, nothing to lose | overwriting a decision a person made, or breaking the pipeline that writes to them |

Both paths end at the same place: a client worktree, their brand, their own database, and the three
checks run after every change.

**The rule that governs everything below: live is read-only until a port has been proven locally.**
Copy their database down, work on the copy, and only go near live when the copy passes. Nobody gets
a second chance with a client's records.

---

## 1. The client gets a worktree, named after their repository

See the **client-branches** skill for why a branch and not a clone. The name is theirs, not one you
invent: if their repository is `oliviabarbarinomokrus`, so is the branch and so is the directory.

```bash
cd ~/projects/hub-template
git worktree add .worktrees/<client> -b <client> dev
cd .worktrees/<client> && npm install
```

`routeTree.gen.ts` does not exist until the dev server has run once, so `tsc --noEmit` reports
dozens of route errors on a fresh worktree. Start `npm run dev` once; the errors disappear.

## 2. Their planning folder comes with them, and must not become committable

In this repository `planning/` is **tracked**; only `planning/communication/` is ignored. A client's
planning folder holds credentials and real supplier data, so before copying anything:

```bash
printf '\n# The whole planning folder stays local: client material and credentials.\n/planning\n' >> .gitignore
```

A `.gitignore` rule does not untrack what git already follows, so the template's own planning
documents stay tracked and only the new material is protected.

Watch for one collision: both sides have `planning/README.md` and they are different documents. Keep
the template's and bring theirs in under a client-specific name.

## 3. Branding: three places, no more

`docs/BRANDING.md` is the source. Note that it says `src/lib/brand.ts`; the file is actually
`src/config/brand.ts`.

1. `src/config/brand.ts` — `name`, `wordmark`, `productName`, `emailDomain`, `description`,
   `themeColor`, and `assets.logo.mode` (`"text"` draws the wordmark, `"image"` draws the files).
2. `src/styles.css` — the `--brand*` ramp. Mirror `--brand-hover` into `BRAND.themeColor`, which is
   the one brand colour that has to be duplicated because a `<meta>` tag cannot read a CSS variable.
3. `public/` — `favicon`, `brand/logo.png`, `brand/logo-white.png`.

**The white logo is not optional.** The login panel is a solid brand colour, and a client's colour
logo disappears on it. If they only have one file, make the white one from its alpha channel:

```python
from PIL import Image
src = Image.open("public/brand/logo.png").convert("RGBA")
white = Image.new("RGBA", src.size, (255, 255, 255, 0))
white.putalpha(src.getchannel("A"))
white.save("public/brand/logo-white.png")
```

Check the alpha first: if nearly every pixel is opaque the logo has a baked background and this
produces a white rectangle.

## 4. A local stack per client, on its own ports

Several clients' stacks run on this machine at once. The project id picks the container names; the
ports come from `supabase/config.toml`, which has **no port block on `dev`** — the block in the main
checkout is an uncommitted local change. A new worktree therefore defaults to 54321/54322 and
collides with whatever is already there.

Check what is running before choosing a range:

```bash
docker ps --format "{{.Names}}\t{{.Ports}}" | grep supabase
```

Then add a block to that worktree's `supabase/config.toml` (local only, never committed) and start:

```toml
[api]
port = 55321
[db]
port = 55322
[studio]
port = 55323
[inbucket]
port = 55324
[analytics]
port = 55327
```

```bash
SUPABASE_PROJECT_ID=<client> supabase start
```

Fix the dev server's port too, in `vite.config.ts`, with `strictPort: true` so a clash fails loudly
instead of silently moving to another port and leaving you looking at the wrong app.

See the **local-database** skill for the stack itself.

## 5. Copy their live database down. Read only

```bash
supabase db dump --linked -f dump/schema.sql
supabase db dump --linked --data-only --use-copy -f dump/data.sql
```

Both commands only read. Load them into the local stack:

```bash
PG="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
psql "$PG" -c "drop schema if exists public cascade; create schema public;"
psql "$PG" -f dump/schema.sql
psql "$PG" -f dump/data.sql
```

Expect a handful of errors on `storage.*` internal tables when the cloud project runs a newer
Supabase than the local CLI. They are Supabase's own tables, not the client's data. Count the rows
afterwards and compare with live before trusting the copy.

Point `.env` at the local stack and **comment the live values out in the same file** rather than
deleting them, with a line saying why. Keep a clean copy as `.env.live`. Anyone opening that file
later must be able to see at a glance which database they are about to talk to.

## 5b. A NEW client instead: build the database, then prove it

Steps 1 to 4 are the same. From here the two paths separate, and the new-client one is short,
because there is nothing to preserve. `planning/14-setting-up-a-new-client.md` is the full version.

```bash
node scripts/codebase/build-baseline.mjs                    # the schema files into one
psql "$THEIR_DB_URL" -f supabase/migrations/00000000000000_schema.sql
psql "$THEIR_DB_URL" -f supabase/catalogue.sql
```

The baseline **checks nothing and refuses nothing**, so run it against an empty database only. The
admin panel's own `applyHubBaseline` does check, and stops when `documents` already exists.

Then prove it before anybody signs in:

```bash
psql "$THEIR_DB_URL" -c "select count(*) from public.feature_tree()"      # the catalogue
psql "$THEIR_DB_URL" -c "select count(*) from public.schema_migrations"   # 5
node scripts/db/check-pipeline-columns.mjs                                # no gap
```

The middle one matters more than it looks: those five rows are how the admin panel knows the
database is provisioned. Without them it declines to read the client's credentials and reports every
source as unfinished, with nothing on screen saying why.

The catalogue seeds roles and rights, never people. Their first administrator is created by hand.

**After that the two paths meet again**: branding (step 3), their worktree (step 1), and the same
three checks after every change.

## 6. Measure the gap before planning anything

```bash
node scripts/codebase/gap-report.mjs "postgresql://…"
```

Reads only. Prints what they have that the template does not, what the template has that they lack,
missing functions, whether the stored vocabulary is still German, and whether the permission model
has its four catalogue columns.

The distance is different for every client, so nothing is planned before this runs. From table
counts alone, one existing client was about 11 tables away and another 75.

Four small skills carry the detail of this half of the job, each loadable on its own:
**client-db-gap** (reading the measurement, and the column gap the report does not show),
**client-db-adopt-order** (the order the schema is applied in, and why the baseline cannot do it),
**throwaway-db** (proving each file on a disposable copy), **client-db-symptoms** (what a broken
screen actually means afterwards).

A quick manual version of the same question:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' order by 1;
```

compared against the names `create table` makes across `supabase/schema/*.sql`.

## 7. Then follow the staged plan, not your own order

`planning/12-adopting-an-existing-client.md` stages the work so each stage stands on its own and a
client can stop after stage 2 and still be better off:

0. measure the gap
1. adopt `src/config/`
2. adopt the catalogue and the switches — additive; their `permissions` table gains `parent_key`,
   `kind`, `default_enabled` and `locked`, and `feature_settings` arrives with everything on
3. the vocabulary — the only stage with data in it, and the one that needs coordinating with
   `book-keeping`, which will otherwise write German values back on its next run
4. shared screens, one at a time
5. point their repository at the template

`supabase/schema/RENAMES.md` is the checklist for stage 3. Read it before editing `tables.ts` or any
query.

---

## What this looks like in practice

Antonius-Apotheke, 13 Nov 2026, measured rather than assumed:

- 41 tables in their live database, 92 in the template schema, **38 names already identical**.
- Only three of theirs unmatched: `payment_runs`, `payment_run_items`, `payment_run_files`. The
  template calls that family `payment_files`.
- Their `permissions` table holds 13 keys (`invoices.read`, `payments.create_run`, `log.read`, …)
  and lacks `kind`, `parent_key` and `locked`. The template's catalogue is a different list
  entirely (`documents.read`, `master_data.write`, `page.overview`, …).

The visible symptom of that last point, once the app runs against their data: you sign in, the
branding is right, and **every page says "No access to this page" with an empty sidebar**. That is
not a bug in the Hub. It is `current_permissions()` answering honestly about a catalogue that is not
there yet. Stage 2 is what fixes it.

## Things that have cost time

- **Assuming the port block is committed.** It is not. A new worktree silently takes 54321 and
  collides with another client's stack.
- **Copying a client's planning folder into `planning/`** without adding the ignore rule first.
- **Taking one logo file for both variants.** The login panel then shows a dark logo on a dark
  brand colour.
- **Reaching for live to "just check something".** Use the copy. Every question this page asks can
  be answered from it.
