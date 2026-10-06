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
  actions `bonuses.submit` and `bonuses.review`. The catalogue gives `bonuses.review` to roles that
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
- **Checked:** a broker row was inserted and read back, and a broker approving their own bonus was
  refused, against the local database. The screen itself was not opened in a browser.

## Open

- The bookkeeper cannot see bonuses yet. Ayla needs the approved list for the salaries: give her a
  read-only permission, or an export of approved bonuses per month.
- Bonuses are typed in by the broker. They are not calculated from sales, so the 10% and 50% shares
  rely on the broker entering the right amount.
- Questions to the client: the rule for "Empfehlung Finanzierung", and whether the notary bonus is
  now 500 euro (the 2025 list shows 300).
- No notification to the reviewer when a bonus is entered.
