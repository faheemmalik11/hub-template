---
name: module-invoices
description: The Invoices module (what comes in, what goes out, and where it came from) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.invoices.
---

# Invoices

`module.invoices` — what comes in, what goes out, and where it came from.

The centre of the product. Incoming invoices with their queues, approvals and detail view;
outgoing invoices; commission deals an estate agency earns on a sale, with a draft invoice per
paying side; the bonuses a broker claims on top of their salary; bookings typed by hand; the
file-naming rules; and the document sources with the folders they file into.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.invoices` | the whole menu group | no |
| `page.incoming_invoices` | See incoming invoices — `/incoming-invoices` | no |
| `documents.property_assignment` | Assign documents to properties — a section of `page.incoming_invoices` | no |
| `page.outgoing_invoices` | See outgoing invoices — `/outgoing-invoices` | no |
| `page.commission_deals` | Commissions — `/commission-deals` | no |
| `deals.from_crm` | Open deals from CRM sales — a section of `page.commission_deals` | no |
| `page.broker_bonuses` | Bonuses — `/broker-bonuses` | no |
| `bonuses.suggest` | Suggest bonuses from sales — a section of `page.broker_bonuses` | no |
| `page.manual_bookings` | Manual bookings — `/manual-bookings` | no |
| `page.file_naming` | File naming — `/file-naming` | no |
| `page.document_sources` | Document sources and filing — `/inbox` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

The three section rows are not screens of their own: `documents.property_assignment` is a field
on the incoming-invoice detail screen, and `deals.from_crm` / `bonuses.suggest` are behaviours of
the commission-deals and broker-bonuses screens. All three are checked with `useFeature`, not
`useAuth().can`: a client has them on or off, and nobody is granted or denied them per role.

`page.commission_deals` and `page.broker_bonuses` ship with `default_enabled = false`, unlike the
rest of this module's pages: a client who is not an estate agency never sees either, even though
the module itself is on. `page.broker_bonuses` also requires `page.commission_deals`
(`feature_requirements`), because a suggested bonus is read off a saved deal.

## What a person may do

| Capability | Means |
|---|---|
| `documents.read` | See documents |
| `documents.write` | Edit documents |
| `invoices.approve` | Approve |
| `invoices.approve_final` | Give the final approval |
| `invoices.override_workflow` | Set a status by hand |
| `deals.submit` | Enter own commissions |
| `bonuses.submit` | Enter own bonuses |
| `bonuses.read` | See approved bonuses |
| `bonuses.review` | Review bonuses |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

`deals.submit` and `bonuses.submit` are held by no role by default: a broker holding one may
create and edit their own deal or bonus while it is unapproved, and never anybody else's or an
approved one. Approving stays `documents.write` (through `approve_deal`) for deals, and
`bonuses.review` for bonuses. `bonuses.read` is read-only, for payroll: it sees every broker's
approved and paid bonuses and changes nothing.

## The screens

- `/incoming-invoices` → `page.incoming_invoices` · `src/routes/incoming-invoices/$nr.tsx`, `src/routes/incoming-invoices/index.tsx`, `src/routes/incoming-invoices/upload.tsx`
- `/outgoing-invoices` → `page.outgoing_invoices` · `src/routes/outgoing-invoices/index.tsx`, `src/routes/outgoing-invoices/upload.tsx`
- `/commission-deals` → `page.commission_deals` · `src/routes/commission-deals/$id.tsx`, `src/routes/commission-deals/index.tsx`
- `/broker-bonuses` → `page.broker_bonuses` · `src/routes/broker-bonuses/index.tsx`
- `/manual-bookings` → `page.manual_bookings` · `src/routes/manual-bookings/index.tsx`
- `/file-naming` → `page.file_naming` · `src/routes/file-naming/index.tsx`
- `/inbox` → `page.document_sources` · `src/routes/inbox/index.tsx`

## The files it owns

89 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 463 files are
shared with other modules: never delete one of those on the way out.

- `src/components/broker-bonuses/` — bonus-settings-dialog.tsx, expandable-note.tsx
- `src/components/commission/` — bonus-suggestions-card.tsx, broker-numbers-card.tsx, broker-numbers.ts, deal-costs-card.tsx, deal-facts-card.tsx, deal-form.ts, deal-status-badge.tsx, draft-invoices.tsx, property-picker.tsx, side-card.tsx
- `src/components/data-table/` — sort-control.tsx
- `src/components/documents/` — document-preview.tsx, intent-console-panel.tsx, linked-documents.tsx, split-origin-note.tsx, voice-search-button.tsx
- `src/components/invoice-queue/` — next-action-cell.tsx, queue-kpi-card.tsx, queue-kpi-row.tsx
- `src/components/records/` — plain-section.tsx
- `src/components/suppliers/` — account-chips.tsx, payment-account-summary.tsx
- `src/data/broker-bonuses/` — broker-bonuses.ts
- `src/data/companies/` — index.ts
- `src/data/deals/` — deals.ts
- `src/data/properties/` — index.ts
- `src/data/review/` — review.ts
- `src/features/file-upload/` — checksum.ts, config.ts, upload.ts
- `src/features/invoice-detail/` — InvoiceDetailPage.tsx, OutgoingFlag.tsx, ReviewChip.tsx, SideBySide.tsx, WorkflowHistoryList.tsx, config.ts, history.ts, outgoing.ts
- `src/hub/adapters/` — document-sources.ts
- `src/kit/components/ai-search/` — AiSimpleSearch.tsx, index.ts, labels.ts
- `src/kit/components/bulk-actions/` — bulk-action-bar.tsx, index.ts, run-bulk-action.ts, selection-checkbox.tsx, use-row-selection.ts
- `src/kit/components/filters/` — FilterFieldsGroup.tsx, index.ts, labels.ts
- `src/kit/components/invoice-payment-link/` — index.ts, unlink-match-button.tsx, workflow-unlink.ts
- `src/kit/components/invoice-workflow/` — backwards.ts, index.ts
- `src/kit/components/shell/` — breadcrumbs.ts, index.ts, shell.tsx, types.ts
- `src/kit/lib/ai-search-sql/` — index.ts, intent-classification.ts, model.ts, sql-generation.ts, types.ts, where-parser.ts
- `src/kit/lib/commission/` — bonuses.ts, calculate.ts, index.ts, types.ts
- `src/kit/pages/document-sources/` — tanstack-router.ts
- `src/lib/` — documents-list-search.ts, filename.ts
- `src/lib/api/` — invoice-intent-config.ts, invoice-intent.functions.ts
- `src/lib/data/` — cost-centre.ts, invoice-queue-config.ts
- `src/routes/broker-bonuses/` — index.tsx
- `src/routes/commission-deals/` — $id.tsx, index.tsx
- `src/routes/file-naming/` — index.tsx
- `src/routes/inbox/` — index.tsx
- `src/routes/incoming-invoices/` — $nr.tsx, index.tsx, upload.tsx
- `src/routes/manual-bookings/` — index.tsx
- `src/routes/outgoing-invoices/` — index.tsx, upload.tsx

`src/kit/lib/commission/` (`calculate.ts`, `bonuses.ts`) is the commission and bonus
calculator: pure functions, no I/O, covered by `calculate.test.ts` and `bonuses.test.ts`.

Regenerate this list rather than trusting it: `node scripts/codebase/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `bank`, `broker-bonuses`, `categories`, `companies`, `deals`, `documents`, `folders`, `lib/bank-account-fields`, `lib/channel-sources`, `lib/cost-centre`, `lib/format`, `lib/invoice-queue-config`, `lib/notification-target`, `lib/opos`, `lib/types`, `manual-bookings`, `outgoing-invoices`, `pipeline`, `properties`, `review`, `rules`, `settings`, `suppliers`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.assignmentRules, TABLE.assistantUsage,
TABLE.bankAccounts, TABLE.bankConnections, TABLE.bankSyncLogs, TABLE.bankTransactions,
TABLE.bonusSettings, TABLE.brokerBonuses, TABLE.categories, TABLE.categoryAccountMapping,
TABLE.categoryAliases, TABLE.changeHistory, TABLE.channelFolders, TABLE.channels,
TABLE.companies, TABLE.customers, TABLE.dealCosts, TABLE.dealParties, TABLE.dealSides,
TABLE.deals, TABLE.documentBankAccounts, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentLinks, TABLE.documentTransactionMatches, TABLE.documents, TABLE.entityAliases,
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

