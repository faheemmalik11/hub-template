# Bringing an existing client onto this codebase

Four of the six Hubs already exist, with their own history, their own tables and German stored
values. They cannot be cloned from the template; the template has to be brought to them.

A big-bang graft would be brutal and unverifiable, so this is staged. **Each stage stands on its own
and ends with the same three checks**, and a client can stop after stage 2 and still be better off.
That matters, because nobody gets a free week for six clients at once.

## 0. Measure the gap

```bash
node scripts/gap-report.mjs "postgresql://…"
```

Reads only. Prints what they have that the template does not, what the template has that they lack,
which functions are missing, whether the stored vocabulary is still German, and whether the
permission model is present with its four catalogue columns.

Nothing is planned before this runs, because the distance is different for every client. From the
table counts alone: Olivia is about 11 tables away, eiffler 75 with a whole second accounting area
of its own.

## 1. Adopt `src/config/`

Purely additive. The names they already use, spelled once: tables, permissions, routes, buckets,
Edge Functions, brand, environment. No behaviour changes, nothing to migrate, and every later stage
becomes mechanical because a rename is one edit.

**Done when** their app builds with no string naming a table, a bucket or a function.

## 2. Adopt the catalogue and the switches

Also additive. Their `permissions` table gains `parent_key`, `kind`, `default_enabled` and `locked`;
`feature_settings` and `feature_requirements` are created; the catalogue seeds their own pages and
modules with everything **on**.

Nothing changes for their users until somebody flips a switch, which is the point: the mechanism
arrives quietly, and the first switch is a decision taken later.

**Done when** `live_features()` returns their whole catalogue and the app behaves exactly as before.

## 3. The vocabulary

The only stage with data in it, and the one that needs a window. `eingegangen` becomes `received`
across their rows, their code, their functions and their views. `RENAMES.md` is the checklist.

The pipeline writes some of these values too, so this stage is coordinated with `book-keeping` or it
will write German back the next time it runs.

**Done when** the gap report says the vocabulary is already English and their screens still work.

## 4. Shared screens

Now their repository can take the template's components, because the names and the vocabulary agree.
Take them one screen at a time, not as a bulk copy: the walk script tells you immediately which one
broke.

## 5. Point their repository at the template

```bash
git remote add template git@github.com:faheemmalik11/hub-template.git
git fetch template
git merge template/main --allow-unrelated-histories
```

The first merge is the expensive one. After it, a fix in the template reaches them by merging, and
it conflicts exactly where somebody edited shared code, which is also how you learn that they did.

From here the rule earns its keep: **a client repository changes its catalogue, its brand, its
locale, its `.env` and its own tables in the 9000 file range. Nothing else.**

## Their own tables

Every established client has some: eiffler's second accounting area and Airtable sync, immonetz's
Lexoffice integration, Olivia's payment runs. They keep them, in their own numbered file:

```
supabase/schema/9000_<client>_payment_runs.sql
```

They may reference shared tables; nothing shared may reference them. That is what lets the shared
baseline move forward without asking what each client has added.

## The three checks, after every stage

| Check | How |
|---|---|
| The schema is sound | apply the baseline to an empty database |
| The code agrees | `npx tsc -p tsconfig.typecheck.json --noEmit` and `npx eslint src --quiet` |
| The app works | `node scripts/walk-screens.mjs` against **their** database |

The third is the one that finds real defects, and it must be run more than once: a screen that
renders before its slowest query fires looks fine.
