# Feature: Propstack sync (poll + webhook)

Reference for how properties get from Propstack into `properties`: what is implemented, which
files own which part, and what is still open.

> **TL;DR** — Two Edge Functions write to `properties`, both through the same shared code:
> `propstack-sync` (the full poll, meant to run daily) and `propstack-webhook` (a near-real-time
> receiver for Propstack's `property_created`/`property_updated` events). Both call `syncUnits()` in
> `supabase/functions/_shared/propstack-client.ts`, so a poll and a webhook upsert a property through
> the exact same path. Every webhook delivery, successful or not, is logged to `crm_webhook_events`.
> **Verified live on a real client**: both webhooks registered in Propstack, a real edit in the
> Propstack UI reached the Hub in under 10 seconds with no manual trigger. **Still open**: the live
> Supabase-dashboard cron job is still hourly, not daily — that's a dashboard setting, not code.

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
     yet being stored, returns a non-2xx without touching the database, and without logging an
     event — these happen before the request is trusted as a real delivery.
  2. Pulls a unit id out of the payload, trying `id`, `unit_id`, `object_id`, `data.id`, `unit.id`,
     `property.id` in that order, falling back to the same keys in the query string. A real
     delivery's body has been seen live and is simply `{"id": <number>}`; the extra candidates stay
     as a guard since Propstack's docs never commit to that shape.
  3. Once a unit id is found, inserts a row into `crm_webhook_events` (`recordEvent()`) before doing
     anything else, then re-fetches that unit with `fetchUnit()` and calls `syncUnits(db, [unit])`.
     `settle()` updates that same row to `done` or `failed` (with the error message) once the
     attempt finishes — so every delivery that got this far is visible in the database, not only in
     Edge Function logs.
  4. Any failure is still `console.error`'d and answered with a non-2xx status, so Propstack's own
     retry (if it has one) can fire. No `notify_administrators` call — the reconciliation poll is
     the backstop if a webhook is ever dropped outright, and `crm_webhook_events` is how a failure
     actually gets noticed.

- `supabase/schema/0031_crm_webhook_events.sql` — new table, one row per webhook delivery that got
  past signature verification: `crm_provider` (currently only `'propstack'`; the table is generic on
  purpose, not `propstack_webhook_events`, so a second CRM integration reuses it instead of
  inventing its own), `crm_record_id`, `status` (`processing` → `done`/`failed`), `payload` (the raw
  body, for real debugging), `error`, `received_at`, `processed_at`. Added to the `master_data.read`/
  `master_data.write` capability area in `0010_access.sql`, same as `properties` itself. Pure event
  logging, not a system of record — `properties` stays the source of truth.

- `supabase/presets/propstack-daily-sync.sql` — the inserted `scheduled_jobs` row's `schedule`
  changed from `0 * * * *` to `0 3 * * *`, and its description now says "reconciliation", matching
  the daily cadence the live cron job needs to move to (see below). This is a one-time INSERT
  (`on conflict (key) do nothing`), so it only affects a brand-new client's catalogue — an
  existing client's row, and the actual timer, both live outside this repo.

## What's still open

- **Move the live cron job from hourly to daily.** The actual timer is a job in the Supabase
  dashboard (Integrations → Cron), not code — this repo's preset only records the last result. An
  existing client's dashboard cron job has to be edited by hand; cloning this preset again will not
  touch it (`on conflict (key) do nothing`). Confirmed still hourly on a real client project as of
  2026-11-10; which client, and whether it has since been changed, is on that client's own branch.
- **True deletes.** Propstack has no `property_deleted` webhook event and the poller only
  upserts/archives, never deletes — a unit genuinely removed from Propstack stays in `properties`
  until someone archives or removes it by hand. Unchanged by this work, called out here so it isn't
  mistaken for something webhooks fixed.
- **No UI for `crm_webhook_events` yet.** The table exists and is populated; nothing in the Hub
  renders it. Right now checking delivery health means querying the table directly. Worth a simple
  admin-only list screen if webhook reliability becomes something that needs watching regularly.

## Confirmed against Propstack directly, not assumed

- **No incremental/changed-since fetch is possible.** Checked Propstack's own API reference
  (`docs.propstack.de/reference/objekte`) for every documented `GET /v1/units` query parameter: no
  `updated_since`, `changed_since`, `modified_after`, or equivalent exists, and there is no separate
  changes/audit-log endpoint. The full fetch on every poll isn't a missed optimization — it's the
  only reconciliation mechanism Propstack's API allows.
- **Signature format**: `X-Propstack-Signature` is a plain lowercase hex HMAC-SHA256 digest with no
  prefix, computed over the raw UTF-8 body (`docs.propstack.de/reference/webhooks` shows the
  verification code verbatim) — exactly what `hmacSha256Hex`/`timingSafeEqual` already do.
- **`GET /units/:id`** is documented as `GET /v1/units/:id?new=1`, returning the unit object
  directly, not wrapped in `data` — confirmed again live, a real webhook-triggered fetch of a real
  unit succeeded end to end. `unwrapUnit()` stays in `propstack-client.ts` as a cheap guard for
  whatever `new=1` actually changes, which is still undocumented, but it's provably not required for
  the current response shape.
- **Real delivery payload shape**: confirmed live — a real `property_updated` call from Propstack is
  `{"id": <number>}`. The other candidate field names in `unitIdFromPayload()` stay as a guard for a
  `property_created` event or a future shape change, neither of which has been observed yet.
- **End-to-end, with real traffic, not a simulated signature**: edited a live property's title in
  Propstack's UI on 2026-11-10; the Hub's `crm_synced_at` advanced within 9 seconds with no manual
  trigger, twice in a row (the edit, then reverting it). `crm_webhook_events` recorded both as
  `done`.
