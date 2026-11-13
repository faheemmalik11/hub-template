# Lexoffice invoice push

Sends a commission invoice the Hub already created on to Lexoffice via its Public API, instead of
staff retyping it there by hand. One-way: the Hub stays the sole creator of the invoice record,
Lexoffice is a destination, not a mirror.

## What was asked

Outgoing commission invoices are created in the Hub (`create_deal_invoices`,
`supabase/schema/0011_functions.sql`), but staff then retype the same data into Lexoffice by hand
("the exact double-data-entry problem this project exists to remove" — client call, 20 Oct 2026,
`planning/communication/2026-10-20/`). Public API access needs the Lexware XL plan (confirmed
2026-11-10: S/M/L don't have it, only XL), so a client has to be on XL before this feature can be
switched on for them; which client upgraded for it is on their own branch.

**Important history**: Lexoffice was integrated in this Hub once before, and removed entirely
(migration `0086`, 2026-08-06) at a different client's explicit request ("no API integration to any
invoicing tool", `docs/AUSGANGSRECHNUNGEN_UPLOAD.md`). That removal deleted a *mirror* model —
Lexoffice was the creator, the Hub mirrored it. This feature does not revive that model; it adds a
one-way push on top of the Hub's existing creation flow, which is why it's additive and off by
default rather than a reversal of that decision.

## What is implemented

- **Feature flag**: `lexoffice.sync` (`supabase/catalogue.sql`, `PERMISSIONS.lexofficeSync`), off by
  default, parented under `page.outgoing_invoices`.
- **Credential**: `LEXOFFICE_API_KEY`, read the same way `PROPSTACK_API_KEY` already is — from the
  `credentials` table via the admin panel, opened with `TENANT_SECRET_KEY` if sealed
  (`supabase/functions/_shared/lexoffice-client.ts`). Not written by Hub code.
- **Shared client** (`_shared/lexoffice-client.ts`): a small typed wrapper over
  `https://api.lexware.io/v1` — `searchContacts`, `createContact`, `createInvoice`, `getInvoice`,
  with 429 retry/backoff. `mapLexofficeVoucherStatus()` maps Lexoffice's `voucherStatus`
  (`draft/open/overdue/paid/paidoff/voided`) onto `outgoing_invoices`'s own vocabulary
  (`draft/sent/paid/cancelled`).
- **Edge Function** `lexoffice-invoice-push` (`supabase/functions/lexoffice-invoice-push/index.ts`):
  takes `{ outgoing_invoice_id }`, checks the caller holds `lexoffice.sync`
  (`_shared/permission.ts`, same pattern as `bank-connect`), then:
  1. **Atomically claims** the row — a single `UPDATE ... WHERE accounting_external_id IS NULL AND
     lexoffice_sync_requested_at IS NULL ... RETURNING` — so two concurrent/retried calls can't both
     reach Lexoffice for the same invoice. A claim miss returns 409. The claim column is released
     back to `NULL` on any failure after it's set, so a retry is possible.
  2. Resolves the Lexoffice contact: reuses `customers.accounting_external_id` if already set,
     otherwise searches by name, otherwise creates one, then stores the returned id back onto the
     customer row (so the next invoice for the same customer doesn't re-create the contact).
  3. Builds a single synthesized line item from the invoice's own `amount_net`/`amount_gross` and
     the deal's `vat_rate` and property name — `outgoing_invoices.line_items` is never populated by
     `create_deal_invoices` today, so this function doesn't rely on it being there.
  4. Creates the invoice (finalized), reads back the real `voucherStatus`, and records
     `accounting_external_id` (the Lexoffice invoice id — already an existing generic column, no new
     id column needed) and the mapped `status` on the row.
- **Migration** `supabase/schema/0034_lexoffice_sync.sql`: one new column,
  `outgoing_invoices.lexoffice_sync_requested_at timestamptz` — the claim lock in step 1 above. No
  other schema change; `customers.accounting_external_id` and
  `outgoing_invoices.accounting_external_id` already existed.
- **UI**: a send button in the actions column of `/outgoing-invoices`
  (`LexofficeSyncButton`, `src/routes/outgoing-invoices/index.tsx`), visible only for
  `source === "app" && status === "draft" && !accounting_external_id`, gated by
  `useFeature(PERMISSIONS.lexofficeSync)`. A row already carrying `accounting_external_id` shows a
  sent indicator instead. Since the automatic push below (`supabase/schema/0037_lexoffice_invoice_auto_push.sql`)
  normally handles this already, the button mostly exists as a **retry** for an invoice the
  automatic push failed on — it stays visible exactly when that's true.
- **Automatic on deal approval** (`supabase/schema/0037_lexoffice_invoice_auto_push.sql`): per
  Fabian's 11 November briefing (§3.2 — "After approval the Hub creates customer and invoice in
  Lexware and finalises them in the same step"), a trigger on `outgoing_invoices` fires
  `lexoffice-invoice-push` the moment `create_deal_invoices` inserts a `source = 'app', kind =
  'commission'` row — same `net.http_post` pattern as `lexoffice_document_push_now()`
  (`0035_lexoffice_document_handover.sql`) and the pre-existing `notify_dispatch_now()`. Referrer
  credit notes (`kind = 'referral_credit'`) are explicitly excluded from this trigger — §13.2 of the
  briefing says that path stays manual/switched off until the tax firm specifies details, unrelated
  to this feature's own scope decision below.
  **`lexoffice-invoice-push` itself had to change for this**: it used to require a real signed-in
  caller (`requirePermission`) for every call, which a database trigger using the service-role key
  cannot provide (no caller email in that JWT). It now checks for a caller email first and runs the
  original permission check if one exists (the manual button's behaviour is byte-for-byte unchanged),
  and falls back to a feature-liveness check (the same `featureIsLive()` helper
  `lexoffice-document-push` already introduced) only when there is no caller at all — i.e. only for
  the trigger's own system-level call.
- **Type fixes made along the way**: `OutgoingInvoice.lexoffice_voucher_id` was dead code — the
  column doesn't exist in the schema (dropped by 0086, the field was never removed from the type).
  Replaced with the real `accounting_external_id`; the one real reader of the old field
  (`src/lib/data/use-bwa-scope.ts`) now reads the real column. `OutgoingVoucherStatus` was widened
  to include `sent`/`paid`/`cancelled` alongside the upload path's `draft`/`open`/`paidoff`/`voided`
  — both vocabularies share the one `status` column; see Known issues below.

## Taking the invoice number and PDF back into the Hub

Briefing §3.2 also asks for "the number and the PDF" to come back into the Hub once Lexware has
created and finalised the invoice. Implemented as a second phase of the same push, not a new
Edge Function:

- **Phase 1** (`createInvoice` → `persistCreated`) writes `accounting_external_id` the moment
  Lexware confirms the invoice exists, before anything else runs. This closes a real gap: writing
  it only at the very end (the old behaviour) meant a crash between creation and that final write
  left the row retryable, and a retry would call `createInvoice` a second time — a duplicate
  finalised invoice at Lexware. Phase 1 never runs again once `accounting_external_id` is set.
- **Phase 2** (`fetchNumberAndFile`) reads `voucherNumber`/`voucherStatus` via the existing
  `getInvoice` call and writes `invoice_number`, `status`, `sent_at`. If the new
  `lexoffice.invoice_file_fetch` feature flag is live, it also calls the new `getInvoiceFile`
  (`_shared/lexoffice-client.ts`, extends `lexofficeFetch` with an `arraybuffer` response mode),
  uploads the bytes to the `outgoing-invoice-files` Storage bucket, and records a row in
  `outgoing_invoice_files` (`supabase/schema/0047_lexoffice_invoice_file_fetch.sql` adds
  `lexoffice_file_fetched_at`/`lexoffice_sync_error` to `outgoing_invoices` and a unique index on
  `outgoing_invoice_files.outgoing_invoice_id`, so a retry upserts instead of duplicating).
- **Resumable, asymmetrically on purpose**: a row with `accounting_external_id` set but
  `lexoffice_file_fetched_at` still null re-enters at phase 2 (`claimForFileFetch`) on the next
  call, which is safe to reclaim after a few minutes (`staleClaimFilter`) since everything phase 2
  does — `getInvoice`, `getInvoiceFile`, the Storage upload, the `outgoing_invoice_files` upsert —
  is safely re-runnable. **Phase 1's claim (`claimInvoice`) is never stale-reclaimable.** `createInvoice`
  has no dedup lookup before it, so a crash in the narrow window between it succeeding and
  `persistCreated` writing `accounting_external_id` must stay stuck forever (a human clears
  `lexoffice_sync_requested_at` by hand) rather than let a retry finalize a second, undeletable
  invoice at Lexware. Any failure in either phase writes `lexoffice_sync_error` (same column name
  and purpose as `documents`' own), so `LexofficeSyncButton`
  (`src/routes/outgoing-invoices/index.tsx`) can show a retry affordance — one that, for this one
  specific stuck-phase-1 case, will keep failing with "not eligible" until someone clears the
  column, which is the deliberately safe outcome.
- **Off by default, independently of `lexoffice.sync`**: `lexoffice.invoice_file_fetch` is its own
  catalogue key, so an existing client already pushing invoices sees no behaviour change until this
  is switched on separately.
- **Answered 13.11.2026, against the real Lexware API**: `GET /invoices/{id}/file` does **not** lag.
  One invocation created the invoice, read back its number and fetched a 120 KB PDF in the same
  call, `sent_at` 13:37:23.166Z and `lexoffice_file_fetched_at` 13:37:25.723Z — 2.5 seconds, first
  try, no 404 and no retry. So no polling job is needed, and the resumable error path above stays
  as the handler for a genuine failure rather than for an expected lag.

Three bugs that only a real call could find, all fixed in the same pass:

- `POST /v1/invoices` **rejects a date-only `voucherDate`** (`400`, "cannot be parsed"), where
  `POST /v1/vouchers` on the document side accepts one. Hence `lexofficeTimestamp()` in
  `lexoffice-invoice-push/index.ts`, sending full ISO 8601 for `voucherDate` and `dueDate`.
- `POST /v1/invoices` **requires `shippingConditions`** (`406`, "must not be null"); the document
  side has no such field. Sent as `shippingType: "service"` dated to the voucher date.
- `friendlyLexofficeError` **discarded the reason** for any `406` whose body is not the `IssueList`
  shape, leaving "rejected for an unknown reason" and nothing to act on. It now falls back to
  Lexware's own `message` field, which is what made the second bug diagnosable at all.

## What was explicitly left out

- **No webhook / no payment-status sync back from Lexoffice.** This only pushes; it never listens.
  A later feature if the client wants it — a different scope, chosen deliberately over this one.
- **No bulk contact sync.** Contacts resolve lazily, one at a time, only when an invoice is pushed.
- **No change to `create_deal_invoices` itself.** The automatic push (above) reacts to the row it
  inserts; the function's own logic — what gets created, and how — is untouched.

## Known issues (pre-existing, not introduced here, flagged rather than silently worked around)

- **Two status vocabularies share one `status` column with no DB-level separation.** The upload
  path (`set_uploaded_outgoing_invoice_status`) writes `draft/open/paidoff/voided` and explicitly
  refuses any row where `source <> 'upload'`. This feature's rows (`source = 'app'`) are written
  `draft/sent/paid/cancelled` instead, per the table's own `outgoing_invoices_status_known` CHECK
  constraint (`supabase/schema/0008_workspace.sql`). The two never collide in practice (each path
  only ever touches its own `source`), but `/outgoing-invoices`' status dropdown
  (`OutgoingStatusCell`) only renders the upload vocabulary — an `app`-sourced row synced to
  Lexoffice will show a status value that dropdown doesn't have an option for. Not fixed here: that
  dropdown's own backing RPC already refuses to write to an `app`-sourced row, so this is a
  pre-existing display gap for every `app`-sourced invoice, not something this feature caused.
- **Live verification is blocked** until `LEXOFFICE_API_KEY` is entered via the admin panel, which
  needs the XL plan to actually be active. Code is typechecked and structurally reviewed, not yet
  exercised against the real Lexoffice API.

## Open questions

- The referrer credit-note process (`0033_referrer_credit_notes.sql`) also creates
  `outgoing_invoices` rows (`kind = 'referral_credit'`). Whether those should also be pushable to
  Lexoffice, or stay Hub-only, hasn't been asked.

## Settled: what a client can change without touching code

Four things that used to be literals in the Edge Functions are read from `tenant_settings.config`
via `_shared/tenant-config.ts`, and a per-record value still wins wherever one exists:

| What | Where it comes from | Default |
|---|---|---|
| VAT rate when a document or deal has none | `config.tax.defaultVatRate` | `19` |
| Country, for the contact, the billing address and the allowed-rate lookup | `config.tax.country` | `DE` |
| The invoice line's label and unit name | `config.wording` | `Provision` / `Coaching` / `Rechnung`, `Pauschal` |
| The voucher remark's payment-method fallback | `config.wording` | `Überweisung` |

The defaults live in code rather than being stamped into each client's `config` by a migration, so
a later change to a default still reaches everyone. `tenantTaxRegime()` existed before this and was
never called from anywhere, so a client could set a VAT rate and country and nothing read them.
