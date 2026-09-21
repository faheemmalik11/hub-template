# Feature: Eingangsrechnungen (Incoming Invoices) — `/eingangsrechnungen`

Complete reference for the incoming-invoices list screen: what it shows, where the
data comes from, whether it is real, every query it runs, and what actually works vs.
what is a placeholder.

> **TL;DR** — The screen is a **real, read-only cockpit** over a **live Supabase
> (Postgres) database**. The invoices themselves are produced by an **external Python
> pipeline (Gmail import → OCR → AI extraction)** that lives _outside this repo_. The
> **List view fully works**. The **Kanban view is only partially wired** (2 of 5
> columns are real; 3 are "Stufe 2" placeholders). All editing happens on the detail
> page, not here.

---

## 1. Where the code lives

| Concern                                       | File                                       |
| --------------------------------------------- | ------------------------------------------ |
| The screen itself                             | `src/routes/eingangsrechnungen/index.tsx`  |
| Data hooks (React Query → Supabase)           | `src/lib/data/queries.ts`                  |
| Domain types                                  | `src/lib/data/types.ts`                    |
| Formatting / label maps / traffic-light logic | `src/lib/data/format.ts`                   |
| Badges (Status, Kanal, USt, Gesellschaft)     | `src/components/belege/badges.tsx`         |
| Loading / error / empty states                | `src/components/belege/query-states.tsx`   |
| Supabase client (URL + public key)            | `src/integrations/supabase/client.ts`      |
| Detail page (edit)                            | `src/routes/eingangsrechnungen/$nr.tsx`    |
| Upload page                                   | `src/routes/eingangsrechnungen/upload.tsx` |

Route registration: TanStack Router file-based route
`createFileRoute("/eingangsrechnungen/")`, title _"Eingangsrechnungen — a sister Hub"_.

---

## 2. Is the data real? Yes — and here's the proof

**Real.** The app talks directly to a live Supabase project (no mock, no fixtures, no
hardcoded invoice array):

- Client: `src/integrations/supabase/client.ts`
  - URL: `https://pbwfihepsrxgcytkvqgf.supabase.co`
  - Uses the **publishable (anon) key** only — the `service_role` key is never in the browser.
- Live REST probe (read-only) against the `belege` table:
  - `GET /rest/v1/belege?select=id` → **`HTTP 200`** (table exists, key valid)
  - `Content-Range: */0` for an anonymous caller → **0 rows visible without login**.

That `*/0` is not "no data" — it's **Row-Level Security (RLS)** doing its job. The app
runs behind a Supabase login (AuthGate); once you are `authenticated`, RLS grants
`SELECT` and the real rows appear. Logged out / anon = you see nothing.

### Where do the invoices actually come from?

They are **not created by this front end** (except manual uploads). An **external
Python pipeline that is not part of this repository** does the heavy lifting:

```
Gmail inbox ──► [External Python pipeline] ──► Supabase Postgres ──► this UI (read)
                (OCR + AI extraction,          (belege, beleg_dateien,
                 validation, dedup)             verarbeitungs_log, …)
```

- The pipeline imports emails, runs OCR + AI extraction, validates, and **writes rows**
  into the `belege` table (plus `beleg_dateien`, `verarbeitungs_log`, `imported_messages`).
- This screen (and the whole app) is a **"read-and-correct" layer** on top of that data.
- `eingangskanal` records how each invoice entered: `email`, `upload`, `scan`,
  `erechnung`, `drive`.
- The **one thing the UI can create** is a manual upload (see §7), which inserts a stub
  `belege` row with `eingangskanal='upload'`, `status='zu_pruefen'`, `extracted IS NULL`.
  The external pipeline is then expected to pick it up and fill in the extracted fields.

> Code comments reference `pipeline/db_schema.sql` and `pipeline/prompts/eingangsrechnung.txt`,
> but **those files are not in this repo** — the schema, the `fts` full-text column, and
> the `status` / `workflow_status` CHECK constraints live only in the Supabase project /
> the external pipeline repo. The schema is **not version-controlled here** (known gap).

---

## 3. Data layer — every query this screen runs

All data comes through **React Query** hooks in `src/lib/data/queries.ts`. This screen
uses **three read queries** (Stufe 1 = read-only). `staleTime` is `60_000` (60s) for all.

| Hook                  | Table            | Query details                                                                                                                                                              | Used for                                      |
| --------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `useBelege(suchTerm)` | `belege`         | `select("*")` where `geloescht_am IS NULL`, ordered `created_at desc`. If a search term is present → adds `.textSearch("fts", q, { type: "websearch", config: "german" })` | The invoice rows, KPIs, Objekt filter options |
| `useLieferanten()`    | `lieferanten`    | `select("*")` where `geloescht_am IS NULL`, ordered by `name`                                                                                                              | Resolves supplier name for each invoice       |
| `useGesellschaften()` | `gesellschaften` | `select("*")`, ordered by `code`                                                                                                                                           | Company filter dropdown options               |

### How the queries actually work

