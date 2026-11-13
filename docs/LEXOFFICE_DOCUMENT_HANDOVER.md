# Lexware document handover

Pushes an approved incoming document (a purchase invoice/receipt) into Lexware automatically, as a
purchase voucher, instead of staff retyping it there by hand. Companion to
`docs/LEXOFFICE_SYNC.md` (the outgoing-invoice equivalent) — same credential, same client, same
atomic-claim pattern, different document type and a different trigger (automatic, not a button).

## What was asked

Fabian's 11 November briefing (`planning/communication/2026-11-11/files/`), sections 1 and 2:
Lexware becomes the system of record once a document is approved. The Hub's job stops at
collecting, extracting, categorising and approving; from there, Lexware takes over bank matching,
payment status, and the handover to the tax firm. The handover itself — getting the approved
document into Lexware in the first place — is a new step this feature builds.

## What is implemented

- **Feature flag**: `lexoffice.document_sync` (`supabase/catalogue.sql`,
  `PERMISSIONS.lexofficeDocumentSync`), off by default, parented under `page.incoming_invoices`.
- **New columns**: `documents.accounting_external_id` (the Lexware voucher id, generic/unscoped
  like the equivalent column on `outgoing_invoices`/`customers`), `documents.lexoffice_sync_requested_at`
  (the atomic claim lock), `documents.lexoffice_sync_error` (the last failure, cleared on success).
  `suppliers.accounting_external_id` (the Lexware vendor contact id). `categories.lexware_category_id`
  (which Lexware posting category a document's category maps to — **this has to be filled in by
  hand, per category, before this feature can push anything for that category** — see Open
  questions).
- **Automatic trigger**, not a button: `lexoffice_document_push_now()`
  (`supabase/schema/0035_lexoffice_document_handover.sql`) fires on insert or on a
  `workflow_status` change into `approved_final` or `paid`, and calls the Edge Function via
  `net.http_post` the same way `notify_dispatch_now()` already does. Firing on `paid` too (not only
  `approved_final`) is the fix for the briefing's "documents that are never approved" gap — a
  document the pipeline marks paid on arrival (credit card, direct debit) skips approval entirely,
  so without this it would never reach Lexware at all.
- **Edge Function** `lexoffice-document-push`: checks the feature flag live (no caller JWT exists,
  since a database trigger invokes this, not a browser), atomically claims the document, resolves
  the supplier's Lexware vendor contact (search then create, same shape as the outgoing invoice's
  customer resolution), builds the voucher payload (document number, date, due date, amount, VAT
  rate, the mapped posting category, the note formatted as payment-method-first), creates it,
  attaches the original file if one is stored, and records the result. On failure, releases the
  claim and records the error message on the row instead of swallowing it.
- **`open` vs `unchecked`**: picks `open` unless the document's own figures aren't confident enough
  to trust (missing VAT rate, non-EUR currency, or net+VAT not matching gross) — matching the
  briefing's explicit rule to prefer `open` wherever possible.
- **Visible error, not just a log line**: `LexofficeDocumentSyncCard`
  (`src/components/documents/lexoffice-document-sync-card.tsx`), shown on the document detail page
  right after the bank-matching section, with a retry button that re-invokes the same Edge Function
  directly.

## The way back (payment status from Lexware)

Ships as one package with the handover above, per the briefing's own ordering rule: switching off
the Hub's bank-matching screens only happens once this is proven, otherwise a document handed over
to Lexware would stay stuck "approved" forever with nothing ever marking it paid.

- **`lexoffice-payment-sync`** (new Edge Function, cron shape like `propstack-sync`): for every
  document with a `accounting_external_id` and no `paid_at` yet, reads `GET /payments/{id}` and, once
  Lexware reports it paid, sets `paid_at` and `paid_source = 'lexware'`.
- **No new workflow logic needed for the status flip itself** — `advance_workflow_on_payment()`
  (`supabase/schema/0011_functions.sql`) already watches for `paid_at` turning non-null and flips
  `workflow_status` to `paid` plus logs the history entry; this just extended its existing
  `paid_source` message mapping with a `'lexware'` case, the same way `'bank_match'`/`'manual'`/
  `'payment_file'` were already handled.
- **Preset**: `supabase/presets/lexoffice-payment-sync.sql`, 15-minute cadence, disabled by
  default — same pattern as `propstack-daily-sync.sql`. **Correction**: the timer is not a separate
  cron job created in the Supabase dashboard — `scheduled_jobs` wires itself to `pg_cron`
  automatically the moment its `enabled` column is flipped to `true` (`apply_scheduled_jobs()` in
  `supabase/schema/0013_scheduled_jobs.sql`, triggered on every insert/update/delete on that table).
  Flipping `enabled: true` once the real `LEXOFFICE_API_KEY` exists is the only remaining step.
- **Rate limiting**: `public.lexware_throttle_wait()` (`supabase/schema/0039_lexoffice_rate_limit.sql`)
  keeps every Lexware call, from any Edge Function invocation, under 2 requests/second. It holds one
  database row under a row lock, so it stays correct even when several invocations call it at the
  same moment — a module-level counter inside one Edge Function could not guarantee that. The shared
  client's `lexofficeFetch()` and `attachVoucherFile()` both call it before every request; the
  existing reactive 429 backoff is kept as a second line of defence.
- **Category mapping screen**: `/categories` → edit a category → "Lexware category" now shows a
  dropdown of Lexware's own posting categories, read live via the new `lexoffice-categories` Edge
  Function, and saves the choice into `lexware_category_id`. No more manual SQL needed.

## What was explicitly left out

- **No webhook from Lexware.** Confirmed Lexware has none to offer — this only pushes and polls.
  Reading payment status back already happens through `lexoffice-payment-sync`'s polling job, not a
  push notification from Lexware.

## Known issues (pre-existing, not introduced here)

- `documents.storage_path` (a single-file convenience column on the row itself) and
  `document_files.storage_bucket`/`storage_path` (the real one-row-per-file table) both exist. This
  feature reads from `document_files` (`role = 'original'`), matching
  `document-bundle.functions.ts`'s own pattern, not the column on `documents` directly.

## Open questions

- Which Lexware posting category each of the client's categories maps to — needs populating once
  real Lexware access exists, by whoever has it (Fabian/the client), not guessable from here.
- Live end-to-end verification is blocked until the Lexware XL plan and `LEXOFFICE_API_KEY` exist,
  same blocker as the outgoing-invoice feature.
