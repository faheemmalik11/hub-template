---
name: module-taxes
description: The Taxes module (VAT, the reserve, and the handover to the accountant) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.taxes.
---

# Taxes

`module.taxes` — VAT, the reserve, and the handover to the accountant.

VAT rules, the tax reserve a client puts aside, and the batch handed over to the tax
accountant.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.taxes` | the whole menu group | no |
| `page.vat_rules` | VAT rules — `/ust-regeln` | no |
| `page.tax_reserve` | Tax reserve — `/steuerruecklage` | no |
| `page.handover` | Handover to the accountant — `/datev-uebergabe` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## The screens

- `/ust-regeln` → `page.vat_rules` · `src/routes/ust-regeln/index.tsx`
- `/steuerruecklage` → `page.tax_reserve` · `src/routes/steuerruecklage/index.tsx`
- `/datev-uebergabe` → `page.handover` · `src/routes/datev-uebergabe/index.tsx`

## The files it owns

18 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 56 files are
shared with other modules: never delete one of those on the way out.

- `src/components/integrations/` — route-status.tsx
- `src/data/tax/` — tax.ts
- `src/features/datev-handover/` — BounceBanner.tsx, CompanyTable.tsx, DatevHandoverPage.tsx, ExportDrawer.tsx, HistoryDrawer.tsx, SendDrawer.tsx, SetupDrawer.tsx, adapter.ts, config.ts, index.ts, model.ts
- `src/lib/api/` — document-bundle.functions.ts
- `src/lib/data/` — monthly-bundle.ts
- `src/routes/datev-uebergabe/` — index.tsx
- `src/routes/steuerruecklage/` — index.tsx
- `src/routes/ust-regeln/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `companies`, `lib/format`, `lib/monthly-bundle`, `lib/types`, `rules`, `tax`

**Tables and views**

```
TABLE.assignmentRules, TABLE.changeHistory, TABLE.companies, TABLE.documentFiles,
TABLE.documentHistory, TABLE.documents
```

**Functions**

```
apply_assignment_rule_bulk, apply_assignment_rules, assignment_rule_preview,
assignment_rule_preview_scope, has_company_access, resolve_assignment_rule,
resolve_assignment_rule_candidates, vat_reserve
```

**Translation namespaces** — `datevUebergabe`, `ustRegeln`, `zuordnungsregeln` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**The smallest module with the most client-specific shape.** VAT rates, reserve percentages
and what the accountant expects differ per client and per country, and none of them belong in code.
They are rows.

The handover is a batch with an acknowledgement: `acknowledge_datev_batch` records that the other
side received it. Do not reduce it to an export button, because a client who exports twice and files
both has a real problem and no way to see it happened.

`has_company_access` appears here and almost nowhere else: a reserve is per company, so the screen
has to ask the question directly rather than relying on the list already being filtered.

## Porting it

Port last, and only for a client who hands over to an accountant at all. It needs
Invoices for the documents and Master data for the companies. `datev-handover` is named for the
German format; a client on another format replaces `src/features/datev-handover/` and keeps the
batch and acknowledgement around it.

1. Copy the files above, keeping their paths. They import through `@/`, so a path change
   is a rewrite.
2. Add the catalogue rows for the keys in the two tables above, into the client's
   `supabase/catalogue.sql`. Upserts, so re-running is safe.
3. Add the route entries to `src/config/routes.ts`. **A screen with no entry there has no
   menu item and no guard**, which is the one failure this arrangement is built to prevent.
4. Check every table and function above exists in the client's schema. `node
   scripts/gap-report.mjs` names what is missing.
5. Copy the translation namespaces into both locale files.
6. Grant the capabilities to the roles that should have them, and to nobody else.

## Removing it

Do not delete code. Switch the module off in the panel: the menu group, its pages and
their actions all go, the routes stop answering, and the tables keep their rows in case
the client wants it back. Deleting is only worth it when a client will never have the
module, and then it is the owned files above and nothing else.

## Proving it still works

```
npx tsc -p tsconfig.typecheck.json --noEmit
npx eslint src --quiet
node scripts/module-map.mjs          # the files and tables above, regenerated
node scripts/check-query-keys.mjs    # no key read under one name and refreshed under another
node scripts/walk-screens.mjs        # every screen, including this module's
```
