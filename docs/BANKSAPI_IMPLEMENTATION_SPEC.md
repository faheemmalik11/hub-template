# BANKSapi Integration — Implementation Spec (Phase 1)

_Status: DRAFT for review. No code, no deployment. Compiled 2026-07-03._

## Purpose & scope

Introduce **bank-transaction reconciliation** into the a sister Hub Hub: import bank accounts
and transactions via **BANKSapi**, match transactions to receipts (`belege`), surface
missing receipts and open items, and let a human confirm/reject matches.

BANKSapi is treated as the **transaction source for reconciliation across all connected
accounts** — it serves normal invoice matching, out-of-band payments (PayPal/card/private),
and missing-receipt detection alike. It is _not_ scoped to only the non-Qonto stream.

**Phase 1 is read-only** (relative to the bank): import accounts · import transactions ·
match transactions ↔ belege · show missing receipts · manual confirm/reject.
**No payment initiation.**

### Non-negotiable constraints

- **Mock-first.** Build entirely against `BANKSAPI_MODE=mock` (BANKSapi's Demo Provider is
  blocked, tenant `wtdigitaltest`). Live mode is a later flip, not a rewrite.
- **All BANKSapi calls run server-side in Supabase Edge Functions.** No BANKSapi secrets,
  tokens, or Basic-Auth in the frontend or the client bundle. The browser only calls our own
  Edge Functions (`supabase.functions.invoke`) and reads our own tables (RLS-guarded).
- **One database.** New tables are added to the existing Supabase project
  (`pbwfihepsrxgcytkvqgf`); nothing is moved. New objects are **additive and ours** — never
  alter pipeline-owned tables/columns (coordinate with the pipeline owner).
- **No receipt/transaction contents in logs** (IBANs, amounts, references, mandate refs).
  Logs carry counts + ids only (domain spec principle 9).

### Repo/facts this builds on

- All DB access is centralized in `src/lib/data/queries.ts` (React Query hooks); domain types
  in `src/lib/data/types.ts`; labels/formatting in `src/lib/data/format.ts`; badges in
  `src/components/belege/badges.tsx`; loading/error/empty in `components/belege/query-states.tsx`.
- Convention: **English code, German UI**; DB-derived names stay German. Writes currently go
  through the untyped `sb = supabase as any` cast — new hooks follow the same pattern.
- No `supabase/migrations/` or `supabase/functions/` yet — both introduced by this work.

---

## 1. Schema migration plan

New migration file `supabase/migrations/0001_bank_reconciliation.sql` (version-controlled here;
**applied later**, not from this task). All tables get RLS enabled. DDL sketch:

### 1.1 `bank_connections` — one BANKSapi bank access (`bankzugang`)

```
id                 uuid pk default gen_random_uuid()
banksapi_access_id text            -- BANKSapi bankzugaenge id (null until webform completes)
banksapi_user      text            -- BANKSapi customer/user (the tenant test user)
provider_id        text            -- BANKSapi provider uuid
provider_name      text
bank_name          text
status             text not null default 'pending'
                     check (status in ('pending','active','error','expired'))
is_sandbox         boolean not null default true   -- mock/sandbox rows are purgeable
last_sync_at       timestamptz
last_sync_status   text
metadata           jsonb           -- raw, non-sensitive connection info
created_at         timestamptz default now()
updated_at         timestamptz default now()
```

### 1.2 `bank_accounts` — an account/product under a connection (`bankprodukt`)

```
id                 uuid pk default gen_random_uuid()
connection_id      uuid not null references bank_connections(id) on delete cascade
banksapi_product_id text
account_name       text
iban               text
bic                text
inhaber            text            -- account holder
product_type       text           -- Girokonto/Kreditkarte/...
waehrung           text default 'EUR'
saldo              numeric
saldo_datum        date
is_own_account     boolean default true  -- our own accounts (…2908, …6990, PayPal x-2908)
is_sandbox         boolean not null default true
metadata           jsonb
created_at         timestamptz default now()
updated_at         timestamptz default now()
unique (connection_id, banksapi_product_id)
```

### 1.3 `bank_transactions` — statement lines (`kontoumsaetze`)

