# Pipeline changes for outgoing invoices

**Nothing in `pipeline_new/` has been changed.** This is a proposal for a future session or
whoever owns the pipeline.

## Why this exists

The Hub's upload screens now write files to Supabase Storage, matching what the pipeline
already does. That part needs no pipeline work.

What does need pipeline work is **outgoing invoices**, if the client wants them to arrive
automatically instead of being uploaded by hand.

## The problem, in one paragraph

Petra writes outgoing invoices in DATEV. DATEV emails them to the customer and keeps the PDF.
The Hub never sees them, so when the customer pays, there is a deposit in the bank account
with no invoice to match it against, and the open-items list is wrong.

DATEV offers no way out: no public API for Auftragswesen next, no BCC or copy-to-self
setting, and DATEVconnect's document interface is upload-only. See `docs/NOTIFICATIONS.md`
style research notes in the meeting transcript of 26.08 at [09:15]–[10:58] and [31:29]–[32:00].

So the only automatic routes are ones where **Petra puts the file somewhere the pipeline
already watches**.

## What the pipeline does today

`pipeline_new/` reads a Microsoft mailbox and a Dropbox folder, extracts fields with AI, and
writes rows. Every row it creates is an **incoming** invoice. Confirmed by grep: there is no
`outgoing` or `ausgang` handling anywhere in the package.

Outgoing invoices live in different tables entirely:

| Incoming              | Outgoing                        |
| --------------------- | ------------------------------- |
| `invoices`            | `outgoing_invoices`             |
| `invoice_files`       | `outgoing_invoice_files`        |
| bucket `belege-files` | bucket `outgoing-invoice-files` |

So this is not a flag on an existing row. It is a second write path.

## Proposed change

**Route by source folder.** A file arriving in a designated Dropbox folder, say
`/Stäy/Ausgangsrechnungen`, is written as an outgoing invoice. Everything else keeps today's
behaviour.

1. **Config.** Add an outgoing folder path alongside the existing intake settings, so it is
   configurable per Hub rather than hard-coded. It belongs next to the existing
   `drive_folder` / `drive_processed_folder` settings the Postfach screen already manages.

2. **Router.** At the point where an ingested file is turned into a row, branch on which
   watched folder it came from. Incoming keeps the current path untouched.

3. **Outgoing writer.** A new function that writes `outgoing_invoices` +
   `outgoing_invoice_files` to the `outgoing-invoice-files` bucket. The Hub's server function
   `src/lib/api/outgoing-invoice-upload.functions.ts` is the reference for the exact column
   set, including `checksum_sha256` and the `companyId/invoiceId/filename` path shape.

4. **Extraction fields differ.** An outgoing invoice needs a customer, not a supplier. The
   existing extraction prompt looks for the invoice _issuer_; for outgoing it is the
   _recipient_ that identifies the counterparty. This is the least trivial part and should be
   validated against real invoices before trusting it.

5. **Filing.** Successfully processed outgoing files move to the same kind of processed
   folder that incoming already uses, so the source folder only holds what still needs
   attention. That mirrors Fabian's description at [28:16].

## What not to do

- **Do not reuse the `invoices` table with a flag.** The Hub reads outgoing invoices from
  `outgoing_invoices` in a dozen places, including open items and bank matching. A flag would
  mean touching all of them.
- **Do not build a DATEV connector.** There is nothing to connect to. This was researched:
  no public API, no export webhook, and the middleware options (GetMyInvoices, Maesn,
  Klardaten) are paid third-party services, which is a client decision, not a build decision.

## Before building any of this

Ask the client one question: **how many outgoing invoices per month?**

Saskia already hinted at the answer at [31:51]: _"we don't actually issue that many invoices,
do we? How many do you normally write? It probably isn't worth it right now."_ She said that
about Lexware, but the same arithmetic applies here. If the answer is a handful, manual upload
at `/ausgangsrechnungen/hochladen` is the correct engineering decision and this document
should stay unbuilt.
