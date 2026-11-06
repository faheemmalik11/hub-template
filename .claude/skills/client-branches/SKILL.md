---
name: client-branches
description: How a client can be a long-lived branch of this repository instead of a separate cloned repo — creating one, bringing in shared updates, and porting a client's own feature back into main/dev. Load this before creating a client branch, merging main/dev into one, or porting work the other way. First done for van Oepen, 2026-11-06.
---

# Client branches

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

```
git worktree add ../hub-template-<client> -b <client> dev   # or main
```

Set the client's name, colours and artwork in `src/config/brand.ts`, `src/styles.css`,
`public/brand/*`, `public/favicon.ico`. Point a local `.env` at the client's own Supabase project. If
the client is being moved from an existing cloned repo rather than starting fresh, port their own
commits across the same way any client feature is ported back into the template (see below), then
reset the brand files to the client's own values afterward, since the ported commits will carry
whatever brand the clone had.

## If a client still keeps their own separate repo too

Some clients, during the move to this model or by choice, still have their own standalone repo (the
one their deployment actually builds from) alongside their branch here. `scripts/client-repos.json`
has one entry per such client, keyed by a client identifier (not necessarily the branch name):
`hubTemplateBranch` (which branch of this repo to push), `clientRemoteName`/`clientRemoteUrl`/
`clientRemoteBranch` (their repo and the branch on their side), and `enabled`. Add an entry there for
a new client, never a hardcoded remote on one developer's machine. New entries default `enabled` to
off, same as any other new behaviour here. `scripts/push-client-repo.sh <client-key>` pushes
`hubTemplateBranch` to this repo's `origin`, and also to the client's own repo if `enabled` is `true`,
adding the remote first if it is not already configured. The client's own repo is still the one
actually deployed until its deployment is re-pointed at this repository — pushing here does not
retire it by itself.

## Bringing in shared updates

From inside the client branch's worktree:

```
git merge dev   # or main
```

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