1. **Full-text search is the only server-side filter.**
   - The search box is **debounced 300 ms** (`suche` → `suchTerm`), so typing doesn't
     hammer the server.
   - When a term exists, the query hits the Postgres **`fts` generated column** via
     `textSearch(..., { type: "websearch", config: "german" })` — German-language,
     web-style search over supplier / number / content.
   - The query key is `["belege", q]`, so each distinct search term is cached separately.

2. **Every other filter is client-side** (see §6). Once the rows are loaded, filtering
   by company/object/status/time-range and all sorting happen in-memory in a `useMemo`
   — instant, no refetch.

3. **Soft-delete aware.** Both `belege` and `lieferanten` queries exclude rows with
   `geloescht_am` set, so deleted invoices/suppliers never appear.

4. **Supplier name resolution** (`stellerName`): builds a `Map(id → Lieferant)` and shows
   `lieferant.name` if `lieferant_id` is set; otherwise falls back to the free-text
   `beleg.rechnungssteller`; otherwise `"—"`.

> Write mutations (`useUpdateBeleg`, `useSoftDeleteBeleg`, `useAddNotiz`,
> `useCreateUploadBelege`, …) also live in `queries.ts` but are **not used on this list
> screen** — they belong to the detail (`$nr`) and upload pages.

---

## 4. Screen anatomy (top → bottom)

1. **Header** — eyebrow "Belege · Buchhaltung", title "Eingangsrechnungen", subtitle, and
   a **"Beleg hochladen"** button → `/eingangsrechnungen/upload`.
2. **4 KPI tiles** — Belege gesamt, Erkannt, Zu prüfen, Volumen (Brutto). The first three
   are **clickable filters** (toggle `statusFilter`); the fourth is display-only.
3. **Control bar** — full-text search, Gesellschaft select, Objekt select, Status select,
   Zeitraum select (+ custom date range), and a **Liste / Kanban** view toggle.
   The Zeitraum select lists, in this order: "Gesamter Zeitraum", "Individueller Zeitraum",
   "Letzte 30 Tage", then one entry per month and per year found in the data. "Letzte 30 Tage"
   is the value `letzte-30-tage` (`LETZTE_30_TAGE` in `src/lib/data/format.ts`), resolved by
   `zeitraumToRange` to today and the 29 days before it on `document_date`. The Overview page
   shows its invoice volume for exactly that range and links into this filter, so the two
   screens show the same figure.
4. **Active-filter chips** — one removable chip per active filter + "Alle zurücksetzen".
5. **Result count** line ("N Belege", plus "· aktualisiere …" while refetching).
6. **List view** (default) — sortable table — **or** **Kanban view**.

---

## 5. Static vs. Dynamic — the full map

### 🟢 Dynamic (from the live database)

| Element                                                                                                                                                                             | Source                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Invoice rows (table & kanban cards)                                                                                                                                                 | `belege` via `useBelege`                                                   |
| KPI counts + Brutto volume                                                                                                                                                          | Computed from loaded `belege` (`kpi` memo)                                 |
| Gesellschaft dropdown options                                                                                                                                                       | `gesellschaften` via `useGesellschaften`                                   |
| Objekt dropdown options                                                                                                                                                             | Distinct `objekt_code` values **derived from loaded belege** (not a table) |
| Rechnungssteller name per row                                                                                                                                                       | `lieferanten` join (`lieferant_id`) → fallback `rechnungssteller`          |
| Row fields: `rechnungsnummer`, `kostenkategorie`, `gesellschaft_code`, `objekt_code`, `betrag_brutto`, `ust_satz`, `beleg_datum`, `created_at` (Eingang), `eingangskanal`, `status` | `belege` columns                                                           |
| Search results                                                                                                                                                                      | Server-side `fts` full-text search                                         |
| Loading / error / "aktualisiere…" / empty states                                                                                                                                    | React Query state                                                          |

### 🔴 Static (hardcoded in the component)

| Element                                                              | Location                                   |
| -------------------------------------------------------------------- | ------------------------------------------ |
| All header/label/subtitle copy                                       | `index.tsx` lines ~197–205                 |
| "Beleg hochladen" button + target route                              | lines ~207–211                             |
| **Status options = only `Erkannt` + `Zu prüfen`**                    | `STATUS_OPTIONS`, lines 55–58              |
| **Zeitraum options = June/May/April 2026 + Jahr 2026 + Individuell** | lines ~307–312 ⚠️ hardcoded to 2026        |
| Time-range logic (`jahr-2026` = starts with "2026")                  | `inZeitraum`, lines 60–72 ⚠️ year baked in |
| Table column headers + which are sortable                            | lines ~410–418                             |
| Liste / Kanban toggle (UI-only, not persisted)                       | lines ~336–357                             |
| **Kanban columns** (5 defined; 3 are placeholders)                   | `KANBAN_PHASEN`, lines 559–571             |
| Badge label + color maps (Status, Kanal, USt, Ampel, Workflow)       | `format.ts` / `badges.tsx`                 |
| Empty-state text "Keine Belege für die aktuelle Auswahl."            | line 466                                   |

