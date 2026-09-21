---
name: module-invoices
description: The Invoices module (what comes in, what goes out, and where it came from) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.invoices.
---

# Invoices

`module.invoices` — what comes in, what goes out, and where it came from.

The centre of the product. Incoming invoices with their queues, approvals and detail view;
outgoing invoices; bookings typed by hand; the file-naming rules; and the document sources with the
folders they file into.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.invoices` | the whole menu group | no |
| `page.incoming_invoices` | See incoming invoices — `/eingangsrechnungen` | no |
| `page.outgoing_invoices` | See outgoing invoices — `/ausgangsrechnungen` | no |
| `page.manual_bookings` | Manual bookings — `/manuelle-buchungen` | no |
| `page.file_naming` | File naming — `/dateibenennung` | no |
| `page.document_sources` | Document sources and filing — `/postfach` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## What a person may do

| Capability | Means |
|---|---|
| `documents.read` | See documents |
| `documents.write` | Edit documents |
| `invoices.approve` | Approve |
| `invoices.approve_final` | Give the final approval |
| `invoices.override_workflow` | Set a status by hand |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/eingangsrechnungen` → `page.incoming_invoices` · `src/routes/eingangsrechnungen/$nr.tsx`, `src/routes/eingangsrechnungen/index.tsx`, `src/routes/eingangsrechnungen/upload.tsx`
- `/ausgangsrechnungen` → `page.outgoing_invoices` · `src/routes/ausgangsrechnungen/hochladen.tsx`, `src/routes/ausgangsrechnungen/index.tsx`
- `/manuelle-buchungen` → `page.manual_bookings` · `src/routes/manuelle-buchungen/index.tsx`
- `/dateibenennung` → `page.file_naming` · `src/routes/dateibenennung/index.tsx`
- `/postfach` → `page.document_sources` · `src/routes/postfach/index.tsx`

## The files it owns

67 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 435 files are
shared with other modules: never delete one of those on the way out.

- `src/components/belege/` — document-preview.tsx, intent-console-panel.tsx, split-origin-note.tsx, voice-search-button.tsx
- `src/components/data-table/` — sort-control.tsx
- `src/components/invoice-queue/` — next-action-cell.tsx, queue-kpi-card.tsx, queue-kpi-row.tsx
- `src/components/records/` — plain-section.tsx
- `src/components/suppliers/` — account-chips.tsx, payment-account-summary.tsx
- `src/data/companies/` — index.ts
- `src/data/properties/` — index.ts
- `src/data/review/` — review.ts
- `src/features/file-upload/` — checksum.ts, config.ts, upload.ts
- `src/features/invoice-detail/` — AusgangFlag.tsx, InvoiceDetailPage.tsx, ReviewChip.tsx, SideBySide.tsx, WorkflowVerlaufListe.tsx, ausgang.ts, config.ts, verlauf.ts
- `src/hub/adapters/` — document-sources.ts
- `src/kit/components/` — AiSimpleSearch.tsx, FilterFieldsGroup.tsx, backwards.ts, breadcrumbs.ts, bulk-action-bar.tsx, index.ts, index.ts, index.ts, index.ts, index.ts, index.ts, labels.ts, labels.ts, run-bulk-action.ts, selection-checkbox.tsx, shell.tsx, types.ts, unlink-match-button.tsx, use-row-selection.ts, workflow-unlink.ts
- `src/kit/lib/` — index.ts, intent-classification.ts, model.ts, sql-generation.ts, types.ts, where-parser.ts
- `src/kit/pages/` — tanstack-router.ts
- `src/lib/` — belege-list-search.ts, filename.ts
- `src/lib/api/` — invoice-intent-config.ts, invoice-intent.functions.ts
- `src/lib/data/` — invoice-queue-config.ts, kostenstelle.ts
- `src/routes/ausgangsrechnungen/` — hochladen.tsx, index.tsx
- `src/routes/dateibenennung/` — index.tsx
- `src/routes/eingangsrechnungen/` — $nr.tsx, index.tsx, upload.tsx
- `src/routes/manuelle-buchungen/` — index.tsx
- `src/routes/postfach/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `bank`, `categories`, `companies`, `documents`, `folders`, `lib/bank-account-fields`, `lib/channel-sources`, `lib/format`, `lib/invoice-queue-config`, `lib/kostenstelle`, `lib/notification-target`, `lib/opos`, `lib/types`, `manual-bookings`, `outgoing-invoices`, `pipeline`, `properties`, `review`, `rules`, `settings`, `suppliers`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.assignmentRules, TABLE.assistantUsage,
TABLE.bankAccounts, TABLE.bankConnections, TABLE.bankSyncLogs, TABLE.bankTransactions,
TABLE.categories, TABLE.categoryAccountMapping, TABLE.categoryAliases, TABLE.changeHistory,
TABLE.channelFolders, TABLE.channels, TABLE.companies, TABLE.customers,
TABLE.documentBankAccounts, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.entityAliases,
TABLE.filenameSettings, TABLE.ingestExclusions, TABLE.manualBookings, TABLE.matchingSettings,
TABLE.notificationChannels, TABLE.notificationDispatchLog, TABLE.notificationEvents,
TABLE.notificationSettings, TABLE.openItemWhitelistRules,
TABLE.outgoingInvoiceTransactionMatches, TABLE.outgoingInvoices, TABLE.paymentOrders,
TABLE.permissions, TABLE.pipelineRunRequests, TABLE.pipelineRuns, TABLE.pipelineSettings,
TABLE.processingLog, TABLE.properties, TABLE.propertyCompanies, TABLE.rolePermissions,
TABLE.roles, TABLE.supplierBankAccounts, TABLE.supplierIbanHistory, TABLE.suppliers,
TABLE.userCompanyAccess, TABLE.userPermissions, TABLE.vBankTransactionsList,
TABLE.vCompanyDocumentTotals, TABLE.vCustomerInvoiceTotals, TABLE.vDocumentsList,
TABLE.vOpenItems, TABLE.vPropertyDocumentTotals, TABLE.vSupplierDocumentTotals, TABLE.vTrash
```

