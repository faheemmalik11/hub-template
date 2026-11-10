# Setting up the bookkeeping pipeline for an estate agency

What a tenant of the pipeline's `estate_agency_crm` kind needs after it is created in the admin
panel. The kind presets only what makes it different (`database: documents`,
`rules.assign_properties: false`, `rules.property_link: direct`, English words for the traffic
light (`storage.traffic_light_words`: green, yellow, red) and for the workflow
(`rules.workflow_states`: arrival `received`, paid `paid`), and its own Hub schema of 76 tables). The
words matter: this schema refuses the German ones, and every other client keeps writing them. Everything below is a setting the kind deliberately does not choose for the client.

The pipeline lives in `book-keeping` (branch `feat/document-procurement`). Tenant settings are
edited in its admin panel, never in this repository.

## 0. The first people

The catalogue seeds four roles: `super_admin` (shown as "Entwickler"), `admin`, `supervisor` and
`assistant`. `super_admin` is the break-glass account and is protected in the database: it cannot be
assigned by an insert or an update, deactivated, renamed or deleted. So the first user is created as
`admin` (an Auth account plus an `app_users` row), and promoted to `super_admin` once by the database
owner, with the guard paused for that one statement:

```sql
begin;
alter table public.app_users disable trigger app_users_protected_role_stays_active;
update public.app_users set role_id = (select id from public.roles where name = 'super_admin')
 where lower(email) = '<the email>';
alter table public.app_users enable trigger app_users_protected_role_stays_active;
commit;
```

## 1. Before anything runs

| Needed | From | Notes |
|---|---|---|
| Tenant created with the "Estate agency or broker, properties kept in a CRM" kind | Admin panel | Builds the 76-table schema from `schema/hub-kinds/estate_agency_crm`. No categories are seeded |
| Tenant database link | Client's Supabase project | Session pooler, port 5432 |
| A company row | Hub | One legal entity is enough. Add its name and aliases so a bill addressed to it is assigned |
| A catch-all category, added in the Hub | Hub | Then set `rules.category_fallback_code` to its code. Other categories are added in the Hub as the client needs them |

## 2. Reading the mailbox (IMAP)

Add a mailbox source with provider **Email (IMAP)** and store `IMAP_HOST`, `IMAP_USERNAME`,
`IMAP_PASSWORD` and, only when it is not 993, `IMAP_PORT`. Port 993 is TLS from the start; any other
port is upgraded with STARTTLS before the login is sent.

- Pick the folder(s) to read in the source's folder list. The default is `INBOX`. The list shows
  the server's own names, so a server that prefixes folders (`INBOX.Belege`, with a dot as the
  separator) is read as listed; a chosen folder can bring the ones inside it.
- A refused password, an unknown host, a refused port and a certificate that does not match the
  host name each fail at once in the panel's connection test with their own message, and none is
  retried. Only a dropped connection is retried.
- `run.since_date` bounds the first read, so years of old mail are not processed.
- Tick "move processed mail" only after one read-only run has been checked. The move copies the
  message and removes the original.
- Nothing about this has been run against a real mail server yet. See the pipeline's
  `tests/unit/test_imap_mailbox.py` for what is covered against a fake one.

## 3. Settings to switch on

| Setting | Value | Why |
|---|---|---|
| `storage.naming` | `date_type_issuer` | Files are named `2026_09_11_Rechnung_Lieferant_Strasse_18`. Needs a date and an issuer, otherwise no name is made and the old one stays |
| `storage.filing_targets` | `channel_root_by_year_and_month` | Files into `2026/09_2026` under the chosen folder. The OneDrive (`graph`) destination only |
| `storage.refile_checks_every_copy` | `true` | A copy filed under the old name is found and moved |
| `stages` | `file`, `track`, `rename`, `publish`, `refile` | `publish` and `refile` write to the client's drive, so they stay off until the folder is confirmed |
| `rules.read_receipt_extras` | `true` | Reads a handwritten tip, the occasion and the guests off a restaurant receipt into `documents.tip_amount`, `occasion`, `participants` |
| `rules.link_reminders` | `true` | A reminder letter that names a bill number gets a `reminder_of` link to that bill, in either arrival order. It is also held for review with the reason "a reminder letter, not a bill" |
| `rules.match_master_names` | `true` | Assigns the company from the recipient name when there is no assignment rule |
| `rules.category_from_issuer` | `false` | Decided: no category is guessed from the supplier's name |

