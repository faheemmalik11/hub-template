# Hub → PropStack writeback (§4.4)

Fabian's 11 November briefing, §4.4: whatever is added or corrected in the Hub for the four
required fields (realised price, sale date, external/internal commission percent — §4.1) should
also reach PropStack, and the Hub should point out when any of them is still missing.

## What the briefing asked for, and what's actually implemented

1. **A prompt about unmaintained fields.** Still open, and narrower in the code than this doc
   claimed until 18.11.2026. `reviewLines` in `src/routes/commission-deals/$id.tsx` flags exactly
   two things: a missing fee on either side, and a missing payment due date. There is no
   `purchase_price` or `notarised_on` check anywhere in `src/`. `purchase_price` genuinely can be
   null, so the realised-price half of this item is unbuilt. `notarised_on` cannot be null in
   practice, because the view coalesces `sold_on` to `became_sold_at`.
2. **Writing back to PropStack as soon as a value is added or corrected in the Hub.** New, and only
   three of the four fields are actually sent — see Status below for why the fourth is a deliberate
   scope decision now, not a technical limitation:
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

**Correction, 25 November 2026: the 17 November finding above was wrong, re-tested against a
disposable test property (id 6572690, "ZZZ-TEST-CLAUDE-PROBE") rather than trusted as still true.**
A bare-number `PUT /units/:id` body (`{"property": {"sold_price": 445500}}`, no wrapper object)
does write `sold_price` — confirmed by a fresh `GET` immediately after reading back
`{"label": "Realisierter Preis", "value": 445500}`, then confirmed again with a second, different
value (333000) on a later write to rule out a fluke. Whatever caused the 17 November no-op
(a since-fixed PropStack-side issue, most likely, since the request shape that failed then is the
one that now succeeds) no longer applies. The `{ value: <number> }` wrapper shape is still wrong
and still 500s — that part of the original finding holds.

**Not building the push anyway, but for a different reason than "it's impossible."** Fabian's 23
November reply (decision 9) explicitly does not want the Hub writing into `sold_price` even though
it now works: "create a separate custom field for the realised price and write it there" instead,
so PropStack's own native field stays under PropStack's own control. That still needs Nik
consulted on how Living Immo shapes its equivalent custom field before building it — unblocked on
the writability question, still blocked on that conversation. `purchase_price` stays out of
`propstack-deal-values-push` until the new custom field exists.