**Functions**

```
acknowledge_notification, apply_assignment_rule_bulk, apply_assignment_rules, ask_for_a_run,
assignment_rule_preview, assignment_rule_preview_scope, bank_sync_log_facets, chain_people,
channel_secret_present, clear_transaction_fully_used, invoice_matched_sum,
invoice_queue_kpis, invoices_facets, invoices_kpis, invoices_search_ids,
learn_assignment_rule_from_match, link_invoice_transaction,
link_outgoing_invoice_transaction, manual_bookings_expanded, mark_notifications_seen,
opos_clear_no_receipt, opos_reapply_whitelist, opos_set_category, opos_set_no_receipt,
outgoing_invoice_matched_sum, outgoing_transaction_allocated_sum, purge_record,
resolve_approval_rule, resolve_assignment_rule, resolve_assignment_rule_candidates,
restore_record, run_now_enabled, send_notification, set_channel_secret,
set_transaction_fully_used, set_uploaded_outgoing_invoice_status, set_user_slack_id,
suggest_assignment_rules, transaction_allocated_sum, trash_eligible_tables,
trash_purge_eligible_tables
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `notifyDispatch`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `ausgangsrechnungen`, `auswertungen`, `bank`, `belege`, `common`, `dateibenennung`, `home`, `lieferanten`, `manuelleBuchungen`, `ping`, `sources`, `splitOrigin`, `upload`, `zuordnungsregeln` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**The largest module by far: 67 files of its own.** The invoice detail screen and the invoice
list are both built from `src/kit/widgets/`, so a client who wants a different column set or a
different action bar changes a widget, not a page.

`page.document_sources` is where the pipeline meets the Hub. It shows the mailboxes and drives the
pipeline reads, whether each one is connected, and the folder each document is filed into. A client
without the pipeline should have that page switched off; the rest of the module works without it.

The three approval actions form a chain: `invoices.approve` releases a document, `invoices.approve_final`
is the last step before payment, and `invoices.override_workflow` bypasses both. Give the third to
almost nobody: it is the one that can move a document to paid without an approval behind it.

## Porting it

Port after Overview and Master data, because an invoice with no supplier, company or
category to point at cannot be corrected. Take `src/kit/widgets/invoice-list/` and
`src/kit/widgets/invoice-detail/` as whole directories; the column sets and action lists are data
inside them.

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
