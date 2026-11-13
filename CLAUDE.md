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

### A client can be a branch of this repository, not only a clone of it (READ THIS TOO)

Decided 2026-11-06, first done for van Oepen. The clone model above still describes several existing
clients' own repositories, and nothing here retires those. But a new client, and any existing one
being brought in, can instead be **a long-lived branch of this repository**, off `main` or `dev`:

**The order of work, every time:**

1. `dev` is the one, latest, shared codebase. Generic work starts here, in the main checkout, never
   in a client's own worktree. Commit it on `dev` and test it there — typecheck, lint, run the
   app — before it touches any client.
2. Each client branch has its own worktree (`.worktrees/<client>/`), checked out on its own branch,
   not on `dev`. Once `dev`'s commit is proven, go into that worktree and `git merge dev` to pick it
   up — local, not a GitHub round trip, since every worktree shares this repository's own git
   history. Nothing pushed until the whole thing is ready.
3. Only a client's own brand (`src/config/brand.ts`, the `--brand*` ramp in `src/styles.css`,
   `public/brand/*`, `public/favicon.ico`) or a genuine one-off for that client alone belongs only in
   their worktree, on their own branch — never on `dev`. Rule 2 below (never write a client's name)
   applies to `dev` and every other shared branch, never to a client's own branch — their name is the
   whole point of their brand files. Their catalogue choices (`feature_settings`) are data in their
   own database either way, not something the branch carries.
4. Only once the worktree is synced with `dev` and the client's branch is ready, sync it outward:
   push the branch to `origin`, and if that client still keeps their own separate deployed repo, run
   `scripts/client/push-client-repo.sh <client-key>` to mirror it there too.

**The reverse direction, just as strict**: find something to fix while in a client's worktree that
is not that client's name, brand or data? Fix it on `dev` first (step 1), then merge `dev` into the
client branch to pick it up (step 2). Never fix it only on the branch you happen to be in — that is
exactly the drift this model exists to prevent, and it is rule 4 below. A feature built for one
client that turns out to be worth having generally goes the other way: cherry-pick or merge the
client branch's commits into `dev`, stripped of that client's name and data, same as any clone's own
fix would be — van Oepen's commission/bonus/CRM-sync feature set reached this template exactly this
way.

`.env` is never committed on any branch, client or shared — it is local config, pointing whichever
checkout at that client's own Supabase project.

Load the `client-branches` skill before creating a client branch, merging shared work into one, or
porting a client branch's feature back into `dev`.

## Session memory: check `planning/communication/sessions/` before starting, update it after

`planning/communication/sessions/` is this engagement's running log: what was asked, what was done,
what was decided, what is still open. It is gitignored, same as the rest of
`planning/communication/`, because it can reference real client specifics.

- **Before starting work**, read `planning/communication/sessions/INDEX.md` in full. Its entries
  carry a real summary of each session's decisions and open items, written so the index alone is
  usually enough — open a dated file behind it only when its summary isn't detailed enough for what
  you're doing right now. Don't open every dated file to find out whether it matters; that is the
  token cost the index exists to avoid.
- **After a session with a real outcome** — a decision, a migration, a deploy, a feature switched
  on or off, an open question worth remembering — add an entry under
  `planning/communication/sessions/YYYY-MM/YYYY-MM-DD-<slug>.md` **and** a summary in `INDEX.md`
  that stands on its own (see `TEMPLATE.md` in that folder for the shape of both). A day with more
  than one session gets more than one file. Skip this for pure Q&A or read-only exploration that
  changed nothing.

### A new client message, and any reply to one, gets filed immediately — not at session end

The session log above is a summary written *after* the fact. A new message from the client or from
Fabian (a briefing, a Slack message, an email, a call transcript) is a different kind of thing: the
source record itself, and it goes into `planning/communication/YYYY-MM-DD/` (new dated folder, or
`files/` under an existing one) **as the first step**, before reading it closely or acting on
anything in it. The 11 Nov briefing and Fabian's covering Slack message are the model for this.

The same applies to a reply sent back — save the message actually sent (not a draft, the final
wording) as its own file in that same dated folder, named for who sent it
(`reply-<name>-to-<name>-<date>.md`, see `2026-11-11/files/reply-faheem-to-fabian-11nov2026.md`).
This was skipped once already: a full reply to a briefing was drafted, reviewed and sent entirely
within a Claude conversation with no file ever recording it, and would have been lost once that
conversation ended. Don't let that happen again — the reply is saved as part of sending it, not as
a cleanup pass afterward.

Add a line to `README.md`'s Timeline and Folders sections for the new dated folder while you're in
there; both tables are the index for everything else in this directory and go stale fast if a new
folder doesn't get a row.

### A client message arriving while working in the shared checkout instead

Same rule, for when you're working in the main `hub-template` checkout rather than here: identify
which client it's for, file it (and any reply) in their own worktree the same way, then add a
one-line pointer (which client, which date) in the shared `planning/` folder too — never the content.

### English only, everywhere a developer types (HARD RULE)

No German in identifiers, function or component names, variables, types, filenames, directory
names, i18n keys, column names, status values or config keys. English, always.

German survives in exactly two places, and nowhere else:

- **UI display strings** — the VALUES in `src/lib/i18n/locales/*.ts`. The audience is German.
- **Live client data** — what is already in a client's database. It stays as it is.

URLs are English here too. The template has no users, so it has no bookmarks to break, and a client
merging this gets a redirect from their old path rather than a broken link.

The trap is the middle ground, and it is how German keeps arriving: a new key added to an existing
German block. `access.pageNotAvailable`, never `zugriff.textPage`. If the surrounding namespace is
German, open an English one rather than extend it.

Existing German identifiers are not grandfathered. When you work in a file that has them, rename
them in the same pass. A rename always beats a comment explaining the German word.

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

### The four rules of this repository

1. **Never delete a screen to suit one client.** Switch it off in their catalogue. A screen removed
   here is a fork; a screen switched off is a row.
2. **Never write a client's name here.** Not in code, not in a comment, not in a migration. This
   includes `planning/`: an analysis that genuinely needs one client's real specifics (their stack,
   their data, a comparison against their codebase) is written on that client's own branch, in
   their own worktree, the same place their brand and their data already live — never inline in a
   shared planning doc. What goes in the shared `planning/` folder is the generic finding, with a
   reference to where the client-specific detail lives (`see <client>'s own branch`), not the
   client's name or their numbers themselves. `planning/15-feature-portability-audit-1/` is the
   example: the audit itself is generic (no client named anywhere in it); the specific client it
   was run against is recorded only on that client's own branch, not here.
