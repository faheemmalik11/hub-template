# This repository: the folder a new client is cloned from

Created 17.09.2026 as a copy of the most complete Hub we run, taken at that Hub's then-current
commit. It exists so a new client starts as a clone with every UI feature present and switched on.
What that client does not use is switched off from the admin panel, never by editing their code.

## What was taken out of the copy

| Removed | Why |
|---|---|
| `.env` | the source Hub's own environment. A clone must never carry another client's connection |
| `node_modules` | 600M and regenerable with `npm install` |
| `.output` | the previous build, and not only bulk: the bundled assets had the source project's live host compiled into them |
| `supabase/.temp/` | the Supabase CLI's link state: the project ref, a pooler connection string and the linked project's name. A `db push` from here would have gone straight at the source project |
| the git history | a fresh `git init`, so nothing that ever sat in an old commit travels to a new client's repository |

## What was checked before calling it clean

No anon key and no service-role key is hard-coded anywhere in `src/`, `supabase/` or `scripts/`.
Every one is read from the environment, and `supabase/config.toml` takes the project id from
`env(SUPABASE_PROJECT_ID)`. The migration that sets up the ingest cron's shared secret carries
placeholders only, with the real value in the vault.

## Open, and it matters

**Two migrations still hard-code the source project's host**, and both run against a new client's
database:

- `supabase/migrations/20260827130000_notification_dispatch_cron.sql:51`
- `supabase/migrations/20260911100000_notify_about_any_record.sql:323`

Each builds a cron job calling that host's `functions/v1/notify-dispatch`. Applied as they stand, a
new client's notifications would be posted to **another client's** Edge Function.

Eight further files name the old project ref in text only: `supabase/schema.sql`, four files under
`docs/`, and two one-off scripts.

Before this template is used for a real client, that host has to come from a database setting or the
vault rather than a literal, and the old migrations either rewritten or replaced by a squashed
baseline. That is a decision about how a client's repository begins, so it is recorded rather than
done quietly.

## What a new client needs on top of the clone

- its own Supabase project, and its own `.env`
- its own brand: logo, theme tokens, the locale file
- its own catalogue seed, since the catalogue is project data (see `03-catalogue.md`)
- the switches set from the panel during onboarding (see `05-panel-tab.md`)

## Why this repository is not the shared package

This template is copied whole, `src/kit/` included. The direction is that more of
the template moves into the kit and the clone gets thinner, which is the last section of
`06-phases.md`. Until the navigation itself is driven by the catalogue, a clone still carries its own
menu file, and that is the fork this plan works to remove.
