---
name: module-overview
description: The Overview module (the screen a person lands on, and their own profile) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.overview.
---

# Overview

`module.overview` — the screen a person lands on, and their own profile.

The first thing anyone sees after signing in: the queues waiting for them, what the pipeline
did overnight, and anything that needs setting up. Plus the profile screen where a person changes
their own name, picture and password.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.overview` | the whole menu group | no |
| `page.overview` | See the overview — `/` | yes |
| `page.profile` | Own profile — `/profil` | yes |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## The screens

- `/` → `page.overview` · `src/routes/index.tsx`
- `/profil` → `page.profile` · `src/routes/profil/index.tsx`

## The files it owns

21 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 407 files are
shared with other modules: never delete one of those on the way out.

- `src/components/dashboard/` — kpi-card.tsx, panel.tsx, ranked-bars.tsx, stage-tiles.tsx, stat-tile.tsx
- `src/components/home/` — bank-card.tsx, dashboard-alert-strip.tsx, money-cards.tsx, open-items-card.tsx, pipeline-stages.tsx, processing-card.tsx, setup-priority-card.tsx, volume-chart.tsx, volume-lists.tsx
- `src/components/notifications/` — alerts.tsx, highlight.tsx
- `src/hub/adapters/` — profile-labels.ts, profile.ts
- `src/kit/components/` — index.ts
- `src/routes/` — index.tsx
- `src/routes/profil/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `bank`, `categories`, `companies`, `documents`, `folders`, `handover`, `lib/bank-account-fields`, `lib/bwa-skeleton`, `lib/channel-sources`, `lib/format`, `lib/notification-target`, `lib/opos`, `lib/types`, `lib/use-bwa-scope`, `lib/use-notification-items`, `lib/use-setup-checklist`, `manual-bookings`, `outgoing-invoices`, `pipeline`, `properties`, `rules`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.assignmentRules, TABLE.bankAccounts,
TABLE.bankConnections, TABLE.bankSyncLogs, TABLE.bankTransactions, TABLE.categories,
TABLE.categoryAccountMapping, TABLE.changeHistory, TABLE.channelFolders, TABLE.channels,
TABLE.companies, TABLE.customers, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.handoverBatches,
TABLE.handoverRoutes, TABLE.ingestExclusions, TABLE.manualBookings,
TABLE.notificationChannels, TABLE.notificationDispatchLog, TABLE.notificationEvents,
TABLE.notificationSettings, TABLE.openItemWhitelistRules, TABLE.outgoingInvoiceFiles,
TABLE.outgoingInvoiceTransactionMatches, TABLE.outgoingInvoices, TABLE.paymentOrders,
TABLE.permissions, TABLE.pipelineRunRequests, TABLE.pipelineRuns, TABLE.pipelineSettings,
TABLE.processingLog, TABLE.properties, TABLE.propertyCompanies, TABLE.rolePermissions,
TABLE.roles, TABLE.suppliers, TABLE.userCompanyAccess, TABLE.userPermissions,
TABLE.vBankTransactionsList, TABLE.vCompanyDocumentTotals, TABLE.vCustomerInvoiceTotals,
TABLE.vDocumentsList, TABLE.vOpenItems, TABLE.vPropertyDocumentTotals,
TABLE.vSupplierDocumentTotals, TABLE.vTrash
```

**Functions**

```
acknowledge_datev_batch, acknowledge_notification, apply_assignment_rule_bulk,
apply_assignment_rules, ask_for_a_run, assignment_rule_preview,
assignment_rule_preview_scope, bank_sync_log_facets, chain_people, channel_secret_present,
clear_transaction_fully_used, invoice_matched_sum, invoice_queue_kpis, invoices_facets,
invoices_kpis, learn_assignment_rule_from_match, link_invoice_transaction,
link_outgoing_invoice_transaction, manual_bookings_expanded, mark_notifications_seen,
my_profile, opos_clear_no_receipt, opos_reapply_whitelist, opos_set_category,
opos_set_no_receipt, outgoing_invoice_matched_sum, outgoing_transaction_allocated_sum,
purge_record, resolve_approval_rule, resolve_assignment_rule,
resolve_assignment_rule_candidates, restore_record, run_now_enabled, send_notification,
set_channel_secret, set_datev_route, set_my_name, set_my_picture_url,
set_transaction_fully_used, set_uploaded_outgoing_invoice_status, set_user_slack_id,
suggest_assignment_rules, transaction_allocated_sum, trash_eligible_tables,
trash_purge_eligible_tables, update_datev_route_status
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `notifyDispatch`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `auswertungen`, `einstellungen`, `home`, `notifications`, `offenePosten`, `profil`, `sources` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**This module cannot be switched off, and neither can its two pages.** `page.overview` and
`page.profile` are `locked` in the catalogue, because a client who turned them off would have
nowhere to land and no way to change their own password.

Its widgets read across the whole app on purpose: a queue card counts documents, a bank card counts
transactions, a setup alert reads the channels. So the overview is the one screen whose content
depends on which other modules are switched on. Every widget asks `useFeature` before it renders;
a widget for a module this client does not have must not show an empty card, it must not be there.

## Porting it

Port this first. Nothing else has a place to sit until the shell and the landing screen
work, and `useAuth`/`current_permissions` prove themselves here before any other screen depends on
them.

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
