# Feature: Propstack sync (poll + webhook)

Reference for how properties get from Propstack into `properties`: what is implemented, which
files own which part, and what is still open.

> **TL;DR** — Two Edge Functions now write to `properties`, both through the same shared code:
> `propstack-sync` (the full poll, now a daily reconciliation pass) and `propstack-webhook` (a new
> near-real-time receiver for Propstack's `property_created`/`property_updated` events). Both call
> `syncUnits()` in `supabase/functions/_shared/propstack-client.ts`, so a poll and a webhook upsert a
> property through the exact same path. **Not yet done:** registering the webhook in Propstack
> (needs a deployed function URL and a generated `PROPSTACK_WEBHOOK_SECRET`), and changing the
> live Supabase-dashboard cron job from hourly to daily — both are actions outside this repo.

## What's implemented

- `supabase/functions/_shared/propstack-client.ts` — new file, Edge-Function-only (no frontend
  twin, since the browser never calls Propstack directly):
  - `propstackKey(db)` / `propstackWebhookSecret(db)` — read `PROPSTACK_API_KEY` /
    `PROPSTACK_WEBHOOK_SECRET` from `credentials` (`channel_key: ""`), opening a sealed value with
    `TENANT_SECRET_KEY` the same way both already did. Neither function writes a credential; both
    are entered through the admin panel, same as before.
  - `fetchUnitPage(apiKey, page)` — one page of `GET /units`, same query params the poller always
    used.
  - `fetchUnit(apiKey, id)` — `GET /units/:id`, used by the webhook. Propstack's webhook payload
    shape is not fully documented, so the webhook never trusts it for data — only for which unit
    changed — and re-reads that one unit the same way the poller reads all of them.
  - `syncUnits(db, units)` — upserts a batch of units into `properties`, then runs
    `link_brokers_to_users()` and `create_deals_for_sold_properties()`. Both RPCs are idempotent
    (the latter dedupes via `on conflict (source, external_id) where external_id is not null do
    nothing`, `supabase/schema/0019_deals_from_crm.sql`), so calling this for one webhook-driven
    unit is exactly as safe as calling it for everything the poller fetched.

- `supabase/functions/propstack-sync/index.ts` — unchanged behaviour, refactored to call
  `syncUnits()` instead of doing the upsert inline. Still fetches every unit, still records
  `last_status`/`last_message` on the `propstack_sync` row of `scheduled_jobs`, still notifies
  admins on a new failure.

- `supabase/functions/propstack-webhook/index.ts` — new, unauthenticated (`verify_jwt = false`,
  `supabase/config.toml`) because Propstack cannot attach a Supabase JWT:
  1. Reads the raw body, computes HMAC-SHA256 over it with `PROPSTACK_WEBHOOK_SECRET`, compares
     against `X-Propstack-Signature` with a constant-time check. Any mismatch, or the secret not
     yet being stored, returns a non-2xx without touching the database.
  2. Pulls a unit id out of the payload, trying `id`, `unit_id`, `object_id`, `data.id`, `unit.id`,
     `property.id` in that order (Propstack's own docs only say "data of the object are passed
     along", not an exact shape).
  3. Re-fetches that unit with `fetchUnit()`, then calls `syncUnits(db, [unit])`.
  4. Any failure is `console.error`'d and answered with a non-2xx status, so Propstack's own retry
     (if it has one) can fire. No `notify_administrators` call here — the daily reconciliation pass
     is the backstop if a webhook is ever dropped outright.

- `supabase/presets/propstack-daily-sync.sql` — the inserted `scheduled_jobs` row's `schedule`
  changed from `0 * * * *` to `0 3 * * *`, and its description now says "reconciliation", matching
  the daily cadence the live cron job needs to move to (see below). This is a one-time INSERT
  (`on conflict (key) do nothing`), so it only affects a brand-new client's catalogue — an
  existing client's row, and the actual timer, both live outside this repo.

## What's still open

- **Register the webhook in Propstack.** Needs `propstack-webhook` deployed (so a function URL
  exists) and `PROPSTACK_WEBHOOK_SECRET` generated and stored via the admin panel. Then, in
  Propstack (Verwaltung → API-Schlüssel → Webhooks → "+ Webhook hinzufügen"), register the function
  URL against the "Property created" and "Property updated" events, with the same secret as the
  Sicherheitsschlüssel.
- **Move the live cron job from hourly to daily.** The actual timer is a job in the Supabase
  dashboard (Integrations → Cron), not code — this repo's preset only records the last result. An
  existing client's dashboard cron job has to be edited by hand; cloning this preset again will not
  touch it (`on conflict (key) do nothing`).
- **Verification**, once both of the above are done: edit a property in Propstack and confirm the
  Hub reflects it within seconds; mark a property `Verkauft` through the webhook path and confirm
  exactly one deal opens, then confirm the next day's reconciliation pass does not open a second
  one for the same property.
- **True deletes.** Propstack has no `property_deleted` webhook event and the poller only
  upserts/archives, never deletes — a unit genuinely removed from Propstack stays in `properties`
  until someone archives or removes it by hand. Unchanged by this work, called out here so it isn't
  mistaken for something webhooks fixed.
- **Confirmed against Propstack's own docs, not just assumed**: `X-Propstack-Signature` is a plain
  lowercase hex HMAC-SHA256 digest with no prefix, computed over the raw UTF-8 body
  (`docs.propstack.de/reference/webhooks`, which shows the verification code verbatim) — exactly
  what `hmacSha256Hex`/`timingSafeEqual` already do. `GET /units/:id` is documented at
  `docs.propstack.de/reference/objekte` as `GET /v1/units/:id?new=1`, returning the unit object
  directly, not wrapped in `data` — `fetchUnit()` now sends `new=1` to match. What the `new`
  parameter actually changes is not documented, so `unwrapUnit()` stays in `propstack-client.ts` as
  a cheap guard in case it turns out to affect the response shape; this has not been seen live.
- **Only a real delivery can confirm**: the exact payload shape of a `property_updated`/
  `property_created` webhook call itself (Propstack's docs don't show an example body), which is
  why `propstack-webhook` never trusts it for data, only for which unit id changed, and checks the
  query string as well as the JSON body for that id. The first real delivery should be checked
  against the function's logs before trusting the webhook over the poller.
