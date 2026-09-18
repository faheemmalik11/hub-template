# Phases

Nothing here is started. Each phase leaves the system working and is worth shipping on its own.

## Phase 1 — the mechanism

- [ ] Migration: the four columns, `feature_settings`, the recursive clause in
      `current_permissions()`, `feature_tree()`, the locked trigger, the write policy, the
      `change_history` trigger.
- [ ] Apply to dev, confirm `current_permissions()` returns the identical set for every existing
      user with nothing switched off.

**Done when** the database can express a switched-off feature and nobody's Hub has changed.

## Phase 2 — the catalogue

- [ ] 6 module rows, 21 new page rows, parent links, grants to every role, the locked list.
- [ ] `src/lib/permissions.ts` gains the new keys.
- [ ] Re-run the seed twice and confirm a chosen switch survives it.

**Done when** every nav entry has a key and the menu still looks exactly as it does now.

## Phase 3 — the Hub reads it

- [ ] Nav entries carry their keys.
- [ ] One path guard in `AppShell`; the six copied route guards come out.
- [ ] Two refusal messages, page off against no access.
- [ ] Tours and badge counts filtered by the same set.

**Done when** switching a module off by hand in the database hides it everywhere, including a typed
URL, and switching it back restores it with its data intact.

## Phase 4 — the panel tab

- [ ] Read `feature_tree()` per client, render the tree, save only what changed.
- [ ] Locked nodes without a switch, history and last editor shown.
- [ ] A clear message for a Hub without the mechanism.

**Done when** a client can be shaped from the panel during onboarding without touching their code.

## Phase 5 — the other Hubs

- [ ] Port the mechanism to the other Hubs that already have the permission model, each with its
      own catalogue seed.
- [ ] `IfAllowed` into `@hub-kit/core`.
- [ ] `docs/PAGE_VISIBILITY.md` in each Hub, as those repos' own rules require.

**Done when** every Hub that has the permission model can be shaped from the panel.

## Phase 6 — sections, as they come up

- [ ] A section key per part that is actually asked for, one seed row each with a parent.

No migration and no panel change: the tree already holds them.

## Phase 7 — one config folder, then one migration baseline

Planned in `09-migrations-and-config.md`, and worth doing in that order: the config folder is
additive and reversible, the squash is neither.

- [ ] `src/config/` with tables, Edge Function names, buckets, routes, permission keys, brand and the
      two bootstrap values. No name typed outside it, and a check that the Deno twin agrees.
- [ ] One generated baseline replacing the 249 migration files, proved by dumping a fresh project and
      diffing it against the source, marked as applied for every client that already has the state.

**Done when** a new client reaches today's schema in one file, and a renamed table breaks the build
instead of a screen.

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
