# Commission invoices (estate agency)

An estate agency earns a commission from the buyer, the seller, or both, once a sale is signed at
the notary. This feature turns a sold deal into one draft invoice per paying person, for a person to
approve before anything is issued.

Status: **calculator, tables and screen exist, tested end to end on the local database.** Switched off
by default. Nothing is created in Lexware or sent yet, and sales are entered by hand.

## What the briefing asked for

1. A sale marked as sold in the CRM (Propstack) triggers the work. Nothing is calculated from free
   text: a missing value is asked for, never guessed.
2. Each side pays a net percentage of the purchase price (2.0, 2.5 or 3.0 in practice), or the
   seller alone pays a fixed amount.
3. Several buyers or sellers each get their own invoice with an equal share, unless they agreed
   that one person pays everything.
4. A discount is a fixed euro amount and always appears on the invoice as its own line.
5. A person approves in the Hub before the invoice is created in the accounting tool, so the
   invoice number sequence stays gap-free.
6. Payment is matched from the bank by invoice number. Buyers pay within 7 days; sellers when the
   purchase price reaches them, so an expected date is stored. Late payment alerts staff only;
   customers never get an automatic reminder.

## What is implemented

`src/kit/lib/commission/`, exported from `src/kit/lib/index.ts`:

| Export | Does |
|---|---|
| `calculateDealCommission(deal)` | Both sides of a deal, one `CommissionInvoiceDraft` per payer, or every problem at once |
| `calculateSideCommission(side)` | One side |
| `splitByShares(cents, shares)` | Splits an amount so the parts always add up, odd cents to the largest remainder |
| `grossRateFromNet`, `grossFromNetCents`, `netFromGrossCents` | The rounding rules below |

All money is integer cents. A result is `{ ok: true, invoices }` or `{ ok: false, problems }`, where
each problem is a code (`purchase_price_missing`, `fee_missing`, `no_payers`, `shares_incomplete`,
`shares_do_not_add_up`, `discount_exceeds_fee`, `no_side_pays`, ...) for the screen to translate.

### Rounding, as read off issued invoices

1. Side net fee = purchase price × net rate.
2. Payer net = side net split by share.
3. Invoice line, gross = payer net × (1 + VAT), rounded half up to the cent.
4. The payer's own discount (a fixed gross amount, with its reason) is subtracted from the gross line.
5. Net and VAT are recomputed from the gross total: net = total / (1 + VAT), rounded; VAT = total
   minus net.
6. The rate printed on the invoice is the gross rate: 2.5% net shows as 2.975%, 3% as 3.57%.