```
id                 uuid pk default gen_random_uuid()
account_id         uuid not null references bank_accounts(id) on delete cascade
connection_id      uuid not null references bank_connections(id)  -- denormalized for filtering
banksapi_hash      text not null   -- BANKSapi `hash`; dedup key
betrag             numeric not null   -- signed: negative = money out (we pay), positive = in
waehrung           text default 'EUR'
buchungsdatum      date
wertstellungsdatum date
verwendungszweck   text
buchungstext       text
gegenkonto_inhaber text
gegenkonto_iban    text
gegenkonto_bic     text
richtung           text generated always as
                     (case when betrag < 0 then 'ausgehend' else 'eingehend' end) stored
matching_status    text not null default 'offen'
                     check (matching_status in ('offen','zugeordnet','ignoriert'))
is_sandbox         boolean not null default true
rohdaten           jsonb           -- full raw transaction (searchable, lossless)
fts                tsvector generated always as (
                     to_tsvector('german',
                       coalesce(verwendungszweck,'') || ' ' ||
                       coalesce(buchungstext,'') || ' ' ||
                       coalesce(gegenkonto_inhaber,''))) stored
imported_at        timestamptz default now()
created_at         timestamptz default now()
unique (account_id, banksapi_hash)
```

### 1.4 `beleg_transaction_matches` — the main matching model (link table)

Many-to-many: one beleg ↔ several transactions (partial payments / installments); one
transaction ↔ several belege (bundled dunning `referenz_rechnungsnummern[]`).

```
id             uuid pk default gen_random_uuid()
beleg_id       uuid not null references belege(id)
transaction_id uuid not null references bank_transactions(id) on delete cascade
status         text not null default 'kandidat'
                 check (status in ('kandidat','auto','bestaetigt','abgelehnt'))
score          numeric         -- 0..1 confidence
match_reasons  jsonb           -- which rules fired: {amount, date, iban, reference, name}
matched_by     text            -- 'system' | user email
matched_at     timestamptz default now()
confirmed_by   text
confirmed_at   timestamptz
rejected_by    text
rejected_at    timestamptz
reject_grund   text
created_at     timestamptz default now()
updated_at     timestamptz default now()
unique (beleg_id, transaction_id)
```

### 1.5 `bank_sync_logs` — sync run events (no sensitive content)

```
id            bigint generated always as identity pk
run_id        uuid            -- one sync run
connection_id uuid references bank_connections(id)
event         text            -- sync_started|accounts_fetched|transactions_fetched|match_run|sync_finished|error
level         text default 'info' check (level in ('info','warn','error'))
message       text            -- human summary, NO IBANs/amounts/references
counts        jsonb           -- {accounts, transactions_new, transactions_total, matches_auto, matches_candidate}
created_at    timestamptz default now()
```

### 1.6 Summary fields on `belege` (fast UI display only — additive, ours)

```
alter table belege add column if not exists abgleich_status text default 'offen'
   check (abgleich_status in ('offen','teilweise','abgeglichen'));   -- reconciliation summary
alter table belege add column if not exists abgeglichener_betrag numeric;  -- sum of confirmed matches
alter table belege add column if not exists abgeglichen_am timestamptz;
alter table belege add column if not exists abgleich_anzahl int default 0;  -- # confirmed matches
```

These are a **denormalized cache** of `beleg_transaction_matches`, refreshed by the matcher.
The link table is the source of truth. If the pipeline later introduces `zahlungsstatus` /
`qonto_transaction_id` / `qonto_beleg_id` (domain spec §3.3–3.4), we map onto them then; we do
not claim those names now.

### 1.7 RLS policies

- Enable RLS on all four new tables + logs.
- `authenticated` may **SELECT** all bank\_\* / matches / logs.
- `bank_connections`, `bank_accounts`, `bank_transactions`, `bank_sync_logs`: **write only via
  service_role** (Edge Functions). No authenticated INSERT/UPDATE/DELETE.
- `beleg_transaction_matches`: `authenticated` may **INSERT/UPDATE** (manual match + confirm/
  reject); the matcher also writes via service_role. (Alternative: route manual actions through
  an Edge Function and keep this table service_role-only — decide in review.)

### 1.8 Indexes