`TABLE.dealSides` and `TABLE.dealCosts` are only ever named inside an embedded-resource
string (`deal_sides:${TABLE.dealSides}(...)` in `src/data/deals/deals.ts`), which
`node scripts/codebase/module-map.mjs` does not parse. Found by grepping `src/data/deals/` and
`src/data/broker-bonuses/` for `TABLE.` by hand; keep doing that rather than trusting the
regenerated list alone for this pair.

**Functions**

```
acknowledge_notification, apply_assignment_rule_bulk, apply_assignment_rules, approve_deal,
ask_for_a_run, assignment_rule_preview, assignment_rule_preview_scope, bank_sync_log_facets,
chain_people, channel_secret_present, clear_transaction_fully_used, invoice_matched_sum,
invoice_queue_kpis, invoices_facets, invoices_kpis, invoices_search_ids,
learn_assignment_rule_from_match, link_invoice_transaction,
link_outgoing_invoice_transaction, manual_bookings_expanded, mark_notifications_seen,
opos_clear_no_receipt, opos_reapply_whitelist, opos_set_category, opos_set_no_receipt,
outgoing_invoice_matched_sum, outgoing_transaction_allocated_sum, purge_record,
resolve_approval_rule, resolve_assignment_rule, resolve_assignment_rule_candidates,
restore_record, run_now_enabled, save_deal, send_notification, set_channel_secret,
set_transaction_fully_used, set_uploaded_outgoing_invoice_status, set_user_slack_id,
suggest_assignment_rules, transaction_allocated_sum, trash_eligible_tables,
trash_purge_eligible_tables
```

