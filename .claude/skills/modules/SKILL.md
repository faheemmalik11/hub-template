---
name: modules
description: The map of what this Hub is made of: eight modules, thirty screens, and the order to port them in. Load this before porting a module into a client, before adding a screen, before switching a feature off, or when you need to know which module owns a file. Points at one skill per module.
---

# The eight modules

A Hub is eight menu groups. Everything else hangs off one of them, and a client gets each one
switched on or off from the panel without a deploy.

| Module | What it is | Screens | Files of its own | Skill |
|---|---|---|---|---|
| `module.overview` | where a person lands, and their profile | 2 | 21 | `module-overview` |
| `module.invoices` | in, out, and where documents came from | 5 | 67 | `module-invoices` |
| `module.payments` | open items, the bank, reconciling | 5 | 55 | `module-payments` |
| `module.master_data` | the names everything points at | 5 | 34 | `module-master-data` |
| `module.rules` | what happens without anyone doing it | 3 | 18 | `module-rules` |
| `module.taxes` | VAT, the reserve, the handover | 3 | 18 | `module-taxes` |
| `module.reports` | the cost analysis | 1 | 13 | `module-reports` |
| `module.admin` | people, setup, log, trash | 5 | 16 | `module-admin` |

Load the module's own skill before touching it. This one is the map, not the territory.

## Four levels, each owning the one below

```
module   a menu group          module.invoices
page     a screen              page.incoming_invoices
section  part of a screen      (declared where a screen has parts worth switching)
action   something a person does   invoices.approve
```

Switching a node off takes its children with it. That is `live_features()` in
`supabase/schema/0002_permissions.sql`, and it is the only place the rule exists.

Containment is `parent_key`. A dependency that crosses the tree — a screen that is useless without
a capability from another module — is a `feature_requirements` row, resolved by narrowing until
nothing changes, because a chain of them needs negation.

## Entitlement and permission are different questions

**Did this client buy it** is `feature_settings`. **May this person do it** is `role_permissions`
and `user_permissions`. Both are answered in one function, `current_permissions()`, with the
entitlement in front: a capability a client does not have cannot be granted to anyone, including an
administrator.

Which is why the panel switch is not a UI concern. `person_may` answers the same question for
server routes with no session, so a screen hidden in the browser is also a route that stops
answering. See `ui-features` for the whole argument.

## The order to port them in

1. **Overview** — the shell, the landing screen, and proof that sign-in and permissions work.
2. **Administration** — until somebody can be granted rights, no other capability is usable.
3. **Master data** — every other module points at these five lists.
4. **Invoices** — the product. Needs somewhere to file and something to point at.
5. **Rules** — worth having once there are documents to apply them to.
6. **Payments** — needs a bank provider and its keys in the vault.
7. **Taxes** — only for a client who hands over to an accountant.
8. **Reports** — last, because it reads everything above. Ported early it shows an empty screen.

A client who wants only invoices takes 1 to 4 and stops. That is a supported shape, not a partial
install.

## Which module owns a file

```
node scripts/module-map.mjs          # every module, its routes, files, tables and functions
node scripts/module-map.mjs --json   # the same as data
```

It resolves imports for real, including relative ones, and matches `@/data` barrel imports name by
name to the domain that defines them. Without that last part every module appears to depend on all
eighteen domains, which is true of the barrel and false of the code.

A file listed under a module is reachable from that module **and no other**, so it is what a port
carries and what a removal deletes. Everything else is shared, and deleting a shared file on the way
out of one module breaks another.

## Adding a screen

1. The catalogue row in `supabase/catalogue.sql`: a `page` with its `parent_key`, both labels, and
   `locked` only if the client must never lose it.
2. The route entry in `src/config/routes.ts`. **A screen with no entry there has no menu item and no
   guard.** It is reachable by URL whatever the client switched off.
3. The screen itself, asking `useAuth().can` for anything it offers.
4. The server side: any route it calls goes through `requireSupabaseAuth` and `person_may`.
5. Both locale files.
6. Update the module's skill, or regenerate the parts of it that come from `module-map.mjs`.
