# Deal donations

A donation to an organisation, tied to a sale above a configured amount. Modelled directly on
`BROKER_BONUSES.md`'s "Suggested from a sale" flow: an administrator records it from the deal page,
no broker involved.

## What was asked

For a sale above a threshold, the agency donates a fixed amount to an organisation the parties agree
on. The organisation, its bank details, a contact person, how to reach them and the handover date
are not known in advance — they vary per sale.

## What is implemented

- **Tables** `supabase/schema/0029_deal_donations.sql`: `deal_donations` (deal, organisation, IBAN,
  contact person, reachability, handover date, amount, status, cancel reason) and
  `donation_settings` (one row: `threshold_amount`, `donation_amount`).
- **Permission** `donations.manage` in `supabase/catalogue.sql`, a section under
  `page.commission_deals`, off by default.
- **Row security:** a holder of `donations.manage` reads and writes every row; nobody else sees the
  tables at all. `created_by`, `paid_by` and `paid_at` are stamped server-side by
  `stamp_deal_donation()`, never trusted from the client.
- **One active donation per deal:** `deal_donations_one_active_per_deal` is a partial unique index on
  `deal_id` excluding `cancelled` rows, so a cancelled suggestion can be replaced but a live one
  cannot be duplicated.
- **Screen:** on the deal page ("Spende für diesen Verkauf",
  `src/components/commission/deal-donation-card.tsx`), shown when `deals.purchase_price` reaches
  `threshold_amount`. An administrator fills in the organisation's details and an amount (defaults to
  `donation_amount`, editable) to create the suggestion; from there, "Mark as paid" or "Cancel" with
  an optional reason. Hooks in `src/data/deal-donations/`.
- **Notification:** `notify_donation_suggested` writes a bell entry for every active administering
  role when a donation is created, the same shape as `notify_bonus_submitted`.

## Open

- Not yet decided: whether a paid donation should also create a bookkeeping entry (manual booking or
  similar) so it shows in the financial picture, or stays purely administrative. Needs a decision
  before this matters for a client that relies on `manual_bookings`/reporting for the full picture.
- Not checked against a live database — typecheck and lint pass, and the file was reviewed
  column-by-column against `0022_bonus_suggestions.sql`'s working pattern, but it has not been
  applied to a running Postgres instance (a local Supabase stack's default port was already in use by
  another project at the time).
- `donation_settings` has no edit screen yet; change the two amounts with a direct SQL update until
  one exists, the same as `bonus_settings` was before "Regeln" was built on the bonus screen.
