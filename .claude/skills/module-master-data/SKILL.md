---
name: module-master-data
description: The Master data module (the names everything else points at) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.master_data.
---

# Master data

`module.master_data` — the names everything else points at.

Suppliers, customers, companies, properties and categories. Every document, rule and booking
refers to a row from one of these five lists.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.master_data` | the whole menu group | no |
| `page.suppliers` | Suppliers — `/lieferanten` | no |
| `page.customers` | Customers — `/kunden` | no |
| `page.companies` | Companies — `/gesellschaften` | no |
| `page.properties` | Properties — `/objekte` | no |
| `page.categories` | Categories — `/kategorien` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## What a person may do

| Capability | Means |
|---|---|
| `master_data.read` | See master data |
| `master_data.write` | Maintain master data |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/lieferanten` → `page.suppliers` · `src/routes/lieferanten/$id.tsx`, `src/routes/lieferanten/index.tsx`
- `/kunden` → `page.customers` · `src/routes/kunden/$id.tsx`, `src/routes/kunden/index.tsx`
- `/gesellschaften` → `page.companies` · `src/routes/gesellschaften/$id.tsx`, `src/routes/gesellschaften/index.tsx`
- `/objekte` → `page.properties` · `src/routes/objekte/$code.tsx`, `src/routes/objekte/index.tsx`
- `/kategorien` → `page.categories` · `src/routes/kategorien/index.tsx`

## The files it owns

34 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 160 files are
shared with other modules: never delete one of those on the way out.

- `src/components/belege/` — merge-supplier-dialog.tsx
- `src/components/kunden/` — edit-customer-dialog.tsx
- `src/components/lieferanten/` — lieferant-link.tsx
- `src/components/objekte/` — company-assignment-field.tsx, zuordnung-dialog.tsx
- `src/components/postfach/` — folder-tree-picker.tsx
- `src/components/records/` — invoice-summary-cell.tsx, section-skeleton.tsx
- `src/components/stammdaten/` — known-spellings-card.tsx
- `src/components/suppliers/` — bank-account-draft.ts, bank-account-drafts.tsx, merge-suggestions.tsx, supplier-iban-cell.tsx, types.ts
- `src/components/ui/` — collapsible.tsx
- `src/data/aliases/` — aliases.ts
- `src/features/properties/` — adapter.ts, config.ts, index.ts, objekt-detail.tsx, objekte-liste.tsx
- `src/lib/` — use-infinite-rows.ts
- `src/lib/forms/` — gesellschaft-schema.ts, kunde-schema.ts, objekt-schema.ts
- `src/routes/gesellschaften/` — $id.tsx, index.tsx
- `src/routes/kategorien/` — index.tsx
- `src/routes/kunden/` — $id.tsx, index.tsx
- `src/routes/lieferanten/` — $id.tsx, index.tsx
- `src/routes/objekte/` — $code.tsx, index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `aliases`, `bank`, `categories`, `companies`, `documents`, `folders`, `lib/bank-account-fields`, `lib/format`, `lib/opos`, `lib/types`, `outgoing-invoices`, `properties`, `rules`, `suppliers`

**Tables and views**

```
TABLE.assignmentRules, TABLE.bankAccounts, TABLE.bankConnections, TABLE.bankSyncLogs,
TABLE.bankTransactions, TABLE.categories, TABLE.categoryAccountMapping, TABLE.changeHistory,
TABLE.channelFolders, TABLE.channels, TABLE.companies, TABLE.customers,
TABLE.documentBankAccounts, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.entityAliases,
TABLE.ingestExclusions, TABLE.openItemWhitelistRules,
TABLE.outgoingInvoiceTransactionMatches, TABLE.outgoingInvoices, TABLE.paymentOrders,
TABLE.properties, TABLE.propertyCompanies, TABLE.supplierBankAccounts,
TABLE.supplierIbanHistory, TABLE.suppliers, TABLE.vCompanyDocumentTotals,
TABLE.vCustomerInvoiceTotals, TABLE.vDocumentsList, TABLE.vOpenItems,
TABLE.vPropertyDocumentTotals, TABLE.vSupplierDocumentTotals, TABLE.vSupplierDuplicates
```

**Functions**

```
apply_assignment_rule_bulk, apply_assignment_rules, assignment_rule_preview,
assignment_rule_preview_scope, bank_sync_log_facets, clear_transaction_fully_used,
invoice_matched_sum, invoice_queue_kpis, invoices_facets, invoices_kpis,
learn_assignment_rule_from_match, link_invoice_transaction,
link_outgoing_invoice_transaction, merge_suppliers, opos_clear_no_receipt,
opos_reapply_whitelist, opos_set_category, opos_set_no_receipt, outgoing_invoice_matched_sum,
outgoing_transaction_allocated_sum, resolve_assignment_rule,
resolve_assignment_rule_candidates, set_transaction_fully_used,
set_uploaded_outgoing_invoice_status, suggest_assignment_rules, transaction_allocated_sum
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `aliases`, `belege`, `common`, `freigabeRegeln`, `gesellschaften`, `home`, `kategorien`, `kunden`, `lieferanten`, `mehrLaden`, `objekte`, `postfach`, `zuordnungsregeln` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**Port this early, because everything points at it.** A rule assigns a category, a document
names a supplier, a property belongs to companies. Ported late, every other module has placeholder
references to fix.

Suppliers carry the part with real consequences: a supplier's bank account is what a payment goes
to. Only an account a person confirmed stands as the master record, and the IBAN history keeps what
it was before. Do not simplify that into a single editable field.

The five pages share one capability pair, `master_data.read` and `master_data.write`, rather than one
per list. Splitting them per list is a catalogue edit and no code change, if a client needs a person
who may maintain suppliers but not companies.

## Porting it

Take the whole module or none of it. A client with no properties switches
`page.properties` off; the table stays empty and nothing breaks, which is cheaper than removing the
column from everything that joins to it.

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
