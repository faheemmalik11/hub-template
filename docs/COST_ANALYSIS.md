# Feature: Cost analysis / evaluation (`/auswertungen`) + Manual bookings (`/manuelle-buchungen`)

Briefing Screen 10 ("Evaluations: cost analysis, BWA & open items") and Screen 11 ("Manual
booking: personnel costs, depreciation, taxes"). This doc exists because the mechanics of "what
does it take for something to actually show up here" kept needing to be re-derived from code in
support conversations — read this instead.

## 1. What the briefing asked for

Screen 10, in the client's own words:

> What is buildable today is a **cost analysis by BWA logic** (level 1): costs grouped by BWA
> lines, filterable, with drilldown. A real BWA (level 2) additionally needs the **revenue**
> (from LexOffice, not yet connected) as well as **personnel costs and depreciation** (these never
> come from the mailbox → Screen 11). **Level 1 must not be called "BWA".** Otherwise Philipp
> compares it with his DATEV BWA, finds discrepancies and loses trust in the whole system.

The three build rules "without which every figure is wrong":

1. **Compute net (standard).** VAT is a pass-through item and belongs in no evaluation line.
2. **No figure without a match.** Into the evaluation counts only a matched pair of receipt and
   transaction. Everything unmatched is an open item and does not count.
3. **Some items belong in no line** (asset addition, loan repayment, deposit, private withdrawal,
   VAT payment) — actively locked out, not silently included.

Screen 11 adds manual bookings "on equal footing" next to receipts, because personnel costs and
depreciation never arrive via mailbox or bank match at all.

## 2. What's actually implemented

- `src/routes/auswertungen/index.tsx` — the page. Fetches `useBelege()`, `useOutgoingInvoices()`,
  `useManualBookings()`, confirmed allocations, filters by company/property/category/account/period,
  and feeds everything into `computeBwaSkeleton()`.
- `src/lib/data/bwa-skeleton.ts` — `BWA_SKELETON`: the fixed line order, reproduced exactly from
  DATEV Form 01. **Gross Profit and Operating Gross Profit are two separate subtotals, never
  merged** — Gross Profit sums only Revenue + Change in inventory + Capitalized own work − Cost of
  materials/goods, then _stops_; Operating Gross Profit adds Other operating income on top. Every
  line below Operating Gross Profit (Personnel, Occupancy, Business taxes, Insurance, Vehicle,
  Advertising/travel, Cost of goods sold, Depreciation, Repair/maintenance, Other costs) is
  invisible to Gross Profit — a booking there moves Preliminary Result but not Gross Profit. This
  is not a bug; it's the exact same behavior DATEV's own BWA has.
- `supabase/migrations/0043_hub_bwa_categories.sql` — seeds `bwa_categories`: ~20 coarse
  categories (each with a `code` that `BWA_SKELETON` keys on, e.g. `COGS_MATERIAL`) and ~90 fine
  tags under them (e.g. "Kfz-Reparatur" under `VEHICLE`). **A booking's BWA line is decided
  entirely by which category is picked** — not by amount, note text, or anything else. Category
  labels are always shown in German (`name_de`), regardless of the DE/EN toggle.
- Rule 2 ("no figure without a match") — `isFullyCovered()` (`src/lib/data/format.ts`) gates every
  receipt/outgoing invoice: only invoices covered by _confirmed bank matches_ count. Since
  2026-08-12, `coveredAmount()` (same file) additionally treats an invoice as fully covered when
  it's already considered paid outside of matching — `paid_source='manual'` on an incoming
  invoice (the "Zahlung & Abgleich" tab's manual paid toggle), or `voucher_status='paidoff'` on an
  outgoing one — since some payments (cash, a channel with no bank feed) will never produce a
  matchable transaction at all. Wired into both `offene-posten/index.tsx` (so a manually-paid
  invoice also stops showing as an open item) and `auswertungen/index.tsx` (`scoped`,
  `scopedRevenue`, `unmatchedCount`/`unmatchedTotal`). Bank-matched coverage already implies
  paid_at/voucher_status agree, so this never under-counts an already-matched invoice.
- Rule 3 — `UNASSIGNED`/`NOT_PNL` category codes route to `computed.unassignedAmount` /
  `computed.excludedNotPnlAmount` (the "Not assigned" / "Belongs in no evaluation line" KPI cards),
  never into a real P&L line.
- Manual bookings (`src/routes/manuelle-buchungen/index.tsx`, `useManualBookings`/
  `useCreateManualBooking` in `queries.ts`, RPC `manual_bookings_expanded`) — company, BWA
  line/category, month/year, optional property, amount, optional recurrence. Feeds
  `auswertungen`'s `manualScoped` on the exact same footing as receipts (`combined = [...belegItems,
...manualScoped.items, ...scopedRevenue.items]`).

## 3. The period window — what "All periods" actually means

This was the source of a real bug, fixed 2026-08-12. `effVon`/`effBis` (`auswertungen/index.tsx`)
decide the date range `useManualBookings` fetches:

- **An explicit period filter is selected** → that period's `von`/`bis` is used directly. Correct,
  unchanged.
- **"All periods" is selected** → _as of the fix_, a generous ~20-year window
  (`currentYear − 15` to `currentYear + 5`) is used, so "all periods" genuinely means all periods.
  **Before the fix**, this fell back to whatever date range the currently _matched_ receipts
  happened to span (or the calendar year if none were matched yet) — a manual booking outside that
  incidental window was silently never fetched at all, with nothing on screen explaining why.

## 4. What's still open / diverges from the briefing

(Full detail from a code-level gap analysis against the briefing, 2026-08-12 — re-verify against
current code before trusting stale specifics.)

- **Net/gross isn't switchable.** The briefing lists this as a foundational, expensive-to-retrofit
  decision ("net/gross switchable ... not hard-wired"). The code hard-codes net
  (`amount_net + vat_nondeductible_amount`), no UI toggle to view gross.
- **No per-company access scoping.** The briefing says (as "✅ Decided"): _"Visibility is enabled
  per company (Philipp = all · Julia = only JPGB). Only management sees the evaluation."_
  `useAuth()` computes `allowedCompanyIds` per user, but nothing in `auswertungen/index.tsx` (or
  anywhere else) filters by it — only the assistant-role redirect exists. Any other logged-in
  manager currently sees every company's figures regardless of what they're assigned to.
- **No previous-month/previous-year comparison shown.** The period filter only lets you _switch_
  to a different period, not see current vs. prior side by side. Possibly deferred deliberately —
  the briefing says Fabian still owed "the exact column layout" for this.
- **Business-line VAT dimension replaced.** The briefing's `property × business_line → company`
  model (needed so a property can be VAT-liable under one business line and exempt under another)
  was replaced by a plain `property_companies` many-to-many (migration 0083) that solves the
  multi-company-per-property case but drops the business-line hook Screen 5's VAT rules needed.
- **LexOffice removed entirely** (migration 0086) — outgoing invoices are now created/uploaded
  directly in-app. This is actually _ahead_ of the briefing's own Level 1/Level 2 split: revenue
  from these uploaded outgoing invoices already flows into the evaluation once matched, which the
  briefing assumed would only happen once LexOffice was connected. The "Kostenanalyse (Stufe 1)"
  disclosure banner doesn't reflect this — worth revisiting whether the Level 1 label is still
  accurate now that revenue is live.

## 5. Related docs

- `docs/BWA_ACCOUNT_MAPPING.md` — the account↔category mapping tab (currently gated behind
  "Coming Soon"), company-scoping of that separate table.
- `docs/PROJECT-ROADMAP.md` — the client's 7-step product vision this fits into.
