# Broker bonuses

What a broker earns on top of their salary, entered by the broker and approved by an administrator.
Replaces the Excel list each broker emailed to the bookkeeper by the 15th of the month.

## What was asked

A broker sees a bonus screen where they enter the date, the type of bonus and the amount. An
administrator approves it. (Not commissions: those are the fees the agency invoices to buyers and
sellers, see `COMMISSION_INVOICES.md`.)

## What is implemented

- **Table** `broker_bonuses`, `supabase/schema/0018_broker_bonuses.sql`: broker (`app_users`), type,
  `earned_on`, `amount` (> 0), note, status (`suggested`, `submitted`, `approved`, `rejected`,
  `paid` — `suggested` added by `supabase/schema/0022_bonus_suggestions.sql:9-11`), reviewer,
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
  follow-up 500 when the sale came from a viewing; own lead gives 50 % of (net commission after discounts
  minus the deal's costs minus the 1,500 personnel flat rate), no notary bonus; a lead won by another broker
  than the one who handled it gives that broker 10 % of the commission, costs not deducted
  (`bonus_settings.company_lead_deducts_costs`, corrected to `false` by
  `supabase/schema/0067_company_lead_bonus_no_cost_deduction.sql` — the own-lead share always deducts
  costs, hardcoded, never controlled by this flag). The notary and follow-up bonuses become a ready
  suggestion once the deal is invoiced (`deals.status = 'invoiced'`). The two shares wait until every
  commission invoice of the deal is paid — `useDealCommissionPaid` asks
  `deal_stage_reached(deal_id, 'commission_received')` (`supabase/schema/0043_referrer_bonus_stage_timing.sql`),
  the same SQL function the mark-paid gate below uses, so the suggestion gate and the payout gate can never
  disagree.
- **Settings:** table `bonus_settings` (one row): the amounts, the two percentages, the personnel flat rate,
  whether the 10 % is taken after costs (now `false`), and `broker_bonus_counts_status`, which bonuses the
  per-agent report counts. Edited under "Regeln" on the bonus screen by whoever reviews.
- **Payout gate:** marking an approved bonus paid calls the RPC `mark_broker_bonus_paid`
  (`supabase/schema/0069_broker_bonus_payout_gate.sql`), not a plain update — it raises rather than
  succeeding if the bonus isn't `approved`, or if its deal hasn't reached the stage that bonus type is due
  at (`invoiced` for notary/follow-up, `commission_received` for the two percentage shares; bonus types with
  no `deal_id` skip the check). `useMarkBrokerBonusPaid` (`src/data/broker-bonuses/broker-bonuses.ts`) calls
  it; the "Als bezahlt markieren" button on `/broker-bonuses` no longer goes through the generic
  `useReviewBrokerBonus` update the way approve/reject still do. This is the same pattern
  `mark_referrer_bonus_paid` already uses for referrer bonuses, extended here rather than left as the one
  bonus type with no server-side check on its paid transition.
- **Commission-invoice payment sync:** `commission_received` depends on `outgoing_invoices.status = 'paid'`
  actually being set for commission invoices, which nothing did before this. `lexoffice-payment-sync`
  (the same job that already reads payment status back from Lexware for incoming invoices) and
  `lexoffice-webhook` (the real-time path) were both extended to also cover commission invoices, through
  one shared decision in `_shared/lexoffice-client.ts` rather than a second, separate sync. See
  `docs/LEXOFFICE_SYNC.md`.
- **Flow:** on the deal page ("Boni für diesen Verkauf", `src/components/commission/bonus-suggestions-card.tsx`)
  an administrator creates a suggestion. It is a `broker_bonuses` row with status `suggested`, `deal_id` set and
  the calculation as its note, one per deal and type. The broker is notified, confirms it (status `submitted`,
  the administrators are notified) or declines it (the row is deleted), and the usual review follows.
- **Who is "handled by" and "lead won by":** `deals.handled_by` and `deals.acquired_by`, set on the deal page
  by whoever may edit any deal. A sale opened from the CRM sets both to the CRM's broker.
- **Assumptions to confirm with the client:** what the 10 % is calculated on (the setting defaults to the
  commission after costs), what happens when nothing is left after the deductions (no suggestion is made),
  and that a sale from a viewing and an own lead may both apply. Which bonuses count towards a reporting
  period is no longer an assumption: `bonus_settings.broker_bonus_counts_status` decides it
  (`supabase/schema/0059_broker_bonus_counting_rule.sql`), defaulting to `approved_and_paid`, the rule the
  report already applied. The period is still taken from `earned_on`, which stays an assumption. The Google
  bonus is not tied to a sale and stays manual.

## Open

- Without the `bonuses.suggest` switch, bonuses are typed in by the broker and nothing checks the amount.
- Questions to the client: the rule for "Empfehlung Finanzierung", and whether the notary bonus is
  now 500 euro (the 2025 list shows 300) — §5.2, separate from the §5.1 corrections below.
- **§5.1's two corrections are both done**, confirmed against the briefing, not assumed: the cost
  deduction direction (company lead without, own lead with) and the two payout triggers (notary bonus
  due on invoice issue, percentage shares due once Lexware confirms the commission invoice paid) — see
  "Suggested from a sale" above, "Payout gate" and "Commission-invoice payment sync".
- **The two percentage shares carry a meaningless `earned_on`.** `suggestBonuses` returns
  `earnedOn: null` for `own_job_share` and `company_lead_share`, because neither is due until the costs
  are closed and every commission invoice is paid, and
  `src/components/commission/bonus-suggestions-card.tsx:90` then falls back to the current date. So the
  stored date is the day somebody pressed the button, not anything about the deal. A deal notarised in
  December whose commission arrives in January has its closing counted in one reporting year and its
  bonus in the next, since the per-agent report windows closings on `deals.notarised_on` and bonuses on
  `earned_on` (`docs/COMMISSION_INVOICES.md`, per-agent reporting).
