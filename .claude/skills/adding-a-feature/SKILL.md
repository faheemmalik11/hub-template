---
name: adding-a-feature
description: The end-to-end order for adding new functionality to this Hub without forking it. Chains the catalogue, schema, data-layer, kit and i18n rules that each live in their own skill, into one sequence, and says which layer owns which decision. Load this before any feature that doesn't fit cleanly inside one module's own "Porting it"/"Adding a screen" section. Points at planning/14-setting-up-a-new-client.md for a brand-new client's own setup — a different task, not covered here.
---

# Adding a feature without forking the template

This is the glue between the skills that each own one layer. It does not replace any of them —
it says what order to touch them in, and which of the three rules in `planning/00-direction.md`
each step is actually protecting.

## First, which of these three is this?

- **A new client, not a new feature.** Stop. That is `planning/14-setting-up-a-new-client.md`
  (the runbook) and `planning/07-hub-template.md` (what the clone still needs). Nothing below
  applies — a new client changes data, never code.
- **A screen or action inside one of the eight existing modules.** Load that module's own
  `module-*` skill and the `modules` skill's "Adding a screen" checklist. That is already the
  right amount of process for this case; this file would only repeat it.
- **Something that doesn't belong to one module yet, or crosses more than one layer** — a new
  table, a new Edge Function, a new kit component, a module-level catalogue key that doesn't
  exist anywhere yet. This file.

## The three rules this whole order exists to protect

1. **Never delete a screen to suit one client.** Switch it off in the catalogue.
2. **Never write a client's name.** Not in code, a comment, a migration, or a seed example.
3. **New behaviour ships off by default**, behind a catalogue switch or a config gate, so an
   existing client's Hub does not change under them when the template moves forward.

Rule 3 is not only a UI rule. A new Edge Function tied to a vendor (a banking or card provider,
a future integration) ships for every client the same way every other file does, but it must
check that client's own config (`resolveBankingAdapter()`/`resolveCardAdapter()`,
`tenant_config`/`feature_settings`) before it does anything vendor-specific — never assume a
provider is active just because the code exists in the repo. Same rule, same reason, applied to
a backend surface instead of a nav entry.

## The order

1. **Catalogue key.** `supabase/catalogue.sql` — a row at the right level (`module`/`page`/
   `section`/`action`), its `parent_key`, `locked` only if the client must never lose it. One key
   per capability — a button asks the action key it already has, never a new `show_x_button` key.
   → `modules` skill.
2. **Schema**, if anything new is stored. The right numbered file under `supabase/schema/`, not a
   migration — that directory is the truth for a fresh clone, migrations are history only. A
   migration is only for a database that already has rows. → `schema` skill.
3. **Table name, spelled once.** `src/lib/data/tables.ts`, and its hand-kept Deno twin
   `supabase/functions/_shared/tables.ts` if an Edge Function touches it too. Never a bare string
   literal. → `data-layer` skill.
4. **Query or mutation hook**, one place, React Query, English identifiers and query keys —
   checked by `node scripts/codebase/check-query-keys.mjs`. → `data-layer` skill.
5. **Server surface**, if this needs one: a TanStack server function or an Edge Function.
   → `backend-api` skill. If it talks to a vendor, gate it on that client's config (see Rule 3
   above) — do not assume the vendor is active.
6. **UI.** Decide first whether this is portable across every Hub or specific to this one.
   Portable → `src/kit`, no `@/` imports, split per the shapes in `granular-components` once it
   passes ~400 lines. This-Hub-only → `src/features`/`src/routes` directly.
7. **Route + guard.** `src/config/routes.ts` — a screen with no entry there has no menu item and
   no guard, and is still reachable by URL regardless of what the client switched off. The screen
   asks `useAuth().can()`; the server side goes through `person_may`/RLS. Never a second gate
   anywhere else — an entitlement or permission checked outside this one path is one the database
   does not know about, and the screen and the data will disagree.
8. **i18n.** New keys in English, in both locale files. German values only in `de.ts`, never in a
   key, a comment, or a stored/logic value. → `i18n` skill.
9. **Update the module's own skill**, or regenerate the parts `node scripts/codebase/module-map.mjs`
   produces, if this extended an existing module. A brand-new module gets its own `module-*`
   skill once it is actually built — not mid-build, and not as a first step.

## What is the client's to change, and what never is

The catalogue's **structure** — which keys exist at all — ships in the template; every client
re-runs the same seed and gets the new row. The catalogue's **choices** —
`default_enabled`, labels, sort order for that one client — are theirs, stored in
`feature_settings`, and a re-run of the seed must never overwrite a choice already made.

If what's being added is genuinely one client's own business rule rather than something every
client could use with the switch off, it does not belong in this repository at all — see
`planning/00-direction.md`.

## Known stale corners

The `module-*` skills are not regenerated on every change. Before trusting a route slug or an
i18n namespace a module skill names, grep the actual code — this session already found one
(`module-admin`) naming German route slugs and locale keys the code had already moved past.

## Proving it still works

```
npx tsc -p tsconfig.typecheck.json --noEmit
npx eslint src --quiet
node scripts/codebase/module-map.mjs          # if an existing module gained a file or a table
node scripts/codebase/check-query-keys.mjs    # no key read under one name and refreshed under another
node scripts/codebase/walk-screens.mjs        # every screen still renders
```

Add `deno check <file>` for anything under `supabase/functions/`.
