# Broker bonuses

What a broker earns on top of their salary, entered by the broker and approved by an administrator.
Replaces the Excel list each broker emailed to the bookkeeper by the 15th of the month.

## What was asked

A broker sees a bonus screen where they enter the date, the type of bonus and the amount. An
administrator approves it. (Not commissions: those are the fees van Oepen invoices to buyers and
sellers, see `COMMISSION_INVOICES.md`.)

## What is implemented

- **Table** `broker_bonuses`, `supabase/schema/0018_broker_bonuses.sql`: broker (`app_users`), type,
  `earned_on`, `amount` (> 0), note, status (`submitted`, `approved`, `rejected`, `paid`), reviewer,
  review time and review note. Types are checked: `notary`, `google_review`, `viewing_new_job`,
  `company_lead_share`, `own_job_share`, `financing_referral`, `other`.
- **Permissions** in `supabase/catalogue.sql`, all off by default: page `page.broker_bonuses`,
  actions `bonuses.submit`, `bonuses.review` and `bonuses.read`. The catalogue gives `bonuses.review` to roles that
  administer.
- **Row security:** a holder of `bonuses.submit` reads, inserts, edits and deletes only their own
  rows, and only while `submitted`; they cannot write a reviewer or a status other than `submitted`.
  A holder of `bonuses.review` reads and writes every row. The trigger `stamp_bonus_review` records
  who decided and when.
- **Screen** `/broker-bonuses`, `src/routes/broker-bonuses/index.tsx`, hooks in
  `src/data/broker-bonuses/`. A broker enters a bonus and can withdraw it until it is reviewed. A
  reviewer sees all brokers, corrects the amount, approves or rejects with a note, and marks approved
  bonuses paid. Totals show to review, approved unpaid, paid. Each row shows its salary month: entered
  on or before the 15th is this month's salary, later is next month's.
- **Roles:** `supabase/presets/broker-role.sql` gives the Broker role the page and `bonuses.submit`,
  and every administering role the page and `bonuses.review`.
  `supabase/presets/broker-for-an-existing-client.sql` is the combined file for a live database.
- **Payroll view:** the Buchhaltung role holds `bonuses.read`, which reads every broker's `approved` and
  `paid` bonuses and nothing else, and changes none. The screen shows those rows with the broker name
  and an "Als CSV exportieren" button (salary month, broker, date, type, amount, status).
- **Reviewer notification:** the trigger `notify_bonus_submitted` writes a bell entry for every active
  administering role, the developer role included, linking to `/broker-bonuses`, each time a broker
  enters a bonus.
- **Decision notice:** approving, rejecting (with the review note) or paying a bonus tells the broker (`notify_bonus_decided`, `docs/NOTIFICATIONS.md`).
- **Checked:** a broker row was inserted and read back, and a broker approving their own bonus was
  refused, against the local database. The screen itself was not opened in a browser.

## Suggested from a sale

Off by default: the switch `bonuses.suggest` (catalogue section under `page.broker_bonuses`, granted to
administering roles). `supabase/presets/bonus-suggestions-for-an-existing-client.sql` adds it to a live
database and ends with the line that switches it on. Run `deal-details-for-an-existing-client.sql` first.

- **Calculation:** `src/kit/lib/commission/bonuses.ts` (`suggestBonuses`, tests beside it), run on the saved
  deal. Rules: notary bonus 500 for the person who handled the sale, unless the sale is an own lead;
  follow-up 300 when the sale came from a viewing; own lead gives 50 % of (net commission after discounts
  minus the deal's costs minus the 1,500 personnel flat rate), no notary bonus; a lead won by another broker
  than the one who handled it gives that broker 10 %. The notary and follow-up bonuses are due at the notary
  date. The two shares wait until the costs are closed and every commission invoice of the deal is paid.
- **Settings:** table `bonus_settings` (one row): the amounts, the two percentages, the personnel flat rate and
  whether the 10 % is taken after costs. Edited under "Regeln" on the bonus screen by whoever reviews.
- **Flow:** on the deal page ("Boni für diesen Verkauf", `src/components/commission/bonus-suggestions-card.tsx`)
  an administrator creates a suggestion. It is a `broker_bonuses` row with status `suggested`, `deal_id` set and
  the calculation as its note, one per deal and type. The broker is notified, confirms it (status `submitted`,
  the administrators are notified) or declines it (the row is deleted), and the usual review follows.
- **Who is "handled by" and "lead won by":** `deals.handled_by` and `deals.acquired_by`, set on the deal page
  by whoever may edit any deal. A sale opened from the CRM sets both to the CRM's broker.
- **Assumptions to confirm with the client:** what the 10 % is calculated on (the setting defaults to the
  commission after costs), what happens when nothing is left after the deductions (no suggestion is made),
  and that a sale from a viewing and an own lead may both apply. The Google bonus is not tied to a sale and
  stays manual.

## Open

- Without the `bonuses.suggest` switch, bonuses are typed in by the broker and nothing checks the amount.
- Questions to the client: the rule for "Empfehlung Finanzierung", and whether the notary bonus is
  now 500 euro (the 2025 list shows 300).
