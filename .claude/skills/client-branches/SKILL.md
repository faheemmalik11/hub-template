---
name: client-branches
description: How a client can be a long-lived branch of this repository instead of a separate cloned repo — creating one, bringing in shared updates, and porting a client's own feature back into main/dev. Load this before creating a client branch, merging main/dev into one, or porting work the other way. First done for van Oepen, 2026-11-06.
---

# Client branches

**The one rule that matters most while working in any client branch**: if what you are fixing is not
that client's name, brand or data, fix it on `main`/`dev`, not here, then merge `main`/`dev` into
this branch to pick it up. A fix made only in a client's branch never reaches any other client —
that silent drift is the exact thing this model exists to prevent. See CLAUDE.md's four rules.

A client's Hub can be a branch of this repository rather than a clone kept in its own repo. The
branch carries the one thing a clone used to carry that cannot be data: brand and artwork. Everything
else — which features are on, who has which role, the client's own records — is still data, in that
client's own Supabase project, exactly as it is for a cloned client.

## Why this exists

A cloned client's repository silently drifts from the template the moment it is cloned: a fix made
in one place never reaches the other unless someone remembers to carry it over by hand, in both
directions. A branch does not drift silently — `git merge` either brings a change over cleanly or
stops and asks a person to look at the conflict. Van Oepen was the first client moved to this model,
after building a commission-deals/broker-bonus/CRM-property-sync feature set in its own separate
repository and porting it into this template by hand; the branch model exists so that port, and the
next one, is a `git merge`, not a manual re-implementation.

## What's on the branch vs what's in the client's database

| Branch (committed) | Client's database (data) |
|---|---|
| `src/config/brand.ts`, the `--brand*` ramp in `src/styles.css`, `public/brand/*`, `public/favicon.ico` | Which catalogue keys are on (`feature_settings`) |
| Nothing else client-specific — no client name anywhere outside brand files and `planning/` | Roles, users, records, everything a cloned client also keeps as data |

`.env` is local to a checkout, on any branch, and is never committed. It is what makes a given
checkout of a given branch point at a given client's Supabase project.

## Creating a client branch

Creating the branch itself (`git branch <client> dev`) never touches the working tree, so it is
always safe directly in the live checkout. Only *checking it out* changes what is on disk. If someone
else is actively using the live checkout on another branch, do the client branch's own work (commits,
file edits) in a separate git worktree instead of switching that checkout's branch out from under
them — but don't create a worktree as a reflex for every task; ask first unless there's a concrete
reason to isolate.

Put the worktree in `.worktrees/<client>/` **inside this repo**, not as a sibling folder — that way
it stays visible in the same project/editor view instead of living somewhere separate. `.worktrees/`
is gitignored, the same way Claude Code's own default `.claude/worktrees/` is.

```
git worktree add .worktrees/<client> -b <client> dev   # or main, if the branch doesn't exist yet
git worktree add .worktrees/<client> <client>           # if it already exists, e.g. created earlier
                                                          # with `git branch <client> dev`
```

Set the client's name, colours and artwork in `src/config/brand.ts`, `src/styles.css`,
`public/brand/*`, `public/favicon.ico`. Point a local `.env` at the client's own Supabase project. If
the client is being moved from an existing cloned repo rather than starting fresh, port their own
commits across the same way any client feature is ported back into the template (see below), then
reset the brand files to the client's own values afterward, since the ported commits will carry
whatever brand the clone had.

## If a client still keeps their own separate repo too

Some clients, during the move to this model or by choice, still have their own standalone repo (the
one their deployment actually builds from) alongside their branch here. `scripts/client/client-repos.json`
has one entry per such client, keyed by a client identifier (not necessarily the branch name):
`hubTemplateBranch` (which branch of this repo to push), `clientRemoteName`/`clientRemoteUrl`/
`clientRemoteBranch` (their repo and the branch on their side), and `enabled`. Add an entry there for
a new client, never a hardcoded remote on one developer's machine. New entries default `enabled` to
off, same as any other new behaviour here. `scripts/client/push-client-repo.sh <client-key>` pushes
`hubTemplateBranch` to this repo's `origin`, and also to the client's own repo if `enabled` is `true`,
adding the remote first if it is not already configured. The client's own repo is still the one
actually deployed until its deployment is re-pointed at this repository — pushing here does not
retire it by itself.

## Bringing in shared updates

From inside the client branch's worktree:

```
git merge dev   # or main
```

This merges the **local** `dev` branch, not `origin/dev` — every worktree of this repository shares
the same local git history, so a fix committed on `dev` a moment ago is already there to merge, no
push or pull required. This is the normal way to work through a round of local fixes while testing a
client branch: commit small fixes on `dev` as you find them (rule 4 — fix them there, not on the
client branch), merge `dev` into the client branch locally as often as you want, and only push either
branch to GitHub once, when you are actually done, not per fix.

