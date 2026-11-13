# Referrer bonuses

A fixed-amount bonus paid to whoever referred a sale ("Tippgeber"), tied to how many of that
referrer's deals have already succeeded in the same calendar year. Modelled on
`DEAL_DONATIONS.md`'s shape — an administrator records it from the deal page — but keyed by a
*count*, not a threshold.

## What was asked

Confirmed by the client in writing, 27 October (`planning/communication/2026-10-27/`), replacing an
earlier percentage-tier model (10/15/20%, confirmed as recently as 8 October): fixed euro amounts
per successful referral in a calendar year — 1st: €1,000, 2nd: €1,500, 3rd: €2,000. The email never
says what happens at a 4th referral in the same year, so that amount is its own configurable field
rather than an assumption.

## What is implemented

- **Settings**: 4 new columns on the existing `bonus_settings` table (`supabase/schema/0032_referrer_bonuses.sql`),
  not a new settings table — `referrer_tier1_amount` (1000), `referrer_tier2_amount` (1500),
  `referrer_tier3_amount` (2000), `referrer_tier4plus_amount` (2000, independently configurable,
  since the source material never specifies this one). Editable from the existing "Bonus rules"
  dialog (`src/components/broker-bonuses/bonus-settings-dialog.tsx`) — four more rows in its
  generic `NUMBER_FIELDS` list.
- **Table** `deal_referrer_bonuses`: deal, referrer (a `customers` row — **never** an `app_users`
  row, which is why this isn't a `broker_bonuses` row), tier, amount, earned date, status, cancel
  reason. `created_by`/`paid_by`/`paid_at` stamped server-side by `stamp_deal_referrer_bonus()`,
  never trusted from the client, same pattern as `stamp_deal_donation()`.
- **Tier counting**: `referrer_bonus_tier(referrer_customer_id, earned_on)` counts, plus one. Four
  rules that shape that count are configurable on `bonus_settings`
  (`supabase/schema/0036_referrer_bonus_rules_configurable.sql`), not hard-coded, per Fabian's 11
  November briefing (§13.1): `referrer_tier_counts_status` (`suggested` default — count as soon as
  a bonus is suggested, or `paid` to only count once actually paid), `referrer_tier_reset` (`yearly`
  default — count resets each calendar year, or `never` for a lifetime count), `referrer_tier_scope`
  (`per_referrer` default, or `company_wide` to pool every referrer into one shared scale), and
  `referrer_payout_timing` (`on_suggestion` default, or `after_commission_paid`). All four are
  editable from the existing "Bonus rules" dialog, same as the tier amounts. The client calls this
  to default the amount field; it does not gate what gets saved — same trust model `save_deal` and
  `create_deal_invoices` already use for client-submitted amounts.
  **`referrer_payout_timing` is stored and counted, but not yet enforced** — setting it to
  `after_commission_paid` does not currently stop `DealReferrerBonusCard`'s "Create bonus" button
  from being usable before the deal's commission is actually paid; wiring that check in is still
  open.
- **Permission**: reuses `bonuses.review` (no new permission key) — a referrer bonus is managed by
  the same role that reviews broker bonuses, and the card is shown under the same `suggestsBonuses`
  gate (`bonuses.suggest` feature + `bonuses.review` permission) as `BonusSuggestionsCard`.
- **One active bonus per deal**: `deal_referrer_bonuses_one_active_per_deal`, a partial unique index
  excluding `cancelled` rows, same shape as `deal_donations_one_active_per_deal`.
- **Screen**: `src/components/commission/deal-referrer-bonus-card.tsx`, shown on the deal page when
  `deal.referrer_customer_id` is set. Shows the referrer's name (`useCustomer`), the computed tier
  and its default amount, an editable amount field, then "Mark as paid" / "Cancel" once created.
  Hooks in `src/data/deal-referrer-bonuses/`.
- **Notification**: `notify_referrer_bonus_suggested`, same shape as `notify_donation_suggested` and
  `notify_bonus_submitted`.

## Open

- **The 4th-referral-and-beyond amount is a guess at the UI shape, not the client's decision.** The
  field exists and defaults to the tier-3 amount, but nobody has actually confirmed what should
  happen there — ask before assuming the default is right for a referrer's 4th+ sale.
- Two gates, not one: `BonusSuggestionsCard` needs `bonuses.suggest` enabled *and* `bonuses.review`
  granted to `admin`/`super_admin`. A client that already has both needs no further switch; any
  client porting this needs both checked. Which clients already have them is on their own branches.
- Like `donation_settings` before it, the new `bonus_settings` columns have an edit screen from day
  one (reusing the existing dialog) — no "change it with raw SQL until a screen exists" gap here.
