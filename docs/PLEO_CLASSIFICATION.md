# H2: reading Pleo's own category and property

## What the client asked for

Saskia, this client meeting 09.09.2026, 10:07 to 13:16. In Pleo the employee already sets the receipt, the
category and the property. The Hub showed none of it, so the same assignment was made twice. At
13:03: *"almost everything is already available here in Pleo. Then we could completely avoid doing
the assignments again."* Fabian: *"then we'll pull that data in."*

## Where the data actually is

**Already in our database.** `pleo-sync` has always stored the whole entry in
`bank_transactions.raw_data`, so nothing had to be fetched to find this out. Sampled over 1,000 rows
on 14.09.2026:

| What | Field | Coverage |
|---|---|---|
| Property / cost centre | `tags[].tagId` | 573 of the 600 most recent rows, 13 distinct values |
| Category | `accountId` | 98 percent of rows, 14 distinct values |

Pleo's own documentation calls a tag *"a cost centre ... to associate each expense with a cost
object"*, which is Saskia's model exactly, and 13 tags sits close to her 15 properties.

Three findings that are easy to get wrong:

- **The tag group has changed.** Older entries carry `9b750613-...`, current ones `d1a07cb2-...`.
  Anything that keys on the group instead of the tag will lose the history.
- **The newest entries of a day are untagged**, because the employee has not finished them. A
  coverage check over "the last few rows" reads as zero and looks like the feature is dead.
- **`accountCode` never arrives**, although `PleoEntry` declares it. `supplier` and `splitItems` are
  always empty. The pair that carries the meaning is `tags` and `accountId`.

## What is implemented

### The two lists

`pleo_tags` and `pleo_accounts` (migration `20260914100000_pleo_tags_and_accounts.sql`), filled by
the `pleo-master-data` function from:

```
GET  /v0/tag-groups                        and  /v0/tag-groups/{id}/tags?include_archived=true
POST /v1/chart-of-accounts:search
```

Archived tags are fetched on purpose: an entry from 2022 still points at the tag it was given, and
one whole group has already been retired.

Separate from `pleo-sync` deliberately. Spend arrives hourly, a chart of accounts changes a few
times a year, and bundling them would re-fetch 14 accounts 8,760 times a year for nothing.

### The mapping is a person's job

`pleo_tags.property_id` (or `is_overhead`) and `pleo_accounts.category_id` say what each Pleo value
means here. **Nothing sets them automatically.** A receipt filed against the wrong property is a
wrong number in the tax adviser's books, so the mapping is made once by someone who knows, and
`pleo-master-data` leaves it alone on every later run. The upsert only sends columns Pleo owns.

### On the transaction

`bank_transactions.pleo_tag_id` and `pleo_account_id`, written by `pleo-sync` on every run and
backfilled from `raw_data` by the migration, so the history is populated without re-syncing.

These are provider-owned, which is what keeps `mapEntry()`'s rule intact: the sync must never write
a column a person can set, or a re-sync would flatten their work. The Hub's own `category_id` and
property columns stay untouched.

**`upsert_external_transactions` had to be extended in the same migration.** It has an explicit
column list, so a field the sync adds and the RPC does not know about is accepted, ignored and lost
with no error. Both ids use `coalesce` on update, like `spender_name`, so a manual import that
carries neither cannot wipe what Pleo established.

## How to run it the first time

```
supabase functions deploy pleo-master-data
curl -X POST "$SUPABASE_URL/functions/v1/pleo-master-data" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

The response lists every tag and account with its name, so the first run answers "which tag is
which property?" without a second query. It also writes to `bank_sync_logs` under
`pleo_master_start` / `pleo_master_done`.

A 403 means the API key works for accounting entries but does not carry the tags or
chart-of-accounts scope. That is a different fix from a broken call, which is why the function
distinguishes it.

## What the first live run established (14.09.2026)

**Tags are refused.** `403 ACCESS_DENIED ... Required permission 'READ' on resource 'tag-group'`.
Pleo resolves `/v0/tag-groups` internally to `v3/tag-groups`, so the path is right and the key
simply lacks the scope. This is the one blocker on the property half, and it is an admin change in
Pleo, not a code change.

**Accounts are allowed, and are the wrong list.** The chart-of-accounts search returned 11 rows with
DATEV codes (4650 Bewirtungskosten, 4530 Kfz-Betriebskosten, 4806 Wartungskosten, ...). Over 1,000
transactions there are 17 distinct `accountId` values, and **the two sets do not overlap at all**:
every id in use is absent from the list, and every account in the list is unused.

That is not a bug. Pleo documents `accountId` as "the account (Category)", and the docs explain that
"bookkeepers map synced Chart of Accounts to Categories, and spenders select Categories". So the 11
are the ERP side of that mapping and the 17 are what people actually pick.

Grouping the 17 by merchant confirms they are categories rather than properties:

| Category id | Top merchants | Reads as |
|---|---|---|
| `720bfc99` | DB Vertrieb (199), FLIXBUS, Booking.com | travel |
| `2b4af12e` | EnBW, Parkgebühr, Mr Wash | vehicle and energy |
| `451f117c` | BAUHAUS (72), Lidl, Hornbach | materials |
| `aa1cb237` | Thai Kitchen, Bäcker Görtz | meals |

The tags, by contrast, each mix builders' merchants with train tickets, which is exactly what a
property looks like. The original reading holds: `accountId` is the category, the tag is the
property.

**`accountCode` is documented but never sent.** It is absent from all 1,000 search rows, and
fetching entries one by one settled it: 18 of 19 returned HTTP 200 and the payload carries

```
accountId  attendees  bookkeepingDate  companyId  createdAt  employeeId  exportStatus
family  id  merchant  performedAt  receiptIds  reviewStatus  settledAt  splitItems
status  subFamily  supplier  tags  teamId  totalBillValue  transactionValue  updatedAt
```

with no `accountCode` anywhere. So the accounting-entries family cannot name a category, and the
per-entry lookup is kept only for its diagnostics.

**Merchants alone cannot finish the job either.** They separate the distinctive categories cleanly:

| Category | Evidence | Almost certainly |
|---|---|---|
| `720bfc99` | DB Vertrieb x199, FLIXBUS, Booking.com, Limehome | ADV_TRAVEL |
| `2b4af12e` | EnBW, Parkgebühr, Mr Wash, JET, TOTAL | VEH_FUEL |
| `b5dfa5f6` | Slack, Vercel, Supabase, GitHub, Fireflies | OTH_SOFTWARE_LICENSES |
| `aa1cb237` | Thai Kitchen, Bäcker Görtz, Cafe Ideal | ADV_HOSPITALITY |

but **eight of the seventeen are dominated by the same builders' merchants** (BAUHAUS, Hornbach,
Globus, toom) and cannot be told apart from each other at all. Which is unsurprising for a property
company, and it means guessing would put spend under the wrong BWA line.

## Still open

- **The tag scope.** Nothing on the property half can move until the Pleo key can read tag groups.
- **The mapping itself.** The tags to properties, and the categories to BWA categories, once the
  names are visible. Needs Saskia to confirm the ambiguous ones. A wider sample shows about 20
  distinct tags rather than the 13 first counted, some of them from the retired group.
- **No screen reads any of this yet.** The transaction detail does not show what Pleo said, and
  nothing suggests the Hub property or category from it.
- **H3 depends on this landing**: `exportStatus` and `reviewStatus` are already stored on every row
  (`EXPORTED` on 397 of the 400 oldest sampled), so "Pleo considers this finished" is a filter away
  once there is somewhere to show it.
