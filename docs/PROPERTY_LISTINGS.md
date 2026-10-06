# Properties from the CRM (Propstack sync)

An estate agency keeps its properties in a CRM. This feature copies them into the Hub on demand, so
bills, deals and brokers can point at the same property the agency already maintains. It reads only:
nothing is written back to the CRM.

Status: **built, tested against a real Propstack account (758 properties), switched off by default.**

There is **one table**: `properties`. The CRM's fields live on it, not on a side table.

## What was asked

1. A "Sync now" button that fetches the properties from Propstack.
2. The main Propstack fields shown in the Hub.
3. One properties page, not two: for a client on a CRM, every property comes from it, so the list
   is the CRM's and there is no manual "Neu".
4. One properties table, and nothing the CRM returns left out.

## What is implemented

| Part | Where |
|---|---|
| Catalogue key `properties.crm_sync`, a **section** of `page.properties`, `default_enabled = false` | `supabase/catalogue.sql` |
| `properties.source` + `properties.external_id`, unique together | `supabase/schema/0003_master_data.sql` |
| `properties.crm_data` (jsonb): the CRM's **complete record, exactly as it sent it**, 296 fields per property today, including fields nobody mapped, images, documents, links, the broker, custom fields and owner and partner ids | `supabase/schema/0003_master_data.sql` |
| Typed copies of what the Hub filters and sorts on, on the same row: `crm_status`, `crm_status_id`, `marketing_type`, `property_type`, `usage_type`, `asking_price`, `sold_price`, `sold_on`, `living_space`, `plot_area`, `room_count`, `commission_note`, `broker_external_id`, `broker_name`, `broker_email`, `parties`, `archived_in_crm`, `crm_updated_at`, `crm_synced_at`. The `crm_` names keep them apart from the Hub's own status and archive | same |
| Propstack mapping, pure and tested, including that the whole record is kept | `src/lib/crm/propstack.ts`, `src/lib/crm/propstack.test.ts` |
| Paging fetch, `GET /v1/units?expand=1&archived=-1&per=100&sort_by=id&order=asc` | `src/lib/crm/propstack.server.ts` |
| Server function `syncPropertyListings`: auth, `person_may` on `properties.crm_sync` and on `master_data.write`, key from `credentials`, one upsert into `properties` on (`source`, `external_id`) | `src/lib/api/property-listings.functions.ts` |
| Hooks `usePropertyListings`, `useSyncPropertyListings`, `usePropertyCrmData` (one property's raw record, loaded only when its page opens) | `src/data/properties/listings.ts` |
| Shared property reads (`useProperties`, `useProperty`, create) name their columns and leave `crm_data` out, because it is about 37 KB per property | `src/data/properties/properties.ts` |
| `/properties` with the key on renders `CrmPropertyList` instead of the shared list: Sync button, last sync time, search, status filter, and columns status, type, price (sold price when set), commission, broker, changed in the CRM. No create button. With the key off the page is the shared list, unchanged | `src/routes/properties/index.tsx`, `src/components/properties/crm-property-list.tsx`, `src/components/properties/sync-properties-button.tsx` |
| Card "Aus dem CRM" on the property detail page | `src/components/properties/property-listing-card.tsx`, wired in `src/routes/properties/$code.tsx` |
| Card "Alle Felder aus dem CRM": every field of the record, with the CRM's own German labels, a search box and a switch for empty fields. Lists and objects open as JSON | `src/components/properties/crm-all-fields.tsx`, `src/lib/crm/fields.ts`, tested in `fields.test.ts` |
| Texts | `propertyListings.*` in both locale files |

There is no separate page or menu entry. A synced property is an ordinary `properties` row (`code` = `CRM-<propstack id>`, `source` =
`propstack`), so it can be assigned to companies and matched to bills like any other. The sync overwrites `name` and `address` on every run: for a synced
property the CRM is the master.

### Setup for a client

1. Create a read-only V1 key in Propstack: Verwaltung → API-Schlüssel. Read on Objekte, Kontakte,
   Projekte, Custom Felder Gruppen, Deals, Verknüpfungen, Nutzer, Objekt-Stati, Pipelines.
2. Store it as a tenant credential: `credentials` row with `channel_key = ''`,
   `name = 'PROPSTACK_API_KEY'`. Never in `.env`; `tenantCredential()` reads only the table.
3. Switch on `properties.crm_sync` in `feature_settings`.
4. The Hub's server needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`.

## Learned from the real API

- **The default sort pages unreliably.** Without `sort_by=id`, pages overlap and some properties
  never arrive (731 of 756 on one run). The fetch sorts by id and drops duplicate ids.
- `expand=1` on the list returns the **same 296 fields** as the single-property endpoint, so 758
  properties take 8 requests and no per-property call is needed.
- Checked against a fresh Propstack response for all 758: 751 records are identical field for field.
  The other 7 differ only in `documents[].url`, a pre-signed S3 link whose signature and expiry
  Propstack regenerates on every request. Stored links therefore expire; each sync refreshes them.
- `/v1/users` and `/v1/deals` redirect to the web app rather than answering; `/v1/brokers` works.
- Owners and buyers are `relationships` on a property, `internal_name` `owner` or `partner`, each
  with a `client_id`. Whether `partner` always means buyer is not confirmed.
- `sold_price` and `sold_date` are standard Propstack fields, empty on every property so far.
- 330 of 756 properties had no status at all in Propstack (mostly the oldest). They show "—".

## Open

- No webhook yet: the sync is manual. A `property_updated` webhook (HMAC-signed,
  `X-Propstack-Signature`) is the next step, and the one that creates a deal on "Verkauft".
- A property removed from Propstack stays in the Hub; nothing marks it as gone.
- Contacts (owners, buyers) are a separate entity in the CRM and are stored as ids only. Fetching
  them belongs to the deal import.
- `crm_data` makes the table about 8 MB for 758 properties. A client with tens of thousands would want
  it moved out, which is a reason to keep every read of `properties` naming its columns.
- The broker is stored as text. Linking it to an `app_users` row is what will let brokers see only
  their own properties.
- The status filter offers whatever statuses the CRM returned; there is no saved default view.
- The CRM list shows all rows on one page (756 today), with no paging and no booked-documents column
  like the shared list has. "Bearbeiten" on the detail page still edits name and address, which the
  next sync overwrites.
