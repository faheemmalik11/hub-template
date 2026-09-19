# Architecture

One template, cloned per client. What differs between clients is **data**, not code.

## The layers, outermost first

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  @hub-kit/core          installed, upgraded, shared by every Hub         │
  │  pages · shell · data-table · ui · tour · checklist                      │
  │  Knows no database, no brand, no language. Takes adapters and labels.    │
  └──────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ adapters and labels
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  src/routes/            one file per screen, path = URL                  │
  │  src/components/        this Hub's own screens and pieces                │
  │  src/features/          self-contained units carried between Hubs        │
  │  src/hub/adapters/      what the kit asks for, answered from this app    │
  └──────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ hooks: ask for a thing, get typed rows
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  src/lib/data/          every query and mutation (being split by domain) │
  │  src/lib/api/           server functions: elevated rights live here only │
  └──────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ names, never typed anywhere else
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  src/config/            tables · permissions · routes · buckets ·        │
  │                         edge-functions · brand · env                     │
  └──────────────────────────────────────────────────────────────────────────┘
                                     ▲
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  the client's own Supabase project                                       │
  │  supabase/schema/  13 files · 68 tables · 11 views · 310 functions       │
  │  supabase/catalogue.sql  what this client uses, and who may use it       │
  └──────────────────────────────────────────────────────────────────────────┘
```

Nothing reaches past the layer below it. A component does not build a query; a query does not type a
table name; a name is not invented anywhere but `config/`.

## Where a thing belongs

| It is | It goes in |
|---|---|
| A screen | `src/routes/<path>/index.tsx`, thin: read the adapter, render the page |
| Shared by every Hub | `@hub-kit/core`, fed by copying working code in from a project |
| This Hub's own UI | `src/components/` |
| A unit carried between Hubs as a whole | `src/features/<name>/`, with its own `PORTING.md` |
| What the kit needs from this app | `src/hub/adapters/` |
| A read or a write | `src/lib/data/` |
| Something the browser may not do | `src/lib/api/*.functions.ts` |
| A name | `src/config/` |
| A table, view, policy or function | `supabase/schema/` |
| What THIS client uses | `supabase/catalogue.sql`, and rows in their database |

## The two questions, answered in one place

- **Entitlement** — does this client use this at all. `feature_settings`, set from the admin panel.
- **Permission** — may this person use it. `role_permissions` and `user_permissions`.

Both resolve inside `current_permissions()`, which the menu, the route guard and every RLS policy
read. There is no second gate, so a screen and its data can never disagree. See the `ui-features`
skill.

## What makes a client different

1. Two values in `.env`: their Supabase project and its publishable key. That is the whole bootstrap.
2. Their catalogue: which modules and pages they use.
3. Their brand: `src/config/brand.ts`, the theme tokens, the files in `public/`.
4. Their locale: `src/lib/i18n/locales/`.
5. Their rows: companies, categories, rules, thresholds.

Nothing on that list is a code change, and that is the point. See `planning/08-startup.md`.

## The database

Thirteen numbered files in `supabase/schema/`, concatenated by `scripts/build-baseline.mjs` into the
one migration the CLI applies. Order is not a preference: functions before views, because a view
cannot be created without the function it calls, while a function may read a view that does not
exist yet.

`supabase/migrations-archive/` holds the 248 migrations of the Hub this template came from. Kept for
the questions only history answers, never applied, and never read as a description of the schema.

## Proving a change

Local, always. `supabase start`, then:

| Check | Command |
|---|---|
| The schema builds from nothing | apply the baseline to an EMPTY database |
| Types agree | `npx tsc -p tsconfig.typecheck.json --noEmit` |
| Style agrees | `npx eslint src --quiet` |
| The app actually works | `node scripts/walk-screens.mjs` |

The last one is the one that finds real defects: it signs in and opens all 29 screens, reporting
console errors and failed requests. Run it more than once, since a screen that renders before its
slowest query fires looks fine.