`save_deal(p_deal_id, p_deal, p_sides, p_status)` writes the deal, its sides and its payers
in one transaction; any save withdraws an approval. `approve_deal(p_deal_id)` only moves a
deal on from `ready`. Both live in `supabase/schema/0011_functions.sql`. The database itself
checks `documents.write` on both, not `invoices.approve`: the UI offers approval to
`invoices.approve` holders, but the function's own check is the one that is load-bearing.

Not listed here: `link_brokers_to_users` and `create_deals_for_sold_properties`, called only
from inside the `propstack-sync` Edge Function (`supabase/functions/propstack-sync/index.ts`),
never from a browser. This section covers RPCs a screen in this module calls directly.

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `notifyDispatch`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `assignmentRules`, `bank`, `brokerBonuses`, `commissionDeals`, `common`, `documents`, `errors`, `fileNaming`, `home`, `manualBookings`, `outgoingInvoices`, `ping`, `reports`, `sources`, `splitOrigin`, `suppliers`, `upload` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**The largest module by far: 89 files of its own.** The invoice detail screen and the invoice
list are both built from `src/kit/widgets/`, so a client who wants a different column set or a
different action bar changes a widget, not a page.

`page.document_sources` is where the pipeline meets the Hub. It shows the mailboxes and drives the
pipeline reads, whether each one is connected, and the folder each document is filed into. A client
without the pipeline should have that page switched off; the rest of the module works without it.

The three approval actions form a chain: `invoices.approve` releases a document, `invoices.approve_final`
is the last step before payment, and `invoices.override_workflow` bypasses both. Give the third to
almost nobody: it is the one that can move a document to paid without an approval behind it.

A broker entering their own deal or bonus is a different pattern from the approval chain above: it
is not a lesser approval right, it is a person editing their own unapproved row and nothing else.
`deals.submit` is enforced by RLS on `deals`, `deal_sides` and `deal_parties`
(`supabase/schema/0017_broker_commissions.sql`: `is_own_property`, `may_edit_own_deal`), not by a
check inside a screen, so the rule holds even against a direct Postgres call. `bonuses.submit` works
the same way on `broker_bonuses` (`0018_broker_bonuses.sql`). A person becomes a broker by holding a
role with these capabilities and having a `crm_external_id` that matches a property in
`module.master_data`; without that id they own no property and so may submit nothing.

A property the CRM marks sold can open a deal by itself: `create_deals_for_sold_properties()` runs
at the end of every `propstack-sync` run (`module.master_data`'s Edge Function), gated on
`deals.from_crm`, not on anything in this module's own code. Switching `properties.crm_sync` off in
master data does not switch `deals.from_crm` off, and the reverse is also true: the two keys are
independent, and a deal already opened stays open either way.

The commission and bonus rules (`splitByShares`, `calculateDealCommission`, `suggestBonuses`) are
plain functions with no I/O, covered by their own tests rather than against the database. Changing
a rounding rule or a bonus percentage is a change to `src/kit/lib/commission/`, not to a screen.

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
   scripts/codebase/gap-report.mjs` names what is missing.
5. Copy the translation namespaces into both locale files.
6. Grant the capabilities to the roles that should have them, and to nobody else.

Commission deals and broker bonuses are not worth porting for a client that is not an estate
agency: leave `page.commission_deals` and `page.broker_bonuses` at their shipped
`default_enabled = false` and stop. For a client that is one, and wants a broker to enter their own
deals and bonuses rather than an administrator typing them in, also run
`supabase/presets/broker-role.sql` (or `broker-for-an-existing-client.sql` against a database that
already exists) to create the `broker` role and switch on the three features it needs. It is a
preset, not a catalogue row, deliberately: a catalogue role would appear on every client's Team
screen. Opening deals automatically from a CRM sale additionally needs `module.master_data`'s
`properties.crm_sync` ported first, since `deals.from_crm` matches against `properties.source`,
`properties.external_id` and `properties.crm_status`.

## Removing it

Do not delete code. Switch the module off in the panel: the menu group, its pages and
their actions all go, the routes stop answering, and the tables keep their rows in case
the client wants it back. Deleting is only worth it when a client will never have the
module, and then it is the owned files above and nothing else.

Switching `page.commission_deals` or `page.broker_bonuses` off in the panel does not remove the
`broker` role created by the preset above: that role is data, not a catalogue entry, so it has to
be dropped by hand (`delete from public.roles where name = 'broker'`) if a client stops using it.

## Proving it still works

```
npx tsc -p tsconfig.typecheck.json --noEmit
npx eslint src --quiet
node scripts/codebase/module-map.mjs          # the files and tables above, regenerated
node scripts/codebase/check-query-keys.mjs    # no key read under one name and refreshed under another
node scripts/codebase/walk-screens.mjs        # every screen, including this module's
npm test                             # the commission calculator and the bonus rules, pure functions
```