---

## 6. List view — working? ✅ Yes (read-only)

Fully functional. The `gefiltert` memo applies, in order:

- **Filters** (all client-side over already-loaded rows):
  - `statusFilter` (from KPI tiles), `fGesellschaft`, `fObjekt`, `fStatus`, and
    `inZeitraum` (time range).
- **Sorting** (client-side, `toggleSort`): Rechnungssteller, Gesellschaft, Objekt, Betrag,
  Rechnungsdatum, Eingang, Status. (USt and Kanal columns are **not** sortable.)
  Clicking a header toggles asc/desc.
- **Row click** → navigates to the detail page `/eingangsrechnungen/$nr` (param = `beleg.id`).
- Columns: Rechnungssteller (+ Nr. / Kostenkategorie subline), Gesellschaft chip, Objekt,
  Betrag (Brutto, right-aligned), USt badge, Rechnungsdatum, Eingang, Kanal badge, Status badge.
- Empty selection shows the "Keine Belege …" row.

**Editing is not done here** — the list is view/navigate only. All changes (status,
fields, notes, delete) happen on the detail page.

---

## 7. Kanban view — working? ⚠️ Partially (2 of 5 columns real)

Defined by the static `KANBAN_PHASEN` array:

| Column                       | Backed by           | Status?                              |
| ---------------------------- | ------------------- | ------------------------------------ |
| **Zu prüfen** (`zu_pruefen`) | real `status` value | ✅ live cards                        |
| **Erkannt** (`erkannt`)      | real `status` value | ✅ live cards                        |
| Geprüft (Assistenz)          | —                   | 🚧 placeholder ("kommt mit Stufe 2") |
| Beim Vorgesetzten            | —                   | 🚧 placeholder ("kommt mit Stufe 2") |
| Übergeben (DATEV)            | —                   | 🚧 placeholder ("kommt mit Stufe 2") |

- The two real columns filter `belege` by `status` and render clickable cards (supplier,
  invoice no., Brutto, USt) linking to the detail page.
- The three "Stufe 2" columns are drawn with a **dashed border** and show the text
  _"kommt mit Stufe 2 (Workflow)"_ — they are **not wired to data** and hold no cards.
- **No drag-and-drop.** You cannot move a card between columns; there is no way to change
  status from the Kanban board. It is a **read-only visualization**, not an interactive board.

> Why: the future workflow columns map to the separate `workflow_status` column
> (`eingegangen → in_pruefung → freigegeben_assistenz → beim_vorgesetzten →
uebergeben_datev → ueberwiesen`), which is defined in the DB/types but **not yet driven
> by any UI**. The list/kanban here use the extraction `status` (`erkannt` / `zu_pruefen`)
> only.

---

## 8. Interactions summary

| Action                                           | Effect                                   | Server round-trip? |
| ------------------------------------------------ | ---------------------------------------- | ------------------ |
| Type in search                                   | Debounced 300 ms → new `fts` query       | ✅ yes             |
| Click KPI tile (Erkannt / Zu prüfen / gesamt)    | Sets/toggles `statusFilter`              | ❌ client-only     |
| Change Gesellschaft / Objekt / Status / Zeitraum | Client-side filter                       | ❌ client-only     |
| Custom date range (Individuell)                  | Client-side `von`/`bis` filter           | ❌ client-only     |
| Click a column header                            | Toggle sort key/direction                | ❌ client-only     |
| Remove a filter chip / "Alle zurücksetzen"       | Clears filter state                      | ❌ client-only     |
| Toggle Liste / Kanban                            | Swaps view (not persisted)               | ❌ client-only     |
| Click a row / kanban card                        | Navigate to `/eingangsrechnungen/$nr`    | (route change)     |
| "Beleg hochladen"                                | Navigate to `/eingangsrechnungen/upload` | (route change)     |

---

## 9. Known caveats / gaps

1. **Zeitraum months are hardcoded to 2026** (April/May/June + "Jahr 2026"). They will go
   stale — they are _not_ derived from the actual invoice dates.
2. **Only 2 of 5 statuses/workflow phases are functional.** The rest are explicit
   placeholders awaiting "Stufe 2".
3. **No supplier linking in the UI.** You can edit the free-text `rechnungssteller` (on the
   detail page) but cannot attach/detach a `lieferant_id`; that link is created only by the
   external pipeline.
4. **Schema not in this repo.** The DB schema, RLS policies, `fts` column, and CHECK
   constraints live only in the Supabase project / external pipeline. `pipeline/db_schema.sql`
   is referenced but absent.
5. **Extraction handoff is implicit.** Manual uploads create `extracted IS NULL` rows and
   assume "someone else runs the pipeline" to fill them in; the app neither triggers nor
   polls for extraction.
6. **RLS gate.** Everything depends on being logged in; anonymous access returns zero rows
   (confirmed: `Content-Range: */0`).

