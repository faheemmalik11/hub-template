# Receipts on a bank transaction

Covers meeting item **H9** parts 1 and 2 (`a client meeting note`): show the document a
transaction already has, and give one that has none a route to reconciliation.

## What was wrong

Migration `0074` let an `invoice_files` row belong to a `bank_transaction` instead of an invoice — a
Pleo card purchase has no invoice record, the photographed receipt **is** the document. The sync has
been downloading and storing those files since 2026-08: **2,145 files across 2,078 transactions** on
this client (11.09.2026, after a backfill that found the hourly cron had never been asking for them at
all, see `PLEO_RECEIPTS.md`). Nothing in the app ever read them back.

So a transaction that already had its receipt looked exactly like one that had nothing, and the bank
screens were a dead end: the client could see a payment with no document and had no way to find out
that the document was already in the system.

## What is implemented

### Reading the files

`src/lib/api/transaction-files.functions.ts` — `getTransactionFileUrls`, a server function.

Returns a **list**, not one file: one Pleo entry can carry several receipts (a split bill, a photo
plus the emailed PDF), so a handful of transactions carry more than one.

Security follows `getInvoiceFileUrl`: the buckets are private with no `storage.objects` policies, so
the browser can never read them directly. The **service-role** client signs the URLs — but only
after the caller's own RLS-scoped client has proved it can see the transaction, which is what the
`bank_transactions!inner(id)` embed does. `invoice_files` carries a permissive `select using (true)`
policy, so without that embed this would hand any signed-in user any receipt. TTL 600s.

A row whose bytes never reached Storage is skipped rather than failing the list — one unreadable
receipt must not hide the others on the same transaction.

### Showing them

`src/components/bank/transaction-documents.tsx` — shown **in place**, above the matching panel,
because a reader arriving on the page asks "is there a receipt?" before "which invoice settles it?".

Same renderer as the invoice detail (`PdfPane` for PDFs, `<img>` for photos) and the same three
actions in the same order: **open in a new tab, enlarge, download**. A thumbnail strip appears only
when there is more than one file. A failed lookup says nothing rather than claiming there is no
receipt — "no document" is a fact somebody acts on, and a network error rendered as that fact sends
them chasing a document that is already here.

### The list screen

`src/routes/banktransaktionen/index.tsx`. Column order, left to right:

**Datum · Konto · Gegenkonto · Verwendungszweck · Abgleich · Bewegungsart · Betrag**

- **Konto** carries a coloured chip on the right (Pleo or Bank) with the account name. For a Pleo row
  the chip shows the employee's display name and email, falling back to "PLEO". A paperclip sits
  **before** the chip when the transaction has a document.
- **Verwendungszweck** falls back to the Pleo employee when the row has no payment reference. (Some
  Pleo rows *do* carry one, so this is a fallback, not a substitution.)
- **Abgleich** merges what used to be Source and Reconciliation.
- **Bewegungsart** has its own chip colours, deliberately not the Pleo/Bank palette and not red.
- There is no Direction column: `+`/`−` on the amount already says it.

A **document filter** (`beleg` = `mit` / `ohne`, first option "Alle") uses a PostgREST embed;
`has_document` / `document_source` are resolved per page.

**Search** covers `spender_name` and `spender_email` as well — `bankSearchFilter` in
`src/lib/data/queries.ts` widens the query with `or()`, because the full-text index only covers
`payment_reference`, `booking_text` and `counterparty`.

### The transaction with no document

A **"Rechnung zuordnen"** button on the detail links to `/offene-posten?match=txn:<id>` with this
transaction already selected. That screen resolves a transaction which is not in its current list
through its own fallback query, so the link works from here without changing that screen.

## Uploading the missing invoice (H9 part 3)

**"Rechnung hochladen"** on the transaction detail, beside "Rechnung zuordnen". It links to the
existing upload page with `?fuer=txn:<id>`, the same `txn:` shape `/offene-posten` already uses for
`?match=`, so the drop zone, the progress and the cancel all come for free.

The upload half needed nothing new: the Hub writes the invoice with `intake_channel = 'upload'`, and
the book-keeping cron picks up anything matching `intake_channel = 'upload' and extracted is null`,
reads it, and fills in supplier, amount and date.

**The link cannot be made at upload time.** `link_invoice_transaction` allocates against the invoice
total and raises when there is none:

```
if v_inv_gross is null or v_inv_gross = 0 then
  raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against'
```

A fresh upload has no amount until extraction runs, up to two hours later. So migration
`20260911190000` records the intent in `invoices.uploaded_for_transaction_id` and an
`after update of amount_gross` trigger makes the link when the amount arrives.

Three things that trigger has to get right:

- **It catches.** It runs inside the pipeline's own UPDATE, so a raise would roll back the
  extraction result. That is a far worse outcome than an unlinked invoice, and the reason is
  written to `invoice_history` rather than swallowed.
- **It checks the transition,** not just the value: `after update of amount_gross` also fires when
  the column is merely in the SET list.
- **It skips an existing confirmed match.** Re-running the RPC can raise once the remainders have
  moved on, and there is nothing to gain.

**Not left to the matcher.** Rediscovering the pair later is today's behaviour and it is exactly
what fails: the amount on a photographed receipt often disagrees with the payment, which is why the
document was missing in the first place. The person uploading already knows the answer.

### The two-hour window

`PendingUploads` on the transaction shows "Rechnung hochgeladen, wird gerade gelesen" until the link
exists, then disappears because the matching panel says it better. Without it the transaction looks
untouched for that whole window and the next person uploads the same document again. It polls once a
minute, because extraction lands out of band and there is no write here to invalidate on.

## Open
- Only this Hub has this. **a sister Hub lacks `invoice_files.transaction_id` entirely** and needs a
  migration adapted from `0074` before any of it can be ported.
