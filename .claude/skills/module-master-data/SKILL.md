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
| `page.suppliers` | Suppliers — `/suppliers` | no |
| `page.customers` | Customers — `/customers` | no |
| `page.companies` | Companies — `/companies` | no |
| `page.properties` | Properties — `/properties` | no |
| `properties.crm_sync` | Properties from the CRM — a section of `page.properties` | no |
| `page.categories` | Categories — `/categories` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

`properties.crm_sync` is not a screen of its own: it is a mode of `/properties`. On, the page
renders `CrmPropertyList` instead of the ordinary create-and-edit list; off, the page is
unchanged. It is checked with `useFeature`, not `useAuth().can`: a client has it on or off,
nobody is granted or denied it per role, so there is no new row below in "What a person may do".

## What a person may do

| Capability | Means |
|---|---|
| `master_data.read` | See master data |
| `master_data.write` | Maintain master data |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/suppliers` → `page.suppliers` · `src/routes/suppliers/$id.tsx`, `src/routes/suppliers/index.tsx`
- `/customers` → `page.customers` · `src/routes/customers/$id.tsx`, `src/routes/customers/index.tsx`
- `/companies` → `page.companies` · `src/routes/companies/$id.tsx`, `src/routes/companies/index.tsx`
- `/properties` → `page.properties` · `src/routes/properties/$code.tsx`, `src/routes/properties/index.tsx`. With `properties.crm_sync` on, these render the CRM list and detail instead of the ordinary ones.
- `/categories` → `page.categories` · `src/routes/categories/index.tsx`

## The files it owns

39 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 200 files are
shared with other modules: never delete one of those on the way out.

- `src/components/customers/` — edit-customer-dialog.tsx
- `src/components/documents/` — merge-supplier-dialog.tsx
- `src/components/inbox/` — folder-tree-picker.tsx
- `src/components/master-data/` — known-spellings-card.tsx
- `src/components/properties/` — assignment-dialog.tsx, company-assignment-field.tsx, crm-property-list.tsx, crm-property-section.tsx, listing-labels.ts, sync-properties-button.tsx
- `src/components/records/` — invoice-summary-cell.tsx, section-skeleton.tsx
- `src/components/suppliers/` — bank-account-draft.ts, bank-account-drafts.tsx, merge-suggestions.tsx, supplier-iban-cell.tsx, supplier-link.tsx, types.ts
- `src/components/ui/` — collapsible.tsx
- `src/data/aliases/` — aliases.ts
- `src/features/properties/` — adapter.ts, config.ts, index.ts, property-detail.tsx, property-list.tsx
- `src/lib/` — use-infinite-rows.ts
- `src/lib/crm/` — fields.ts
- `src/lib/forms/` — company-schema.ts, customer-schema.ts, property-schema.ts
- `src/routes/categories/` — index.tsx
- `src/routes/companies/` — $id.tsx, index.tsx
- `src/routes/customers/` — $id.tsx, index.tsx
- `src/routes/properties/` — $code.tsx, index.tsx
- `src/routes/suppliers/` — $id.tsx, index.tsx

Two more files belong to this feature but are invisible to `node scripts/codebase/module-map.mjs`,
because nothing under `src/` imports them — see "What is worth knowing" below:

- `src/lib/crm/` — propstack.ts
- `supabase/functions/_shared/` — propstack.ts

Regenerate the rest of this list rather than trusting it: `node scripts/codebase/module-map.mjs`.

## What it reads and writes

**Data hooks** — `aliases`, `bank`, `categories`, `companies`, `documents`, `folders`, `lib/bank-account-fields`, `lib/format`, `lib/opos`, `lib/types`, `outgoing-invoices`, `properties`, `rules`, `suppliers`

**Tables and views**

```
TABLE.assignmentRules, TABLE.bankAccounts, TABLE.bankConnections, TABLE.bankSyncLogs,
TABLE.bankTransactions, TABLE.categories, TABLE.categoryAccountMapping, TABLE.changeHistory,
TABLE.channelFolders, TABLE.channels, TABLE.companies, TABLE.customers,
TABLE.documentBankAccounts, TABLE.documentFiles, TABLE.documentHistory, TABLE.documentLinks,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.entityAliases,
TABLE.ingestExclusions, TABLE.openItemWhitelistRules,
TABLE.outgoingInvoiceTransactionMatches, TABLE.outgoingInvoices, TABLE.paymentOrders,
TABLE.properties, TABLE.propertyCompanies, TABLE.supplierBankAccounts,
TABLE.supplierIbanHistory, TABLE.suppliers, TABLE.vCompanyDocumentTotals,
TABLE.vCustomerInvoiceTotals, TABLE.vDocumentsList, TABLE.vOpenItems,
TABLE.vPropertyDocumentTotals, TABLE.vSupplierDocumentTotals, TABLE.vSupplierDuplicates
```

All of a synced property's CRM fields (`crm_status`, `broker_external_id`, `became_sold_at`,
`crm_data` and the rest) live as columns on `TABLE.properties` itself: there is no separate CRM
table, so nothing new appears in this list for the sync.

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

Not listed here: `link_brokers_to_users` and `create_deals_for_sold_properties`, called only
from inside the `propstack-sync` Edge Function below, never from a browser. This section
covers RPCs a screen in this module calls directly.

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `paymentCancel`, `paymentInitiate`, `propstack-sync`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

`propstack-sync` does not go through the `EDGE_FUNCTION` registry
(`src/config/edge-functions.ts`) the other six do: `src/lib/api/property-listings.functions.ts`
invokes it by its literal slug, `db.functions.invoke("propstack-sync", ...)`. That is why
`node scripts/codebase/module-map.mjs` does not find it either — its regex only matches
`EDGE_FUNCTION.xxx` or a bare string, and the call sits inside a server function the scope-
building pass does not follow (see "What is worth knowing"). Found by grepping
`src/lib/api/property-listings.functions.ts` for `functions.invoke` by hand.

**Translation namespaces** — `aliases`, `approvalRules`, `assignmentRules`, `categories`, `common`, `companies`, `customers`, `documentSources`, `documents`, `errors`, `home`, `loadMore`, `properties`, `propertyListings`, `suppliers` in `src/lib/i18n/locales/`.
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

**`properties.crm_sync` replaces the properties list, it does not add to it.** With the section on,
`/properties` renders `CrmPropertyList` (`src/components/properties/crm-property-list.tsx`) instead
of the shared list, with a Sync button and no "Neu", and the detail page
(`src/routes/properties/$code.tsx`) turns off editing, archiving, the companies card, booked
documents and the known-spellings card for every property: a synced property is the CRM's record,
and the next sync overwrites whatever was typed over it anyway. With it off, `/properties` is the
ordinary create-and-edit list, exactly as before this feature. The switch and the screen are
not the same thing: `properties.crm_sync` existing in the catalogue changes nothing by itself until
a client also has a Propstack key and turns `feature_settings` on for it.

**The sync is one Edge Function, triggered two ways, both running the same code.** The "Jetzt
abgleichen" button (`src/components/properties/sync-properties-button.tsx`) calls the
`syncPropertyListings` server function, which calls `propstack-sync` and waits for it
(`{ body: { wait: true } }`). The hourly cron calls the same Edge Function directly and does not
wait (`EdgeRuntime.waitUntil`). Both paths fetch every unit from Propstack, upsert it into
`properties` on (`source`, `external_id`), then run `link_brokers_to_users()` and
`create_deals_for_sold_properties()` — the second is how `module.invoices`'s `deals.from_crm`
actually fires; see that skill.

**The Propstack adapter is copied, not imported.** `src/lib/crm/propstack.ts` maps a Propstack
unit onto the Hub's property shape (`toSyncedProperty`), and is used by the Edge Function, not by
anything under `src/`. `node scripts/codebase/module-map.mjs` walks import graphs reachable from
`src/config/routes.ts`, so a file nothing imports — whether because an Edge Function cannot import
from `src/`, or because it is reached only through a `supabase.functions.invoke` call the scope-
building pass does not follow — is invisible to it, own file or not. `node
scripts/build/copy-edge-shared.mjs` copies `src/lib/crm/propstack.ts` verbatim into
`supabase/functions/_shared/propstack.ts`; edit the source, run the script, never edit the copy.
`supabase/functions/_shared/matching.ts` (owned by `module.payments`) is the same pattern without
the script, kept in sync by hand.

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
   scripts/codebase/gap-report.mjs` names what is missing.
