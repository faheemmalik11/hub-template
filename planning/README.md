# UI features: what a client's Hub shows, and who may use it

Start here. This folder is the plan for what this template is becoming. `00-direction.md` holds the
direction; the numbered files after it plan the first feature towards it: **turning parts of a Hub on
and off per client**, so a client cloned from this template arrives with everything and we switch off
what they do not use, without touching their code.

| File | What it holds |
|---|---|
| `00-direction.md` | **Read first.** Why this exists: one shared codebase, behaviour as data, and the three rules that follow |
| `01-decisions.md` | The problem, every decision taken, and the alternatives rejected with the reason |
| `02-mechanism.md` | The schema, the resolver, the guards, the audit. Identical for every tenant, holds no keys |
| `03-catalogue.md` | The four levels, key naming, and what each Hub seeds for itself |
| `04-hub-changes.md` | What changes inside a Hub: nav keys, one route guard, the component wrapper |
| `05-panel-tab.md` | The admin panel tab that edits any client's switches |
| `06-phases.md` | The phased plan, with what is done and what is next |
| `07-hub-template.md` | The clone a new client starts from, what was stripped out of it, and what it still needs |
| `08-startup.md` | Starting a clone: what stays in `.env`, what the panel writes, and the one table this creates |
| `09-migrations-and-config.md` | Squashing 249 migrations into one honest baseline, and the `src/config/` folder every name is spelled in |
| `10-data-layer.md` | One place for every database call, and modular inside it: the folder shape and how to get there without a big bang |
| `11-schema-at-scale.md` | Whether the schema holds up for N clients, checked against what the field publishes and against the six Hubs already running |
| `12-adopting-an-existing-client.md` | Bringing one of the four Hubs that already exist, with their own history and German-named tables, onto this codebase |
| `13-kit-modularity-and-stories.md` | Making `src/kit` (42,766 lines, 45 primitives, 96 components, 148 page files) granular enough for Storybook |
| `14-setting-up-a-new-client.md` | Setting up a new client start to finish, as it was actually run for `dev-tenant` on 21 Sept 2026 |
| `15-feature-portability-audit-1/` | The first per-client feature-portability audit: what a real client's Hub has that this template doesn't, and a port-or-not call for each |

`06-phases.md` is kept current against the actual code, not written once and left — check its
"updated" line before trusting a checkbox in it.

## `communication/` — this engagement, not the template

`communication/` is gitignored: real client data, offers, transcripts and the dated session log for
Immobilien van Oepen specifically, as opposed to everything above, which plans the template for
every client. Start at `communication/README.md`, then `communication/sessions/INDEX.md` for what
was discussed and decided session by session — its entries are written to stand on their own, so
reading the index is usually enough without opening a dated file behind it.

## The one-paragraph version

Every Hub already has a permission catalogue that the menu, the route guards and the database
policies all read through one function, `current_permissions()`. Today it answers only "may this
person do this". We give the same catalogue a tree and a switch, so it also answers "does this client
use this at all". One clause in that function, and the menu, the typed URL and RLS agree on the
answer for free.

## The two questions, kept apart

- **Entitlement:** does this client use this at all. Set by us in the admin panel, stored in the
  client's own database. Can only ever remove.
- **Permission:** may this person use it. Roles and per-person overrides, exactly as today.

Turning a feature on grants nobody anything. That separation is the whole design.
