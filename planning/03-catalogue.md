# The catalogue: four levels, and what each Hub seeds

The mechanism is shared. The catalogue is project data, and lives where project data already lives:
each Hub's `supabase/permissions.seed.sql` and `src/lib/permissions.ts`, which are the two files a
new project replaces wholesale.

## The four levels

| Level | What it is | Example key | Declared on |
|---|---|---|---|
| `module` | a sidebar group | `module.invoices` | the nav group entry |
| `page` | one screen | `page.incoming_invoices` | the nav link entry |
| `section` | a card, tab or block inside a screen | `section.invoice_detail.vat` | `src/lib/permissions.ts` |
| `action` | something a person does | `invoices.pay` | already exists today |

Switching a module off takes its pages, their sections and their actions with it, because the
resolver walks the tree.

## One key per capability

A button that performs an action asks the **action** key it already has. The pay button reads
`invoices.pay`, which RLS also enforces on `payment_orders`. It does not get a second key.

Only a part with no action behind it gets its own **section** key: a read-only card, a figure tile,
a tab that only shows numbers.

## Naming

- English identifiers, whatever the URL says: `page.incoming_invoices` for `/eingangsrechnungen`,
  `page.tax_reserve` for `/steuerruecklage`, `page.properties` for `/objekte`.
- The key spells its own place in the tree where that helps a reader:
  `section.invoice_detail.vat`.
- No permission string appears anywhere in `src/` except `permissions.ts`, which is the rule that
  file already states and the reason a rename is one edit and a typo is a compile error.

## What this template seeds

- **6 module rows** for the existing groups: invoices, payments, master data, rules, taxes,
  administration.
- **21 new page rows**, for the nav links that carry no key today. Seven already have one and keep
  it: Dateibenennung, Freigabe-Regeln, Auswertungen, Team, Benachrichtigungen, Protokoll,
  Papierkorb.
- **Parent links** on those seven, plus on the action keys that belong under a page.
- **Grants to every existing role** for the new page and module keys, so the day the migration lands
  nothing is hidden from anyone.
- **`locked = true`** on the overview, the profile and the team page, since the team page is where
  the rights are administered and a client who hides it can no longer put it back.

## The seed stays re-runnable

The existing seed upserts on the key and updates labels, categories and sort order only. It must
**not** be extended to write `default_enabled` on conflict, or a re-run would reset what a client
chose. The client's choice lives in `feature_settings` precisely so the seed can never reach it.

The seed also keeps its existing loud check, the one that refuses to finish silently when a role name
does not match, because a seed that inserts nothing locks every screen for everyone with no clue why.

## Other Hubs

Every Hub that carries the model seeds its own catalogue, with its own pages and its own locked
list. A Hub built for a single business with no companies and no properties simply does not have
those pages, so they need no key.

The older Hubs do not have the permission model yet. They need that ported first;
it is the same single file, and the newest Hub is the worked example of doing it.
