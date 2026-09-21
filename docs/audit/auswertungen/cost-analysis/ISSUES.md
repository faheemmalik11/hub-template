# Auswertungen / Kostenanalyse (Cost Analysis) — this client Hub

Screen: `http://localhost:7070/auswertungen`.

The findings for this screen were written up on the **a sister Hub Hub** — see that repo's
`docs/audit/auswertungen/cost-analysis/ISSUES.md` for the 13 numbered items, the evidence behind
each, and the shared Resolution. All 13 applied here too and all 13 are fixed here. This file records
only what is **different about this Hub**, so nobody re-derives it.

## Structural difference

a sister Hub extracted the BWA computation into `src/lib/data/use-bwa-scope.ts`; **this Hub computes it
inline in `src/routes/auswertungen/index.tsx`** (`scoped`, `scopedRevenue`, `manualScoped`). The
fixes are therefore in the route, not in a hook. Same behaviour, different location.

To support the prior-period comparison (#13) without a second implementation of the bucketing rules,
the three scoping memos no longer apply the date window themselves. They now emit every in-scope item
with its booking date into `alleItems`, and `imFenster(items, von, bis)` cuts the two windows —
the selected period and the comparison period — from that one list.

## Data situation (as of 19.08.2026), and why it shapes the testing

- **Zero confirmed bank matches** (`invoice_transaction_matches` where `status='bestaetigt'` → 0),
  against 433 invoices and 2.756 bank transactions. No receipt reaches the P&L at all.
- **Zero outgoing invoices**, so the Revenue line is structurally 0,00 € and cannot be exercised.
- The entire P&L is therefore **two manual bookings**, both dated 2026-08-01 (STAY):
  112,00 € Bauleistung § 13b and 422,00 € Kfz-Steuer. Baseline: Rohertrag −112,00 €,
  Betriebliche Steuern 422,00 €, Vorläufiges Ergebnis −534,00 € — unchanged by this work, verified
  before and after.
- 433 of 433 invoices have `vat_deductible_pct` null; 33 have `amount_net` null.

Consequence: findings #4 and #6 cannot be reached from the live data. #4 is covered in
`e2e/kostenanalyse.spec.ts` by cloning a real invoice into a fully-covered one with `amount_net:
null`; **#6 is covered on the a sister Hub Hub instead** — here it would need a synthetic outgoing
invoice _and_ a synthetic confirmed match, because every company on this Hub books on
`payment_date`, so revenue has no booking date without one.

## The one finding that was specific to this Hub

**The period picker offered no concrete period at all.** Its month/quarter/year options were derived
purely from receipt and revenue booking dates — and with nothing matched, that set is empty. The
dropdown showed only "Alle Perioden / Vormonat / Vorjahr / Individueller Zeitraum …", which also made
the new prior-period comparison unreachable. Manual-booking months now feed the picker too; it now
also offers Jahr 2026, Q3 2026 and August 2026.

Related: the manual-booking fetch no longer narrows itself to the selected period. One fixed wide
span keeps the picker stable, guarantees the comparison window is actually fetched, and collapses
what was a refetch-per-filter-change into a single React Query key.

## Verified live on this Hub

#1 loading gate · #2 error gate (forced 500 on `manual_bookings_expanded` → ErrorState, no P&L) ·
#3 custom range 20.–31.08. excludes the 01.08. bookings while 01.–31.08. includes them ·
#7 drilldown item reads "STAY · Manuelle Buchung" and navigates to `/manuelle-buchungen` ·
#9 "Unabhängig vom Zeitraum-Filter" appears only with a period selected · #11 all three allocation
queries now carry `offset`/`limit` · #12 CSV export · #13 comparison columns with correct deltas
(112,00 € vs 0,00 € = +112,00 €).

Regression tests: `e2e/kostenanalyse.spec.ts`, titled by audit number. They intercept responses and
never insert rows, so they are safe against this Hub's production project.
