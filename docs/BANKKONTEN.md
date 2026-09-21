# Bankkonten (Bank accounts and bank connections)

One screen at `/bankkonten`. It used to be two.

## What was asked

Bring the Bank accounts and Bank connections screens up to the standard of the reworked screens
(incoming/outgoing invoices, suppliers, bank reconciliation, overview), and **merge them into a
single page, because they describe the same thing**. The another client Hub had already merged its pair
and was named as the reference. this client is the base; the result has to be portable to a sister Hub,
another client and another client.

## Why they were merged

Two nav entries, one subject, opposite ends of it:

- `/bankkonten` listed the accounts and said nothing about where they came from or how to stop
  them. Removing a provider-fed account cannot work from there, since the next sync recreates it.
- `/bankverbindungen` listed the accesses and could only preview the account names underneath. It
  was also where the sync button and the sync log lived, behind a role gate, so the state of the
  feed was invisible from the screen showing what the feed produced.

The question people arrive with is one question: which bank is feeding us what, and is it still
working. So the connections became the group headers of the accounts table, and the sync controls
moved next to the sync state.

## What is implemented

### Page structure

`src/routes/bankkonten/index.tsx`

```
Bankkonten                                    [Bank verbinden] [Neues Konto]
Verbundene Bankkonten und Zahlungsquellen verwalten.

[ Bankkonten ] [ Pleo ]

[ Konten suchen … ]     [Jetzt synchronisieren] [Protokoll] [Filter]

▾ Sparkasse Rhein-Haardt Bad Dürkheim
  2 Konten · Aktiv · Letzter Abgleich 11:00 · Eingerichtet 13.08.2026
   Konto | Gesellschaft | IBAN | Art | Anbindung | Aktionen
```

Four levels, in this order: page title, tabs, one row of controls, table. Nothing above the tabs
applies to only one of them, and nothing inside a tab is duplicated by the page header. Sections are
separated by typography and spacing, not by a card each: a bordered box per section is what made the
page read as a dashboard of unrelated panels.

