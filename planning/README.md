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
