---
name: map
description: Architecture, navigation, and file map for this Hub codebase — including how every credential and external integration (Microsoft Graph, Propstack, BANKSapi, Pleo, book-keeping, Supabase itself) is stored and reached. Use FIRST for any task in this repo — to understand where code lives, how data flows browser→Supabase, which integration a feature actually depends on, and which doc answers a question. Load before editing so you don't re-read the whole tree.
---

# this Hub — codebase map

Internal accounting cockpit for a German property company. It reads and corrects invoices that
book-keeping (a separate Python pipeline, sibling repo, cron-driven, not in this repo) has already
written into Supabase, and it owns several features of its own on top: outgoing invoices, DATEV
handover, bank reconciliation, card-expense import, broker commissions, approval rules. This Hub is
one tenant of that pipeline, behaviour picked by one `tenant_settings`/`tenant_config` row. For the
Hub↔book-keeping boundary specifically (three databases, why the Hub can't read its own mailbox
password, the `pipeline_run_requests` "Run now" mechanism), see the **book-keeping-integration**
skill — this doc covers the rest: the Hub's own features and its *other* integrations.

## Stack

- **TanStack Start** (React 19 + TS) — file-based routing (`src/routes/*.tsx` → URLs).
- **TanStack React Query** — all data fetching/caching (`staleTime` 60s).
- **Supabase** (`@supabase/supabase-js`) — Postgres + auth + Edge Functions (Deno).
- **shadcn/ui** (`src/components/ui/*`) + Tailwind v4. npm. `npm run lint` / `build` / `dev`.

## Running it — two different things, don't conflate them

- **`VITE_SEED=1 npm run dev`** — no database, no Supabase project, nothing to start. `src/data/
  client.ts`'s one client (`sb`) swaps to `src/seed/client.ts`'s in-memory fixture object: fake
  `.from()`/`.rpc()`/`.auth`/`.storage`, any password signs in as any seed team member. Good for
  looking at screens; writes mostly no-op, queries ignore filters/order/paging. See `src/seed/
  README.md`.
- **A real Supabase project** (local or cloud) — needed for real queries, RLS, permissions, or
  anything that has to persist. See the **local-database** skill for the local stack, and
  `supabase/catalogue.sql` + `supabase/seed-local.sql` for data to look at once it's up.

## The 7 layers (walk down this to read any feature)

```
1 ROUTE   src/routes/<name>/index.tsx, $param.tsx       ← the page = the exported component
2 LAYOUT  src/routes/__root.tsx + src/components/layout/  (providers, AppShell, AuthGate)
3 UI KIT  src/components/ui/*                             ← generic shadcn widgets
4 FEATURE src/components/<domain>/*, src/features/<domain>/*  ← project pieces
5 DATA    src/lib/data/queries.ts, src/data/<domain>/*    ← EVERY DB call (React Query hooks)
6 SHAPE   src/lib/data/format.ts, types.ts                ← labels/formatting + domain types
7 CLIENT  src/integrations/supabase/                      → Supabase tables / Edge Functions
```

Writes go the same way, then `onSuccess` calls `queryClient.invalidateQueries(...)`.

## Routes — current, English-first; every German path is a redirect stub, not a second page

A template-wide pass anglicised every route. **Verified directly, not assumed**: `bankkonten`,
`kategorien`, `gesellschaften`, `eingangsrechnungen`, `ausgangsrechnungen`, `datev-uebergabe` and
every other German-named directory under `src/routes/` now contain only a `beforeLoad` redirect to
the English equivalent, with the same comment each time: *"Moved to /X when this template anglicised
its URLs... the old path stays as a redirect... so a client merging this keeps every bookmark
working."* Always read the English path's own directory for the real implementation; treat the
German one as a compatibility shim only.

| Domain | English route | What it is |
|---|---|---|
| Incoming invoices | `incoming-invoices`, `/$nr` | The main cockpit screen: list/Kanban, view/edit/workflow/assign/paid/notes |
| Outgoing invoices | `outgoing-invoices` | Real feature now (not a placeholder) — commission/sale invoices |
| DATEV handover | `datev-handover` | Sends incoming-invoice batches to the tax advisor's `@uploadmail.datev.de` address; see `docs/DATEV_HANDOVER.md` |
| Inbox / Postfach | `postfach`, `inbox` | Document-source setup (mailbox/scan-folder channels) and the triage inbox |
| Bank | `bank-accounts`, `bank-connections`, `bank-transactions`, `bank-settings` | BANKSapi-backed reconciliation — see "Bank connections" below |
| Commissions | `broker-bonuses`, `commission-deals` | Referrer/broker payout tracking |
| Master data | `companies`, `suppliers`, `customers`, `categories`, `properties` | The VAT rates / companies / categories book-keeping's rule packs read at runtime |
| Rules | `approval-rules`, `assignment-rules`, `exclusion-rules`, `confidence-thresholds` | Tenant-tunable routing knobs, mirrors of what book-keeping's packs consume |
| Tax | `vat-rules`, `vat-reserve`, `open-items` | VAT handling and open-item tracking |
| Other | `manual-bookings`, `document-intake-log`, `document-types`, `file-naming`, `export`, `team`, `notifications`, `activity-log`, `trash`, `onboarding` | One feature each, named for what they do |

