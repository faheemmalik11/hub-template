# Hub → PropStack writeback (§4.4)

Fabian's 11 November briefing, §4.4: whatever is added or corrected in the Hub for the four
required fields (realised price, sale date, external/internal commission percent — §4.1) should
also reach PropStack, and the Hub should point out when any of them is still missing.

## What the briefing asked for, and what's actually implemented

1. **A prompt about unmaintained fields.** Already built before this feature — `reviewLines` in
   `src/routes/commission-deals/$id.tsx` already flags a missing `purchase_price`, a missing
   `notarised_on`, or a missing fee on either side, each with a "Fix" link jumping to the field.
   Nothing added for this.
2. **Writing back to PropStack as soon as a value is added or corrected in the Hub.** New:
   - `supabase/functions/_shared/propstack-client.ts`'s `updateUnitFields()` — a sibling to the
     existing `updateUnitCustomFields()`, for plain top-level unit attributes (`PUT /units/:id`
     with `{"property": {...}}`, no `partial_custom_fields` wrapper).
   - `supabase/functions/propstack-deal-values-push/index.ts` — takes `{ deal_id }`, loads the
     deal's `purchase_price`/`notarised_on` and both `deal_sides.fee_net_rate`, skips cleanly if
     the property has no PropStack `external_id`, calls `updateUnitFields` with `sold_price`,
     `sold_date`, `external_commission_percentage`, `internal_commission_percentage`.
   - Wired into `DealEditor`'s `runSave` in `src/routes/commission-deals/$id.tsx`, mirroring the
     existing payment-due-date push exactly: after the deal itself saves, if the price/notary
     date/either rate actually changed (`dealValuesUnsaved`) and the new feature is live, the push
     runs best-effort — a failure never blocks the save, it only changes the save toast's wording
     (reusing the existing `savedAndSynced`/`savedButNotInCrm`/`saved` tri-state, same as the
     due-date flow; no new UI strings needed).
   - New feature flag `propstack.deal_values_sync`, off by default like every other sync flag here.

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

**Implemented, typecheck/lint clean, not yet live-tested.** The exact PropStack field names
(`sold_price`, `sold_date`, `external_commission_percentage`, `internal_commission_percentage`)
are inferred from the *read* side (`_shared/propstack.ts`'s `PropstackUnit` mapping and
`create_deals_for_sold_properties()`'s own `crm_data` lookups) — PropStack's own API docs confirm
the `PUT /units/:id` + `{"property": {...}}` shape but do not publish a field-name reference table,
so this has not yet been proven against a real write call. Next step: one disposable test deal,
edited with the new feature switched on, confirmed against the real PropStack account, cleaned up
afterward — same pattern as every other live test this session.
