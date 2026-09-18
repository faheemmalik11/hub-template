# Immonetz — Project Roadmap (client vision, from Miro)

> **Source:** Client (Fabian Tscheu), 2026-07, written on miro.com — the full 7-step
> vision for the platform. This is the **product north star**. Each step below records
> the client's intent, **who owns it** (pipeline = client's external Python / Hub = this
> front-end repo / external = Bank API, DATEV, etc.), **what exists today**, and **my
> (Hub) tasks**.
>
> Companion docs: `PIPELINE-OVERVIEW.md` (client's ingestion side),
> `EINGANGSRECHNUNGEN_FEATURE.md` (the invoices screen), `HUB-ACTION-ITEMS.md` (my to-dos).
>
> **Current priority (confirmed by client):** get the **basics** working first —
> essentially Step 1. Natural-language chat/voice search is explicitly deferred ("cherry
> on top, later").

---

## The 7 steps

### Step 1 — Ingest, categorize (paid/unpaid), display, store cleanly

**Client intent:** Receive emails from the inbox, read them cleanly, categorize as **paid /
unpaid**, and present everything neatly in the UI — the invoice document itself and all its
extracted data — stored cleanly in Supabase.

|               |                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline owns | Reading Gmail, OCR + AI extraction, writing `belege` / `beleg_dateien`                                                                                                                                                                               |
| Hub owns      | Displaying invoices + data + original file, showing **paid/unpaid** clearly, edit/correct                                                                                                                                                            |
| Today         | List + detail + file preview exist; `bezahlt_am` column + a "paid" toggle exist on detail. **But the list/KPIs categorize by extraction status (`erkannt`/`zu_pruefen`), not by paid/unpaid.**                                                       |
| **My tasks**  | Add a clear **paid/unpaid** dimension to the list + KPIs (driven by `bezahlt_am`); make sure all extracted fields are shown (incl. the 6 columns currently missing from the type — see schema-alignment note); confirm the document preview is solid |

### Step 2 — Bank transactions + matching

**Client intent:** Pull the bank account's transactions, capture **all** of them, and **match
transactions against receipts**. Show which receipt was used for which transaction, which are
paid vs. unpaid, and from the **delta** find where receipts are still missing.

|                   |                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| External owns     | The **Bank API** (client is setting this up now)                                                                                                                                                             |
| Pipeline/Hub owns | Importing transactions into Supabase (TBD who), the **matching logic**, and the UI                                                                                                                           |
| Today             | **Nothing.** No transactions table in the schema, no UI.                                                                                                                                                     |
| **My tasks**      | New **Transactions** screen; a **matching view** (transaction ↔ receipt); a **"missing receipts"** view derived from unmatched transactions. Needs a new `transaktionen` table + a decision on who writes it |

#### Step 2 — provider access (received 2026-07, from client)

- **Provider:** **BANKSapi** (German open-banking / PSD2 account-information API). Docs:
  https://docs.banksapi.de/ · Quickstart: https://docs.banksapi.de/guide/quickstart.html ·
  No-code explorer (ATLAS): https://banksapi.io/atlas/ · Demo providers:
  https://docs.banksapi.de/guide/demo-provider.html
- **Access:** trial/test tenant `wtdigitaltest`, **valid until 2026-08-03**. HTTP **Basic Auth**
  (username `wtdigitaltest/wtdigitaltestClient` + password) — typically exchanged for a bearer
  token. **Demo bank providers** let us test the full flow without a real bank account.
  - ⚠️ **Secrets are NOT stored in this repo** (kept in a secret store / gitignored `.env`).
    The credential is a live secret; do not commit it.
- **Architecture rule (firm):** BANKSapi credentials and calls **must run server-side** — never
  in the browser/front-end. So the front end will read a `transaktionen` table from Supabase; it
  will **not** call BANKSapi directly.
- **Open decision (client):** who ingests transactions into Supabase — the **existing Python
  pipeline** (natural fit: already server-side, holds secrets, writes to the DB) or a **new
  backend service**? This mirrors the `ask.py` endpoint question.
- **Status:** access provisioned early by the client. **Not started** — Step 1 remains the
  priority. Next when we pick this up: read the docs, confirm the transaction/`Umsätze` endpoints,
  and propose the `transaktionen` schema + the receipt-matching key (amount + date + reference).

#### Step 2 — API flow (from BANKSapi docs, read 2026-07)

1. **Auth:** Basic Auth exchanged for a 2-hour Bearer token at `POST /auth/oauth2/token`
   (`grant_type=client_credentials` for management; `grant_type=password` for the data user).
   Host: `banksapi.io`.
2. **Connect a bank:** `POST /customer/v2/bankzugaenge` with a provider ID → user completes
   login/consent. Demo provider ID `00000000-0000-0000-0000-000000000000`, login `demo`/`demo`.
3. **List accesses:** `GET /customer/v2/bankzugaenge`. Force refresh: `?refresh=true`.
4. **Transactions:** `GET /customer/v2/bankzugaenge/{bankAccessId}/{accountId}/kontoumsaetze`
   → array with `betrag`, `verwendungszweck`, `buchungsdatum`, `wertstellungsdatum`, counterparty,
   etc. `?tag=true` adds categorization.
   - All of this runs **server-side** (token + credentials never reach the browser).

#### Step 2 — proposed data model (draft, to confirm with client)

Two tables — a transactions table + an **N:M link** table (one transfer can settle several
invoices; consolidated/partial payments need many-to-many, not a single FK):

```sql
-- Bank transactions (Kontoumsätze) imported from BANKSapi
create table public.transaktionen (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaktion_id text unique,        -- BANKSapi Umsatz-ID → idempotent import
  bankzugang_id       text,
  konto_id            text,
  konto_iban          text,               -- our account
  gesellschaft_code   text,               -- which company this account belongs to
  betrag              numeric not null,    -- signed: negative = outgoing/Belastung
  waehrung            text default 'EUR',
  buchungsdatum       date,
  wertstellungsdatum  date,
  verwendungszweck    text,
  buchungstext        text,
  gegenseite_name     text,
  gegenseite_iban     text,
  gegenseite_bic      text,
  kategorie           text,                -- from ?tag=true or manual (Step 4)
  status              text not null default 'offen', -- offen | zugeordnet | ignoriert
  raw                 jsonb,               -- full payload → "no data loss"
  imported_at         timestamptz default now(),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Link: which receipt(s) a transaction settles (many-to-many, partial-aware)
create table public.beleg_transaktion (
  id                uuid primary key default gen_random_uuid(),
  beleg_id          uuid not null references public.belege(id),
  transaktion_id    uuid not null references public.transaktionen(id),
  betrag_zugeordnet numeric,               -- allocated amount (supports partial/split)
  konfidenz         numeric,               -- match score 0..1
  quelle            text default 'auto',   -- auto | manuell
  bestaetigt_am     timestamptz,           -- set when a human confirms
  bestaetigt_von    text,
  created_at        timestamptz default now(),
  unique (beleg_id, transaktion_id)
);
```

#### Step 2 — matching approach (draft)

For each outgoing transaction, score candidate invoices on four signals:

- **Amount** — `abs(transaktion.betrag) == beleg.betrag_brutto` (exact = strong; sum of several =
  consolidated payment).
- **Reference** — `beleg.rechnungsnummer` appears in `verwendungszweck` (strong).
- **Counterparty** — `transaktion.gegenseite_iban == lieferant.iban` (strong).
- **Date** — `buchungsdatum` on/after `beleg_datum`, within ~60 days; closer scores higher.

→ **Auto-confirm** when unambiguous (exact amount **+** reference or IBAN match) → write
`beleg_transaktion` with `quelle='auto'`. Everything else becomes a **suggestion** a human
confirms in the UI. **Missing receipts** = outgoing transactions still `offen` (no confirmed link).

#### Step 2 — how "paid" is derived (proposal, needs client sign-off)

- On confirming a `beleg_transaktion`, set `belege.bezahlt_am` = the transaction's `buchungsdatum`.
- This keeps **`bezahlt_am` as the single source of truth** the list indicator already uses — no
  competing signal. `workflow_status = 'ueberwiesen'` stays a **separate manual/approval** concept.
- **Open question for client:** confirm this model (matching drives `bezahlt_am`) before wiring up
  the matching. See the paid-status question raised with the client.

### Step 3 — Special cases, assignment & approval flow

**Client intent:** Handle incoming invoices/special cases and **assign** them correctly — to the
**company** (Gesellschaft) that owns/receives the invoice, and to the right **object/project**.
Decide **who reviews/approves**. Build the **Approval Flow**: who approves what, who can **skip
steps** and mark something **paid directly**.

|              |                                                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub owns     | Assignment UI + the approval workflow + roles/permissions                                                                                                                                                                                                                         |
| Today        | `gesellschaft_code`, `objekt_code`, `workflow_status` (6-state CHECK), `zugewiesen_an`, and a fixed `ZUWEISBAR` list (Anja/Philipp) exist. Kanban approval columns are **dead placeholders**; **no assignment UI for `lieferant_id`**; no roles/permissions; no "skip step" logic |
| **My tasks** | Company/object assignment UI; wire the Kanban to `workflow_status` (real approval lanes); an approval flow with **roles** (who approves, who can skip → mark paid); supplier linking                                                                                              |

### Step 4 — Tags/filters, cost categories & accounting overview

**Client intent:** Assign **tags/filters** to invoices and transactions, book them under
**projects, companies, cost categories**. Build an **accounting overview**: how much spent on
advertising, building materials, etc. Goal — know **expenses vs. revenues vs. what's left**.

|              |                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub owns     | Tagging/cost-category assignment + the reporting/analytics screen                                                                                                                                 |
| Today        | `kostenkategorie` exists (free text). Nav has an **"Auswertungen"** (evaluations) page — needs review of how built. Revenues require outgoing invoices (**"Ausgangsrechnungen"** nav item exists) |
| **My tasks** | Structured **cost categories** (likely a lookup table, not free text); tag/filter model; an **accounting dashboard** (spend by category/company/project, expenses vs. revenue vs. remaining)      |

### Step 5 — DATEV / accounting-tool export

**Client intent:** Integrate the final output with the accounting tool and connect to **DATEV**
to cleanly transmit everything to the tax advisor.

|               |                                                                       |
| ------------- | --------------------------------------------------------------------- |
| External owns | DATEV format/interface                                                |
| Hub owns      | Export UI + marking items "transmitted"                               |
| Today         | `workflow_status` has a `uebergeben_datev` state; **no export built** |
| **My tasks**  | DATEV export (format TBD), and status update when transmitted         |

### Step 6 — Tooling specifics & status-change recognition

**Client intent:** Set tools up correctly, **name documents properly**, **move emails out of the
inbox once read**. Recognize **status changes** — e.g. an invoice that's already been transferred
must be linked cleanly, its status updated after transfer, keeping a clear overview at all times.

|               |                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline owns | Moving/labeling emails (needs Gmail write scope); applying the uniform filename to what actually lands in Supabase Storage                                                                                                                                                                                                                              |
| Hub owns      | Admin-configurable naming convention + reflecting status changes clearly; linking already-transferred invoices                                                                                                                                                                                                                                          |
| Today         | Document naming: **implemented** (`filename_settings` + `/dateibenennung` admin screen + `src/lib/filename.ts`, migration 20260804090000_filename_settings; document naming in `book-keeping`). See `docs/FILENAME_CONVENTION.md`. Mailbox cleanup (moving/labeling emails) is still an open pipeline item. Status display exists but is dual/confusing |
| **My tasks**  | A single, clear **"where is this invoice"** status model in the UI; reflect transfer/paid state cleanly                                                                                                                                                                                                                                                 |

### Step 7 — The end state (in a nutshell)

**Client's summary of "done":**

- Overview of **all invoices** — received **and** sent.
- Overview of **all transactions**.
- Invoices **and** transactions **linked** to each other.
- Both **assigned** to companies, projects, etc.
- **Cost groups** created → clear overview.
- Clear view of **which invoices are still missing** and need uploading.
- Platform has **transferred** the necessary items → **sent to the tax advisor**.

---

## Where the current app stands vs. the vision

The nav already scaffolds most of the vision: `Übersicht`, `Eingangsrechnungen`,
`Ausgangsrechnungen`, `Lieferanten`, `Objekte`, `Auswertungen`, `Protokoll`. What's **built vs.
missing**:

| Capability                                          | State                                                       |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Incoming invoices: list, detail, edit, file preview | ✅ built (read/edit)                                        |
| Paid/unpaid categorization in the UI                | 🟡 partial (`bezahlt_am` exists; not surfaced in list/KPIs) |
| Suppliers / Objects / Companies                     | 🟡 suppliers + objects screens exist; assignment gaps       |
| Outgoing invoices (Ausgangsrechnungen)              | ❓ nav exists — needs review                                |
| Bank transactions + matching                        | 🔴 not started (no table, no UI) — Step 2                   |
| Approval flow + roles/permissions                   | 🔴 not started (columns exist, no logic) — Step 3           |
| Cost categories (structured) + tags                 | 🔴 free-text only — Step 4                                  |
| Accounting overview / reporting                     | ❓ Auswertungen page — needs review                         |
| DATEV export                                        | 🔴 not started — Step 5                                     |
| Document naming (uniform filename convention)       | ✅ built — Step 6 (see `docs/FILENAME_CONVENTION.md`)       |
| Mailbox cleanup (move/label emails)                 | 🔴 pipeline side, not started — Step 6                      |

---

## What this means for me right now

1. **Focus = Step 1** (client-confirmed). Make incoming invoices display cleanly and show
   **paid/unpaid** clearly, with all extracted data visible.
2. **Steps 2 & 5** depend on **external** pieces (Bank API, DATEV) the client is arranging — I
   can design the UI/data model ahead, but can't finish them yet.
3. **Steps 3 & 4** are big **Hub-owned** builds (approval flow, roles, cost categories, reporting)
   — these are the bulk of my future work after Step 1.
4. **Chat/voice search = deferred.** Do not build now.

### Immediate, unblocked work (serves Step 1 correctness)

- Schema alignment: add the 6 missing `belege` columns to the type, version-control the schema,
  fix the `abgeschlossen` workflow-status mismatch. _(See `HUB-ACTION-ITEMS.md`.)_
- Surface **paid/unpaid** in the invoices list/KPIs (using `bezahlt_am`).
- Fix the hardcoded 2026 Zeitraum filter.

---

## Open questions to confirm with the client (before Steps 2–4)

1. **Transactions (Step 2):** Who writes bank transactions into Supabase — the Python pipeline
   (via the Bank API) or the Hub? What's the table shape? What's the match key (amount + date +
   reference)?
2. **Roles/approval (Step 3):** Who are the actual roles (Assistenz, Vorgesetzter, …)? Who can
   skip steps and mark paid directly? Is there real user/auth-based permissioning, or a simple
   assignee model?
3. **Cost categories (Step 4):** Fixed list or free-form? Per company or global? This drives the
   reporting model.
4. **Objects/projects:** Is there a canonical list of objects/projects, or is `objekt_code`
   free text?
5. **DATEV (Step 5):** Which export format/interface, and what does the tax advisor expect?

---

_Compiled 2026-07-02 from the client's 7-step Miro roadmap. This is the product-level
reference; per-feature detail lives in the companion docs._
