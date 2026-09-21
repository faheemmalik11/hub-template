# CLAUDE.md — Hub template (front-end)

Guidance for Claude Code when working in this repository.

## What this repository is (READ FIRST)

**This is the template a new client's Hub is cloned from**, not a client's Hub. It is a copy of the
most complete Hub we run, with its environment, its build and its git history removed. Everything
below still describes how the code works, because the code is that Hub's code.

- A new client starts as a clone of this folder, with **every UI feature present and switched on**.
  What that client does not use is switched off from the admin panel, never by editing their code.
  Deleting a screen here to suit one client is a fork, and forks are what this template exists to
  prevent.
- `planning/` holds where this is going: **`planning/00-direction.md` first**, then the decisions in
  `planning/01-decisions.md` and the phases in `planning/06-phases.md`. The `ui-features` skill is
  the working summary of it.
- **One skill per module**, under `.claude/skills/module-*`: what it is, the keys a client switches,
  its screens, the files it alone owns, the tables and functions it touches, and the order to port
  it in. Start at the `modules` skill for the map, then load the one for the module you are in.
- `planning/07-hub-template.md` records what was stripped out of the clone and what a new client
  still needs: its own Supabase project and `.env`, its own brand and locale, its own catalogue seed.

### Code explains itself. Comments are the exception (HARD RULE)

Name things so the code reads without help: `unpaidInvoiceCount`, `hasConfirmedBankAccount`,
`documentsAwaitingApproval`. If a reader needs a comment to follow what a block does, the block
needs a better name or to be a named function, not a sentence above it.

- **Do not write comments.** Not headers, not section banners, not restating the next line.
- **One line, only when the code genuinely cannot say it**: a non-obvious constraint from outside
  the code, a deliberate deviation, an ordering that looks wrong but is required. Never two lines.
- Reasoning that a reader will want later belongs in `planning/` or the commit message, where it
  can be corrected. A comment rots in place and is then trusted.

The same rule in SQL: a table, column or function named for what it holds needs no explanation.

### The three rules of this repository

1. **Never delete a screen to suit one client.** Switch it off in their catalogue. A screen removed
   here is a fork; a screen switched off is a row.
2. **Never write a client's name here.** Not in code, not in a comment, not in a migration.
3. **New behaviour ships off by default**, behind a switch, so an existing client's Hub cannot change
   under them when the template moves forward.

The direction is the one the pipeline already reached: one shared codebase, and what makes a client
different is data rather than code. `@hub-kit/core` is the shared package and grows; this template is
copied and should get thinner.

**Open, and it bites a new client on day one:** two migrations hard-code the source Hub's project
host in a cron job, `20260827130000_notification_dispatch_cron.sql:51` and
`20260911100000_notify_about_any_record.sql:323`. Applied as they stand, a new client's notifications
would be posted to another client's Edge Function. That host has to come from a database setting or
the vault before this template is used for real. Eight further files name the old ref in text only.

## Language convention (IMPORTANT)

- **Code is written in English.** All comments, new variable/function/component names,
  commit messages, and internal documentation use English.
- **Commit messages are plain and human.** One line, no body, never mention Claude, AI,
  or bots, and never add a co-author trailer.
- **UI-facing text is written in German.** Anything the user sees on screen — labels,
  buttons, headings, placeholders, toasts, empty/error states, badge text — stays in
  German (the app's audience is German-speaking).
- **Exception — database-derived names stay as-is.** Table/column names, and the domain
  types that mirror them (`Beleg`, `Lieferant`, `Gesellschaft`, `gesellschaft_code`,
  `betrag_brutto`, `workflow_status`, …) come from the Supabase schema and remain German.
  Do not rename them.

Rule of thumb: if a string is rendered to the user → German. Everything else → English.

**In this template, German is the source Hub's language, not a law.** A client cloned from here
picks their own locale file. What is fixed is the split: identifiers English, on-screen text from the
locale, never a rendered string typed into a component.

## Project shape

- **TanStack Start** (React 19 + TypeScript) SPA/SSR app — the "Hub" front-end.
- **Supabase (Postgres)** is the shared data layer. This app mostly **reads**; it also
  edits invoices/suppliers and tracks workflow status.
- The **ingestion pipeline** (Outlook/Graph + Dropbox → OCR → AI extraction → Supabase) is **not
  in this repo**. It is the multi-tenant `book-keeping` service
  (`github.com/fabiantscheu-ship-it/book-keeping`; the sibling folder `../book-keeping` locally),
  in which every client is one tenant: shared code, and behaviour picked by that client's row,
  edited in that project's admin panel. Change the pipeline there, never here.
- Package manager: **bun**. Lint: `bun run lint`. Build: `bun run build`.

## Key references

- `docs/PROJECT-ROADMAP.md` — the client's 7-step product vision.
- `docs/EINGANGSRECHNUNGEN_FEATURE.md` — the incoming-invoices screen.
- `docs/HUB-ACTION-ITEMS.md` — current front-end to-dos.
- `docs/ROLES_AND_ACCESS.md` — roles/access/trash feature doc; model example for the
  convention below.
- `supabase/schema.sql` — a real `pg_dump` of the live schema. Refresh it with
  `./scripts/dump-live-schema.sh`, never by hand.
- `docs/TABLE_NAMING_MIGRATION.md` — the bookkeeping rename (invoices → documents),
  applied 16.09.2026, and the tooling that did it.

## Feature documentation (IMPORTANT)

**Every non-trivial feature gets a doc under `docs/`, kept current, not written once
and forgotten.**

- **Implementing new functionality** (a new screen, a migration, a cross-cutting
  system like roles/access) → create a `docs/<FEATURE_NAME>.md` describing: what the
  spec/briefing asked for, what's actually implemented (file paths, migration names,
  function names — concrete enough that a future Claude session can verify it against
  the code without re-deriving it), and what's still missing or open. See
  `docs/ROLES_AND_ACCESS.md` for the shape to follow.
- **Touching a feature that already has a doc** → update that doc in the same pass,
  don't leave it stale. If your change alters what's implemented, invalidates a listed
  gap, or fixes something the doc flagged as open, reflect that immediately — a doc
  that quietly drifts from the code is worse than no doc, since a future session will
  trust it and act on stale information.
- The audience for these docs is a future Claude Code session picking up the work
  cold, not (only) the human client — write them concrete and verifiable, not just
  narrative.

## Data layer

- **Never write a table name as a string.** Every table and view is spelled once in
  `src/lib/data/tables.ts`, and `supabase/functions/_shared/tables.ts` is its hand-kept Deno twin
  (an Edge Function cannot import from `src/`). Use `supabase.from(TABLE.documents)`. A name that
  no longer exists then fails to compile instead of 404-ing in production. This covers table names
  used as data and the embedded resources inside select strings too.

- Query/mutation hooks live in `src/lib/data/queries.ts` (React Query → Supabase).
- Domain types: `src/lib/data/types.ts`. Formatting/label maps: `src/lib/data/format.ts`.
- The generated `Database` type covers 7 of 65 tables, not all of them, so most reads and every
  write use an untyped `sb` cast. Keep new mutations consistent with that until the types are
  regenerated. A stale name in it fails the typecheck, so it is worth keeping in step.