3. **New behaviour ships off by default**, behind a switch, so an existing client's Hub cannot change
   under them when the template moves forward.
4. **A fix that is not specific to one client goes on `main`/`dev`, never only on a client's branch.**
   Fixing it only on the branch where you noticed it means every other client, cloned or branched,
   keeps the bug until someone remembers to port it by hand — the exact drift branches exist to
   avoid. Make the fix on `main`/`dev`, then merge it into the client branch you were working on. If
   you are not sure whether something is client-specific, it almost always is not: a client-specific
   thing is their name, their brand, their data, or a setting in their own database, nothing else.

The direction is the one the pipeline already reached: one shared codebase, and what makes a client
different is data rather than code. There is no separate package: `src/kit/` holds the shared parts
and every client carries the whole thing, switching off what they do not use from the panel.

**The source Hub's project ref is out of the code, not out of the prose.** Every `net.http_post`
now builds its host from the vault — `deployment_secret('project_url')`,
`supabase/schema/0013_scheduled_jobs.sql` — and no `*.supabase.co` literal is left under
`supabase/`, `src/` or `scripts/`. Eight files under `docs/` still name the old ref in text. They
run nothing, but strike the ref when you next edit one, and never paste a host back into code.

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
- Package manager: **npm**. Lint: `npm run lint`. Build: `npm run build`.

## Key references

- `docs/PROJECT-ROADMAP.md` — the client's 7-step product vision.
- `docs/EINGANGSRECHNUNGEN_FEATURE.md` — the incoming-invoices screen.
- `docs/HUB-ACTION-ITEMS.md` — current front-end to-dos.
- `docs/ROLES_AND_ACCESS.md` — roles/access/trash feature doc; model example for the
  convention below.
- `supabase/schema.sql` — a real `pg_dump` of the live schema. Refresh it with
  `./scripts/db/dump-live-schema.sh`, never by hand.
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

## Keep docs and skills current

A change that makes a `docs/*.md` file or a `.claude/skills/*/SKILL.md` wrong does not wait for
someone to notice later — fix it in the same pass, the same discipline as the Feature documentation
rule above.
