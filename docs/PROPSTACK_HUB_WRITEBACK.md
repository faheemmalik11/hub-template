# Hub → PropStack writeback (§4.4)

Fabian's 11 November briefing, §4.4: whatever is added or corrected in the Hub for the four
required fields (realised price, sale date, external/internal commission percent — §4.1) should
also reach PropStack, and the Hub should point out when any of them is still missing.

## What the briefing asked for, and what's actually implemented

1. **A prompt about unmaintained fields.** Already built before this feature — `reviewLines` in
   `src/routes/commission-deals/$id.tsx` already flags a missing `purchase_price`, a missing
   `notarised_on`, or a missing fee on either side, each with a "Fix" link jumping to the field.
   Nothing added for this.
2. **Writing back to PropStack as soon as a value is added or corrected in the Hub.** New, and only
   three of the four fields actually work — see Status below:
   - `supabase/functions/_shared/propstack-client.ts`'s `updateUnitFields()` — a sibling to the
     existing `updateUnitCustomFields()`, for plain top-level unit attributes (`PUT /units/:id`
     with `{"property": {...}}`, no `partial_custom_fields` wrapper).
   - `supabase/functions/propstack-deal-values-push/index.ts` — takes `{ deal_id }`, loads the
     deal's `notarised_on` and both `deal_sides.fee_net_rate`, skips cleanly if the property has no
     PropStack `external_id`, calls `updateUnitFields` with `sold_date`,
     `external_commission_percentage`, `internal_commission_percentage`. Does **not** send
     `purchase_price` — see Status.
   - Wired into `DealEditor`'s `runSave` in `src/routes/commission-deals/$id.tsx`, mirroring the
     existing payment-due-date push exactly: after the deal itself saves, if the price/notary
     date/either rate actually changed (`dealValuesUnsaved`) and the new feature is live, the push
     runs best-effort — a failure never blocks the save, it only changes the save toast's wording
     (reusing the existing `savedAndSynced`/`savedButNotInCrm`/`saved` tri-state, plus a new
     `savingAndSyncing` loading message so the toast says what's actually happening while a save is
     also pushing to PropStack). `dealValuesUnsaved` still watches `purchasePrice` too, even though
     it's never sent — a date/rate fix bundled with a price edit should still sync the two that do
     work, rather than silently skip the whole push.
   - New feature flag `propstack.deal_values_sync`, off by default like every other sync flag here.
   - `approveDisabled`/`createInvoicesDisabled` now also check `isSaving`, so no other action button
     can be clicked while a save (and its PropStack push) is still in flight.

## Why this needed no conflict-protection column, unlike payment due date

Payment due date lives on `properties` and gets overwritten by every hourly `propstack_sync` pull,
which is why it carries a `payment_due_date_source` marker protecting a human's edit from the next
pull. Realised price, sale date and both commission rates live on `deals`/`deal_sides` instead —
confirmed by reading `create_deals_for_sold_properties()` (`supabase/schema/0019_deals_from_crm.sql`)
and `save_deal()` (`supabase/schema/0011_functions.sql`): `propstack_sync` only ever *creates* a
deal from a newly-sold property, it never updates an existing deal afterward. There is no "the next
sync will stomp this" race here, so no marker column was added.

## Known, accepted simplification

A property can have more than one deal over its lifetime (no DB constraint prevents it, and it's a
real scenario — a deal falls through and the same property sells again later). If that happens,
whichever deal is saved last writes its own values into PropStack — there is no cross-deal conflict
resolution. This matches Living Immo's own precedent exactly: fire-and-forget, best-effort, last
write wins, nothing fancier. Not worth building around for a genuinely rare case.

## Status

**Live-tested against the real PropStack account, 17 November 2026, with a disposable test deal.**
Three of the four fields are confirmed working end to end: a real notary-date change and both
commission-rate changes landed correctly in PropStack (`sold_date`, `external_commission_percentage`,
`internal_commission_percentage`), confirmed by reading the raw `crm_data` PropStack returns after
a fresh `propstack_sync` pull, not just the Hub's own assumption.

**`purchase_price` (PropStack's "Realisierter Preis") does not work, confirmed by repeated,
varied testing, not a single failed attempt:**
- A bare number silently no-ops: the call succeeds, but the field stays empty.
- `{ value: <number> }` (the shape PropStack's own API returns this field in on *read*) fails
  outright with a real 500 from PropStack (`{"errors":["Leider ist etwas schief gelaufen. Bitte
  versuche es später erneut."]}`) — every time, including alone, combined with the other three
  fields, and again after a 15-second wait to rule out rate-limiting.
- The property's own "Deals" tab (PropStack's `client_properties` concept — prospects at various
  sales-funnel stages) was checked directly as a possible source of a linked price; none of this
  property's 57 prospect records have a price set either, so "Realisierter Preis" isn't being
  rolled up from one of those.
- The field **is** genuinely editable directly in PropStack's own UI (confirmed by typing a value
  there and watching it save and read back correctly) — the limitation is specifically the public
  `PUT /units/:id` API, not the field itself.

**Confirmed for good reason, not just the attempts above.** A second client's codebase
(`alba-homes`, a separate production integration, unrelated to Living Immo) has its own PropStack
field binding with this exact note, written after confirming it against a real PropStack account:
PropStack holds a price in two places — `price` (the asking price, genuinely writable, the one
their own code pushes) and `sold_price` (labelled "Realisierter Preis" in German, read-only,
PropStack fills it in itself once a sale closes through its own internal process). Writing `price`
instead was tried here too: it succeeds, but it changes the asking price, not "Realisierter Preis"
— confirmed live, the two fields stayed independent after the write. So there is no field this
Hub can write to that actually updates "Realisierter Preis".

**Decision: not building a manual nudge for this either.** §4.1's own Data Maintenance Assistant
already blocks a deal from reaching "Notartermin stattgefunden" in PropStack until "Realisierter
Preis" is filled in there — the value is correct by the time a deal exists in the Hub at all.
The only case this gap could matter is someone correcting the price in the Hub *after* the deal
exists, which for a notarised purchase price is rare. `purchase_price` is deliberately left out of
the push: not a thing to fix, a confirmed, permanent limitation of PropStack's public API, not
worth a workaround for how rarely it would ever come up.
