---
name: module-admin
description: The Administration module (people, setup, notifications, the log and the trash) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.admin.
---

# Administration

`module.admin` — people, setup, notifications, the log and the trash.

Team and roles, the setup checklist, notification settings, the processing log, and the
trash with its restore and purge.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.admin` | the whole menu group | no |
| `page.team` | Team and roles — `/team` | yes |
| `page.onboarding` | Setup — `/onboarding` | no |
| `page.onboarding_tour` | Guided practice — `/onboarding-tour` | no |
| `page.notifications` | Notifications — `/notifications` | no |
| `page.activity_log` | Activity log — `/activity-log` | no |
| `page.trash` | Trash — `/trash` | no |
| `page.bank_connections` | Bank connections — `no screen` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## What a person may do

| Capability | Means |
|---|---|
| `users.read` | See the team |
| `settings.manage` | Change the setup |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/team` → `page.team` · `src/routes/team/index.tsx`
- `/onboarding` → `page.onboarding` · `src/routes/onboarding/index.tsx`
- `/onboarding-tour` → `page.onboarding_tour` · `src/routes/onboarding-tour/index.tsx`,
  `process-an-invoice.tsx`, `when-does-it-stop.tsx`
- `/notifications` → `page.notifications` · `src/routes/notifications/index.tsx`
- `/activity-log` → `page.activity_log` · `src/routes/activity-log/index.tsx`
- `/trash` → `page.trash` · `src/routes/trash/index.tsx`

## The files it owns

25 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 248 files are
shared with other modules: never delete one of those on the way out.

- `src/components/access/` — permission-checklist.tsx, permission-matrix.tsx, types.ts
- `src/config/` — team.ts
- `src/features/onboarding-practice/` — find-live-practice-documents.ts, find-live-stop-cases-records.ts, practice-seeded-records.ts, seed-practice-data.ts, seed-stop-cases-practice-data.ts
- `src/kit/components/notifications/` — bell.tsx, category-pills.tsx, index.ts, notification-row.tsx, notification-section.tsx
- `src/lib/data/` — activity-log-format.ts, use-notification-acks.ts, use-setup-alerts.ts
- `src/routes/activity-log/` — index.tsx
- `src/routes/notifications/` — index.tsx
- `src/routes/onboarding-tour/` — index.tsx, process-an-invoice.tsx, when-does-it-stop.tsx
- `src/routes/onboarding/` — index.tsx
- `src/routes/team/` — index.tsx
- `src/routes/trash/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/codebase/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `bank`, `companies`, `folders`, `handover`, `lib/activity-log-format`, `lib/bank-account-fields`, `lib/bwa-export`, `lib/channel-sources`, `lib/format`, `lib/notification-target`, `lib/types`, `lib/use-notification-acks`, `lib/use-notification-items`, `lib/use-setup-alerts`, `lib/use-setup-checklist`, `pipeline`, `properties`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.bankAccounts, TABLE.bankConnections,
TABLE.bankSyncLogs, TABLE.bankTransactions, TABLE.changeHistory, TABLE.channelFolders,
TABLE.channels, TABLE.companies, TABLE.documentFiles, TABLE.documentHistory,
TABLE.documentTransactionMatches, TABLE.documents, TABLE.handoverBatches,
TABLE.handoverRoutes, TABLE.notificationChannels, TABLE.notificationDispatchLog,
TABLE.notificationEvents, TABLE.notificationSettings, TABLE.outgoingInvoiceFiles,
TABLE.outgoingInvoices, TABLE.paymentOrders, TABLE.permissions, TABLE.pipelineRunRequests,
TABLE.pipelineRuns, TABLE.pipelineSettings, TABLE.processingLog, TABLE.properties,
TABLE.propertyCompanies, TABLE.rolePermissions, TABLE.roles, TABLE.userCompanyAccess,
TABLE.userPermissions, TABLE.vBankTransactionsList, TABLE.vOpenItems, TABLE.vTrash
```

**Functions**

```
acknowledge_datev_batch, acknowledge_notification, ask_for_a_run, bank_sync_log_facets,
chain_people, channel_secret_present, mark_notifications_seen, opos_clear_no_receipt,
opos_set_no_receipt, purge_record, resolve_approval_rule, restore_record, run_now_enabled,
seed_onboarding_demo_data, seed_stop_cases_practice_data, send_notification,
set_channel_secret, set_datev_route, set_user_slack_id, team_login_status,
trash_eligible_tables, trash_purge_eligible_tables, update_datev_route_status
```

**Edge Functions reachable from here** — `bankConnect`, `bankDisconnect`, `bankSync`, `expenseToolEmployees`, `notifyDispatch`, `paymentCancel`, `paymentInitiate`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `activityLog`, `approvalRules`, `bank`, `checklist`, `home`, `notifications`, `onboarding`, `ping`, `settings`, `team`, `trash` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**`page.team` is locked, because it is the screen that can put everything else back.** A
client who switched off the screen where rights are administered would need a developer to recover.

Four pages are administrator-only by default, in the catalogue rather than in code:
`page.team`, `page.bank_connections`, `page.activity_log` and `page.trash` are granted only to roles
with `administers`. A client can change that on the Rollen tab; nothing in the code decides it.

The trash is a real safety net and not a nicety. `restore_record` and `purge_record` work off
`trash_eligible_tables`, so a table added later is covered by adding it to that list. Purge is the
only irreversible action outside of payments.

`src/components/access/` is where entitlement meets permission on screen: what the client bought
versus what this person may do. Read `ui-features` before changing anything in it.

## Porting it

Port immediately after Overview. Without Team nobody can be given rights, and every other
module's capabilities are unusable until somebody can grant them.

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

## Removing it

Do not delete code. Switch the module off in the panel: the menu group, its pages and
their actions all go, the routes stop answering, and the tables keep their rows in case
the client wants it back. Deleting is only worth it when a client will never have the
module, and then it is the owned files above and nothing else.

## Proving it still works

```
npx tsc -p tsconfig.typecheck.json --noEmit
npx eslint src --quiet
node scripts/codebase/module-map.mjs          # the files and tables above, regenerated
node scripts/codebase/check-query-keys.mjs    # no key read under one name and refreshed under another
node scripts/codebase/walk-screens.mjs        # every screen, including this module's
```
