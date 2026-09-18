---
name: ui-features
description: How a client's Hub decides what to show. Use when touching navigation, route guards, permissions, the permission catalogue and its seed, or anything that hides a module, page or section per client. Entitlement (does this client use it) and permission (may this person use it) are separate questions resolved by one database function.
---

# UI features: what a client's Hub shows, and who may use it

The full plan is in `planning/`, starting at `planning/README.md`. This skill is the working summary.
Read `planning/01-decisions.md` before proposing anything different; every alternative already
rejected is listed there with its reason.

## The rule

Two questions, kept apart, resolved into one answer:

- **Entitlement** — does this client use this at all. Set in the admin panel, stored in the client's
  own database, in `feature_settings`. Can only ever remove.
- **Permission** — may this person use it. `role_permissions` and `user_permissions`, as today.

Turning a feature on grants nobody anything.

## Where the answer comes from

`current_permissions()` in the client's database. The menu reads it through `can()`, the route guard
reads it, and every RLS policy reads it through `has_permission()`. **Never add a second gate.** An
entitlement checked anywhere else is one the database does not know about, and then the screen and
the data disagree.

## The catalogue is a tree

| Level | What it is | Example key |
|---|---|---|
| `module` | a sidebar group | `module.invoices` |
| `page` | one screen | `page.incoming_invoices` |
| `section` | a card or tab inside a screen | `section.invoice_detail.vat` |
| `action` | something a person does | `invoices.pay` |

Switching a node off takes its children with it.

## Rules that are easy to get wrong

- **One key per capability.** A button that performs an action asks the action key it already has.
  Only a part with no action behind it gets its own section key. Never invent `show_pay_button`
  beside `invoices.pay`.
- **A key is declared once.** Pages and modules on their nav entry; everything else in
  `src/lib/permissions.ts`. No permission string anywhere else in `src/`.
- **English identifiers, whatever the URL says.** `page.incoming_invoices` for `/eingangsrechnungen`.
- **Defaults ship in the catalogue, choices live in `feature_settings`.** The seed may update labels
  and sort order on conflict; it must never write `default_enabled`, or a re-run resets what a client
  chose.
- **Locked nodes are enforced by a trigger**, not by hiding the switch. The overview, the profile and
  the team page are locked, because the team page is where rights are administered.
- **Two refusal messages.** A page the client does not use says so; a page the role may not see says
  no access. The decision comes from the resolved set, the wording from the catalogue.

## When you add a page

1. A key in `src/lib/permissions.ts`.
2. A row in `supabase/permissions.seed.sql`, with its `parent_key`, its `kind` and grants for every
   role.
3. The key on the nav entry. Nothing else: the sidebar filter and the route guard already read it.

## When you add a section

One seed row with a parent, and wrap the part in `IfAllowed`. No migration, no panel change.

## What never goes in the shared migration

A page name, a client name, a German word, or a `tenant_id`. The mechanism holds no keys; keys are
project data. See `planning/02-mechanism.md`.

## State

Nothing is built yet. `planning/06-phases.md` holds the phases and what each is done when.
