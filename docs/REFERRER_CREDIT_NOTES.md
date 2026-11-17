# Referrer credit notes

The accounting record for a paid referrer bonus (see `docs/REFERRER_BONUSES.md`): an
`outgoing_invoices` row with `kind = 'referral_credit'`, created by
`create_referrer_credit_note(p_bonus_id uuid)` (`supabase/schema/0033_referrer_credit_notes.sql`).
Creation from the UI is currently switched off (17.11.2026) because the row it creates never
reaches Lexware and nothing told anyone that. This doc records the root cause and the two possible
real fixes, so a future session can implement one without re-deriving this analysis.

## The problem

`create_referrer_credit_note` inserts into `outgoing_invoices` with `kind = 'referral_credit'`,
`status = 'draft'`, and no `source` set explicitly, so it takes the table's own default,
`source = 'app'` (`supabase/schema/0008_workspace.sql`).

The automatic Lexware push trigger
(`supabase/schema/0037_lexoffice_invoice_auto_push.sql:32`) only fires
`when (new.source = 'app' and new.kind = 'commission')`. A `referral_credit` row never matches, so
it is never pushed. `docs/LEXOFFICE_SYNC.md`'s own "Open questions" section already flagged this as
undecided ("Whether those should also be pushable to Lexoffice, or stay Hub-only, hasn't been
asked"); this doc settles the root cause and lays out the two candidate fixes, still without
deciding between them.

The manual retry button (`LexofficeSyncButton`,
`src/routes/outgoing-invoices/index.tsx`) does not help either: it is scoped to rows the automatic
trigger is expected to have already handled, not a second code path, so a `referral_credit` row
sits as a `draft` with no `invoice_number` and no `accounting_external_id` forever, with no
indicator in the UI that it is stuck.

## Part 1, shipped now: creation switched off in the UI

`src/components/commission/deal-referrer-bonus-card.tsx` disables the "Create credit note" button
so no more stale draft rows accumulate while this is unresolved.

- **The switch**: `CREDIT_NOTE_CREATION_ENABLED` (currently `false`), declared just above
  `DealReferrerBonusCard` in `src/components/commission/deal-referrer-bonus-card.tsx`. Flipping it
  to `true` is the entire re-enable, once one of the two fixes below has shipped. The button, its
  `useCreateReferrerCreditNote` mutation and the `create_referrer_credit_note` RPC are all
  untouched, so this is reversible without rebuilding anything.
- When disabled, the button renders visibly disabled with a hint below it,
  `commissionDeals.referrerBonus.creditNoteDisabled` (`src/lib/i18n/locales/en.ts`,
  `src/lib/i18n/locales/de.ts`), explaining that credit notes do not reach Lexware yet and creating
  one would leave a stuck draft. This matches the existing disabled-control-plus-muted-hint pattern
  already used elsewhere on the deal page (e.g. the notarised date, purchase price and VAT fields in
  `src/routes/commission-deals/$id.tsx`, and this same card's own `creditNoteNote` paragraph).
- No RPC, mutation, migration or database change in this part. Existing stuck draft rows (if any)
  are not cleaned up here either.

## Part 2, not built: what the real fix needs

The core decision this needs first, before any code: **is a referrer credit note a sales invoice
the company issues, or an expense/purchase voucher the company pays out?** Business logic
currently models it as the former (an `outgoing_invoices` row, same table as commission invoices),
but the content is closer to the latter: money going out to a referrer, not money the company is
billing for. Both directions are laid out below, accurately against what each adjacent feature
already does; neither is picked here, because that is an accounting decision, not an engineering
one.

### Option A: extend the sales-invoice push to cover this kind

Keep `create_referrer_credit_note` writing an `outgoing_invoices` row and extend
`lexoffice-invoice-push` (or a new dedicated function) to handle `kind = 'referral_credit'`.

What this needs, concretely:

- Widen the trigger's `WHEN` in `supabase/schema/0037_lexoffice_invoice_auto_push.sql:32` from
  `new.kind = 'commission'` to `new.kind in ('commission', 'referral_credit')` (or a second
  trigger), so the row reaches the Edge Function at all.
- `lexoffice-invoice-push/index.ts` resolves the Lexware **contact** from
  `customers.accounting_external_id` via `outgoing_invoices.customer_id`
  (`deal_referrer_bonuses.referrer_customer_id` is already a `customers` row, confirmed in
  `docs/REFERRER_BONUSES.md`), the same lookup it already does for a commission invoice's buyer or
  seller. That part needs no change.
- It would, however, create a **sales invoice** in Lexware billed to the referrer
  (`createInvoice`/`POST /v1/invoices`), which is backwards for money flowing out to them. Lexware
  has no native "negative sales invoice" semantics the push currently uses; this is the main
  structural argument against Option A, not just a missing `WHEN` clause.
- No VAT split is needed either way: `create_referrer_credit_note` already sets `amount_net =
  amount_gross` (confirmed in `0033_referrer_credit_notes.sql`), since the client's referrer bonus
  figures are flat euro amounts with no VAT ever mentioned.

### Option B: treat it as an expense/purchase voucher ("Fremdleistungen")

Model it like `lexoffice-document-push` already models an incoming supplier invoice: a payment the
company makes, booked against an expense category, not a sales invoice issued to a customer. Read
`supabase/functions/lexoffice-document-push/index.ts` to confirm the shape this would need to
mirror:

- It calls `createPurchaseVoucher` with `type: "purchaseinvoice"`
  (`buildVoucherPayload` in that file), not `createInvoice`. The counterpart function would need
  the same call, not the sales-invoice one `lexoffice-invoice-push` uses today.
- Its contact resolution (`resolveVendorContactId`) looks up and creates Lexware contacts with
  `roles: { vendor: {} }`, off the **`suppliers`** table's own `accounting_external_id`. A referrer
  credit note's payee is a `customers` row (`deal_referrer_bonuses.referrer_customer_id`), not a
  `suppliers` row, so this path cannot reuse that function unchanged. Either the referrer needs a
  parallel `suppliers` record, or the vendor-contact resolution needs a `customers`-table variant.
  This is a real structural difference, not a naming detail.
- Its voucher needs a `category_id` resolved against `categories.lexware_category_id`
  (`loadCategory`, `categoryRateRule`) to book the expense to a specific Lexware posting category.
  `outgoing_invoices` has no `category_id` column today (confirmed against
  `supabase/schema/0008_workspace.sql`); one would need adding, or the category could be a fixed
  constant (a "Fremdleistungen" category id read the same way `tenant-config.ts` already reads
  other per-tenant defaults) rather than a column, since every referral credit note plausibly books
  to the same category.
- `refuseRateTheCategoryRejects`'s zero-rate-only and reverse-charge category rules
  (`ZERO_RATE_ONLY_CATEGORY`, `REVERSE_CHARGE_CATEGORY` in `lexoffice-document-push/index.ts`)
  would need checking against whichever category is chosen, even though a referral credit note's
  VAT rate is always effectively 0 (net equals gross), to avoid Lexware's 406 on an unexpected rate.
- `lexoffice-document-push` claims a row with `UPDATE ... WHERE accounting_external_id IS NULL AND
  lexoffice_sync_requested_at IS NULL`, the same claim-lock shape
  `lexoffice-invoice-push` already uses on `outgoing_invoices`
  (`lexoffice_sync_requested_at`, `supabase/schema/0034_lexoffice_sync.sql`), so that column is
  reusable either way, no new column needed for the lock itself.

### Not decided here

Which of Option A or Option B is correct depends on how the tax firm wants a referrer payout
booked in Lexware, which is an accounting decision for the client/tax firm, not something to infer
from the code. Do not implement either without that answer. Whoever decides should also confirm
whether a referral credit note needs VAT at all beyond "the client's figures never mention VAT" (an
observation, not a confirmed VAT treatment).

## Re-enabling once a fix ships

Flip `CREDIT_NOTE_CREATION_ENABLED` to `true` in
`src/components/commission/deal-referrer-bonus-card.tsx`. No other UI change is needed; the
mutation, RPC and hint copy stay as they are (the hint simply stops rendering once the flag is
`true`, since the two sit behind the same condition).

## Open

- Existing stuck `draft` rows, if any client already has one, are not found or fixed by this doc.
  Check `outgoing_invoices` for `kind = 'referral_credit' and accounting_external_id is null` on
  whichever client(s) use this feature before assuming there are none.
- `docs/LEXOFFICE_SYNC.md`'s own "Open questions" section still names this gap; update it once a
  fix direction is picked.