`bank_transactions(matching_status)`, `(buchungsdatum)`, `(betrag)`, GIN on `fts` and `rohdaten`;
`beleg_transaction_matches(beleg_id)`, `(transaction_id)`, `(status)`; `belege(abgleich_status)`.

---

## 2. Edge Function API plan

Under `supabase/functions/`. Shared BANKSapi wrapper in `_shared/banksapi.ts` (§3). All functions
read `BANKSAPI_*` from `Deno.env` (Supabase secrets) and write with the **service_role** client
(auto-injected as `SUPABASE_SERVICE_ROLE_KEY` in Edge Functions).

| Function        | Trigger                     | Auth                            | Purpose                                                                                                                                                                               |
| --------------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank-connect`  | user (frontend invoke)      | `verify_jwt=true`               | Start a bank connection: `createBankAccessSession(callbackUrl, customerIp)` → return REG/Protect **webform URL**. Also expose `GET issues`.                                           |
| `bank-callback` | BANKSapi redirect (public)  | signed/nonce, no JWT            | REG/Protect callback endpoint. Record `baReentry` result on the connection; on success set `status='active'` and enqueue first sync.                                                  |
| `bank-sync`     | pg_cron **+** manual invoke | scheduled secret / `verify_jwt` | For each active connection: refresh accounts, fetch new transactions (delta by date/hash), upsert, run matcher, write `bank_sync_logs`. Body `{action}`: `sync` (default), `rematch`. |

Frontend contract: `supabase.functions.invoke('bank-connect', { body: {...} })` etc. The frontend
**never** sees BANKSapi tokens/URLs beyond the returned webform URL.

Gotchas to bake in (from the Postman session): `.trim()` all tokens (trailing space → nginx 500);
user token needs `POST` + `grant_type=password` body; `Customer-IP-Address` must be a public IPv4;
handle non-JSON error bodies defensively; `DELETE /customer/v2/regprotect/sessions` to clear stuck
sessions.

---

## 3. BANKSapi wrapper — mock/live mode

`supabase/functions/_shared/banksapi.ts` — single interface, two implementations selected by
`BANKSAPI_MODE` (`mock` default | `live`). Identical return shapes so sync/matching/UI are
mode-agnostic.

Methods (as agreed with the ChatGPT handoff):

```
getClientToken()                             -- POST /auth/oauth2/token, Basic, client_credentials
getUserToken()                               -- POST /auth/oauth2/token, Basic, password grant
getProviders()                               -- GET /providers/v2
getBankAccesses()                            -- GET /customer/v2/bankzugaenge
createBankAccessSession(callbackUrl, ip)     -- POST /customer/v2/bankzugaenge -> 451 + Location (webform)
deleteRegProtectSessions()                   -- DELETE /customer/v2/regprotect/sessions
getBankAccessIssues(accessId)                -- GET /customer/v2/bankzugaenge/{id}/issues
getBankProduct(accessId, productId)          -- GET /customer/v2/bankzugaenge/{id}/{prod}
getTransactions(accessId, productId, {from}) -- GET .../{prod}/kontoumsaetze
```

- **Token cache:** client & user tokens (~2h) cached in-memory per invocation / short-lived store;
  refresh on expiry.
- **live:** real `fetch` against `BANKSAPI_BASE_URL`, Basic Auth from secrets, robust error mapping.
- **mock:** returns fixtures from `_shared/mock/*.json` (§4). No network. Deterministic. Used by
  tests/CI and current development.

Env (Supabase secrets — **never in repo**): `BANKSAPI_MODE`, `BANKSAPI_BASE_URL`,
`BANKSAPI_BASIC_USERNAME` (`tenant/clientId`), `BANKSAPI_BASIC_PASSWORD`, `BANKSAPI_TEST_USER`,
`BANKSAPI_TEST_USER_PASSWORD`. Real values live only in Supabase secrets; locally in an untracked
`supabase/functions/.env` used with `supabase functions serve` (gitignored).

---

## 4. Mock transaction data shape

Fixtures mirror BANKSapi field names so the `live` mapper is trivial. Amounts signed
(negative = outgoing). Cover the test corpus so matching is demoable.

Account (`bankprodukt`):

```json
{
  "produktId": "acc-2908",
  "kontoName": "Qonto Hauptkonto",
  "iban": "DE00000000000000002908",
  "bic": "QNTODEB2XXX",
  "inhaber": "Living Immo GmbH",
  "produktTyp": "Girokonto",
  "waehrung": "EUR",
  "saldo": 12500.0,
  "saldoDatum": "2026-06-30"
}
```

Transaction (`kontoumsatz`):

```json
{
  "hash": "d41d8cd98f00b204e9800998ecf8427e",
  "betrag": -75.55,
  "waehrung": "EUR",
  "buchungsdatum": "2026-06-18",
  "wertstellungsdatum": "2026-06-18",
  "verwendungszweck": "ImmoScout24 Rechnung 143R2606692875 Mandatsref M-993",
  "buchungstext": "SEPA-LASTSCHRIFT",
  "gegenkontoInhaber": "Immobilien Scout GmbH",
  "gegenkontoIban": "DE12500105170648489890",
  "gegenkontoBic": "INGDDEFFXXX"
}
```

Include at least: an ImmoScout direct debit (matches a beleg by ref + amount + IBAN); Passauer
75551254 (direct debit); koesslarn 011221; a PayPal debit; a BMW THG **credit** (positive amount →
`gutschrift`, incoming); and one **orphan debit** (no beleg → "missing receipt"). Mock connection
uses `is_sandbox=true` so it can be purged before go-live.

---

## 5. Transaction ↔ beleg matching rules

Deterministic, explainable scoring (mirrors the domain spec's "deterministic core outranks the
LLM"). Runs in `bank-sync` after import; also on-demand (`rematch`) and after a manual edit.

**Candidate generation.** For each `bank_transaction` with `matching_status='offen'`, find belege
where direction is consistent (outgoing beleg ↔ debit `betrag<0`; `gutschrift`/incoming ↔ credit)
and `buchungsdatum` falls in a window around the beleg (`beleg_datum .. faelligkeit + N days`,
default N=10; direct debits cluster near the due date).

**Signals & weights** (normalized to 0..1):

| Signal         | Rule                                                                                                   | Weight |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| Amount         | `abs(txn.betrag)` == `betrag_brutto` (or `faelliger_betrag`, or a `teilzahlung`), tolerance ±0.01 / FX | 0.45   |
| Reference      | `rechnungsnummer` / mandate ref / `kundennummer` found in normalized `verwendungszweck`                | 0.25   |
| IBAN           | `txn.gegenkonto_iban` == supplier IBAN (`lieferant.iban`) or creditor IBAN on beleg                    | 0.20   |
| Counterparty   | `gegenkonto_inhaber` fuzzy-matches `rechnungssteller` / `lieferant.name`                               | 0.10   |
| Date proximity | closer to due date scores higher (tie-breaker)                                                         | small  |

**Thresholds.** `score ≥ 0.90` → create match `status='auto'` (still human-revocable);
`0.60 ≤ score < 0.90` → `status='kandidat'` (review queue); `< 0.60` → no match.
Never auto-match on date+name alone without amount. Confidence traffic light (spec §10): green ≥95,
yellow 80–95, red <80 — align the review UI dot to `score*100`.

**Many-to-many.** Bundled dunning → one txn satisfies several belege; installments/`teilzahlungen`
→ several txns sum to one beleg (`abgleich_status='teilweise'` until sum == brutto).

**Guards (from domain spec).** Matching **confirms collection**; it never triggers a payment. A
direct-debit beleg becomes `abgeglichen` only when a real debit transaction confirms it — this is
the reconciliation half of double-payment guard #1.

**Derived outputs.**

- `belege.abgleich_status` / `abgeglichener_betrag` / `abgleich_anzahl` refreshed from confirmed matches.
- **Missing receipts** = debit transactions with no confirmed match after the window → flagged in UI.
- **Open items / overdue** = belege with no confirming transaction past `faelligkeit`.

---

## 6. UI routes / components

German UI, English code. Reuse `queries.ts` hooks, `format.ts`, badges, `query-states`, table/ dialog primitives.

**New routes** (`src/routes/`):

- `banktransaktionen/index.tsx` — transaction list; filters (account, `matching_status`, direction,
  date range), full-text search on `fts`; `MatchStatusBadge`, `ZahlungBadge`, `formatEUR`.
- `banktransaktionen/$id.tsx` — transaction detail + candidate belege with **Zuordnen / Ablehnen**
  (confirm/reject); manual "match to beleg" search.
- `offene-posten/index.tsx` — open items & **missing receipts**: unpaid belege past due + orphan
  debits; two tabs.
- `bankverbindungen/index.tsx` — connections list; **Bank verbinden** (invokes `bank-connect`, opens
  webform), **Jetzt synchronisieren** (invokes `bank-sync`), last-sync status, link to sync logs.

**Existing route touched:**

- `eingangsrechnungen/$nr.tsx` — add a **"Zahlung & Abgleich"** section: matched transaction(s),
  `abgleich_status` badge, jump to the transaction.

**Nav:** add "Banktransaktionen" (and/or "Offene Posten") to `nav[]` in
`src/components/layout/app-shell.tsx`.

**New components:** `components/bank/` — `MatchStatusBadge`, `MatchCandidateList`,
`ConfirmRejectControls`, `SyncStatusPill`. New badge lives beside existing ones for consistency.

**New hooks (`queries.ts`):** `useBankConnections`, `useBankAccounts`, `useBankTransactions(filter)`,
`useBankTransaction(id)`, `useBelegMatches(belegId)`, `useConfirmMatch`, `useRejectMatch`,
`useCreateManualMatch`, `useBankSyncLogs`, and invoke-wrappers `useStartBankConnect`,
`useTriggerSync` (via `supabase.functions.invoke`). Mutations `invalidateQueries` the affected keys
and write a `beleg_verlauf` entry (typ `zuordnung`) on confirm/reject for audit.

---

## 7. Logs / events

- **`bank_sync_logs`** written by Edge Functions per run: `sync_started → accounts_fetched →
transactions_fetched → match_run → sync_finished` (or `error`), each with `counts`. **No IBANs,
  amounts, references, or names in `message`** — counts + ids only.
- **Per-beleg audit** reuses existing `beleg_verlauf` (typ `zuordnung`): "Transaktion zugeordnet /
  abgelehnt", actor = user email — consistent with current edit/delete history.
- **UI:** a sync-log view (reuse the `protokoll` page pattern) on `bankverbindungen`, plus the
  existing `/protokoll` stays the pipeline's `verarbeitungs_log`.

---

## 8. Live-mode switch plan

The wrapper interface is identical in both modes, so **only the wrapper internals change** — sync,
matching, and UI are untouched by the flip.

Steps to go live (later, gated on prerequisites):

1. BANKSapi Demo Provider fixed (support ticket) **or** a real bank connected in prod.
2. Obtain Supabase project admin access; set real `BANKSAPI_*` in **Supabase secrets**; deploy the
   Edge Functions; add the pg_cron schedule.
3. Set `BANKSAPI_MODE=live`.
4. Run `bank-connect` to create a real `bank_connection` (webform); confirm callback.
5. First live `bank-sync`; validate accounts/transactions import.
6. Validate matching against real data; tune thresholds/window.
7. **Purge sandbox data:** delete rows where `is_sandbox=true` (dedicated mock connection makes this clean).

Keep `mock` mode permanently available for tests/CI. A kill switch (`BANKSAPI_MODE=mock`) instantly
reverts to fixtures without a deploy of app code.

---

## Prerequisites & open decisions (confirm before build → live)

1. **Target repo** — this `a sister Hub` repo vs. `living-immo-hub` (Fabian).
2. **Supabase admin access** — service_role + rights to run migrations and deploy Edge Functions on
   `pbwfihepsrxgcytkvqgf`, or coordinate with the pipeline owner.
3. **Manual-match write path** — direct RLS-guarded writes to `beleg_transaction_matches` vs. via an
   Edge Function (§1.7).
4. **Summary-field naming** — our `abgleich_*` columns vs. adopting the spec's future `zahlungsstatus`
   / `qonto_*` names (§1.6) — needs pipeline-owner coordination.
5. **Security housekeeping** — `.env` exists in git history; `receipt-classification-*.pdf` is
   untracked-but-unignored. Decide on history scrub / gitignore.