> **Note (this doc is otherwise an old audit snapshot — table names/URLs above predate the
> English rename and are stale; verify against `src/lib/data/queries.ts` before trusting them):**
> file storage/display was changed to Storage-only — see `docs/FILE_STORAGE.md` for the current,
> accurate description of how `DocumentPreview` reads/downloads an invoice's original file.

---

## 10. Data flow (one glance)

```
                 external (NOT in this repo)                    this repo (browser)
   ┌────────────────────────────────────────────┐   ┌───────────────────────────────────┐
   │ Gmail → Python pipeline: OCR + AI extract   │   │  React Query hooks (queries.ts)     │
   │  → writes belege / beleg_dateien /          │   │   useBelege(suchTerm)  ─┐           │
   │    verarbeitungs_log / imported_messages    │   │   useLieferanten()      ├─► memoize │
   └───────────────────────┬─────────────────────┘   │   useGesellschaften()  ─┘   +filter │
                           │                          │            │            +sort       │
                           ▼                          │            ▼                         │
                 Supabase Postgres  ◄─── RLS ────────►│   List table  /  Kanban board        │
                 (live project)      (auth required)  │   (read-only; row → /$nr detail)     │
                           ▲                          └───────────────────────────────────┘
                           │ manual upload only
                 useCreateUploadBelege (upload page) → inserts stub belege row (extracted NULL)
```

---

## 11. Detail page (`$nr.tsx`) — "E-Mail" section (Briefing Screen 2)

This doc's scope is the list screen (§10 above), but one detail-page addition is worth noting here
since it depends directly on the external pipeline described in §2.