5. Copy the translation namespaces into both locale files.
6. Grant the capabilities to the roles that should have them, and to nobody else.

`properties.crm_sync` needs a CRM before it is worth anything, the same way `module.payments`
needs a bank provider: a client with no CRM leaves it off and the module works exactly as it does
today, properties entered by hand. For a client that has Propstack:

1. Create a read-only API key in Propstack (Verwaltung → API-Schlüssel) and store it as a
   `credentials` row (`channel_key = ''`, `name = 'PROPSTACK_API_KEY'`), sealed the same way a
   document-source channel credential is, never in `.env`.
2. Deploy `supabase/functions/propstack-sync`, after running `node scripts/build/copy-edge-shared.mjs`
   so its `_shared/propstack.ts` matches `src/lib/crm/propstack.ts`.
3. Run `supabase/presets/propstack-hourly-sync.sql` and add the matching cron job in the Supabase
   dashboard (Integrations → Cron) calling the Edge Function hourly; the table row only records
   the last result, the dashboard job is the actual timer.
4. Switch `properties.crm_sync` on in `feature_settings`.
5. For deals to open themselves from a sold property, also port `module.invoices`'s
   `deals.from_crm` and the `broker-role.sql` preset if brokers submit their own commissions.

## Removing it

Do not delete code. Switch the module off in the panel: the menu group, its pages and
their actions all go, the routes stop answering, and the tables keep their rows in case
the client wants it back. Deleting is only worth it when a client will never have the
module, and then it is the owned files above and nothing else.

Switching `properties.crm_sync` off stops the sync and restores the ordinary properties list, but
leaves every already-synced `properties` row in place with its CRM fields filled in: nothing
un-syncs them. Removing the Propstack key from `credentials` stops the Edge Function from doing
anything on its next run, whether or not the switch is also off.

## Proving it still works

```
npx tsc -p tsconfig.typecheck.json --noEmit
npx eslint src --quiet
node scripts/codebase/module-map.mjs          # the files and tables above, regenerated
node scripts/codebase/check-query-keys.mjs    # no key read under one name and refreshed under another
node scripts/codebase/walk-screens.mjs        # every screen, including this module's
node scripts/build/copy-edge-shared.mjs --check   # propstack.ts (and sealed.ts) match their src/ source
npm test                                    # the Propstack mapping and CRM field rules, pure functions
```
