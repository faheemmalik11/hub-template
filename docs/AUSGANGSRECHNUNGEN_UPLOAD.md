# Outgoing invoice uploads

## What was asked

The client was explicit: no LexOffice integration for Stäy Hub, "no API integration to any
invoicing tool — neither now nor planned for the initial scope." Outgoing invoices instead
get created outside the Hub and uploaded manually. The settled decision, recorded in
`communication/INDEX.md` (thread 4, scope clarification): _"outgoing invoices by manual PDF
upload into OPOS/reporting."_

An earlier open action in
`communication/work-log/2026-08-05-immonetz-vs-staey-differences.md` had framed this as a
**CSV template** the client would need to fill in — that was never actually settled that way
and is now closed: the client's real requirement was a document upload, not a spreadsheet
import.

This feature ports immonetz's own outgoing-invoice-upload feature (their commit `4c63f5a`,
"Add outgoing invoice upload feature for companies without LexOffice accounts"), built for
their own non-LexOffice companies — the same shape fits Stäy Hub directly, and here it's the
**only** way to create an outgoing invoice at all: unlike immonetz (where IMKO still has a
real LexOffice account), no real Stäy company has one.

**Update (2026-08-06, migration `0086`):** LexOffice was removed from this repo entirely —
the `/ausgangsrechnungen/neu` LexOffice-backed form, the `/lexoffice-konfiguration` screen,
`lexoffice.functions.ts`, and the `lexoffice_config`/`lexoffice_sync_log` tables are all gone.
`outgoing_invoices.source` and `customers.source` no longer accept `'lexoffice'` at all —
upload (and, for customers, direct in-app creation via `/kunden`) is the only path left. See
`docs/ROLES_AND_ACCESS.md` §2.1b for a note on a possible cross-client credential found in the
dropped `lexoffice_config` table.

## What's implemented

- **Upload flow**: drop a PDF/image at `/ausgangsrechnungen/hochladen` → OpenAI extracts the
  fields and proposes a company/customer match → editable preview → confirm writes the
  invoice. If the model can't classify the document as an outgoing invoice issued by one of
  the known companies, the upload is rejected outright with the model's reason shown — no way
  to force it through.
- **Data model** — `supabase/migrations/0085_outgoing_invoice_uploads.sql`: builds on the
  existing schema (`0052`, `0058`) rather than a parallel table. `outgoing_invoices.source`
  gains `'upload'`; `lexoffice_voucher_id` became nullable at the time (the column, along with
  the rest of LexOffice, was dropped outright by migration `0086` — see above).
  `status_source` (`'auto' | 'manual' | null`) tracks who last set `voucher_status` for
  upload rows. New table `outgoing_invoice_files` + private Storage bucket
  `outgoing-invoice-files`. RPC `set_uploaded_outgoing_invoice_status` for a manual override
  (rejects any non-`'upload'` row — now the only row shape that exists). Trigger
  `sync_uploaded_outgoing_invoice_status_from_matches` auto-flips an uploaded invoice to
  `paidoff`/`open` from confirmed bank matches, mirroring the existing
  `sync_invoice_paid_from_matches` pattern (migration `0037`) — never overwrites a manual
  override in either direction. The existing outgoing-invoice matching engine
  (`outgoing_invoice_transaction_matches`, migration `0058`) needed no changes: it isn't
  scoped by `source`, so uploaded invoices participate in matching automatically.
- **Backend** (`src/lib/api/`, TanStack Start `createServerFn`s, no Edge Function):
  `outgoing-invoice-extraction.functions.ts` (read-only AI extraction, OpenAI Responses API,
  `OPENAI_EXTRACTION_MODEL` env var, default `gpt-4o-mini`), `outgoing-invoice-upload.functions.ts`
  (the write, service-role client, file uploaded to Storage before any DB row), and
  `outgoing-invoice-files.functions.ts` (signed URLs for viewing the stored file, mirroring
  `invoice-files.functions.ts`'s existing pattern).
- **Frontend**: the new upload route; `ausgangsrechnungen/index.tsx`'s only creation action is
  the "Rechnung hochladen" button (the LexOffice-era "Neue Rechnung" button and its
  `/ausgangsrechnungen/neu` route are gone — migration `0086`). Every row now gets the same
  editable status dropdown and the same lazy-signed-URL "view file" button, since every row
  is `source='upload'`.
- **Schema difference from immonetz, handled**: immonetz's `companies` table has a
  `tax_number` column (added in a later immonetz-only migration) used as a company-matching
  backstop during extraction. Stäy Hub's `companies` table has no equivalent column — the
  extraction function here matches on the model's own company-code pick plus a
  normalized-legal-name fallback only, no tax-number step.

## What's NOT built (same as immonetz, unchanged)

- No structured line items for uploaded invoices — totals only (net/gross/VAT rate).
- No batch upload — one file at a time through the preview/confirm flow.
- No re-extraction or replace-file for an existing row — soft-delete and re-upload instead.
- No DATEV handover path for outgoing invoices.
- OpenAI cost/rate limiting isn't tracked or capped — one extraction call per upload attempt.
