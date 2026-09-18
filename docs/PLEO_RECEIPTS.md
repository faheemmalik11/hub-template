# Pleo receipt files

How the photographed receipt on a Pleo card payment reaches the Hub, and the gap that meant it
stopped for five weeks.

**Companion:** `TRANSACTION_DOCUMENTS.md` covers showing these files on screen. This covers getting
them here.

## The chain

```
cron ingest-hourly  ->  /functions/v1/ingest  ->  pleo-sync      (transactions + receipt METADATA)
                                              ->  pleo-receipts  (the FILES, batch=50)
```

| Piece | Does |
|---|---|
| `pleo-sync` | imports entries into `bank_transactions`, and records the receipt ids Pleo reports into `raw_data.pleo_receipt_ids`. It does **not** download the files. |
| `pleo-receipts` | downloads the actual bytes into Storage and writes an `invoice_files` row with `transaction_id` set. Bounded per call by `?batch=50`, returns `remaining`. |
| `pending_receipt_downloads(p_limit)` | migration `0075`. The anti-join "transactions whose reported receipts have no `invoice_files` row". PostgREST cannot express it, so it lives in SQL. This is the authoritative backlog count. |

Auth: both functions accept either a service-role bearer **matching what Supabase injects into the
function**, or an `x-sync-secret` header. The vault's `service_role_key` does **not** match the
injected one (see migration `20260901170200`), so `x-sync-secret` is what actually gets you in. A
call with only the bearer returns `401 {"error":"unauthorized"}`, which is easy to misread as a
broken key.

## The gap, found 11.09.2026

`ingest` gates the download behind a query parameter:

```ts
const withReceipts = url.searchParams.get("receipts") === "1";
if (withReceipts && keys.includes("pleo")) {
  results.push(await runSource("receipts", "pleo-receipts", "?batch=50"));
}
```

The comment beside it reads "opt-in because it is long-running, the caller decides, the cron
normally does not". The cron POSTed to `/functions/v1/ingest` with no query string, so **nobody ever
decided** and the downloader never ran on a schedule. Every file we held came from one manual run.

It was invisible because transactions kept arriving normally. Only the files stopped, and
`ingest_done` logged "2 source(s) ok" without ever mentioning receipts.

### How it showed up in the data

Share of each month's Pleo transactions with no stored receipt:

| Period | Missing |
|---|---|
| 2022-07 to 2026-06, every month | 0 to 5% |
| 2026-07 | 33% |
| 2026-08 | **100%** |
| 2026-09 | **100%** |

A cliff, not a trend. Employees had not stopped attaching receipts. The newest stored file was
written `2026-08-05 07:09:23`, which is when the last manual run finished.

At that point 151 Pleo transactions had no file, and **103 of them were sitting on a receipt Pleo
had all along** (`raw_data.pleo_receipt_ids` non-empty). The other 48 genuinely have nothing in
Pleo, which is the real case for "Notify someone" (`NOTIFY_SOMEONE.md`).

### Fixed

- **Backfill**, three `pleo-receipts?batch=50` calls: 115 files, 28.6 MB, **0 failures**,
  `pending_receipt_downloads` back to 0.
- **Migration `20260911180000_ingest_cron_fetches_receipts.sql`**: the cron URL becomes
  `/functions/v1/ingest?receipts=1`. Nothing else changes from `20260901170200`; diff it and only
  the URL moves.

After the backfill: 2,078 of 2,126 Pleo transactions carry their receipt. July fell to 1.1% and
August to 3.5%, back in line with the four-year norm. September sat at 45%, which is the genuine
current-month lag while employees catch up, and should settle near 2%.

## Reading it later

The steady-state late-attachment rate is the thing to watch, and it could not be measured while the
downloader was off. Anything much above ~2% for a settled month means either employees are slower
than they were, or this broke again.

```sql
select to_char(t.booking_date, 'YYYY-MM') as month,
       count(*) as total,
       count(*) filter (where f.id is null) as no_file
  from bank_transactions t
  left join invoice_files f on f.transaction_id = t.id and f.deleted_at is null
 where t.source = 'pleo'
 group by 1 order by 1 desc limit 12;
```

## Open

- **`ingest_receipts` is only logged when the step runs.** A future regression looks like the same
  silence: `ingest_done` says "2 source(s) ok" and nothing says receipts were skipped. Logging the
  skip explicitly would have made this visible in a day rather than five weeks.
- The other three hubs are not checked. immonetz and mayestate have Pleo functions of their own.