A conflict here means the client branch and the shared branch both touched the same lines for
unrelated reasons — read both sides' actual intent before resolving (`git log`/`git show` on both
branches' commits for the conflicted file), the same discipline as any merge, not a reason to take
one side blindly. Re-run typecheck, lint and the test suite after resolving, the same proof every
other change in this repository needs.

## Porting a client's own feature into `main`/`dev`

The direction this template itself was built in for van Oepen's commission/bonus/CRM-sync feature
set:

1. Identify which of the client branch's commits are genuinely generic — no client name, no
   client-specific data, reusable by another client. A commit that only makes sense for one client
   (their specific brand, their specific one-off config) stays on their branch.
2. Cherry-pick those commits onto a new branch off `dev`, in a separate worktree.
3. Audit the result for anything that slipped through: a client's name in a comment, a real person's
   name as a test fixture, a hardcoded email in what should be a reusable preset. Fix before merging,
   not after.
4. Confirm every new catalogue key the feature introduces defaults off (`default_enabled = false`),
   per the hard rule that new behaviour ships off by default.
5. Typecheck, lint, test, and — if the feature touches the schema — apply the full schema set to a
   fresh empty database and confirm it applies clean.
6. Merge into `dev`. Update the relevant module skill(s) under `.claude/skills/module-*` with the new
   catalogue keys, screens, files, tables and functions, the same shape as every other module.

## Checking a client branch against their live database

Before assuming a branch and a client's live database agree, check — don't assume. A schema-only
dump (`supabase db dump --linked --schema public -f <file>`, read-only, no secrets in the output)
compared against the branch's `supabase/schema/*.sql` files will show table/column/function/policy
drift directly. Row counts (`select table_name, count(*) ...` per table, read-only) show which tables
actually have live data — drift in an empty table is low-risk; drift in a table with real rows needs
care, and a migration that would alter or drop a row-bearing table's data is high severity regardless
of which side "wins."

## What this does not change

The clone model in the section above this one is not retired. An existing client whose Hub is a
separate repository keeps working exactly as it does today — nothing here requires migrating them to
a branch. This is the model for a client being brought in or moved onto this way, starting with van
Oepen, not a mandate to re-platform every client at once.

## Known client branches

### van-oepen

The first one, and the worked example everything above is grounded in.

- **Worktree**: `.worktrees/van-oepen` at this repository's root (not a sibling folder — see
  "Creating a client branch" above for why). If that path is gone, recreate it: `git worktree add
  .worktrees/van-oepen van-oepen` — the branch itself already exists and carries all the history
  below, only the worktree checkout needs remaking.
- **Local dev server port**: 3031, not the template's default 3030, so it can run alongside a `dev`
  session in the same window. Start with `npx vite dev --port 3031` from inside the worktree (the
  committed `vite.config.ts` still says 3030; that is the template's default, not this branch's).
- **`.env`**: already present in the worktree, gitignored, pointing at this client's real Supabase
  project. If it is missing (a fresh worktree, or `.env` was never copied), it needs to come from
  wherever this engagement's credentials are kept — not reconstructed from guesswork.
- **The live site**: deployed from the separate `vanoepen` repository
  (`git@github.com:fabiantscheu-ship-it/vanoepen.git`, `main` branch), not from this branch yet.
  `scripts/client/client-repos.json` has the `van-oepen` entry already configured to mirror there via
  `scripts/client/push-client-repo.sh van-oepen`, currently `"enabled": true`.
- **Database state, as of this writing**: the live project has been brought fully up to date with
  what this branch's code expects — `supabase/catalogue.sql` and all three
  `*-for-an-existing-client.sql` presets (practice mode, document privacy/classification,
  handover-routes hardening) have been applied and verified object by object, and
  `outgoing_invoices.last_synced_at` was renamed to `last_sync_at` to match the code. None of this
  needs doing again unless the live project is reset or a new client is being brought up fresh, in
  which case the same presets apply there too.
- **Code parity with production, verified 2026-11-09**: every one of the 32 routes in
  `src/config/routes.ts` was checked page by page against `https://vanoepen.vercel.app/`. They match,
  with two expected gaps — both because production is still running older, unpushed code, not because
  of a bug: `/onboarding-tour` works in the worktree and 404s on production; `/payment-file` 404s on
  production and is a permission-gated "No access" page in the worktree (the route exists, this role
  just isn't granted it). The worktree's permission labels and a few section headers read more
  descriptively than production's (e.g. "Set the filename convention" vs. "File naming") — that's a
  kept, deliberate difference, not drift to fix. One real bug surfaced during the check: the trash
  screen's age filter read `trash.age.*` instead of `trash.ageFilter.*` and showed raw i18n keys
  instead of labels — fixed on `dev` (not the branch) and merged in, per the one rule above.
- **What's still open**: the actual push to the `vanoepen` repository (step 6 above) — the worktree
  and the database are ready for it, and code parity is now verified, but nothing has been pushed
  there yet as of this writing.

A session with no memory of how any of this happened can pick it up cold: `cd` into the worktree,
read `git log --oneline -10`, and the database state above is current unless a later session's own
notes say otherwise.
