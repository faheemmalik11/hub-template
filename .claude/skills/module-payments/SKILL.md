---
name: module-payments
description: The Payments module (open items, the bank, and reconciling the two) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.payments.
---

# Payments

`module.payments` — open items, the bank, and reconciling the two.

What is still owed, what actually moved through the bank, and the matching between them.
Includes the bank accounts with their connections, the open-item exceptions, and the matching
settings.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.payments` | the whole menu group | no |
| `page.open_items` | Open items — `/offene-posten` | no |
| `page.bank_transactions` | Bank transactions — `/banktransaktionen` | no |
| `page.bank_accounts` | Bank accounts — `/bankkonten` | no |
| `page.open_item_whitelist` | Open item exceptions — `/opos-whitelist` | no |
| `page.bank_settings` | Bank settings — `/bank-einstellungen` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## What a person may do

| Capability | Means |
|---|---|
| `payments.write` | Raise a payment |
| `bank.read` | See the bank |
| `bank.write` | Reconcile |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/offene-posten` → `page.open_items` · `src/routes/offene-posten/index.tsx`
- `/banktransaktionen` → `page.bank_transactions` · `src/routes/banktransaktionen/$id.tsx`, `src/routes/banktransaktionen/index.tsx`
- `/bankkonten` → `page.bank_accounts` · `src/routes/bankkonten/index.tsx`
- `/opos-whitelist` → `page.open_item_whitelist` · `src/routes/opos-whitelist/index.tsx`
- `/bank-einstellungen` → `page.bank_settings` · `src/routes/bank-einstellungen/index.tsx`

## The files it owns

55 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 184 files are
shared with other modules: never delete one of those on the way out.

- `src/components/bank/` — account-active-switch.tsx, bank-account-dialog.tsx, bank-account-form-fields.tsx, bank-accounts-table.tsx, banksapi-state.ts, connect-bank-dialog.tsx, connection-group-row.tsx, constants.ts, disconnect-bank-dialog.tsx, invoice-matches.tsx, konto-switcher.tsx, link-confirm-dialog.tsx, manual-import-account-form.tsx, manual-import-account-step.tsx, manual-import-ai-preview-step.tsx, manual-import-dialog.tsx, manual-import-mapping-step.tsx, manual-import-preview-step.tsx, manual-import-result.tsx, manual-import-upload-step.tsx, manual-search.tsx, match-candidates.tsx, match-card.tsx, match-panel.tsx, no-receipt-action.tsx, pleo-panel.tsx, possible-invoice-matches.tsx, possible-matches.tsx, sync-log-dialog.tsx, sync-log-panel.tsx, sync-status.tsx, transaction-documents.tsx, trigger-sync-button.tsx, use-bank-account-form.ts, use-possible-invoice-matches.ts, use-possible-matches.ts
- `src/lib/` — use-debounced-value.ts
- `src/lib/api/` — bank-statement-ai.functions.ts
- `src/lib/bank-import/` — column-guess.ts, csv.ts, duplicates.ts, file-to-base64.ts, mapping-storage.ts, normalize.ts, parse-file.ts, xlsx.ts
- `src/lib/data/` — matching.ts, sync-health.ts
- `src/routes/bank-einstellungen/` — index.tsx
- `src/routes/bankkonten/` — index.tsx
- `src/routes/banktransaktionen/` — $id.tsx, index.tsx
- `src/routes/offene-posten/` — index.tsx
- `src/routes/opos-whitelist/` — index.tsx
- `supabase/functions/_shared/` — matching.ts

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `bank`, `categories`, `companies`, `documents`, `lib/bank-account-fields`, `lib/format`, `lib/matching`, `lib/notification-target`, `lib/opos`, `lib/sync-health`, `lib/types`, `outgoing-invoices`, `rules`, `settings`, `suppliers`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.assignmentRules, TABLE.bankAccounts,
TABLE.bankConnections, TABLE.bankSyncLogs, TABLE.bankTransactions, TABLE.categories,
TABLE.categoryAccountMapping, TABLE.changeHistory, TABLE.companies, TABLE.customers,
TABLE.documentFiles, TABLE.documentHistory, TABLE.documentTransactionMatches,
TABLE.documents, TABLE.filenameSettings, TABLE.ingestExclusions, TABLE.matchingSettings,
TABLE.notificationChannels, TABLE.notificationDispatchLog, TABLE.notificationEvents,
TABLE.notificationSettings, TABLE.openItemWhitelistRules,
TABLE.outgoingInvoiceTransactionMatches, TABLE.outgoingInvoices, TABLE.paymentOrders,
TABLE.permissions, TABLE.rolePermissions, TABLE.roles, TABLE.supplierBankAccounts,
TABLE.suppliers, TABLE.userCompanyAccess, TABLE.userPermissions, TABLE.vBankTransactionsList,
TABLE.vCompanyDocumentTotals, TABLE.vCustomerInvoiceTotals, TABLE.vDocumentsList,
TABLE.vOpenItems, TABLE.vPropertyDocumentTotals, TABLE.vSupplierDocumentTotals, TABLE.vTrash
```

**Functions**

```
acknowledge_notification, apply_assignment_rule_bulk, apply_assignment_rules,
assignment_rule_preview, assignment_rule_preview_scope, bank_sync_log_facets, chain_people,
channel_secret_present, clear_transaction_fully_used, invoice_matched_sum,
invoice_queue_kpis, invoices_facets, invoices_kpis, learn_assignment_rule_from_match,
link_invoice_transaction, link_outgoing_invoice_transaction, mark_notifications_seen,
opos_clear_no_receipt, opos_reapply_whitelist, opos_set_category, opos_set_no_receipt,
outgoing_invoice_matched_sum, outgoing_transaction_allocated_sum, purge_record,
resolve_approval_rule, resolve_assignment_rule, resolve_assignment_rule_candidates,
restore_record, send_notification, set_channel_secret, set_transaction_fully_used,
set_uploaded_outgoing_invoice_status, set_user_slack_id, suggest_assignment_rules,
transaction_allocated_sum, trash_eligible_tables, trash_purge_eligible_tables
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `notifyDispatch`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `bank`, `bankAccountForm`, `bankSettings`, `bankkonten`, `bankverbindungen`, `belege`, `common`, `home`, `manualLink`, `matchPanel`, `noReceipt`, `offenePosten`, `oposWhitelist`, `syncLog` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**`/bankverbindungen` is a redirect, not a screen.** Bank connections merged into
`/bankkonten`, where every connection is a group header over the accounts it delivers. The old path
still resolves so that months of bookmarks do not turn into a 404, and it throws in `beforeLoad`,
so nothing of the old page mounts on the way through. It has no `ROUTES` entry because it is not a
screen; that is correct, not an omission.

`page.bank_connections` is still in the catalogue as a switchable page, left over from before the
merge. Switching it off today does nothing. Remove it from the catalogue when you next touch that
file, and remember the row already exists in every client database, so a delete needs to consider
`role_permissions` and `feature_settings` rows pointing at it.

`payments.write` raises real money. It is the only capability in the app whose misuse costs
something that cannot be undone from inside the Hub, which is why it sits behind `invoices.approve_final`
in every default role.

## Porting it

Needs a bank provider before it is worth anything: `bankConnect`, `bankSync` and the
payment functions are Edge Functions, and their keys live in the vault, not in this repo. A client
without a bank connection can still run the module read-only by importing statements, which is what
`src/lib/bank-import/` is for.

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
