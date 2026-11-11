# Phases

**Updated 2026-10-15, against the actual code and the live `vanoepen` project** — this file
previously said "nothing here is started," which stopped being true some time before this branch
became van Oepen's Hub. Each item below was checked, not assumed: file paths and function names are
named so the next check is a grep, not a re-read of this file. Each phase leaves the system working
and is worth shipping on its own.

## Phase 1 — the mechanism — done

- [x] `feature_settings` (`supabase/schema/0002_permissions.sql:70`), the recursive clause in
      `live_features()` (`:86`) feeding `current_permissions()` (`:132`), `feature_tree()` (`:164`),
      the locked trigger `guard_locked_feature()` (`:209`, `:223`).
- [x] Applied: `current_permissions()` is called from `src/lib/auth.tsx:159` and is what `useAuth().can`
      resolves against everywhere.

**Done when** the database can express a switched-off feature and nobody's Hub has changed. True on
`vanoepen`: switching `module.reports` and `page.tax_reserve` off on 2026-10-15 took effect
immediately with no deploy, see `communication/sessions/2026-10/2026-10-15-*.md`.

## Phase 2 — the catalogue — done

- [x] Module and page rows, parent links, grants, the locked list: `supabase/catalogue.sql`.
- [x] The key list lives in `src/config/permissions.ts`, not `src/lib/permissions.ts` as originally
      planned here — it moved when the config folder was built (Phase 7).
- [x] The catalogue's own upsert comment states the re-run guarantee directly: "Idempotent: every
      statement upserts, and none of them touches `feature_settings`, so re-running this after
      adding a page never resets what a client switched off" (`supabase/catalogue.sql:9-10`).

**Done when** every nav entry has a key and the menu still looks exactly as it does now. True: every
entry in `src/components/layout/app-shell.tsx`'s nav array carries a `permission:` key.

## Phase 3 — the Hub reads it — done

- [x] Nav entries carry their keys (`app-shell.tsx`, `permission: PERMISSIONS.*` on every entry).
- [x] One path guard in `AppShell`: `featureKeyForPath` + `can(pageFeature)` in
      `app-shell.tsx:271-274`, not a guard per route.
- [x] `showDenied` distinguishes the two cases; a role without the overview lands on its first
      allowed page instead of a denial (`app-shell.tsx:274-280`).
- [ ] Tours and badge counts filtered by the same set — not verified either way this pass.

**Done when** switching a module off by hand hides it everywhere including a typed URL, and
switching it back restores it with its data intact. Confirmed live on 2026-10-15.

## Phase 4 — the panel tab — not started

- [ ] Read `feature_tree()` per client, render the tree, save only what changed.
- [ ] Locked nodes without a switch, history and last editor shown.
- [ ] A clear message for a Hub without the mechanism.

No reference to `feature_tree` or `feature_settings` anywhere under `src/routes/` or `src/kit/` —
checked by grep, not absence of memory. Switching a feature today means a direct SQL write against
`feature_settings`, as done by hand for `module.reports`/`page.tax_reserve` on 2026-10-15. **Done
when** a client can be shaped from the panel during onboarding without touching their code, or a SQL
console.

## Phase 5 — the other Hubs — not from this repo

Not checkable from here: it is about porting the mechanism into the *other* Hub repositories, not
this one. This repo already has the mechanism, independently of whether
it arrived here via that port or via this branch's own history.

## Phase 6 — sections, as they come up — ongoing

- [x] Several already exist where a client actually needed one: `properties.crm_sync`,
      `documents.property_assignment`, `page.bank_connections`, the `broker_bonuses`/`commission_deals`
      sections and actions (`supabase/catalogue.sql`).

No migration and no panel change needed per section: the tree already holds them. This phase has no
"done" state — it continues as long as a client asks for a part to be switchable.

## Phase 7 — one config folder, then one migration baseline — done

Planned in `09-migrations-and-config.md`, done in that order: the config folder first, the squash
second.

- [x] `src/config/`: `tables.ts`, `edge-functions.ts`, `buckets.ts`, `routes.ts`, `permissions.ts`,
      `brand.ts`, `env.ts`, `seed.ts`, `team.ts`. The Deno twin is
      `supabase/functions/_shared/tables.ts`, hand-kept in step per `CLAUDE.md`'s Data layer section.
- [x] `supabase/migrations/00000000000000_schema.sql` is the single generated baseline — its own
      header says so: "GENERATED from `supabase/schema/*.sql` by `scripts/build-baseline.mjs`...
      Everything a new client's database needs, in order, with no history. The 248 migrations of the
      Hub this template came from are not carried." Confirmed against the live `vanoepen` project on
      2026-10-15: table, function and view names match exactly (79/79, 161/161, 11/11).

**Done when** a new client reaches today's schema in one file, and a renamed table breaks the build
instead of a screen. True: `scripts/dump-live-schema.sh` and the baseline generator both exist and
were exercised this session.

## Later, not part of this

- A tab inside a Hub letting the client change their own switches.
- The permission model itself ported to the Hubs that do not have it yet, which is the prerequisite
  for them.
- Driving the navigation itself from the catalogue, so a Hub stops hand-writing its own menu. That is
  the step that removes the last fork between the Hubs, and it is only safe once every page is keyed,
  which phases 2 and 5 do anyway.

## Verification, per Hub, before any phase is called done

- Switch a whole module off: the group disappears, its pages refuse a typed URL with the right
  message, and RLS refuses the same keys.
- Switch it back on: the data is untouched.
- Sign in as a non-admin: the role rules behave exactly as before.
- Typecheck, lint and build clean.
