# DATEV handover

Screen: `/datev-uebergabe` (`src/routes/datev-uebergabe/index.tsx`). Two tabs: **Übersicht** (what is
ready to send, and the send button) and **Konfiguration** (which upload address each company uses).

## What DATEV actually needs

DATEV issues a separate `@uploadmail.datev.de` address per document category. Documents mailed to an
address are filed under that category at the tax advisor's end, so the address IS the routing
decision: send an outgoing invoice to the incoming-invoice address and it lands in the wrong place
with nothing to tell you.

There are **three per company**:

| `direction` | UI label (DE)      | Holds                                                  |
| ----------- | ------------------ | ------------------------------------------------------ |
| `incoming`  | Eingangsrechnungen | Incoming invoices                                      |
| `outgoing`  | Ausgangsrechnungen | Outgoing invoices                                      |
| `other`     | Sonstiges          | Everything else: contracts, statements, correspondence |

Only `incoming` is ever **sent** today. `outgoing` and `other` are storable so the addresses live in
the system rather than in a password manager, which is the same reason `outgoing` existed before
anything sent it either (migration `0051`'s own scope notes say so).

`DatevSendableDirection` (`src/lib/data/types.ts`) is `Exclude<DatevDirection, "other">` and is what
`useTriggerDatevHandover` accepts, so the compiler refuses an attempt to send the `other` route.

## Storage, and why the address is never shown again

`public.datev_routes`, one row per `(company_id, direction)` (unique). The `address` column is
protected by **column-level privileges**, not just RLS: `authenticated` has SELECT on every column
_except_ `address`, and no direct INSERT/UPDATE at all. Every write goes through two SECURITY
DEFINER RPCs:

- `set_datev_route(company_id, direction, address, is_enabled, note, updated_by)` — upsert, always
  writes the address.
- `update_datev_route_status(id, is_enabled, note, updated_by)` — status/note only, never touches
  the address.

This is a **blind write**: an admin can set or replace an address but can never read one back,
including their own immediately after saving. Consequences that matter to anyone editing this
screen:

1. **The address inputs always start empty.** There is nothing to prefill them with. This is not a
   bug.
2. **Blank must mean "leave it alone", never "clear it".** With three fields behind one Save button,
   treating blank as empty-string would let editing one address silently wipe the other two.
   `useSaveDatevRoutes` enforces this: it calls `set_datev_route` only for a direction that was
   actually typed into, `update_datev_route_status` when only the switch or note changed on an
   existing row, and skips a direction with neither.

## Konfiguration tab shape

**One row per company**, not per address. Columns: Gesellschaft (code with the company name beneath
it), one status cell per direction, and a single Add/Edit button opening a dialog with all three
addresses. It used to be one row per company × direction, so setting a company up meant opening
three dialogs and nothing ever showed a company's configuration as one thing.

Status per direction has **three** outcomes, not two — not configured, configured, and configured
but switched off. Collapsing the last two would hide the one case where the screen says a route
exists and the handover skips it anyway.

## Files

| Path                                                                  | What                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/datev-uebergabe/index.tsx`                                | Both tabs, the combined `RouteDialog`                                                                                             |
| `src/lib/api/datev-handover.functions.ts`                             | Batching, attachment building, size caps, the send call                                                                           |
| `src/lib/datev/mime-message.server.ts`                                | `buildRawEmail` - RFC 2822 multipart builder, standard-base64 out                                                                 |
| `src/lib/graph/send-mail.server.ts`                                   | `sendGraphMimeMessage` - Graph `sendMail`, MIME body                                                                              |
| `src/lib/graph/auth.server.ts`                                        | App-only Graph token, shared with the Postfach folder picker                                                                      |
| `src/lib/data/queries.ts`                                             | `useDatevRoutes`, `useSetDatevRoute`, `useUpdateDatevRoute`, `useSaveDatevRoutes`, `useDatevReadiness`, `useTriggerDatevHandover` |
| `src/lib/data/types.ts`                                               | `DatevDirection`, `DatevSendableDirection`, `DATEV_DIRECTIONS`, `DatevRoute`, `DatevHandoverBatch`                                |
| `supabase/migrations/0051_hub_datev_handover.sql`                     | Tables, the blind-write RPCs, the send RPC                                                                                        |
| `supabase/migrations/20260815130000_datev_routes_other_direction.sql` | Widens `direction` to allow `other`                                                                                               |
| i18n                                                                  | `datevUebergabe.*` in `src/lib/i18n/locales/{de,en}.ts`                                                                           |

## Applying the `other` migration

```
supabase db push
```

Nothing changes in the app until it runs: the UI offers a third address, and `set_datev_route`
rejects `'other'` on a database still carrying the two-value CHECK. The migration is idempotent and
seeds nothing — the real addresses are confidential and are entered by a human through this screen.

## Open / deliberately not done

- **The send transport moved from Gmail to Microsoft Graph (2026-08-20).** It was previously
  `sendGmailRaw` against `gmail.googleapis.com`, authenticated by a Google service account with
  domain-wide delegation over the sender's domain. That could never have worked here: `this client.de`
  is a Microsoft 365 tenant (MX -> `this client-de.mail.protection.outlook.com`), not a Google
  Workspace one, so the token request would fail with `unauthorized_client` before any mail was
  attempted - which is why `GOOGLE_SA_KEY_JSON` and `GOOGLE_IMPERSONATE_USER` never had values.

  Now: `triggerDatevHandover` -> `sendGraphMimeMessage` (`src/lib/graph/send-mail.server.ts`) ->
  `POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail` with `Content-Type: text/plain`
  and the base64 MIME message as the body. `src/lib/google/` is deleted. App-only Graph auth was
  extracted from `mail-folders.server.ts` into `auth.server.ts` and is shared by both callers, so
  no new credentials are needed - `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET`
  already in `.env` cover it. `buildRawEmail` now emits standard base64 instead of base64url
  (Gmail's `raw` field needed base64url; Graph does not, and `-`/`_` would corrupt the message).

  **Two deployment steps are NOT done and the send will fail without them:**
  1. Grant **`Mail.Send` (application)** on the existing Graph app registration, with admin
     consent. The folder picker only needed `Mail.Read`-class permissions.
  2. Scope it with an **application access policy** limited to the `DATEV_SENDER_EMAIL` mailbox.
     An application permission otherwise grants send-as rights over every mailbox in the tenant.

- **Per-email size cap dropped from 20MB to 4MB.** Graph rejects a MIME `sendMail` request over
  4MB, well under DATEV's own 20MB limit, so `MAX_EMAIL_BYTES` is now budgeted against Graph's
  ceiling. Batches simply split into more emails, which the existing `chunkAttachments`
  bin-packing already handles - but a **single invoice file over ~2.9MB raw is now blocked**
  where it would previously have sent. Lifting this needs Graph's `createUploadSession` draft
  flow, which cannot send a pre-built MIME message, so it would mean rebuilding the message as
  Graph's JSON `message` object and re-deriving the DATEV-specific formatting in
  `mime-message.server.ts` against Graph's attachment schema. Not done; revisit if real invoices
  hit the cap.

- **Still unverified: whether anyone has ever sent successfully from this screen.** Given the
  Gmail transport above, almost certainly not. Nothing here has been exercised against a live
  Graph tenant - the MIME output was verified locally (standard-base64 charset, CRLF, RFC 2047
  subject, filename transliteration, header-injection sanitizing, 76-char wrapping), but the
  actual send path has not run.

- **Nothing sends `outgoing` or `other`.** The Übersicht tab and the `datev-handover` Edge Function
  still read `incoming` only. `datev_handover_batches.direction` was widened at the same time so the
  first send of another category cannot fail in the logging insert _after_ the mail has gone out.
- **No cron.** Sending is a manual trigger. There is no return channel from DATEV, so an unattended
  bad send would fail silently at the tax advisor's end.
- **The old `sameForBothDirections` shortcut is gone.** It copied one address into both the incoming
  and outgoing rows, on the assumption that a "combined" address is the same value twice. All three
  addresses genuinely differ per company, so that shortcut could only ever misroute documents.
