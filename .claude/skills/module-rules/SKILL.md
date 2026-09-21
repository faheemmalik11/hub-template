---
name: module-rules
description: The Rules module (what should happen without anyone doing it) end to end: its catalogue keys, routes, files, tables and RPCs. Load this before adding, changing, porting or switching off anything under module.rules.
---

# Rules

`module.rules` — what should happen without anyone doing it.

Assignment rules that fill in a document's company, property and category; approval rules
that decide who must release it; exclusion rules that keep things out of the Hub entirely.

## What a client switches

| Key | Screen | Locked |
|---|---|---|
| `module.rules` | the whole menu group | no |
| `page.assignment_rules` | Assignment rules — `/zuordnungsregeln` | no |
| `page.approval_rules` | Approval rules — `/freigabe-regeln` | no |
| `page.exclusion_rules` | Exclusion rules — `/ausschlussregeln` | no |

Switching the module off takes every page with it. Switching a page off takes its
actions with it. Neither needs a deploy: it is a row in `feature_settings`.

## What a person may do

| Capability | Means |
|---|---|
| `rules.write` | Change the rules |

These are checked twice: in the UI through `useAuth().can`, and on the server
through `person_may` in `src/lib/api/require-permission.ts`. A screen hidden in the
browser whose route still answers is not switched off, it is only invisible.

## The screens

- `/zuordnungsregeln` → `page.assignment_rules` · `src/routes/zuordnungsregeln/index.tsx`
- `/freigabe-regeln` → `page.approval_rules` · `src/routes/freigabe-regeln/index.tsx`
- `/ausschlussregeln` → `page.exclusion_rules` · `src/routes/ausschlussregeln/index.tsx`

## The files it owns

18 files reachable from this module and no other, so a port
carries them and a removal deletes them. Another 158 files are
shared with other modules: never delete one of those on the way out.

- `src/components/zuordnung/` — ki-import-kontenrahmen-dialog.tsx
- `src/hub/adapters/` — approval-rules-labels.ts, approval-rules.ts, assignment-rules-labels.ts, assignment-rules.ts
- `src/kit/pages/` — delete-rule-dialog.tsx, index.ts, labels.ts, rule-editor.tsx, rule-table-row.tsx, rule-table.tsx, rule-tester.tsx, scenario-result.tsx, scope-chips.tsx, specificity.ts
- `src/routes/ausschlussregeln/` — index.tsx
- `src/routes/freigabe-regeln/` — index.tsx
- `src/routes/zuordnungsregeln/` — index.tsx

Regenerate this list rather than trusting it: `node scripts/module-map.mjs`.

## What it reads and writes

**Data hooks** — `approval`, `categories`, `companies`, `lib/format`, `lib/notification-target`, `lib/opos`, `lib/types`, `properties`, `rules`, `suppliers`, `team`

**Tables and views**

```
TABLE.appUsers, TABLE.approvalRules, TABLE.assignmentRules, TABLE.bankTransactions,
TABLE.categories, TABLE.categoryAccountMapping, TABLE.changeHistory, TABLE.companies,
TABLE.documentHistory, TABLE.documents, TABLE.ingestExclusions, TABLE.notificationChannels,
TABLE.notificationDispatchLog, TABLE.notificationEvents, TABLE.notificationSettings,
TABLE.openItemWhitelistRules, TABLE.permissions, TABLE.properties, TABLE.propertyCompanies,
TABLE.rolePermissions, TABLE.roles, TABLE.supplierBankAccounts, TABLE.suppliers,
TABLE.userCompanyAccess, TABLE.userPermissions, TABLE.vBankTransactionsList,
TABLE.vOpenItems, TABLE.vTrash
```

**Functions**

```
acknowledge_notification, apply_assignment_rule_bulk, apply_assignment_rules,
assignment_rule_preview, assignment_rule_preview_scope, chain_people, channel_secret_present,
mark_notifications_seen, opos_reapply_whitelist, opos_set_category, purge_record,
resolve_approval_rule, resolve_assignment_rule, resolve_assignment_rule_candidates,
restore_record, send_notification, set_channel_secret, set_user_slack_id,
suggest_assignment_rules, trash_eligible_tables, trash_purge_eligible_tables
```

**Edge Functions reachable from here** — `notifyDispatch`.
Transitively, through the data hooks above, so not every one is called from a screen
in this module. Each needs its keys in the vault before it answers.

**Translation namespaces** — `ausschlussregeln`, `common`, `freigabeRegeln`, `kontenrahmen`, `vorschlaege`, `zuordnungsregeln` in `src/lib/i18n/locales/`.
Both locales or neither: a key present in one file and missing from the other renders
as the key itself.

## What is worth knowing

**Rules are the difference between a Hub that saves work and one that only stores it.** They
are also the module a client most often wants to change, which is why the rule editor, the tester
and the specificity ordering are all in `src/kit/pages/assignment-rules/`.

The tester matters more than it looks. A rule that silently mis-assigns is worse than no rule,
because nobody reviews a field that is already filled in. Keep `rule-tester.tsx` and
`assignment_rule_preview` in any port, even a minimal one.

Specificity, not order, decides which rule wins. `specificity.ts` holds that comparison. A client
who expects first-match-wins will file a bug against correct behaviour, so say so in their
handover.

## Porting it

Depends on Master data for everything a rule can point at, and on Invoices for anything to
apply to. It is the natural third port after those two.

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