**The Bankkonten tab has no section heading and no count line.** The tab strip immediately above it
already names the section, so an `h2` reading "Bankkonten" was the same word twice within twenty
pixels, and the counts ("13 Konten · 4 Gesellschaften · 2 Bankverbindungen · 1 ohne Gesellschaft ·
10 mit doppeltem Namen") restated what the table underneath shows. What is left is a single row:
search on the left, then Jetzt synchronisieren, Protokoll and Filter, all at the same height.

- **Page header**: title, one supporting line, and the two actions that create something. Sync, the
  log, search and the filters all moved down into the tab that owns them.
- **Tabs** (`src/lib/use-tab-param.ts`, `?tab=`): Bankkonten and Pleo. Deliberately labelled
  "Bankkonten" rather than "BANKSapi" -- the provider is how the rows arrive, not what the reader is
  looking at. Both values stay in the `TABS` list even while the Pleo trigger is hidden, so a
  `?tab=pleo` link survives the first render, when the accounts query has not come back yet. The
  strip is not rendered at all on a Hub with no Pleo programme: one tab is decoration.
- **Toolbar**: the shared `ListToolbar` + `FilterPopover` + `FilterPills`, the same row the supplier
  and company lists use, carrying the sync controls as well. Search matches name, holder and IBAN,
  space-insensitive on both sides so a pasted IBAN finds what the screen displays.
- **Table** (`src/components/bank/bank-accounts-table.tsx`): Konto, Gesellschaft, IBAN,
  [Kreditinstitut], Art, Anbindung, Aktionen, grouped by connection. Sorting lives on the column
  headers and orders within each group. Below `sm` the table is replaced by cards with the same
  fields under the same headings.

### Sync status lives in the log dialog

`src/components/bank/sync-status.tsx` replaced the full-width coloured `SyncHealthStrip`, which is
deleted.

The state has to stay somewhere: an automatic job nobody looks at can stop unnoticed, which is what
migration `20260901170200` records. But it is fine 99% of the time, so as a filled panel above the
table it made the loudest thing on the page the thing that is almost never interesting, and as a
line beside a section heading it was still one more thing to read on arrival. It now sits at the top
of the **Protokoll dialog**, which is where somebody is actually asking the question: a dot and a
phrase (`● Synchronisiert vor 24 Minuten`), the new transactions and automatic matches beside it
from `lg` up, and the full sentence with its timestamp and any error message on the `title`.

It is passed through `DialogDescription asChild` wrapped in a `div`, because `SyncStatus` renders
null while its first read is in flight and Radix needs an element to point `aria-describedby` at.

The dialog lost its blurb, and the panel inside it lost its own `SYNC LOG` heading and the paragraph
explaining how the figures are counted: the dialog title already said it once, and the paragraph
pushed the table people opened the dialog for below the fold. That reconciliation caveat is still
recorded in `docs/audit/bankverbindungen/bank-connections/ISSUES.md` #7.

`[Jetzt synchronisieren]` and `[Protokoll]` are both outline buttons in the toolbar row, beside
Filter.

### Switching a single account off

`is_active` (migration `20260902160000_bank_account_active.sql`),
`src/components/bank/account-active-switch.tsx`, `setBankAccountActive` in
`src/lib/api/bank-accounts.functions.ts`, `useSetBankAccountActive` in `queries.ts`.

**A provider-fed bank account cannot be deleted.** BANKSapi documents only two DELETEs,
`/customer/v2/bankzugaenge` (every access) and `/customer/v2/bankzugaenge/{access-id}` (one bank),
and nothing per account. The account cannot be detached at the source, so the next hourly sync
upserts it straight back, and a button whose effect undoes itself within the hour is worse than no
button.

So there are now three states, not two:

| State                    | Column            | What happens                                                                                                                   |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Aktiv                    | `is_active` true  | Normal. New movements are imported hourly.                                                                                     |
| Deaktiviert (the switch) | `is_active` false | Row stays, every imported movement stays, bank-sync fetches nothing new. Reversible.                                           |
| Entfernt (legacy, no UI) | `excluded_at` set | Movements purged with their invoice matches and receipt files; product off the feed for good. Invisible in the Hub, see below. |

The switch is the **only** per-row action besides Edit. There is no delete button: for a
provider-fed account it could not work, and for every account the alternative it used to sit beside
("Konto entfernen") purged the movements with their invoice matches and receipt files, which is not
what anybody reaching for "delete" wants. Switching off achieves the actual intent, stop importing
this, and is reversible. It covers manual accounts too, since it is now the only way to take one out
of use. A switched-off account's name is struck through and dimmed rather than badged.

The predicate is `a.is_active === false`, never `!a.is_active`: on a database where the migration
has not been applied the column is absent, and treating undefined as "off" would empty the table.

`bank-sync` reads `is_active` into `inactiveAccountIds` alongside the excluded set and skips those
accounts in its per-account transaction loop, logging `accounts_inactive_skipped` so an account that
stops receiving movements is never silently missing. **It must never write the column**, the same
rule as `name_is_custom`, or the hourly run would reset the choice.

**Deployment order matters.** Apply both migrations (`20260902160000_bank_account_active.sql`,
`20260902170000_bank_connection_disconnected.sql`) and deploy `bank-sync` and the new
`bank-disconnect` before, or with, the app.
`is_active` was deliberately left out of `BANK_ACCOUNT_COLUMNS`, so create/edit/remove/restore keep
working on a database where the migration has not run; the only thing that fails pre-migration is
the switch itself, and it fails with a toast rather than taking the page down.

### Status is Aktiv | Inaktiv | Alle

`Filter → Status` reads `is_active`: **Aktive Konten** (default), **Inaktive Konten**, **Alle
Konten**. There was briefly a quick checkbox beside the search doing the same job; it was removed,
the filter is the one place.

It used to be `Aktiv | Entfernt` over `excluded_at`. That split described a state nobody could
reach once removal lost its button, and "Aktiv" was doing double duty: it meant "not removed", so a
switched-off account was an "Aktiv" row.

**Groups are collapsed by default**, and any narrowing unfolds them all: filtering is a request to
see what matches, and folded headers would answer it with a row of counts. "Narrowing" is an
explicit predicate (a search term, or a filter away from its default), NOT
`konten.length !== alleKonten.length`. The length comparison was the first version and it was wrong
the moment one account was switched off: the default status filter hides inactive accounts, so the
lengths differed with nobody having filtered anything, every group was permanently force-expanded,
and the collapse looked broken.

**Removed accounts have no UI at all any more.** `excludeBankAccount`, `restoreBankAccount`,
`useExcludedBankAccounts`, `useRestoreBankAccount`, `RemoveBankAccountDialog` and
`RestoreBankAccountDialog` all still exist and are all unreferenced. Any account with `excluded_at`
set is now invisible in the Hub and cannot be brought back from it. On this database that is one
account ("Sonstige Darlehen", removed 15.08.2026). Converting it to the new vocabulary is a
one-liner and has NOT been run:

```sql
update public.bank_accounts
   set excluded_at = null, excluded_by = null, exclusion_reason = null, is_active = false
 where excluded_at is not null;
```

That would make it an ordinary inactive row: visible behind the quick filter, switchable back on.
Its purged movements do not return either way; the next sync would re-import whatever the bank still
holds, and bank APIs serve a bounded history.

### Disconnecting a whole bank

`supabase/functions/bank-disconnect/index.ts`, migration
`20260902170000_bank_soft_delete_on_disconnect.sql`, `useDisconnectBank` + `useDisconnectPreview`,
`src/components/bank/disconnect-bank-dialog.tsx`.

`DELETE /customer/v2/bankzugaenge/{access-id}` is the only removal BANKSapi offers and it takes a
whole bank, which is why this lives on the connection group row and a single account is switched off
locally instead. `deleteBankAccess` was added to `_shared/banksapi.ts` (interface, mock, real); a 404
counts as success, since the access being gone is the point.

**Order.** BANKSapi first, and nothing local changes if that call fails: a half-detach that leaves
the access alive is worse than none, because the next sync silently restores everything while the
operator believes the bank is gone.

**Nothing is deleted from the database.** The connection, its accounts, their transactions and its
sync log are all soft-deleted and disappear from the app. A hard delete would take the invoice
matches with it (`invoice_transaction_matches.transaction_id` is `ON DELETE CASCADE`) and leave
every invoice those matches settled still marked paid, because the paid trigger is set-only and
never clears `bezahlt_am`: the conclusion outliving its own evidence, with no way back.

**The hiding is enforced in the SELECT policies, not in the queries.** `bank_transactions` is read
from a dozen places and every one would have to remember the filter; a policy covers the ones
written after this migration too. The service role bypasses RLS, so bank-sync still sees the hidden
rows, which it needs: its incremental cursor stays at the true newest booking date, and
`ON CONFLICT (account_id, banksapi_hash) DO NOTHING` still absorbs a re-delivered movement instead
of inserting a duplicate. `bank_accounts` keeps its query-level filter, because other code reads
soft-deleted accounts deliberately (the trash/restore machinery).

`is_active` is deliberately not touched. It records a human decision about one account, and
resetting it here would silently undo that choice on the next reconnect.

### Reconnecting the same bank

Almost all of it falls out of behaviour bank-sync already had:

|                | What happens                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts       | **Revived.** The reuse branch clears `deleted_at` when the bank delivers a known IBAN again and logs `account_revived`. Company, custom name and `is_active` all survive, because that branch never wrote them. |
| Transactions   | **Stay hidden.** Nothing clears their `deleted_at`. New movements are inserted alongside.                                                                                                                       |
| Sync log       | **Stays hidden.** New runs write new rows.                                                                                                                                                                      |
| Connection row | **A NEW one is created.** See below.                                                                                                                                                                            |

One change was needed: the revive now also moves `connection_id` to the connection that delivered
the IBAN. Without it a revived account came back still pointing at the detached, hidden connection,
so it would appear in the table under no group at all.

**The old connection row is not revived, and cannot straightforwardly be.** bank-sync keys
connections on `banksapi_access_id`, and reconnecting issues a NEW access id, so the lookup misses
and a new row is inserted; the old one stays soft-deleted as history. Matching on the bank instead
would be wrong: two consents to the same Sparkasse are legitimately two connections, and this Hub
has exactly that today. What the reader sees is the bank back with its accounts under it, which is
the visible outcome either way.

### The disconnect confirmation

`DisconnectBankDialog` fetches `useDisconnectPreview` on open (uncached, so it states what is true
now) and lists the actual counts: the BANKSapi access, N accounts, N transactions, N log entries. If
any of those movements back an invoice match it says so in a separate amber block, because the match
and the paid mark survive while the movement behind them stops being readable until the bank is
reconnected.

The confirm button stays disabled until `ENTFERNEN` / `REMOVE` is typed. Typed rather than merely
confirmed because one part is genuinely irreversible even though nothing is deleted: the BANKSapi
access. Getting it back means a new webform and a new SCA with the account holder, which cannot be
done from this screen. The confirm is a plain `Button` and not `AlertDialogAction`, because the
latter closes the dialog on click and would dismiss it while the request is in flight.

The Edge Function checks `page.bankverbindungen` ("Manage bank connections") for itself through
`supabase/functions/_shared/permission.ts`, resolving a personal override then the role default, the
same rule `current_permissions()` applies. It cannot lean on RLS: the call reaches out of the
database, and a refusal has to land before the access is deleted at BANKSapi.

`bank-connect` checks `page.bankverbindungen` ("Manage bank connections") the same way, before a
BANKSapi session is created. Until 15.09.2026 it checked nothing: only the Connect button was hidden,
so any signed-in account could start a bank consent session by calling the function directly. A
refusal returns 403.

Disconnecting moved onto the same right on 15.09.2026. It used to check `bank_accounts.remove`, the
switch for turning ONE account off, so connecting and disconnecting the same bank were guarded by
different rights while the Team screen described "Manage bank connections" as covering both. The
Trennen button on /bankkonten follows it (`darfTrennen` in `bank-accounts-table.tsx`). Switching a
single account off stays on `bank_accounts.remove`.

Consequence by role default: supervisors hold `page.bankverbindungen` and not `bank_accounts.remove`,
so they can now disconnect a bank, which stops its import. Take the permission off a person on Team &
Rollen if that is not wanted for them.

### Who connected a bank

A BANKSapi consent belongs to whoever authorised it at their own bank, and only that person can renew
it when it expires. Since 15.09.2026 `bank-connect` writes `connected_by` (the account) and
`connected_by_email` (a fallback that survives the account being removed) onto the connection,
taken from the same permission check that gates the call (migration
`20260915100000_bank_connection_connected_by.sql`). Each bank row on /bankkonten reads "verbunden von
<name>" next to its account count. Connections made before that were not backfilled, since guessing a
name is worse than saying it is unknown, so they read "wer verbunden hat, ist nicht erfasst".

Deploy order matters: `useBankConnections` joins through `bank_connections_connected_by_fkey`, so the
migration has to be applied before this frontend goes live, and before `bank-connect` is deployed.

### Fewer badges

- **The "Name doppelt" badge is gone from the rows.** `account_name` is BANKSapi's product category
  rather than a name, so live it collides on ten of the twelve accounts: a badge on nearly every row
  had stopped carrying information while still competing with the name it commented on. It moved to
  the count line, and then the count line went too, so **this fact is currently shown nowhere** --
  see the open items below.
- **The BANKSapi column is a dot and a word**, not a filled chip. It reads "Verbunden" on nearly
  every row; the exceptions are what needs to stand out.
- **The connection status is a coloured word** on the group's metadata line rather than a pill.
- **Kept as badges**: Sandbox (these figures are fabricated, which muted text cannot say loudly
  enough) and "Keine Gesellschaft" (a permission fact, see below).

### Pleo is its own tab

`src/components/bank/pleo-panel.tsx`, formerly `pleo-card-spenders.tsx` at the foot of the accounts
page. A Pleo programme is not a bank account -- no IBAN, no BIC, no consent, nothing to sync -- and
it sat under the accounts table only because it happens to be stored in `bank_accounts`, which is a
storage detail leaking into the layout.

The tab is a search box (name or email), a filter (`Nur in den letzten 90 Tagen aktiv`, which is how
a dormant card gets found) and the spender table. No heading, no description line and no counts: the
tab strip already says "Pleo" and the table says the rest.

**There is no longer any UI for the Pleo programme's company.** The chip and its edit button lived
in the section header that was removed, and the replacement control in the toolbar was removed after
it. This is worth knowing rather than discovering: `has_company_access(null)` returns **true**, so
while the programme has no company every Pleo movement is readable by every signed-in user, and
assigning one now means an `UPDATE` on `bank_accounts` in SQL. `card-program-dialog.tsx` is still in
the tree and unreferenced; putting it back into the toolbar's `actions` is the whole of the undo.

### The connection group header

`src/components/bank/connection-group-row.tsx`, type `KontoGruppe`.

Two lines, not one. The bank name owns the first at the weight of a row heading; everything the old
connections table carried is one muted dot-separated line under it: account count, consent status,
"Letzter Abgleich {date}", "Eingerichtet {date}", and the amber "Liefert keine Konten" when the
connection delivers nothing. On one line the name competed with five pieces of metadata and a status
pill, so the thing a reader scans for was the hardest to find. Sandbox is the only badge left on the
row; the status is a coloured word instead of a pill.

The groups are built **from the connections, not from the accounts**. Building them from accounts
means a connection delivering nothing has no group and does not appear, which is exactly the bug
recorded as finding #3 in `docs/audit/bankverbindungen/bank-connections/ISSUES.md`: an abandoned
webform, an expired consent and a live connection whose last account was removed all looked
identical, namely absent, while `bank-sync` kept running against them.

Two non-connection buckets exist and are keyed `__manuell` / `__unbekannt`: accounts entered by
hand (`connection_id is null`), and accounts whose connection the current user cannot read. The
second one is listed rather than dropped, so no account can silently vanish from the table.

### Why Pleo shows people and not cards

`usePleoSpender()` in `src/lib/data/queries.ts` feeds the tab above.

The section used to be headed "Firmenkarten" and listed the Pleo `bank_accounts` rows, of which
there is exactly one: `pleo-sync` finds it with `.eq("metadata->>source","pleo").maybeSingle()` and
stamps its id onto every transaction it imports. So a heading promising a list of cards rendered a
single container row.

**Pleo has no cards API.** Checked against Pleo's own documentation index
(`https://developers.pleo.io/llms.txt`): the public families are accounting entries, export, tags,
tax codes, webhook subscriptions, employees and the app marketplace. There is no cards page of any
kind. The nearest endpoint is `GET /v2/employees` on `https://external.pleo.io` (auth: JWT bearer
**or** HTTP Basic with the API key, which is what `_shared/pleo.ts` already uses; scope
`users:read`), returning `id`, `companyId`, `email`, `firstName`, `lastName`, `code`, `jobTitle`,
`phone` and **no card data**. So "which cards exist" cannot be asked.

`WALLET` entries are excluded from the table (`PLEO_NICHT_MITARBEITER` in `queries.ts`). They are the
company funding its own Pleo wallet, so they have no employee because no employee is involved, and
on this database they were 26 entries worth -147.000,00 EUR: 96% of everything with no spender. The
"Ohne Zuordnung" row was outspending every named employee several times over while not being
spending at all. Established from the live table, not guessed:

```
select raw_data->>'family', count(*), sum(amount)
  from bank_transactions where source = 'pleo' and spender_email is null group by 1;
-- WALLET 26 -147000.00 | CARD_PURCHASE 116 -5125.79 | REIMBURSEMENT 1 -147.75 | OUT_OF_POCKET 1 -147.75
```

It is a deny-list, not an allow-list of card families: an unknown family stays visible under "Ohne
Zuordnung" where somebody can notice it, instead of being dropped from the totals silently. The
transactions themselves are untouched, this governs only what the spending table counts.

What the section shows instead is the **spenders**, aggregated from data already synced:
`pleo-sync`'s `spenderOf()` writes `spender_name` and `spender_email` onto every row (migrations
`20260901190000_transaction_spender.sql` and `20260901200000_spender_from_employee_id.sql`, the
second backfilling 176 rows that carried only `raw_data->>'employeeId'`). Per person: transaction
count, total spend and last booking date.

