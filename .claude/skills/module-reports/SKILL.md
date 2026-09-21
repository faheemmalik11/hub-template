---
name: module-reports
description: The Reports module (the cost analysis, built from everything else) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.reports.
---

# Reports

`module.reports` — the cost analysis, built from everything else.

One screen: the cost analysis, broken down by company, property, category and period, with a
history and a CSV export.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.reports` | the whole menu group | no |
| `page.reports` | See reports — `/auswertungen` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## The screens

- `/auswertungen` → `page.reports` · `src/routes/auswertungen/index.tsx`

## The files it owns

13 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 132 files are
shared with other modules: never delete one of those on the way out.

- `src/features/cost-analysis/` — adapter.ts, aufschluesselung.tsx, basis-umschalter.tsx, bwa-report.ts, config.ts, erklaerung.tsx, hinweis-karte.tsx, index.ts, kennzahlen-reihe.tsx, kostenanalyse.tsx, use-infinite-rows.ts, verlauf.tsx
- `src/routes/auswertungen/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `bank`, `categories`, `companies`, `documents`, `lib/bank-account-fields`, `lib/bwa-export`, `lib/bwa-skeleton`, `lib/format`, `lib/opos`, `lib/types`, `lib/use-bwa-scope`, `manual-bookings`, `outgoing-invoices`, `properties`, `rules`

**Tables and views**

```
TABLE.assignmentRules, TABLE.bankAccounts, TABLE.bankConnections, TABLE.bankSyncLogs,
TABLE.bankTransactions, TABLE.categories, TABLE.categoryAccountMapping, TABLE.changeHistory,
TABLE.companies, TABLE.customers, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.ingestExclusions,
TABLE.manualBookings, TABLE.openItemWhitelistRules, TABLE.outgoingInvoiceTransactionMatches,
TABLE.outgoingInvoices, TABLE.paymentOrders, TABLE.properties, TABLE.propertyCompanies,
TABLE.suppliers, TABLE.vCompanyDocumentTotals, TABLE.vCustomerInvoiceTotals,
TABLE.vDocumentsList, TABLE.vOpenItems, TABLE.vPropertyDocumentTotals,
TABLE.vSupplierDocumentTotals
```

**Functions**

```
apply_assignment_rule_bulk, apply_assignment_rules, assignment_rule_preview,
assignment_rule_preview_scope, bank_sync_log_facets, clear_transaction_fully_used,
invoice_matched_sum, invoice_queue_kpis, invoices_facets, invoices_kpis,
learn_assignment_rule_from_match, link_invoice_transaction,
link_outgoing_invoice_transaction, manual_bookings_expanded, opos_clear_no_receipt,
opos_reapply_whitelist, opos_set_category, opos_set_no_receipt, outgoing_invoice_matched_sum,
outgoing_transaction_allocated_sum, resolve_assignment_rule,
resolve_assignment_rule_candidates, set_transaction_fully_used,
set_uploaded_outgoing_invoice_status, suggest_assignment_rules, transaction_allocated_sum
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `auswertungen`, `belege`, `home` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**It owns thirteen files and reads almost every table in the app.** That is not a mistake in
the map: a report is a view over other modules' data by definition. `src/lib/data/use-bwa-scope.ts`
is where that breadth comes from.

Which means switching a module off changes what this screen can show. A client without Payments has
no cash-basis figures; a client without Properties has no breakdown by property. The screen has to
say so rather than show a zero, because a zero reads as "nothing was spent" and not as "this is
switched off".

`src/features/cost-analysis/` is still the one place with German file names in the app
(`kostenanalyse`, `aufschluesselung`, `verlauf`). Rename them when the screen is next worked on, not
as a sweep of its own.

## Porting it

Port after everything it reads. Ported early it shows an empty report, which is the worst
first impression the product can make.

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
