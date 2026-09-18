# Starting a clone, and what is configured from the panel

The goal is that a new client's Hub is set up from the admin panel, not by editing files. This says
exactly where the line falls, because there is a floor below which configuration cannot come from the
panel.

## The floor: two values

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, read in
`src/integrations/supabase/client.ts:8`. They are how the Hub finds the database that everything else
is stored in, so they cannot themselves live there. That is the whole bootstrap.

Same principle the pipeline already follows, where its `.env` holds only how to reach the database
and how to decrypt, and everything else is a row.

## The environment surface today, classified

Every `VITE_*` and `process.env.*` the template reads, grouped by what it really is:

| Value | What it is |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | **bootstrap**, stays in `.env` |
| `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `ELEVENLABS_API_KEY`, `VITE_BUGHERD_KEY` | **credentials**, stay in `.env` or the vault |
| `OPENAI_MODEL`, `OPENAI_EXTRACTION_MODEL`, the three `OPENAI_NL_SEARCH_*` models, `ELEVENLABS_TRANSCRIPTION_MODEL`, `DATEV_SENDER_EMAIL` | **behaviour**, and behaviour belongs in a row the panel can change without a redeploy |

The last group is the same item the pipeline already has open against itself: which model to use is a
choice, not a credential.

## What is code today and should be a row

- **Brand.** The logo is a file in `public/`, the theme is compiled tokens, the app name is a string.
  A clone currently rebrands by editing files, which is the fork this template exists to prevent.
  These become settings, with the theme tokens injected as CSS variables at render.
- **Default language.** A clone should pick its locale rather than inherit the source Hub's.
- **Which pages this client has.** The catalogue, which is what the rest of this folder plans.

## What the pipeline already stores in a client's database

Checked in the pipeline's `schema/`, which creates 29 tables in every client database, in four
groups:

| Group | Tables |
|---|---|
| Settings | `tenant_settings` (one row: `config`, encrypted `secrets`), `tenant_settings_history` with an audit trigger |
| Sources | `channels`, `channel_folders`, `channel_state`, `credentials`, `credential_reads` |
| Master data | companies, properties, suppliers, categories, VAT rates, aliases, exclusions |
| The work | documents, files, line items, taxes, bank accounts, runs, processing log, AI usage |

So the panel already writes a client's configuration into the client's own database. This plan is not
a new pattern, it extends an established one.

**Why the switches do not go into `tenant_settings.config`.** That row is validated against the
pipeline's own schema, where an unknown key is an error. Putting Hub screen switches there would
force the pipeline to carry UI concepts it has no business knowing. The permission catalogue is owned
by the Hub, so its switches belong beside it.

## The one table this plan creates

`feature_settings`, in the client's own database, holding only what somebody switched:

| Column | Holds |
|---|---|
| `feature_key` | primary key, references the catalogue |
| `enabled` | this client's choice |
| `updated_by`, `updated_at` | who and when |

Plus four columns on the existing catalogue: `parent_key`, `kind`, `default_enabled`, `locked`. See
`02-mechanism.md`.

## Boot

The Hub resolves one query against its own database at start: the settings row, the catalogue, and
the caller's permissions. Cached for the session, not fetched per navigation, which is the lesson
every authorization library publishes.

If that query fails, the Hub says so plainly. It must not fall back to rendering a menu it cannot
justify, in either direction: not a full menu it may not be entitled to, and not an empty one that
reads as "you have no rights".

## Where it stops

A new **kind** of screen is still code, in the shared kit. The panel chooses from what exists; it
never invents a page. That is the same line the pipeline draws: config picks from a menu, an
unselected option costs one registry line, and a fork costs every future fix once per client.