Left alone on purpose: `rules.assign_properties` stays `false`. The property list belongs to the CRM
and must not be attached to a bill.

## 4. What the Hub does with the result

- A bank line is matched against `amount_gross + tip_amount`, in the scorer
  (`src/lib/matching/score.ts`), its Deno twin used by `bank-sync`
  (`supabase/functions/_shared/matching.ts`), the allocation trigger and `v_open_items`
  (`amount_paid_out()` in `0011_functions.sql`). A receipt of 100 with a 15 tip is closed by a payment of 115,
  and a payment of 116 against it is refused.
- A document with a `reminder_of` link is not an open item (`open_blocker = 'reminder_letter'`)
  and is left out of `ready_for_payment` and `pay_now` (`is_a_reminder()`), so it is paid with the
  bill it chases, never on its own.
- A document page shows a notice above the review box when it is linked to another: a reminder
  names the bill to pay instead, and the bill names the reminder that arrived.
- A broker is a Hub user with the Broker role: they see only their own properties and enter their
  own commissions, which an administrator approves (`COMMISSION_INVOICES.md`). Create the role once
  with `supabase/presets/broker-role.sql`, or on an existing database with
  `supabase/presets/broker-for-an-existing-client.sql`.
- A broker is a Hub user with the `properties.crm_sync` permission. The Team screen shows a
  "CRM broker ID" field for such a person; it is also filled when the email matches the CRM broker.

## 5. Still open

- A SEPA payment file record, and the handover to the accounting tool: see
  `BOOKKEEPING_SCHEMA_ADDITIONS.md`, "Not decided".
- A real run against the client's mailbox and drive. Nothing above has been exercised on live data.

## Propstack sync (daily reconciliation + webhook)

See `docs/PROPSTACK_SYNC.md` for the full picture. In short: `propstack-sync` is now a daily
reconciliation pass (the "Jetzt abgleichen" button still runs it on demand, through the Hub server
function `syncPropertyListings`), and `propstack-webhook` reacts to Propstack's
`property_created`/`property_updated` events in near-real-time. Both write through the same
`syncUnits()` in `supabase/functions/_shared/propstack-client.ts`.

1. Deploy both: `supabase functions deploy propstack-sync --project-ref <ref>` and
   `supabase functions deploy propstack-webhook --project-ref <ref>`.
2. Give them the client's key: `supabase secrets set TENANT_SECRET_KEY=<key> --project-ref <ref>`.
3. Create the reconciliation timer in the Supabase dashboard (Integrations, Cron): schedule
   `0 3 * * *` (daily), type Supabase Edge Function, POST, function `propstack-sync`,
   timeout 5000 ms (the function answers at once and syncs in the background).
4. Run `supabase/presets/propstack-daily-sync.sql`. It adds the `propstack_sync` row with `enabled`
   false, so the function has a place to write its result and the table does not start a second timer.
5. Generate a `PROPSTACK_WEBHOOK_SECRET`, store it as a sealed `credentials` row the same way
   `PROPSTACK_API_KEY` is stored, then register the deployed `propstack-webhook` URL in Propstack
   (Verwaltung → API-Schlüssel → Webhooks) against "Property created" and "Property updated", with
   that same secret.

The function shares `propstack.ts` and `sealed.ts` with the app as copies in `_shared/`. After
changing either source, run `node scripts/build/copy-edge-shared.mjs`; `--check` fails when they differ.
Run once by hand against production: 760 properties fetched.

## No property on a document

The pipeline never attaches a property for this kind of client (`rules.assign_properties` is false for
`estate_agency_crm`), and the Hub hides the property controls on the document screen: the catalogue
section `documents.property_assignment` (on everywhere else) is switched off by
`supabase/presets/estate-agency-no-property-assignment.sql`. Hidden are the property field in the
"needs your decision" card and in the Zuordnung editor, with the company suggestion derived from it.
The invoice list columns and filters are not changed.
