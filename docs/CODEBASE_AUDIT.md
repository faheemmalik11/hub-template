# a sister Hub Codebase Audit

_Read-only audit. No app code, migrations, or Supabase writes were performed. Date: 2026-07-01._

---

## 1. Executive Summary

a sister Hub is a **TanStack Start (React 19 + TypeScript)** single-page/SSR app, generated with Lovable, that acts as an internal accounting cockpit for incoming invoices (`Eingangsrechnungen`). It is a **read-and-correct front end on top of Supabase (Postgres)**. There is **no custom backend in this repo** — the browser talks directly to Supabase; an **external Python pipeline (not in this repo)** does the Gmail import, OCR, and AI extraction and writes rows the app then displays and edits.

What actually works today (real, wired to Supabase):

- Login (Supabase email/password), invoice list + detail, field editing, notes, soft-delete, workflow-status + assignment changes, "paid" toggle, supplier master data (read/edit/soft-delete), suppliers/objects/reports/log views, and a **real manual upload** that stores the file bytes in Postgres.

What is fake / placeholder / missing:

- `Ausgangsrechnungen` (outgoing invoices) is a **UI-only placeholder**.
- Gmail import, OCR, AI extraction, invoice validation, bank-transaction import, invoice↔transaction matching, missing-receipt detection, approval rules, DATEV/Lexware export — **none exist in this repo** (some are handled by the external pipeline; most are simply not built).
- The Kanban board only reflects the AI `status`, not the approval `workflow_status`; three of its five columns are hard "coming in Stufe 2" placeholders.

Biggest risks (detailed in §10):

1. **Auth is client-side only.** Route protection depends entirely on Supabase Row-Level Security (RLS), which cannot be verified from this repo. The server-side auth middleware that exists is **dead code** (never wired to any server function).
2. **Upload uses two non-transactional inserts** — a failure between them orphans an invoice row with no file, or a file with no invoice.
3. **Files are stored as Postgres `bytea`, sent/loaded as hex strings.** This will not scale to large PDFs (payload + memory blow-up) and there is **no Supabase Storage** usage.
4. **All writes are untyped (`as any`)** even though the generated DB types are complete — column typos won't be caught.
5. **No pagination anywhere** — every list loads the full `belege` table into the browser.

---

## 2. Project Structure

### Framework & build

- **Framework:** TanStack Start (`@tanstack/react-start` 1.167) on React 19, TypeScript 5.8. — `package.json`
- **Build tool:** Vite 8 via `@lovable.dev/vite-tanstack-config` (bundles TanStack Start, React, Tailwind, tsconfig-paths, **Nitro** targeting Cloudflare Workers, Lovable error loggers). — `vite.config.ts`
- **Styling:** Tailwind CSS v4 + shadcn/ui (46 vendored primitives in `src/components/ui/`). — `components.json`, `package.json`
- **Data layer:** TanStack React Query 5. **Backend:** Supabase (`@supabase/supabase-js` 2.108).
- **Package manager:** Bun (`bun.lock`, `bunfig.toml`) — but a `package-lock.json` also exists (mixed lockfiles).

### Routing

- **File-based routing** via TanStack Router. Every file in `src/routes/` is a URL. `src/routeTree.gen.ts` is auto-generated glue (do not edit). — `src/routes/README.md`
- Root layout: `src/routes/__root.tsx` (providers + `<Outlet/>`). Dynamic segments use bare `$` (e.g. `eingangsrechnungen/$nr.tsx`).

### Main folders

| Path                         | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `src/routes/`                | Pages (one folder per module)                                                           |
| `src/components/ui/`         | Vendored shadcn primitives (46 files)                                                   |
| `src/components/belege/`     | Feature components (badges, copy-button, document-preview, query-states)                |
| `src/components/layout/`     | `app-shell`, `auth-gate`, `size-control`                                                |
| `src/components/brand/`      | Logo                                                                                    |
| `src/lib/data/`              | `queries.ts` (all DB calls), `types.ts` (domain types), `format.ts` (labels/formatting) |
| `src/lib/`                   | `auth.tsx`, `config.server.ts`, error/reporting helpers, `ui-scale.tsx`, `utils.ts`     |
| `src/integrations/supabase/` | Supabase clients + auth middleware + generated `types.ts`                               |
| `src/hooks/`                 | `use-mobile.tsx`                                                                        |
| `supabase/`                  | `config.toml` only (project id) — **no migrations**                                     |

### Main entry files

- `src/routes/__root.tsx` — app shell / provider chain.
- `src/start.ts` — TanStack Start instance; registers `attachSupabaseAuth` (client function middleware) + an error middleware.
- `src/server.ts` — SSR fetch wrapper that normalizes catastrophic 500s (Cloudflare/h3).
- `src/integrations/supabase/client.ts` — the `supabase` client every hook imports.
- `src/lib/data/queries.ts` — **the single file containing every DB call.**