Entries Pleo delivered without an employee are grouped under "Ohne Zuordnung" rather than dropped,
so the per-person figures still add up to the programme's total, and that bucket is pinned to the
bottom of the table regardless of size. On this database it is the largest total of all (144
entries, about 152k), so ranking it by amount put an "Unassigned" row at the head of a list of named
employees, where it read as a mystery colleague outspending everyone. It is a residual and it sits
where a residual belongs.

What remains in it after the WALLET exclusion is 118 entries worth about -5.421 EUR: 116
`CARD_PURCHASE` whose employee Pleo never delivered, plus one `REIMBURSEMENT` and one
`OUT_OF_POCKET`. Those last two carry the identical amount (-147,75 each), which looks like one
expense stored as two legs and would then be double-counted in `bank_transactions`. Not acted on:
two rows is not enough evidence, and it is a pipeline question rather than a UI one.

Spend is stored **negative** (`signedAmount()` in `supabase/functions/_shared/pleo.ts` negates
Pleo's own positive "spent"), and the column renders it that way, so it reads back against the
transactions screen.

**The programme row stays, and stays editable in the tab's header.** It is load-bearing: without it `pleo-sync`
logs `account_missing` and the imported transactions get no account and therefore no company, and
`has_company_access(null)` returns **true**, so every Pleo movement would become readable by every
signed-in user.

**Known cost.** A per-spender total is a question about every row, so there is no `range()` that
answers it. `usePleoSpender()` reads all Pleo rows but only four columns
(`spender_name`, `spender_email`, `amount`, `booking_date`), roughly fifty bytes a row rather than
the full record with its `raw_data` payload. Affordable at the current volume; at a different order
of magnitude the fix is a view or an RPC that groups in Postgres, not a bigger fetch in the browser.

### Sync health

`src/lib/data/sync-health.ts` — `computeSyncHealth(rows, nowMs)`, a pure function over
`bank_sync_logs`, plus `syncNeedsAttention`. Ported from the another client Hub and adapted:

- Completion is `ingest_done` **or** `sync_finished`; a start is `cron_fired`, `ingest_start` or
  `sync_started`. Reading only the ingest pair gets it badly wrong here: per migration
  `20260901170200_ingest_cron_sync_secret.sql` this database had **zero** `ingest_*` rows ever,
  because every hourly call to `ingest` came back 401, so an ingest-only reading would report
  "never ran" over a log full of completed bank syncs.
- `STALE_AFTER_MINUTES = 125` tolerates exactly one missed hourly run.
  `RUNNING_GRACE_MINUTES = 20` separates "still running" from "lost".
- States: `never`, `running`, `ok`, `warn`, `error`, `stalled`, `stale`.

`src/components/bank/sync-status.tsx` renders it, polling `useBankSyncLogs(100, 60_000)` and ticking
a local timer so the relative time does not freeze on an open tab. Colours come from the theme's
status ramp, not from raw Tailwind palette classes. It replaced `sync-health-strip.tsx`, which is
deleted.

### Extracted, portable pieces

| File                                                  | What it is                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/data/sync-health.ts`                         | Pure reducer over `bank_sync_logs`. No React, no Supabase.       |
| `src/components/bank/sync-status.tsx`                 | The compact state line: dot, phrase, counts, full text on hover. |
| `src/components/bank/bank-accounts-table.tsx`         | The grouped table and its mobile card list.                      |
| `src/components/bank/restore-bank-account-dialog.tsx` | Confirmed restore for a removed account.                         |
| `src/components/bank/pleo-panel.tsx`                  | The whole Pleo tab.                                              |
| `src/components/bank/sync-log-dialog.tsx`             | The log, with the sync state line as its header.                 |
| `src/components/bank/trigger-sync-button.tsx`         | The confirmed "Jetzt synchronisieren", with `variant`/`size`.    |
| `src/components/bank/connection-group-row.tsx`        | The connection group header + `KontoGruppe`.                     |

Each takes plain data and labels, and carries no this client-specific vocabulary, so a sibling Hub takes
them as they are. What stays repo-specific is the route itself: the permission names and the removal
flow differ per Hub, and `pleo-panel.tsx` only applies where Pleo is connected.

### Permissions

`bank_connections` and `bank_sync_logs` carry the BANKSapi access handles and the banking
relationship, neither table has a `company_id` to scope by, and migration `20260819160000` denies
both to the assistant role at the database.

The old `BankverbindungenGuard` is gone with the page. `PERMISSIONS.pageBankverbindungen` now gates
the connection layer **inside** `/bankkonten`: without it the page renders the accounts flat, with
no grouping, no health strip, no connect button, no sync and no log. That is the honest shape,
since grouping by connections the reader cannot read would produce headers with nothing behind
them. `PERMISSIONS.bankAccountsRemove` still gates removal and the removed-accounts section's
restore controls.

### Routing and navigation

- `src/routes/bankverbindungen/index.tsx` is now a `beforeLoad` redirect to `/bankkonten`. Kept
  rather than deleted: the route was in the nav for months, so it is in bookmarks and in links
  people sent each other, and a 404 would read as the feature having been removed.
- The `nav.bankverbindungen` entry is out of `src/components/layout/app-shell.tsx`. The locale keys
  stay, because the roles screen still names the `page.bankverbindungen` permission.
- `/banktransaktionen` linked to `/bankverbindungen` under that label; it now links to
  `/bankkonten` under `bank.list.bankkonten`, and its own sync button was replaced by the shared
  `TriggerSyncButton`. That button used to be an unconfirmed single click there and a confirmed one
  on the connections page, for an action that in live mode calls the bank
  (`docs/audit/bankverbindungen/bank-connections/ISSUES.md` #9). The shared toast now names both
  new movements and suggestions, so nothing was lost in the swap.

### Audit findings this pass closes

From `docs/audit/bankkonten/bank-accounts/ISSUES.md`:

- **#9** (Kreditinstitut repeats one value on every row): the column is dropped while grouped, since
  the bank is named on the group header above the rows it owns. Ungrouped it still appears only
  once a second institution exists.
- **#10** (no search/filter/sort): reworked onto the shared toolbar with the filters listed above,
  and sorting moved onto the column headers.

From `docs/audit/bankverbindungen/bank-connections/ISSUES.md`:

- **#9** was "partly fixed": the duplicate sync button remained, unconfirmed on one screen. Both
  now go through `TriggerSyncButton`, so they cannot disagree.

## What is still open

- **No per-connection action** (`bank-connections` #4). There is no disconnect and no
  re-authorise on this Hub: `supabase/functions/` has `bank-connect`, `bank-callback` and
  `bank-sync` and no disconnect function, so there is nothing for a button to call. The another client Hub
  has built both (`useDisconnectBank`, `useReauthorizeBank`) and its group row carries them, which
  is where the port comes from when the Edge Function lands here. The group row is already the
  right place to hang them.
- **Sync is still all-or-nothing.** `bank-sync` is invoked with `body: {}`, so a single connection
  cannot be synced on its own. Per-connection scoping needs the Edge Function to accept a
  connection id.
- **`bank_sync_logs` grows without bound** (`bank-connections` #8). Unchanged: a retention policy
  deletes operational history, so it is a decision rather than a fix.
- **The log's headline figures still cannot be reconciled** with the account and transaction counts
  (`bank-connections` #7).
- **No balance column** (`bank-accounts` #1). Deliberately dropped across all three Hubs: the
  balances are not refreshed reliably enough for a column to imply the freshness it would.
- **Not verified live.** Typecheck, lint and build pass; the screen has not been exercised against
  the dev database in this pass, and "Jetzt synchronisieren" was not clicked, since `BANKSAPI_MODE`
  is live here and a sync talks to the real bank.
- **Pleo employees who have never spent do not appear.** The list is derived from transactions, so
  a cardholder with no entries yet is invisible. `GET /v2/employees` would close that gap and add
  `jobTitle`, at the cost of a second Pleo API surface; whether the existing `plp_` key carries the
  `users:read` scope can only be established at runtime. Judged not worth it for now.
- **The Pleo programme's company cannot be set from the Hub.** See the Pleo section above; this is
  the one place where a UI removal took a capability with it, and it has a security consequence.
- **Two facts lost their home when the count line went.** "10 mit doppeltem Namen" is now shown
  nowhere at all (`bankkonten.namensdubletteTitle` survives in the locales for whatever picks it up
  next), and "1 ohne Gesellschaft" survives only as the per-row amber badge in the Gesellschaft
  column, with no total. Both were deliberate removals, not oversights.
- **An inactive account is still offered elsewhere.** `is_active` is read by `bank-sync` and by this
  screen only. The transaction filter, the payment account picker and the matching still list a
  switched-off account, because narrowing those silently could break a payment flow. Worth deciding
  deliberately rather than by omission.
- **A disconnected bank's soft-deleted rows are never cleaned up.** They stay for good, and nothing
  in the UI can see or purge them. That is the point, but it means `bank_transactions` only ever
  grows; a retention decision belongs with the one already open for `bank_sync_logs`.
- **A paid invoice can outlive the readability of its evidence.** Disconnecting hides a matched
  movement while the match and `bezahlt_am` stay. The dialog says so with a count; reconnecting the
  bank brings the account back but NOT those transactions, so the invoice detail keeps a match
  pointing at a row the browser cannot read.
- **`bank-disconnect` has never been run.** Deploying it and pressing the button deletes a real
  BANKSapi access, which cannot be undone from here: reconnecting means a new webform, a new SCA and
  a new connection row. Not exercised in this pass for that reason.
- **The whole removal path is unreferenced and its one existing row is now invisible.** See the
  Status section above for the SQL that converts it, which has not been run. Decide whether removal
  is coming back before deleting `excludeBankAccount`, `restoreBankAccount`, their two dialogs and
  their hooks.
- **Not verified in a browser.** Typecheck, lint and build pass, and the structure was reviewed by
  reading the composed markup, but the page was not opened against the dev database in this pass:
  it sits behind the Supabase login and no session was available.
- **Switching tabs resets the accounts tab's search and filters.** Radix unmounts inactive
  `TabsContent`, and that state is deliberately local to `KontenTab`. Only `?tab=` is in the URL.
- **Not yet ported** to a sister Hub, another client or another client. this client is the base, per the brief.