## Credentials and external integrations — two different mechanisms, not one

Two genuinely different storage mechanisms exist side by side; don't assume uniformity across
integrations.

### Mechanism A — `public.credentials`, dual-encrypted, used by Graph / Propstack / OpenAI

Rows keyed by `channel_key` (a real channel's own key for channel-scoped secrets, `""` for
tenant-wide ones like `OPENAI_API_KEY`/`PROPSTACK_API_KEY`). Two encryption generations coexist in
the same table: older Fernet values decrypted with `SECRET_ENCRYPTION_KEY`, newer "sealed" values
(a `"v2."`-prefixed envelope) decrypted with the tenant's own `TENANT_SECRET_KEY` — read via
`src/lib/inbox/channel-credentials.server.ts` (main app, 60s per-process cache) and
`supabase/functions/_shared/sealed.ts` (Edge Functions).

- **Microsoft Graph** (`src/lib/graph/auth.server.ts`): app-only client-credentials grant, reading
  `GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`GRAPH_CLIENT_SECRET` via `channelCredential("mailbox", ...)`
  — deliberately NOT from `.env`, because env rotation used to go stale against what the panel
  showed. Used by `src/lib/graph/mail-folders.server.ts` (the folder picker) and
  `send-mail.server.ts` (DATEV handover send — see `docs/DATEV_HANDOVER.md` for the still-missing
  `Mail.Send` admin-consent step).
- **Propstack** (`supabase/functions/propstack-sync/index.ts` + `_shared/propstack-client.ts`):
  `PROPSTACK_API_KEY` + `PROPSTACK_WEBHOOK_SECRET`, tenant-wide (`channel_key = ""`). Triggered by
  a `scheduled_jobs` cron row or the "Jetzt abgleichen" button calling the same function. Pulls
  Propstack units into `properties`, links brokers, opens deals.

### Mechanism B — Edge Function environment secrets, used by BANKSapi / Pleo

Read with plain `Deno.env.get(...)`, set via `supabase secrets set`, never touching
`public.credentials` at all:

- **Bank connections** — confirmed in code as **BANKSapi** (`supabase/functions/bank-connect/index.ts`
  line 1: *"start a BANKSapi bank-access (REG/Protect) session"*). Reads
  `BANKSAPI_ONE_CONNECT_API_KEY`, `BANKSAPI_BASE_URL`, `BANKSAPI_MODE`, `BANKSAPI_CALLBACK_URL`,
  `BANKSAPI_CUSTOMER_IP` (`_shared/adapters/banksapi/client.ts`). Flow: `bank-connect` opens a
  pending `bank_connections` row and returns a webform URL for the user's own bank consent;
  `bank-callback` finalizes it; `bank-disconnect` revokes it; `bank-sync` is the transaction
  fetch/match step — the same one book-keeping's `bank_sync_stage.py` pings after a run, confirming
  the actual bank data lives here, not in book-keeping. Whether banking is even on for a tenant is a
  config flag, not a credential check: `tenant_settings.config.banking.provider`
  (`_shared/tenant-config.ts`).
- **Pleo** (`_shared/adapters/pleo/client.ts`): `PLEO_API_KEY`, `PLEO_COMPANY_ID`, `PLEO_BASE_URL`,
  same env-var pattern. Provider flag: `tenant_settings.config.cards.provider`, defaulting to
  `"pleo"`. Functions: `pleo-receipts`, `pleo-master-data`, `pleo-sync`, `pleo-employees`.

### Supabase's own auth — two keys, two trust levels

- **Browser**: `src/integrations/supabase/client.ts` — anon/publishable key + the signed-in user's
  JWT, gated entirely by Postgres RLS. `AuthGate` in `__root.tsx` is UI-only; the real boundary is
  RLS, not the React tree.
- **Server (this Hub's own host)**: `src/integrations/supabase/client.server.ts` — plain
  `process.env.SUPABASE_SERVICE_ROLE_KEY`, bypasses RLS. **This is a separate copy of the same
  secret value** book-keeping's own admin panel needs saved into `public.credentials` for *its*
  Edge Function calls — two different callers, two different homes, same value, each one
  chicken-and-egg-necessary for its own side. Don't assume saving it in one place satisfies the
  other.

## Related skills

- `book-keeping-integration` — the Hub↔pipeline boundary specifically (three databases, why the Hub
  can't decrypt its own stored mailbox password, `pipeline_run_requests`).
- `instructions` — standing team rules, load at the start of any task.
- `data-layer` — how to add/change a Supabase read or mutation.
- `ui` — routes, badges, formatting conventions, the English/German rule.
- `local-database` — the local Supabase stack, for when seed mode above isn't enough.