### Package scripts (`package.json`)

```
dev        vite dev
build      vite build
build:dev  vite build --mode development
preview    vite preview
lint       eslint .
format     prettier --write .
```

> No `test` script. No test files anywhere in the repo.

### Env variables

From `.env` (six keys; values redacted here):

- `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (server-side, read via `process.env`)
- `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client-exposed)

Referenced in code but **not present in `.env`**:

- `SUPABASE_SERVICE_ROLE_KEY` — required by `src/integrations/supabase/client.server.ts` (admin client). Since nothing uses that client, it is never hit today, but the admin path is non-functional without it.
- `VITE_BUGHERD_KEY` — the BugHerd feedback widget in `src/routes/__root.tsx`. Optional: with no
  key the script tag is not emitted at all. Ported from a sister Hub, which loads it the same way.
  **Privacy:** a submitted feedback item includes a **screenshot of the current screen**, i.e. real
  financial data, plus the URL and browser info, stored on BugHerd's servers. Only invited BugHerd
  project members and guests ever see the sidebar; ordinary users get nothing.
- **Note:** `src/integrations/supabase/client.ts` **hard-codes** the URL and publishable key (lines 6–7) instead of reading the `VITE_` env vars — the env vars are effectively unused by the browser client.

---

## 3. Current Features

### Pages built (all under `src/routes/`)

| Route                            | File                            | Real or placeholder | Notes                                                                                        |
| -------------------------------- | ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `/` Dashboard                    | `index.tsx`                     | **Real**            | KPIs + module tiles + last-6 invoices, all from live `belege`/`lieferanten`/`gesellschaften` |
| `/eingangsrechnungen` list       | `eingangsrechnungen/index.tsx`  | **Real**            | List + Kanban, client-side filter/sort, server full-text search                              |
| `/eingangsrechnungen/$nr` detail | `eingangsrechnungen/$nr.tsx`    | **Real**            | View/edit, workflow, assign, paid toggle, notes, delete, preview                             |
| `/eingangsrechnungen/upload`     | `eingangsrechnungen/upload.tsx` | **Real**            | Drag-drop, writes file bytes to Postgres                                                     |
| `/lieferanten` list              | `lieferanten/index.tsx`         | **Real**            | Supplier master list with per-supplier invoice volume                                        |
| `/lieferanten/$id` detail        | `lieferanten/$id.tsx`           | **Real**            | Full CRUD (read/update/soft-delete)                                                          |
| `/objekte` list                  | `objekte/index.tsx`             | **Real (derived)**  | Aggregates distinct `objekt_code` from `belege`                                              |
| `/objekte/$code` detail          | `objekte/$code.tsx`             | **Real (derived)**  | All invoices for one object code                                                             |
| `/auswertungen`                  | `auswertungen/index.tsx`        | **Real**            | Sums by supplier/company/object/month, recharts                                              |
| `/protokoll`                     | `protokoll/index.tsx`           | **Real**            | Reads `verarbeitungs_log` (external pipeline output)                                         |
| `/ausgangsrechnungen`            | `ausgangsrechnungen/index.tsx`  | **Placeholder**     | Static "coming via Lexware/sevDesk" empty state, no data                                     |

### Flows that are complete

- **Login / logout** (Supabase session, localStorage).
- **Invoice list → detail → edit → save** (with audit trail in `beleg_verlauf`).
- **Manual upload → row + file stored** (with the caveats in §7).
- **Supplier master data CRUD.**
- **Soft-delete** of invoices and suppliers (audit-proof; sets `geloescht_am`).
- **Workflow status change + assignment + paid toggle** on the detail page (writes real columns, logs history).

### Flows that are fake / partial / UI-only

- **Ausgangsrechnungen:** entirely placeholder.
- **Kanban board** (`eingangsrechnungen/index.tsx`, lines 559–648): only the two AI-`status` columns (`zu_pruefen`, `erkannt`) are populated; `geprueft`, `beim_vorgesetzten`, `uebergeben` are hard-coded `stufe2: true` placeholders that read "kommt mit Stufe 2". The board **ignores `workflow_status`** even though that column is editable on the detail page — so the two disagree.
- **Paid/unpaid categorization:** only a `bezahlt_am` toggle on the detail page. There is **no "offen vs. bezahlt" view, filter, KPI, or overdue logic** anywhere in the lists/dashboard (requirement #6 is essentially unmet in the UI).
- **Objekte:** there is no `objekte` table — objects are just distinct free-text `objekt_code` strings. No object master data, address, or validation.

---

## 4. Supabase / Data Model Usage

### Where the client is created

- **Browser client:** `src/integrations/supabase/client.ts` — `createClient<Database>(URL, PUBLISHABLE_KEY)` with `persistSession` + `autoRefreshToken`, session in `localStorage`. URL/key are **hard-coded string literals** (lines 6–7).
- **Admin client (service role, bypasses RLS):** `src/integrations/supabase/client.server.ts` — lazy Proxy, reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. **Not imported anywhere in the app.**
- **Per-request user client:** `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`) — builds a token-scoped client. **Not used by any server function** (dead code; see §5).