The invoice detail page (`src/routes/eingangsrechnungen/$nr.tsx`, "Verlauf" tab) shows the source
email's envelope metadata for mail-imported invoices — subject, sender, send date, and (collapsible)
mail body text — per Briefing Screen 2 ("what is captured from the mail itself: subject, sender, mail
text, send date").

- **Gating**: only rendered when `beleg.intake_channel === "email"` **and** a matching
  `processing_log` row exists (`emailLog`, `$nr.tsx` ~line 542-548) — picked from the already-fetched
  `useVerarbeitungsLogFuerBeleg(beleg.id)` result by matching `gmail_message_id`, falling back to the
  most recent entry.
- **Data source**: `processing_log.subject` / `.sender` / `.sent_at` / `.body`
  (`VerarbeitungsLog` type, `src/lib/data/types.ts`). `subject`/`sender` have always been populated by
  the pipeline; `sent_at`/`body` are new columns added by the external pipeline repo
  (`book-keeping`, migration `0024_processing_log_email_metadata.sql` from the old numbering,
  `docs/TASK-10-email-metadata-persistence.md` there) — **older `processing_log` rows created before
  that migration have `sent_at`/`body` = NULL**, and the section degrades gracefully (shows "—" for the
  date, hides the mail-text `<details>` block).
- No new query was needed — `useVerarbeitungsLogFuerBeleg` already does `select("*")`.

---

_Generated 2026-07-02, §11 added 2026-08-04. Scope: the `/eingangsrechnungen` list screen (Stufe 1,
read-only), plus the detail-page addition noted in §11.
See `docs/CODEBASE_AUDIT.md` for the whole-app audit._

---

## Bank-reconciliation axis on the incoming-invoice list (2026-08-13)

A match suggestion used to be visible only on a **detail** screen — open the invoice, or open the
bank transaction. There was no way to answer "which invoices have a suggestion waiting for me?"
without clicking through them one at a time. The list now carries the axis in three places.

### Data

`v_invoices_list` (and `v_invoices_review`, which the KPI RPC reads) expose two booleans:

| Column                     | Definition                                                                  |
| -------------------------- | --------------------------------------------------------------------------- |
| `has_suggested_bank_match` | a row in `invoice_transaction_matches` with `status in ('kandidat','auto')` |
| `has_confirmed_bank_match` | a row with `status = 'bestaetigt'`                                          |

**`auto` counts as SUGGESTED, not confirmed.** The matcher writes it without asking, so a human
still has to look — and those are precisely the rows most worth reviewing. The detail screens use
the same reading (`hasOpenMatch` in `$nr.tsx`, `offen` in `components/bank/match-candidates.tsx`).

### Filter

`bankMatch` on the invoice list, four options, and the three real values form a **partition** —
every invoice falls in exactly one:

| Value        | Predicate                       | Label (DE / EN)                    |
| ------------ | ------------------------------- | ---------------------------------- |
| `offen`      | both flags false                | Nicht zugeordnet / Not matched     |
| `vorschlag`  | suggested **and not** confirmed | Vorschlag prüfen / Match suggested |
| `zugeordnet` | confirmed                       | Zugeordnet / Matched               |

Two traps this shape exists to avoid, both found in review:

- **`offen` needs BOTH flags false**, not just "no confirmed match". An invoice with an open
  suggestion also has no confirmed match, so the naive test filed exactly the rows awaiting a
  decision under "nothing to do".
- **`vorschlag` must exclude confirmed.** `invoice_transaction_matches` is m:n and confirming one
  candidate does **not** withdraw its siblings — they stay `kandidat`. Without the exclusion a
  reconciled invoice appeared under both `vorschlag` and `zugeordnet`, and the three counts did not
  sum to the total.

The German labels are deliberately _not_ "Zuordnung offen" for `vorschlag`: that collided head-on
with "Nicht zugeordnet" for the value actually named `offen`, so a reviewer wanting "nothing linked
yet" picked it and silently got the opposite subset.

### KPI tiles

The tiles come from `invoices_kpis`, which takes `p_bank_match` and applies the same partition, so
tile counts and list counts agree. Its bank-match clause is a **closed OR-list**: an unrecognised
value makes the whole predicate false and the tiles return `0 / 0 / 0 / 0` — not "unfiltered" but
actively wrong, in the direction that reads as real data. Any new filter value must be added to the
RPC in the same pass as the UI.

#### Every filter reaches the tiles (migration 20260815160000)

`invoices_kpis` now also takes `p_ampel`, `p_archiv` and `p_ids`, so the tiles count exactly the
rows the list shows. Before that migration it had no parameter for the traffic light, the archive
switch or an AI search's id set, and the tiles quietly counted a wider set while a line of small
print above them admitted it. `status` is still deliberately left out, because the Erkannt and
Zu prüfen tiles double as status toggles.

The migration splices the live definition (the body grew across several migrations and the database
holds the authoritative copy), asserts a single overload first, and drops the old signature by oid
afterwards, since adding defaulted parameters creates a second overload rather than replacing the
first.

`useBelegeKpis` sends the three new parameters separately from the rest. On a database that has not
run the migration, PostgREST answers PGRST202, the hook retries with the old signature and returns
`partial: true`, and the page shows the old caveat instead of an error. Once the migration is
applied, `partial` is false and no caveat appears.

#### The unassigned-company gap (migration 20260815180000)

Most rows arrive with no company, an invoice cannot move on without one, and nothing on the screen
counted them. Three parts now do:

- **A filter option.** "Ohne Gesellschaft" sits directly under "Alle Gesellschaften" in the company
  filter and sends the code `NZO`. The NZO companies row itself is dropped from the list below it,
  so the same thing is not offered twice under a code that reads like a company.
- **A counter.** An amber chip under the KPI tiles, "N Belege ohne Gesellschaft", which applies and
  clears that filter. It is counted by `useBelegeOhneGesellschaftCount`, a `head: true` count query
  carrying every other active filter, so it says how many of the current view still need one. The
  chip disappears at zero.
- **A flag on the row.** `GesellschaftChip` renders the missing value amber rather than grey, so it
  reads as a gap and not as one code among many.

#### Reading the row: four naming and clipping fixes

- **The status filter is named after its column.** It was "Status", which matched no column header
  on the screen, and read like the workflow or the payment state, which are two other columns. It is
  now "KI & Prüfung" / "AI & review", the same words as the column it narrows.
- **Workflow status is no longer cut off.** The cell truncated at 120px, so "Freigegeben
  (Vorgesetzter)" showed as "Freigegeben (Vorge…" with a hover tooltip as the only way to read it.
  The width cap and the truncation are gone: the workflow `TableCell`
  (`src/routes/eingangsrechnungen/index.tsx:1254`) sets no width, and `WorkflowBadge`
  (`src/components/belege/badges.tsx:171`) is `whitespace-nowrap`, so the label always shows in full
  on one line and the column takes the width it needs. The sideways scroll below is what absorbs
  that on a narrow screen.
- **The table scrolls sideways.** Its container was `overflow-hidden`, so on a laptop or tablet the
  last columns were clipped away with nothing saying so. Now `overflow-x-auto`.
- **The document-type tag only marks exceptions again.** `istEingangsrechnung` tested for the
  capitalized `"Eingangsrechnung"` while the pipeline writes lowercase German (`rechnung`,
  `mahnung`, `gutschrift`, …). Nothing matched, so every ordinary invoice counted as an exception
  and the badge printed the raw column value, which is how a lowercase German "rechnungen" tag ended
  up on every row of an English screen. `belegartKey` in format.ts normalizes the stored value
  (aliases plus lowercasing), `BELEGART_META` and the `belege.belegart.*` labels are keyed on it,
  and every call site goes through `istEingangsrechnung` rather than comparing strings inline. The
  document-type filter's option labels use the same normalization.
- **One spelling in the column, not only in the UI (migration 20260817120000).** `belegartKey`
  normalizes for DISPLAY, but every reader matches the raw value: `invoices_facets` returns
  `distinct document_type`, `applyBelegeFilter` does `document_type = <chosen value>`, and
  `invoices_kpis` does the same for `p_belegart`. With `"Eingangsrechnung"` and `"rechnung"` both in
  the column, the filter dropdown showed **two options both labelled "Rechnung"**, nothing on screen
  told them apart, and picking either silently dropped every invoice stored under the other. The
  migration folds the alias spellings onto their canonical key for every row except the split
  containers (`status = 'aufgeteilt'`, `document_type = 'Sammelscan'`, excluded from
  `v_invoices_list` anyway), and moves the column default from `'Eingangsrechnung'` to `'rechnung'`.
  Both writers changed in the same pass so the second spelling cannot come back:
  `useCreateUploadBelege` (`src/lib/data/queries.ts`) now inserts `'rechnung'`, and the pipeline's
  `dokumenttyp` fallback (`pipeline_new/adapters/repo/receipts.py`) writes it too. `belegartKey`
  stays as the display-side safety net.
- **"ohne" / "none" became "Ohne Gesellschaft" / "No company".** In a mono font next to codes like
  STAY it read as one more code rather than as the absence of one. Same wording as the filter option
  and the counter above the list.

#### Paging, sorting and the phone layout

- **A page past the end no longer errors.** PostgREST answers a range starting beyond the result
  set with PGRST103 ("Requested range not satisfiable") instead of an empty page, so a bookmarked
  or shared `?page=9` turned into a full error screen once the result set shrank, and Retry re-sent
  the same impossible request. `useBelegeListe` now catches that one error, counts what exists,
  serves the last real page, and reports it as `angepassteSeite`; the route corrects the URL with a
  replace so the dead page number leaves no history entry.
- **Review priority shows in the table.** The toolbar toggle sorts by `pruefung`, which no column
  header owned, so every header sat on the neutral icon while the rows were plainly reordered.
  `SortHeader` takes `alsoFor`, the KI-&-Prüfung column claims `pruefung`, and it renders the
  toolbar toggle's own icon next to the arrow so the two read as one control. Clicking it toggles
  **the key the header is currently showing** (`onSort(viaAlso ? alsoFor : col)`). Passing `col`
  regardless made the header lie: it showed a descending arrow and `aria-sort="descending"` for
  `pruefung`, and a click meant to flip that direction switched to sorting by `status` ascending,
  because `toggleSort` took its else branch.
- **The AI search placeholder fits on a phone.** The box reserves about 112px on the right for its
  three buttons, so the long example question wrapped and the second line showed as a sliver. Below
  `sm` it uses `nlSearch.placeholderKurz` instead, and the empty box keeps the placeholder on one
  line.
- **Kanban stacks on a phone.** As a horizontal board it showed one column at nearly full width,
  so reading all nine stages meant swiping across eight times. Below `sm` the stages are a stacked
  list of headers with their counts, one open at a time, starting on the first stage that has
  cards. From `sm` up it is the same board as before.
  Which stage is open is derived, not seeded once. `KanbanBoard` holds `wahl` as
  `string | null | undefined`: `undefined` is "not chosen yet", `null` is "the user closed it". A
  stage the user picked that no longer has any cards falls back to the first stage that does. Seeding
  `useState` with that first stage collapsed the two meanings into one, and the board stays mounted
  across filter changes (only `isFetching` flips), so narrowing the filter left the previously opened
  stage open and empty while every stage with cards stayed collapsed. On a phone that reads as "no
  results".

#### Reading the row, second pass

- **Negative filters.** The company filter got "Ohne Gesellschaft" earlier; the property filter now
  has "Ohne Objekt", sent as the sentinel `__ohne` (`OBJEKT_OHNE` in format.ts) because properties
  have no catch-all code the way companies have NZO. `applyBelegeFilter` maps it to
  `property_code is null`, and migration 20260815210000 teaches `invoices_kpis` the same, so the
  tiles do not report 0 while the list shows rows.
- **A "still payable" tile.** `invoices_kpis` returns `offen`, the gross sum of the rows in view
  with no `paid_at`. The volume tile stays as the total that passed through, with a tooltip saying
  it includes paid documents; the new tile is the number to act on.
  On a database that has not run migration 20260815210000 the tile is **left out entirely**, and
  `partial` cannot be what detects that: the migration changed the function's return TYPE, not its
  signature, so PostgREST resolves the call normally and the column is simply absent from the row.
  `readKpiRow` therefore returns `offen: null` when the key is missing (`BelegeKpis.offen` is
  `number | null`) and the route drops the tile and falls back to a four-column grid. Reading
  `row?.offen ?? 0` printed "Noch zu zahlen: 0,00 €" beside a six-figure volume, which is read as a
  figure and not as "unknown".
- **VAT: three cases, not two.** "0 %" was shown both for a document stating 0 % VAT and for one
  where no rate was recognized. It now reads "USt-frei" / "VAT exempt" for a stated zero and
  "USt unklar" / "VAT unclear" for a missing one, each with its own tooltip.
- **The service date is on the list.** `leistungszeitraum()` shows `service_date`, or the
  `service_period_from`–`to` range, under the invoice date, and only when it differs from it. For a
  lot of invoices that is the date that decides which period the cost belongs to.
- **AI recognition and Review are separate columns.** They answer different questions and disagree
  legitimately (a perfectly read invoice with no company assigned is 100 % and still needs review),
  which read as a contradiction while they shared one column. The confidence column carries a
  tooltip saying it is about reading the document, not about assignment. The filter is named
  "Prüfung" / "Review" to match the column it narrows.
- **Plain language in the descriptions.** The list and Overview subtitles named the ingestion
  pipeline and Supabase; they now describe what the screen is for.
- **The language toggle reaches dates and the workflow header.** `formatDate`/`formatDateTime` were
  pinned to `en-US` and `formatMonthYear` to `de-DE`, so the period filter listed German months next
  to English column dates whatever the toggle said. Both now read the active language from the i18n
  instance. The Workflow column read "Workflow" in both dictionaries, which looked untranslated; it
  is "Bearbeitungsstand" / "Processing status".

"Unassigned" has two representations: the pipeline leaves `company_code` NULL, and there is a real
companies row `NZO` ("Nicht zugeordnet") meaning the same thing. Migration 20260813190000 settled
that for the AI-search RPCs; `applyBelegeFilter` (`GESELLSCHAFT_OHNE` in format.ts) and migration
20260815180000 (`invoices_kpis`) now read it the same way, so the filter, the list, the tiles and
the counter agree.

#### The backend-missing banner

It used to read "please apply migration 0042 to the database", which tells someone doing accounting
nothing except that something is badly wrong. It now says the list cannot be loaded, that the cause
is the database rather than their documents, that nothing is lost, and to tell support. The
migration detail moved to a small second line addressed to whoever takes that call.

### Column

One combined column, **"Zahlung & Bank-Abgleich" / "Payment & bank reconciliation"**, rendering two
stacked lines: payment state on top, reconciliation state below.

`BankMatchBadge` renders **nothing** when there is no match unless `showWhenEmpty` is passed, and
only the table cell passes it — there the badge is the second line of a labelled column, where a
blank line reads as "unknown" rather than "nothing linked yet". Kanban and mobile cards have no
column header to give a blank that meaning, and with most invoices unmatched an always-on grey chip
is pure noise on the densest surfaces. A **confirmed** match outranks a suggested one in the badge,
for the same m:n reason as the filter.

## Two fixes on the detail screen (2026-08-25)

### The audit trail records who the approval was given AS

`invoice_history.actor` holds the logged-in account, which is the right thing to hold someone to.
But the approval chain is name-based: `useActingAs` matches the login's display name against
`approvers.name`, and any account can act as any approver through the "Handeln als" picker. So the
actor alone never said which step of the chain a row belonged to. An approval clicked by
`test@test.com` while acting as Petra Kistner was recorded as `test@test.com` and nothing else.

`runApprovalAction` in `src/routes/eingangsrechnungen/$nr.tsx` now writes `handelnd_als` and
`handelnd_als_rolle` into the history row's `data` jsonb alongside the existing `returned_to`, and
the Freigabe-Verlauf list renders it: `test@test.com · handelnd als Petra Kistner · 25. August 2026`.
Additive only, so existing rows (and the `returned_to` reader) are unaffected.

The picker's own label was also wrong: it said "Angemeldet als {{name}}" ("signed in as") for
someone you are not signed in as. Now "Handelnd als {{name}}" / "Acting as {{name}}".

### A mixed-VAT invoice no longer claims a single rate

`invoices.vat_rate` is one column, but a German invoice routinely carries several rates. A hotel
bill is 7 % on the room and 19 % on breakfast and parking. `UstBadge` showed `vat_rate` alone, so a
169,18 € Motel One bill read "USt 19 %" while its actual VAT was 11,23 €, which is 7,1 % blended.
The per-rate split was extracted correctly all along and sits in `invoices.tax`
(`[{satz, netto, ust}, …]`); nothing displayed it.

`UstBadge` now takes an optional `steuer` prop (the `tax` array, available on `Beleg` and therefore
on every list row too). When more than one rate carries a non-zero net, it renders "USt gemischt"
with the rates in the tooltip instead of picking one. Single-rate and unknown-rate behaviour is
unchanged. On this client this affects 66 of 435 active invoices.

## The Fällig filter and the Apply button (2026-08-28)

Item 4 of `OPEN-TASKS.txt` asks for a "pay today" list Saskia can work through. Rather than a new
screen, this list learned to be one: the filter that was missing was the due date.

### The filter

- **Values**: `DUE_FILTER_VALUES` in `src/lib/data/format.ts` — the six exclusive `DUE_BUCKETS`
  (`overdue`, `today`, `within_3_days`, `within_week`, `later`, `unknown`) plus `due_now`, which
  spans overdue _and_ today. `due_now` is the one the task is actually about; the exclusive bands
  exist so a link from the overview's urgency tiles means the same thing on both screens.
- **Resolution**: `dueFilterRange(value, today)` turns a band into `{von, bis, unbekannt}`.
  Deliberately resolved in TypeScript, not SQL: the list query (PostgREST) and the `invoices_kpis`
  RPC behind the tiles both consume the same two dates, so the tiles and the rows cannot disagree —
  and `today` stays `heuteLokal()`, the user's local day, not the database server's.
- **Applied in**: `applyBelegeFilter` (`queries.ts`) via the new `faelligVon` / `faelligBis` /
  `faelligUnbekannt` fields on `BelegeListeParams`.
- **URL param**: `?faellig=<band>`, validated by `toDueFilter` in `belege-list-search.ts`, so it is
  bookmarkable and survives the trip to the detail page and back like every other filter.
- **Migration**: `20260828120000_invoices_kpis_faellig.sql` adds `p_faellig_von` / `p_faellig_bis` /
  `p_faellig_unbekannt` to `invoices_kpis`, spliced onto the live definition and the old overload
  dropped — the same shape as `20260815160000`. Applied to `xsgbdtdwhrrhoeximeon` on 28.08.2026.
  Also adds a partial index on `invoices(due_date)`.

### The due date is now on the row

The list showed no due date at all, so filtering by it gave no way to see what was filtered. It
renders as a second line under the invoice date (list and card view), red once overdue, and only for
unpaid invoices — no new column, so nothing else lost width.

### Filters now commit on Apply

Every dropdown in the Filters popover wrote straight to the URL, so choosing three filters fired
three queries and the list moved under the cursor while the popover was still open. The popover now
edits a draft (`filterEntwurf`) and commits it with **Anwenden / Apply**; closing it discards.
Removing a chip below the toolbar still applies immediately — that is a one-click undo, not
composition.

### What this does NOT solve

The list is only as good as its inputs, and both are thin. Measured 28.08.2026: 24 of 525 invoices
carry a due date, and 482 sit at `workflow_status = 'eingegangen'` with nobody having approved them.
`?faellig=due_now` returns 23 receipts, 15.305,56 € — of which 21 are overdue, and most cannot be
paid because they were never approved. See `docs/OFFENE_POSTEN.md` for the extraction side.

Also open, and a real risk: `JetztBezahlenSection`'s disabled-reason list checks IBAN, approval,
already-paid, open attempt and bank account — but **not** direct debit. `istLastschrift()` already
drives a "wird automatisch eingezogen" banner on the same screen, so the invoice warns you not to
transfer while the Pay-now button beside it stays enabled. 109 of the active invoices are
Lastschrift or SEPA-Lastschrift.

## List read performance (2026-09-10)

The list was taking around 20 s to paint on a 500-invoice tenant. Three separate causes, all fixed
in `src/lib/data/queries.ts` plus two migrations that still have to be applied.

**1. The read asked for every column.** `select("*")` on `v_invoices_review` returns 89 columns,
including `ocr_fulltext` and the whole `extracted` JSON, for a table that renders 12. A page of 50
rows was 1.33 MB on the wire. `BELEGE_LISTE_SPALTEN` (just above `SORT_COLUMN`) now names the 29
columns the row actually needs and the page is 417 KB. Anything added to the table has to be added
to that list, or it arrives `undefined`.

**2. The list read the expensive view.** Migration `20260909150000_recheck_review_columns.sql` hung
`invoice_review_state()` off `v_invoices_review` with `CROSS JOIN LATERAL`. A lateral sits in the
FROM clause, so Postgres runs it once per row whatever the caller selected: even `select=id&limit=50`
cost 1.0 s against 0.25 s for the same thing from `v_invoices_list`. For the 29 columns above it was
3.7 s against 0.83 s.

`listenQuelle()` in `queries.ts` picks the view per read. The app reads exactly one review-only
column, `search_text`, and only when there is a text filter, so a read without `q` goes to
`v_invoices_list` and the expensive view is paid for only by the search that needs it. The list,
the count, the paging fallback, the "ohne Gesellschaft" count and both Kanban reads all go through
it. `v_invoices_review` is still the AI-search table (`src/lib/api/invoice-intent-config.ts` needs
`review_problem_count` / `review_unchecked`), so it cannot be dropped.

Migration `20260910120000_review_columns_on_demand.sql` (**written, not applied**) rebuilds
`v_invoices_review` with those two values as correlated scalar subqueries in the target list instead
of a lateral. An unreferenced target-list entry is never evaluated, so after it lands both views
cost the same for this column list, and `invoices_kpis` (which scans the whole filtered set through
`v_invoices_review` and measured 2.4 s server-side) gets the same drop without a change of its own.
The function still returns one row per invoice, and column names, types and order are unchanged,
which is what allows CREATE OR REPLACE rather than a drop and rebuild. A read that asks for both
review columns calls the function twice per row rather than once; that is the AI-search path only.

**3. `invoices_facets` was timing out**, which is why the property filter rendered empty. It scanned
`v_invoices_list` four times, once per facet. Migration
`20260910100000_invoices_facets_single_scan.sql` (**written, not applied**) builds all four facets
from one scan of `public.invoices`. The filter already recovered once the list query stopped
competing with it, so the function was borderline rather than broken; the migration is what makes it
stop being borderline.

The same `CROSS JOIN LATERAL` exists in a sister Hub, another client2 and another Hub. In those three it is
inside `v_invoices_list` itself rather than `v_invoices_review`, so the view fix is the one that
matters there and the `listenQuelle` split would not help.
