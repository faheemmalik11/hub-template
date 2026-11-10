# Lexoffice invoice push

Sends a commission invoice the Hub already created on to Lexoffice via its Public API, instead of
staff retyping it there by hand. One-way: the Hub stays the sole creator of the invoice record,
Lexoffice is a destination, not a mirror.

## What was asked

Van Oepen's outgoing commission invoices are created in the Hub (`create_deal_invoices`,
`supabase/schema/0011_functions.sql`), but staff then retype the same data into Lexoffice by hand
("the exact double-data-entry problem this project exists to remove" — Ayla, 20 Oct 2026 call,
`planning/communication/2026-10-20/`). Van Oepen upgraded their Lexware plan to XL specifically for
Public API access (confirmed 2026-11-10: S/M/L don't have it, only XL).

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
  `https://api.lexoffice.io/v1` — `searchContacts`, `createContact`, `createInvoice`, `getInvoice`,
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
  sent indicator instead.
- **Type fixes made along the way**: `OutgoingInvoice.lexoffice_voucher_id` was dead code — the
  column doesn't exist in the schema (dropped by 0086, the field was never removed from the type).
  Replaced with the real `accounting_external_id`; the one real reader of the old field
  (`src/lib/data/use-bwa-scope.ts`) now reads the real column. `OutgoingVoucherStatus` was widened
  to include `sent`/`paid`/`cancelled` alongside the upload path's `draft`/`open`/`paidoff`/`voided`
  — both vocabularies share the one `status` column; see Known issues below.

## What was explicitly left out

- **No webhook / no payment-status sync back from Lexoffice.** This only pushes; it never listens.
  A later feature if the client wants it — a different scope, chosen deliberately over this one.
- **No bulk contact sync.** Contacts resolve lazily, one at a time, only when an invoice is pushed.
- **No change to `create_deal_invoices` or its UI.** This adds an action on an invoice that already
  exists; it doesn't change how that invoice got created.

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

- Van Oepen's referrer credit-note process (`0033_referrer_credit_notes.sql`) also creates
  `outgoing_invoices` rows (`kind = 'referral_credit'`). Whether those should also be pushable to
  Lexoffice, or stay Hub-only, hasn't been asked.
- What VAT rate applies when a deal has none set — currently falls back to the deal's own
  `vat_rate` column, which itself defaults to 19%.