### Tables used in code (`src/lib/data/queries.ts`)

`gesellschaften`, `lieferanten`, `belege`, `beleg_dateien`, `verarbeitungs_log`, `beleg_verlauf`.

**Declared in generated types but NOT used in code:** `imported_messages` (Gmail dedup — written by the external pipeline only).

### Queries (reads — all `supabase.from(...).select(...)`)

| Hook                               | Table               | Query specifics                                                                                                                                      |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGesellschaften`                | `gesellschaften`    | `select('*').order('code')`                                                                                                                          |
| `useLieferanten`                   | `lieferanten`       | `.is('geloescht_am', null).order('name')`                                                                                                            |
| `useLieferant(id)`                 | `lieferanten`       | `.eq('id',id).maybeSingle()`                                                                                                                         |
| `useBelege(search?)`               | `belege`            | `.is('geloescht_am', null)`, optional `.textSearch('fts', q, {type:'websearch', config:'german'})`, `.order('created_at', desc)` — **no `.limit()`** |
| `useBeleg(id)`                     | `belege`            | `.eq('id',id).maybeSingle()` — **does not filter `geloescht_am`**                                                                                    |
| `useBelegDatei(belegId)`           | `beleg_dateien`     | `.eq('beleg_id',id).maybeSingle()` — selects `*` incl. `inhalt` (full file bytes)                                                                    |
| `useVerarbeitungsLog`              | `verarbeitungs_log` | `.order('verarbeitet_am', desc).limit(500)`                                                                                                          |
| `useVerarbeitungsLogFuerBeleg(id)` | `verarbeitungs_log` | `.eq('beleg_id',id)`                                                                                                                                 |
| `useBelegVerlauf(id)`              | `beleg_verlauf`     | `.eq('beleg_id',id).order('created_at', desc)`                                                                                                       |

### Inserts / updates / deletes (mutations)

| Hook                         | Operation                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `useUpdateBeleg(id)`         | `belege.update({...changes, updated_at})` + optional `beleg_verlauf` insert                                  |
| `useAddNotiz(id)`            | `beleg_verlauf.insert({typ:'notiz'})`                                                                        |
| `useSoftDeleteBeleg(id)`     | `belege.update({geloescht_am, geloescht_von, loesch_grund})` + verlauf insert                                |
| `useUpdateLieferant(id)`     | `lieferanten.update(changes)`                                                                                |
| `useSoftDeleteLieferant(id)` | `lieferanten.update({geloescht_am,...})`                                                                     |
| `useCreateUploadBelege`      | per file: `belege.insert(stub)` → `beleg_dateien.insert(file)` → `beleg_verlauf.insert` (**no transaction**) |
| `insertVerlauf` (helper)     | `beleg_verlauf.insert({beleg_id, typ, text, daten, actor})`                                                  |

There are **no hard deletes** anywhere — deletion is always soft (audit-proof), which is appropriate for accounting.

### Are the TypeScript DB types complete/correct?

- **`src/integrations/supabase/types.ts` (generated) is complete and correct** — full `Row/Insert/Update` for all 6 tables + FKs. `belege` carries the extraction fields (`extracted`, `validierung`, `positionen`, `steuer`, `volltext_ocr`, `konfidenz` via `extracted`), workflow fields, soft-delete fields, `storage_path`, `embedding`, `fts`, `gmail_message_id`.
- **BUG / stale comment:** `src/lib/data/queries.ts` lines 24–28 claim "Der generierte Supabase-Database-Typ ist leer" and therefore cast the client to `any` (`const sb = supabase as any`) for **all writes**, and use `as unknown as` on all reads. **This is no longer true** — the types are populated. The result: every write payload is **completely untyped**, so a wrong/renamed column name would not be caught at compile time. This is a self-inflicted loss of type safety.
- `src/lib/data/types.ts` is a **hand-written parallel set of domain types** (`Beleg`, `Lieferant`, etc.) used by the UI. They mostly mirror the generated types but are maintained separately — a drift risk (two sources of truth).

### Missing migrations / schema files

- **No SQL migrations or schema files exist in the repo.** `supabase/` contains only `config.toml` (project id `pbwfihepsrxgcytkvqgf`).
- Code comments reference `pipeline/db_schema.sql`, `pipeline/prompts/eingangsrechnung.txt`, and "Migration 001" CHECK constraints — **none of these files are in this repo.** The database schema, RLS policies, the `fts` generated column, and the `status`/`workflow_status` CHECK constraints live only in the (external) Supabase project and/or the external pipeline repo. **This is a significant gap: the schema is not version-controlled here.**

---

## 5. Auth and Permissions

### How login works

- `src/lib/auth.tsx` (`AuthProvider`) wraps `supabase.auth.signInWithPassword`. Email/password only; **no self-signup** (accounts are created in Supabase directly). German error mapping. Session lives in `localStorage`, auto-refreshed.
- `src/components/layout/auth-gate.tsx` gates the whole app: while `!ready` → blank screen; `!user` → `<LoginScreen/>`; else `<AppShell>{children}</AppShell>`. The gate wraps `<Outlet/>` in `__root.tsx`, so **every** route sits behind it.

### Are routes protected? Can unauthenticated users reach private pages?

- **UI gating is client-side only.** `AuthGate` decides what renders in the browser. There is **no per-route server `beforeLoad`/loader guard** and **no server-side session check** on any route.
- **Actual data protection depends entirely on Supabase RLS.** All data access uses the **publishable/anon key** (hard-coded in `client.ts`) with the user's bearer token attached client-side. If RLS is correctly configured to require `authenticated`, an unauthenticated caller gets nothing back even if they bypass the UI. **If RLS is missing or allows `anon`, all data is readable/writable by anyone with the (public) key.**
- **Unclear / needs verification:** the RLS policies are not in this repo. **This is the single most important thing to confirm against the live Supabase project.** (See §12.)
- **Dead code:** `requireSupabaseAuth` (`auth-middleware.ts`) and the `supabaseAdmin` client exist to enforce auth on server functions, but the only server function in the repo is `getGreeting` (`src/lib/api/example.functions.ts`), an unused example that requires nothing. So the server-side auth story is scaffolding only.

### Roles / permissions

- **None implemented.** There is no role/permission concept in code. The "approval chain" is a free dropdown any logged-in user can set to any value, and assignment is a fixed two-name list (`ZUWEISBAR = ["Anja Kienbaum", "Philipp Netz"]`, `format.ts:110`). Nothing enforces "only a supervisor may set `beim_vorgesetzten`" etc.

---

## 6. Invoice Flow Trace

All hooks below live in `src/lib/data/queries.ts`.

### 6.1 Invoice list

- **File / component:** `src/routes/eingangsrechnungen/index.tsx` → `EingangsrechnungenPage`.
- **Reads:** `useBelege(suchTerm)`, `useLieferanten()`, `useGesellschaften()`.
- **Writes:** none.
- **Behavior:** debounced (300ms) server full-text search on `fts`; all other filters (company, object, status, date range) + sort + KPIs are computed **client-side** over the full result. Two views: table + Kanban.
- **Weak points / bugs:**
  - **No pagination / no `.limit()`** — loads every non-deleted invoice. Fine at prototype scale, breaks at thousands.
  - **Search depends on a DB `fts` generated column with `config:'german'`.** If that column/config doesn't exist, `useBelege` throws and the whole list errors out. Not verifiable from repo.
  - Sort uses a generic `<`/`>` comparator over mixed string/number `val()` — works for the current keys but is fragile (e.g. `created_at` is compared as a string).
  - Object filter options come only from currently-loaded invoices, so a valid object with no loaded invoice won't appear.
  - Status filter and KPIs use the AI `status` (`erkannt`/`zu_pruefen`), not `workflow_status` — see §9.

### 6.2 Invoice detail

- **File / component:** `src/routes/eingangsrechnungen/$nr.tsx` → `BelegDetailPage` → `BelegDetail`.
- **Reads:** `useBeleg(nr)`, `useLieferant(beleg.lieferant_id)`, `useGesellschaften()`, `useVerarbeitungsLogFuerBeleg(id)`, `useBelegVerlauf(id)`, `useBelege()` (to compute this supplier's total across all invoices), and `useBelegDatei` via `<DocumentPreview>`.
- **Writes:** via edit/workflow/assign/paid/notes/delete (below).
- **Weak points / bugs:**
  - `useBeleg` does **not** filter `geloescht_am`, so a soft-deleted invoice is still reachable by URL (no restore UI exists, so it's a dead-but-viewable record).
  - Loads the **entire** `belege` table again just to sum one supplier's volume (`lieferantBelege`, lines 226–230) — wasteful; should be a scoped query or an aggregate.
  - `volltext` falls back to `extracted.volltext` cast as string — fine, but untyped.

### 6.3 Invoice edit / update

- **Component:** `BelegDetail` → `speichern()` → `useUpdateBeleg`.
- **Reads:** current `beleg`. **Writes:** `belege.update(changes)` (only diffed fields) + a `beleg_verlauf` "aenderung" row listing changed field names.
- **Data written:** text fields via `TEXT_KEYS`, numeric via `NUM_KEYS` (`Number(form[k].replace(',', '.'))`), plus `updated_at`.
- **Weak points / bugs:**
  - **Number parsing is naive:** `"1.234,56"` (German thousands) → `replace(',','.')` → `"1.234.56"` → `Number(...)` → `NaN`, which is then stored as `null` (silent data loss). Only bare decimals work.
  - No validation that `netto + ust = brutto` on save (the `validierung` flags are display-only, produced by the external pipeline).
  - Payload is untyped (`sb as any`) — a mistyped column is a silent runtime failure.
  - `gesellschaft_code` is edited as a free select, but `gesellschaft_id` (the FK) is **never updated** — so company assignment updates the code string but not the relational link.

### 6.4 Manual upload

- **File / component:** `src/routes/eingangsrechnungen/upload.tsx` → `UploadPage`; hook `useCreateUploadBelege`.
- **Reads:** none. **Writes (per file, in a loop, no transaction):**
  1. `belege.insert({ belegart:'Eingangsrechnung', eingangskanal:'upload', quelle:'upload', status:'zu_pruefen', workflow_status:'eingegangen', rechnungssteller: filename })` → returns `id`.
  2. `beleg_dateien.insert({ beleg_id, filename, mime, size_bytes, inhalt: hex })`.
  3. `beleg_verlauf.insert(...)` audit row.
- **Client validation:** extension in `.pdf/.jpg/.jpeg/.png/.xml`, max 50 MB.
- **Weak points / bugs (major — see §7).**

### 6.5 File storage

- **Where:** Postgres `beleg_dateien.inhalt` column as **`bytea`**, transported as a hex string (`\x...`). **Not Supabase Storage.** `belege.storage_path` exists but is unused.
- Read back in `DocumentPreview` via `hexToUint8Array` → `Blob` → object URL.

### 6.6 Invoice status

- **Two independent axes:**
  - `status` (`erkannt` | `zu_pruefen`) — from the AI pipeline. Drives list KPIs, list filter, Kanban.
  - `workflow_status` (`eingegangen → in_pruefung → freigegeben_assistenz → beim_vorgesetzten → uebergeben_datev → ueberwiesen`) — the approval chain, editable only on the detail page.
  - Plus `bezahlt_am` (a timestamp, toggled by the "Überwiesen" switch) as a third, separate "paid" signal.
- **Writes:** `setWorkflow` and `setBezahlt` via `useUpdateBeleg` with history logging.
- **Weak point:** three overlapping status concepts with no single source of truth; the list and Kanban ignore `workflow_status` and `bezahlt_am`.

### 6.7 Supplier assignment

- Displayed on detail (`useLieferant(beleg.lieferant_id)`), linked to `/lieferanten/$id`.
- **There is no UI to set or change `beleg.lieferant_id`.** The invoice→supplier link is created only by the external pipeline. In-app, you can edit the free-text `rechnungssteller` but cannot attach/detach a supplier record. **This is a real functional gap** (requirement #10 partially unmet).

### 6.8 Company assignment

- Editable via the `gesellschaft_code` select in edit mode (`$nr.tsx` lines 472–488).
- **Bug (repeat of 6.3):** only `gesellschaft_code` is written; the FK `gesellschaft_id` is left stale. Any query that joins on `gesellschaft_id` will disagree with the displayed code.

### 6.9 Approval status / history

- **Status:** `setWorkflow` dropdown (any value, any user).
- **Assignment:** `setZuweisung` to one of two hard-coded names.
- **History:** `beleg_verlauf` (notes + status changes + edits + deletions), shown in "Notizen & Verlauf"; the pipeline's `verarbeitungs_log` is shown separately.
- **Weak points:** no permission gating, no state-machine enforcement (you can jump straight to `ueberwiesen`), no notifications, no approver identity beyond the free text `actor` (logged-in email, best-effort via `actorEmail()`).

---

## 7. File Upload and Storage

- **Storage location:** Postgres `bytea` (`beleg_dateien.inhalt`), **not** Supabase Storage. `belege.storage_path` is defined but unused.
- **Is upload safe?** Partially. Client-side it checks extension + 50 MB cap. But:
  - **No transaction across the two inserts** (`useCreateUploadBelege`, `queries.ts` 280–317). If `beleg_dateien.insert` fails after `belege.insert` succeeds, you get an **orphan invoice with no file**. In a multi-file batch, an error mid-loop leaves earlier files committed and the rest un-inserted, then throws — partial success with a generic error toast.
  - **No duplicate detection** — the same file can be uploaded repeatedly, each creating a new invoice.
  - **No server-side validation** of MIME/content (a `.pdf` could be anything; the anon key + RLS is the only gate).
  - The whole file is read into memory and hex-encoded on the main thread (`fileToHex`, `upload.tsx` 41–46) — **doubles memory** and blocks the UI for large files; `hexToUint8Array` uses the deprecated `substr`.
- **What happens if one DB insert succeeds and another fails?** As above — orphaned rows, no rollback, no cleanup. This is the most likely source of "ghost" invoices.
- **Previews / downloads:** Implemented (`document-preview.tsx`) — PDFs in an `<iframe>` (+ new-tab + zoom dialog), images inline (+ zoom), other types show "download only". Download link uses the object URL. Works for reasonably sized files.
- **Large PDFs:** **Poorly handled.** A 50 MB file becomes a ~100 MB hex string sent in a single PostgREST JSON insert (likely to hit request-size limits), stored inline in the row, and on preview the entire `inhalt` is `select *`-ed back into browser memory and hex-decoded byte-by-byte. This will be slow and can OOM the tab. **Supabase Storage is the correct home for these.**

---

## 8. Missing Workflows

| Workflow                              | Status in this repo                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Gmail inbox import                    | **Not in repo.** External Python pipeline. App only reads `verarbeitungs_log` / `imported_messages` output.              |
| Duplicate email/attachment protection | External only (`gmail_message_id`, `imported_messages` exist for the pipeline). **Manual upload has no dedup.**          |
| Moving processed emails out of inbox  | **Not in repo** (pipeline concern).                                                                                      |
| OCR                                   | **Not in repo.** App displays `volltext_ocr`.                                                                            |
| AI extraction                         | **Not in repo.** App displays/edits `extracted`, `konfidenz`, `positionen`, `steuer`, `validierung`.                     |
| Invoice validation                    | **Display-only.** `validierung` flags are shown but computed externally; no in-app rule (e.g. netto+USt=brutto) on save. |
| Bank transaction import               | **Missing entirely** — no table, no code, no UI.                                                                         |
| Invoice ↔ transaction matching        | **Missing entirely.**                                                                                                    |
| Missing-receipt detection             | **Missing** — no paid/unpaid list, no transaction side to compare against.                                               |
| Approval rules                        | **Missing** — manual free dropdown + fixed 2-name assignment, no roles, no enforcement.                                  |
| DATEV export                          | **Missing** — only the label "Übergeben (DATEV)" as a status.                                                            |
| Lexware export                        | **Missing** — `ausgangsrechnungen` page is a static placeholder mentioning Lexware/sevDesk.                              |

---

## 9. Hard-coded Data

- **Approval / assignee names:** `ZUWEISBAR = ["Anja Kienbaum", "Philipp Netz"]` — `src/lib/data/format.ts:110`. These are the only two people an invoice can be assigned to.
- **Supabase URL + publishable key:** string literals in `src/integrations/supabase/client.ts:6-7` (also the project id in `supabase/config.toml` and `src/integrations/supabase/auth-middleware`/`client.server` read from env).
- **Company codes (union type):** `GesellschaftCode = "IMKO" | "IMGM" | "JPGB" | "PNPR" | "NOGR" | "IMOS"` — `src/lib/data/types.ts:5`. (Actual companies still come from the `gesellschaften` table; this union is just a hint.)
- **Statuses / labels (German):**
  - `STATUS_META`, `WORKFLOW_META`, `WORKFLOW_REIHENFOLGE`, `KANAL_LABELS`, confidence thresholds — `src/lib/data/format.ts`.
  - `STATUS_OPTIONS` (list filter) and `KANBAN_PHASEN` (incl. `stufe2` placeholders) — `src/routes/eingangsrechnungen/index.tsx:55, 559`.
  - Log status styles (`erkannt/zu_pruefen/fehler/duplikat/kein_beleg_anhang`) — `src/routes/protokoll/index.tsx:35`.
  - Channel icons map — `src/components/belege/badges.tsx:35`.
- **Date-range filter presets:** hard-coded to 2026 months ("Juni 2026", "Mai 2026", "April 2026", "Jahr 2026") — `src/routes/eingangsrechnungen/index.tsx:308-311`. Will be stale in 2027.
- **Month labels:** `MONATE = ["Jan"…"Dez"]` — `src/routes/auswertungen/index.tsx:33`.
- **Navigation:** `nav[]` (7 routes) — `src/components/layout/app-shell.tsx:20`.
- **Module tiles** (labels/descriptions/"folgt"/"Stufe 2") — `src/routes/index.tsx:76-137`.
- **UI scale presets** + localStorage key `hv.ui-scale` — `src/lib/ui-scale.tsx`, `src/components/layout/size-control.tsx`.
- **Login placeholder email:** `name@wt-digital.de` — `src/components/layout/auth-gate.tsx:93`.
- **Test / fake / demo data:** **None found.** All list/detail data is live from Supabase; the only non-data hard-coding is UI structure, labels, and the two items above (assignee names, company-code union). No mock records, no seed arrays, no `demo`/`mock`/`fixture` files.

---

## 10. Bugs and Risks

Ordered roughly by severity.

1. **Auth is client-side only; RLS unverified (Security — critical).** Route protection is purely the `AuthGate` in the browser. Real protection = Supabase RLS, which is not in this repo and must be confirmed. The publishable key is public (hard-coded). If RLS is permissive, data is exposed. — `auth-gate.tsx`, `client.ts`. Server middleware `requireSupabaseAuth` is dead code.
2. **Non-transactional upload → orphaned rows (Data integrity — high).** Two/three separate inserts with no rollback. — `queries.ts:280-317` (§7).
3. **`bytea` file storage won't scale (Performance/limits — high).** Large PDFs blow request-size and browser memory; should be Supabase Storage. — `upload.tsx`, `document-preview.tsx`, `queries.ts`.
4. **All writes untyped (`as any`) despite complete types (Type safety — high).** Column typos silently fail at runtime. — `queries.ts:24-28`.
5. **German number parsing loses data (Correctness — high).** `"1.234,56"` → `NaN` → stored `null` on edit. — `$nr.tsx:187-192`.
6. **Company assignment updates code but not FK (Correctness — high).** `gesellschaft_code` written, `gesellschaft_id` left stale. Same class of issue means `objekt_code` free-text can create phantom objects. — `$nr.tsx:475-488`.
7. **No way to set supplier link in-app (Functional gap — high).** `lieferant_id` can't be assigned/changed from the UI. — `$nr.tsx`.
8. **No pagination anywhere (Performance — medium).** Every list loads the full `belege` table; detail reloads it again to sum a supplier. — `queries.ts` (`useBelege` no `.limit`), `$nr.tsx:226`.
9. **Paid/unpaid + workflow not surfaced (Logic — medium).** `workflow_status` and `bezahlt_am` don't appear in lists, KPIs, Kanban, or filters; three status concepts with no reconciliation. No overdue/`faelligkeit` logic. — `eingangsrechnungen/index.tsx`, `index.tsx`.
10. **Soft-deleted invoices still reachable by URL (Minor).** `useBeleg` ignores `geloescht_am`; no restore UI exists. — `queries.ts:96-111`.
11. **Full-text search is a hard dependency on a DB `fts` column (Robustness — medium).** If missing/misconfigured, the entire list errors. — `queries.ts:87`.
12. **Stale date-range presets (Minor).** Hard-coded 2026 months. — `eingangsrechnungen/index.tsx:308`.
13. **Two parallel type systems (Maintainability — medium).** Generated `integrations/supabase/types.ts` vs hand-written `lib/data/types.ts` can drift.
14. **Mixed lockfiles (Build hygiene — low).** Both `bun.lock` and `package-lock.json` present.
15. **Error handling** is generally decent (React Query error states, toasts on mutation failure), but upload surfaces only a generic message and can leave partial state; no retry/queue.
16. **Approval flow has no permission model or state-machine (Logic — medium).** Any user can set any status/assignee.

---

## 11. Phase 1 Implementation Plan

**Phase 1 scope only:** email/manual upload → file saved safely → invoice data extracted → data stored cleanly → invoice visible in UI → status tracked clearly. **Do not** start bank transactions, matching, DATEV, or Lexware yet.

### Fix first (correctness & safety, low blast radius)

1. **Verify & document Supabase RLS** for all 6 tables (confirm `authenticated`-only, no `anon` read/write). This gates everything else. (§5, §12)
2. **Make upload safe:** move file bytes to **Supabase Storage** (store the path in `belege.storage_path`), and make the `belege`+file+verlauf creation atomic — ideally a single Postgres RPC / server function so a failure rolls back. Update `DocumentPreview` to read from Storage (signed URL) instead of `bytea`.
3. **Restore write type-safety:** delete the `sb = supabase as any` cast; use the generated `TablesInsert`/`TablesUpdate` types (they're complete). Fix the stale comment.
4. **Fix number parsing** on save (handle German `1.234,56`) and stop silently coercing to `null`.
5. **Fix company/object assignment:** write `gesellschaft_id` alongside `gesellschaft_code`; consider a real `objekte` table or a validated code list.

### Leave alone (works; don't churn)

- shadcn `components/ui/*`, `format.ts` labels, `app-shell`, `ui-scale`, error/reporting plumbing, the read hooks and list/detail rendering, soft-delete design.
- `ausgangsrechnungen` placeholder (out of Phase 1 scope).

### Refactor later (after Phase 1 is stable)

- Add **pagination / server-side filtering** to `useBelege` (and stop reloading the full table on the detail page).
- **Consolidate the status model** (AI `status` vs `workflow_status` vs `bezahlt_am`) into one clear derived state; make the Kanban reflect it. Surface paid/unpaid + overdue in lists/KPIs.
- Merge the two type systems (generate once, derive domain types).
- Add a real **supplier-assignment UI** and an **approval permission/role model**.

### Needs client (Fabian) clarification

- See §12.

### What to build for Phase 1

- **Safe manual upload** (Storage + atomic create) — the anchor of Phase 1.
- **Extraction handoff contract:** confirm exactly how the external pipeline picks up `eingangskanal='upload', extracted IS NULL` rows, writes back `extracted`/`status`, and whether the app should trigger it or just poll. Today the app assumes "someone else runs the pipeline."
- **Clear status tracking:** a single, obvious "where is this invoice" indicator in the list (received → extracted/needs-check → reviewed), driven by real columns, replacing the confusing dual/triple status.
- **Email-import visibility:** the `protokoll` view already reads `verarbeitungs_log`; make sure it clearly shows imported vs. failed vs. duplicate so email import is observable even though the import itself is external.

---

## 12. Questions for Fabian

1. **RLS:** What are the exact Row-Level Security policies on `belege`, `beleg_dateien`, `beleg_verlauf`, `lieferanten`, `gesellschaften`, `verarbeitungs_log`? Are all writes/reads restricted to `authenticated`? (Cannot be verified from this repo and is the top security question.)
2. **Schema ownership:** The DB schema, the `fts` generated column, and the `status`/`workflow_status` CHECK constraints are not in this repo (only referenced as `pipeline/db_schema.sql`, "Migration 001"). Where does the schema live, and should it be version-controlled here?
3. **The external pipeline:** Where is the Gmail-import / OCR / AI-extraction pipeline code? How does it discover new upload rows (`eingangskanal='upload', extracted IS NULL`)? Should the app trigger extraction, or only display results?
4. **File storage decision:** Are we committed to `bytea` in Postgres, or can we move to Supabase Storage? (Strongly recommend Storage for Phase 1.)
5. **Status model:** What is the intended relationship between `status` (AI), `workflow_status` (approval), and `bezahlt_am` (paid)? What should the primary status shown in the list be?
6. **Supplier linking:** Should reviewers be able to attach/change the `lieferant_id` on an invoice in the app, or is that always the pipeline's job?
7. **Objects:** Should `Objekt` be a real master-data table (with name/address), or stay as free-text `objekt_code` on invoices?
8. **Roles/approval:** Who may move an invoice to each `workflow_status`? Should assignment names (`Anja Kienbaum`, `Philipp Netz`) come from a users table instead of being hard-coded?
9. **Paid/unpaid:** Is `bezahlt_am` alone the source of truth for "paid", or should it come from bank-transaction matching later? Do we need an "open items / overdue" view in Phase 1?
10. **Ausgangsrechnungen:** Confirm this is out of scope until the Lexware/sevDesk integration — the current page is a placeholder.

---

## 13. Files Reviewed

**Config / entry:** `package.json`, `vite.config.ts`, `tsconfig.json`, `.env` (keys only), `.gitignore`, `bunfig.toml`, `components.json`, `supabase/config.toml`, `.lovable/plan.md`, `.lovable/project.json`, `READING-GUIDE.md`, `src/routes/README.md`, `src/start.ts`, `src/server.ts`.

**Supabase / data layer:** `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-attacher.ts`, `auth-middleware.ts`, `types.ts`; `src/lib/data/queries.ts`, `types.ts`, `format.ts`; `src/lib/config.server.ts`, `src/lib/api/example.functions.ts`.

**Auth / layout:** `src/lib/auth.tsx`, `src/components/layout/auth-gate.tsx`, `app-shell.tsx`, `size-control.tsx`, `src/lib/ui-scale.tsx`, `src/lib/utils.ts`, `src/hooks/use-mobile.tsx`, `src/components/brand/logo.tsx`.

**Routes:** `src/routes/__root.tsx`, `index.tsx`, `eingangsrechnungen/index.tsx`, `eingangsrechnungen/$nr.tsx`, `eingangsrechnungen/upload.tsx`, `ausgangsrechnungen/index.tsx`, `auswertungen/index.tsx`, `lieferanten/index.tsx`, `lieferanten/$id.tsx`, `objekte/index.tsx`, `objekte/$code.tsx`, `protokoll/index.tsx`.

**Feature components:** `src/components/belege/badges.tsx`, `copy-button.tsx`, `document-preview.tsx`, `query-states.tsx`.

**Scanned (not individually deep-read):** `src/components/ui/*` (46 vendored shadcn primitives), `src/routeTree.gen.ts` (auto-generated), error/reporting helpers (`src/lib/error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`).

**Confirmed absent:** any `*.sql` / migration files, any Python pipeline code, any test files, any Supabase Storage usage, any bank-transaction/DATEV/Lexware code.
