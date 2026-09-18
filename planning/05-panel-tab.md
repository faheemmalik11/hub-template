# The panel tab: built once, serves every client

In `admin-ui`, on the tenant workbench, beside the tabs that are already there.

## What it does

- Reads `feature_tree()` from the client's own database, through the pool the panel already opens per
  client (`src/lib/server/tenant-db-pool.ts`, `withTenantDb`).
- Renders the tree: modules, their pages, and any sections that exist, each with a switch.
- Switching a module off switches its children with it, on screen and in what is saved.
- Saves **only what changed**, one row per switched feature in `feature_settings`.
- Shows who last changed each switch, from `updated_by`, and the history from `change_history`.
- A locked node renders without a switch, rather than with one that is refused.

## For a Hub that does not have the mechanism yet

The panel already probes a client's database for tables that may be absent and says so rather than
rendering an empty screen. Same here: name the migration to port, and offer nothing else. Three Hubs
need the permission model itself first.

## Onboarding

This is the point of the feature. A new client cloned from an existing Hub arrives with every module
on. During onboarding we open this tab and switch off what they do not use. No code is touched, no
navigation file is edited, and the client's Hub is identical to every other client's Hub.

## Who wins if the client can edit it too

Not needed yet, since only the panel edits. If a tab is later added inside the Hub, the rule is last
write wins, with `updated_by` on the row and the change in `change_history`, so both sides can see
what the other did. There is no second table and therefore nothing to reconcile.

## What the panel must never do

Write into the client's catalogue. The catalogue is shipped code; the panel writes choices only.