`src/kit/lib/commission/calculate.test.ts` checks this against five real invoices, amounts only
(no names or addresses), including the half-cent case where 7,187.50 net becomes 8,553.13 gross.
Run with `npm test` (Node's own test runner, which strips the types itself).

### Tables (`supabase/schema/0008_workspace.sql`)

| Table | Holds |
|---|---|
| `deals` | One sale: company, property (`property_id` or a free `property_label`), price, VAT rate, notary date, who won and who handled it (`acquired_by`, `handled_by`), approval, `status` (`incomplete`, `ready`, `approved`, `invoiced`, `cancelled`). `source` + `external_id` is unique, for the row a CRM import creates |
| `deal_sides` | What the buyer or the seller side pays: `fee_kind` `percent` (`fee_net_rate`) or `fixed` (`fee_net_amount`), One per side |
| `deal_parties` | Who pays on a side, as a `customers` row, with an optional `share_percent` (no share on any party means equal split) and that person's own `discount_gross` and `discount_reason` |
| `deal_costs` | What the agency paid for the sale: `kind` (`city_fee`, `photos`, `energy_certificate`, `voucher`, `other`), description, `amount`, `incurred_on`. Saved with the deal by `save_deal(..., p_costs)`; readable and editable by whoever may edit the deal, including a broker on their own deal |
| `deals.own_lead`, `from_viewing`, `referrer_customer_id`, `costs_closed_at`, `ready_for_bookkeeping_at` | What the bonus rules depend on. Edited on the deal page under "Angaben zum Verkauf"; the two timestamps are set when the box is ticked and kept while it stays ticked |
| `outgoing_invoices.deal_party_id` | Which party an issued invoice bills |
| `outgoing_invoices.expected_payment_on`, `sent_at`, `accounting_external_id` | When the money is expected (a seller pays weeks later), when it was emailed, and the accounting tool's id. See `BOOKKEEPING_SCHEMA_ADDITIONS.md` |

Access (`0010_access.sql`): the `documents.read` / `documents.write` area, and `deals` is company
scoped like `outgoing_invoices`. `deals` needs a reason to be soft deleted (`0014_triggers.sql`).
Money is `numeric(14, 2)` in the database and cents in the calculator; convert at the boundary.

### Screen (`page.commission_deals`, Rechnungen → Provisionen, off by default)

| Part | Where |
|---|---|
| Catalogue key `page.commission_deals` under `module.invoices`, `default_enabled = false` | `supabase/catalogue.sql` |
| Route and menu entry | `src/config/routes.ts`, `src/components/layout/app-shell.tsx` |
| List: property, notary date, price, gross commission (calculated), status; "Neuer Verkauf" picks a property and prefills the price from the CRM listing | `src/routes/commission-deals/index.tsx` |
| Detail: sale (date, price, VAT, note), one card per side (pays or not, percent or fixed, discount and reason, payers with optional shares, create a customer inline), live draft invoices or the list of what is missing, Save, Approve | `src/routes/commission-deals/$id.tsx`, `src/components/commission/side-card.tsx` (each payer has a discount and a reason), `src/components/commission/deal-facts-card.tsx`, `src/components/commission/deal-costs-card.tsx`, `src/components/commission/draft-invoices.tsx` |
| Form to calculator and to saved rows, German number entry | `src/components/commission/deal-form.ts`, tested in `deal-form.test.ts` |
| Hooks `useDeals`, `useDeal`, `useCreateDeal`, `useSaveDeal`, `useApproveDeal` | `src/data/deals/deals.ts` |
| `save_deal(p_deal_id, p_deal, p_sides, p_status)`: deal, sides and payers in one transaction, as the caller. Any save withdraws an approval. `approve_deal(p_deal_id)`: only from `ready` | `supabase/schema/0011_functions.sql` |

Status: saved as `ready` when the calculation succeeds, `incomplete` when something is missing, so an
unfinished sale can be kept. `deal_sides_fee_shape` allows a missing fee for that reason. Approval is
offered to people with `invoices.approve`; the database itself only checks `documents.write`.

## A broker enters their own commission

A broker is a Hub user, not an administrator. They see only the properties the CRM says are theirs
and enter the commission for a sale on one of them. An administrator reviews it and approves it. The
rules are in the database (`supabase/schema/0017_broker_commissions.sql`), not in the screens.

- **The permission is `deals.submit`**, off in the catalogue and held by no role until a client gives
  it to one. Nothing changes for a client that does not.
- **What a holder may do:** create a deal on one of their own properties, edit it while it is
  incomplete or ready, create customers for it and see only the customers they created, and pick
  payers only from those. A deal saved complete becomes `ready`, which is what an administrator
  reviews.
- **What a holder may not do:** approve (that stays `documents.write`, through `approve_deal`),
  create a deal on somebody else's property, move a deal to one, write an approved status, or touch
  a deal once it is approved. Another broker sees none of it.
- **The Broker role** is data, not catalogue: `supabase/presets/broker-role.sql` creates it with nine
  rights (profile, properties, the CRM view, commissions, `deals.submit`, and the menu groups above them) and switches on
  the three features it needs. A client that already has a database runs
  `supabase/presets/broker-for-an-existing-client.sql` instead, which is the same rules, the
  permission and the role in one file.
- **What a broker sees:** the menu offers only the pages the role holds (Commissions, Properties, their profile), and they land on Properties, not the Overview, which the role does not hold. A menu entry is shown by the same check the page makes, so nothing is offered that answers "no access".
- **A person becomes a broker** when their Team row has the Broker role and the CRM broker id
  (filled when the email matches the CRM). Without the id they see no properties.
- **Proved** with a broker and an administrator over the API: 26 checks, including that another
  broker sees nothing, that approval is refused to the broker, and that an approved deal cannot be
  edited. The screens were checked in a browser: the dialog offers exactly the broker's properties,
  and the deal page has Save but no Approve.
- **Notifications:** saving a deal as ready tells the administrators, and approving it tells the broker (`docs/NOTIFICATIONS.md`).

## Open

- **Discount per person (done).** The client's answer is a fixed euro amount for a named party with a
  reason, so the discount sits on `deal_parties` and the calculator takes it per payer. A database
  built before this runs `supabase/presets/deal-details-for-an-existing-client.sql`, which moves an
  old side discount onto the payers by share.
- A property the CRM marks "Verkauft" opens a deal by itself (`deals.from_crm`, off by default,
  `supabase/schema/0019_deals_from_crm.sql`, run at the end of each `propstack-sync`). The deal is
  `incomplete`, with the realised price (`sold_price`), the property and the broker filled in; the
  broker and every administering role get a bell entry linking to it. The CRM's sold date is empty on
  all 56 sold properties in the van Oepen data, so it is not used: a trigger stamps
  `properties.became_sold_at` when the sync sees `crm_status` change to "Verkauft", and only a stamp
  newer than the day the switch was turned on opens a deal. Properties already sold never do, and one
  property never opens two. Both sides are created with the fee read from the CRM's structured rates:
  `external_commission_percentage` (buyer) and `internal_commission_percentage` (seller), which the
  CRM keeps sometimes gross (2.975, 2.38, 3.57) and sometimes net (3, 2.5). A rate that divides by 1 + the
  deal's VAT rate into a round half percent (2.975 to 2.5) is converted; any other is taken as net. The
  deal note asks the broker to check. A side without a rate is created empty. Not read: the notary date, the free-text
  notes (discount, own lead; the "warning" field is empty on every sold property today), and the owners
  and buyers as payers, so the broker enters those. Checked on the local database, not yet against Propstack data.
- No Lexware call yet. The
  Lexware contact and invoice calls exist in another Hub (`createLexofficeContact`,
  `createLexofficeInvoice`) and are the starting point. A Lexware draft should not consume a
  number, so the invoice is drafted on calculation and finalised on approval. This needs checking
  against the client's Lexware plan.
- Referral credit notes (10, 15 or 20% by referrals in the calendar year) and coaching invoices are
  not modelled.
- A rate typed as "2.975" is read as 2975 (German thousands), not 2,975. The field asks for the net
  rate, normally 2,0 to 3,0.
- The breadcrumb shows the sale's id rather than the property name.
- Outgoing e-invoices are mandatory for this client from 1 January 2027. Check that the accounting
  tool issues them.

## Expected payment of seller invoices

`supabase/schema/0023_expected_payment.sql`. A seller pays once the purchase price has reached them, so a seller's commission invoice has no due date. The trigger `outgoing_invoices_set_expected_payment` fills `expected_payment_on` with the deal's `notarised_on` + `seller_payment_wait_days()` (56) when the invoice has a `deal_party_id` on a seller side, no due date, and is not a referral credit. The outgoing list (`src/routes/outgoing-invoices/index.tsx`) treats `due_date ?? expected_payment_on` as the date for overdue and sorting, and marks an expected date with "(erwartet)".

`notify_overdue_payments()` pings the administrators once per invoice (`overdue_notified_at`) when an open or sent invoice passes its expected date. It is timed by a pg_cron job `overdue-payments`, daily 06:00, created by `supabase/presets/expected-payment-for-an-existing-client.sql`. Open: the 8 weeks are the client's figure from the brief; a notary date that changes later does not move an invoice that already has a date.

## Overview: attention panel and blockers

`src/components/home/attention-panel.tsx` greets the person and lists the incoming invoices waiting on them: rejected back to them, queries addressed to them, assigned to them, each invoice in one bucket only. The deputy bucket of the sibling Hub is not ported. `src/components/home/system-blockers.tsx` shows what is stuck system-wide: invoices to review, overdue outgoing invoices (due date, else the expected payment date), payments without a receipt, receipts that cannot be reconciled. A zero row is not drawn; all zeros collapse to one line. Both are mounted in `src/routes/index.tsx`. The manual outgoing-invoice form of the sibling Hub is not ported: it creates invoices through the accounting tool.
