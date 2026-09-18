# Reading This Codebase — A Map for Newcomers

This is **Stäy**, an internal accounting cockpit (German: _Buchhaltungs-Cockpit_)
for a property company. It reads invoices that an external pipeline has already
scanned with AI, lets staff review/correct/approve them, and writes the changes back.

The code and UI text are in **German**. The structure, though, is the same in every
module. Once you can read one module top-to-bottom, you can read them all. This doc
walks you down through the layers using the **Eingangsrechnungen** (incoming invoices)
module as the worked example, then gives you a glossary and a "where do I find X?" table.

> You do **not** need to understand deep implementation to use this guide. The goal is:
> _given a screen, trace it from pixels → components → state → API call → database, and back._

---

## The tech stack in one breath

- **React 19** + **TypeScript** for the UI.
- **TanStack Start / Router** — file-based routing. A file in `src/routes/` _is_ a URL.
- **TanStack React Query** — fetches data, caches it, re-fetches when something changes.
- **Supabase** — the backend. A hosted PostgreSQL database + auth + file storage,
  talked to directly from the browser. There is **no custom backend server** in this repo;
  the browser queries the database directly (protected by login + database row-level security).
- **shadcn/ui** (in `src/components/ui/`) — pre-built, copied-in UI building blocks
  (Button, Table, Select, Dialog…). These are generated/vendored. You normally **read** them
  to know what props exist; you rarely edit them.
- **Tailwind CSS v4** — all styling is utility classes in `className="..."`. No separate CSS files per component.
- Built with **Lovable** (an AI app builder) — hence the `.lovable/` folder and a few `lovable-*` files.

---

## The 7 layers, top to bottom

Think of any feature as a stack. Reading a module = walking down this stack:

```
1. ROUTE  (the page)        src/routes/<module>/index.tsx, $id.tsx, ...
2. LAYOUT (the frame)       src/components/layout/  +  src/routes/__root.tsx
3. UI KIT (the widgets)     src/components/ui/        ← generated shadcn, design primitives
4. FEATURE COMPONENTS       src/components/belege/, /brand/   ← project-specific pieces
5. STATE + DATA HOOKS       src/lib/data/queries.ts   ← React Query read/write hooks
6. FORMAT + TYPES           src/lib/data/format.ts, types.ts   ← shaping + naming the data
7. DATABASE CLIENT          src/integrations/supabase/   → Supabase (Postgres) tables
```

Design decisions live in **layers 3, 4 and 6** (colors, badges, labels, formatting).
API calls and state management live in **layer 5**. The database shape is **layer 7 + 6**.

---

## Worked example: the Eingangsrechnungen (incoming invoices) module

### Step 1 — Find the page. Start at the route.

URL `/eingangsrechnungen` → file `src/routes/eingangsrechnungen/index.tsx`.

The mapping is mechanical (see `src/routes/README.md`):

| File                            | URL                                                                       |
| ------------------------------- | ------------------------------------------------------------------------- |
| `eingangsrechnungen/index.tsx`  | `/eingangsrechnungen` (the list)                                          |
| `eingangsrechnungen/$nr.tsx`    | `/eingangsrechnungen/:nr` (one invoice's detail) — `$` means a dynamic id |
| `eingangsrechnungen/upload.tsx` | `/eingangsrechnungen/upload` (the upload screen)                          |

Every route file exports a `Route` created with `createFileRoute(...)` and names its
React component. That component **is the page**. So the list page is the `EingangsrechnungenPage`
function in `index.tsx`. Read that function top-to-bottom and you are reading the whole screen.

`routeTree.gen.ts` is **auto-generated** glue that wires files into URLs. Never edit it by hand.

### Step 2 — See the frame around the page.

You never see a route alone. `src/routes/__root.tsx` wraps **every** page with providers,
and `<Outlet />` is where the current page gets injected. The chain is:

```
__root.tsx
  → QueryClientProvider  (turns on React Query data fetching)
    → UIScaleProvider    (global zoom/scale setting)
      → AuthProvider     (who is logged in — src/lib/auth.tsx)
        → AuthGate       (src/components/layout/auth-gate.tsx)
             • not logged in → shows ONLY the login screen
             • logged in     → AppShell + the page
```

`src/components/layout/app-shell.tsx` is the persistent frame: top navigation bar, the logo,
the user menu / logout. The `nav` array near the top of that file is the **list of all modules** —
a great table of contents for the whole app.

### Step 3 — Notice the widgets (the UI kit).

Look at the imports at the top of `index.tsx`:

```ts
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, ... } from "@/components/ui/select";
import { Table, TableBody, ... } from "@/components/ui/table";
```

Anything from `@/components/ui/*` is a **generic shadcn primitive** — a styled, accessible
widget. These are vendored/auto-generated. To learn what props a `<Button>` accepts, open
`src/components/ui/button.tsx` and read its `variant`/`size` options. You read these; you
seldom change them. (`@/` is an alias for `src/`, configured in `tsconfig.json`.)

### Step 4 — Notice the feature components (project-specific pieces).

Imports from `@/components/belege/*` are **this app's own** reusable pieces, built on top of the UI kit:

```ts
import { GesellschaftChip, KanalBadge, StatusBadge, UstBadge } from "@/components/belege/badges";
import { ErrorState, TableSkeleton, CardsSkeleton } from "@/components/belege/query-states";
```

- `components/belege/badges.tsx` — the little colored pills (status, tax rate, company code, channel).
  **This is where small visual/design decisions live** — e.g. `UstBadge` decides "tax rate > 0 →
  teal pill 'USt 19 %', otherwise grey '0 %'."
- `components/belege/query-states.tsx` — the loading skeletons and the error box.
- `components/belege/copy-button.tsx`, `document-preview.tsx` — copy-to-clipboard buttons and the PDF/image preview.

(`belege` = "documents/receipts" — the core entity of this app. `brand/` holds the logo.)

### Step 5 — Find the state and the data (this is the important layer).

Two kinds of state in the page:

**(a) Local UI state** — plain React `useState`, right inside the component. In `index.tsx`
that's the search box text, which filters are active, sort column, list-vs-kanban view, etc.
All the `filtering and sorting` (`gefiltert`, `kpi`) is computed **client-side** with `useMemo`
over the data already loaded. So: _the filters you see in the toolbar are just JavaScript
filtering an array in the browser_ — except the **full-text search**, which is sent to the server (see below).

**(b) Server data** — comes from hooks in `src/lib/data/queries.ts`:

```ts
const belegeQ = useBelege(suchTerm); // the invoices (search term goes to the DB)
const lieferantenQ = useLieferanten(); // suppliers
const gesellschaftenQ = useGesellschaften(); // companies
```

Each `useXxx()` is a **React Query hook**. It returns an object with `.data`, `.isLoading`,
`.isError`, `.refetch()`, `.isFetching`. That's why you see `belegeQ.isLoading ? <Skeleton/> : <Table/>`.
React Query caches results (`staleTime` 60s) and auto-refetches.

`queries.ts` is the **single file that contains every database call in the app.** Two groups:

- **Reads** (`useQuery`): `useBelege`, `useBeleg(id)`, `useLieferanten`, `useGesellschaften`,
  `useBelegDatei`, `useVerarbeitungsLog`, `useBelegVerlauf`, … — each just runs a
  `supabase.from("table").select(...)` and returns rows.
- **Writes** (`useMutation`): `useUpdateBeleg`, `useAddNotiz`, `useSoftDeleteBeleg`,
  `useUpdateLieferant`, `useCreateUploadBelege`, `useSoftDeleteLieferant`. After a write
  succeeds, `onSuccess` calls `queryClient.invalidateQueries([...])` which tells React Query
  _"that data is stale, re-fetch it"_ — that's how the screen updates itself after an edit.

> **Mental model for the whole data flow:**
> `component → useXxx() hook (queries.ts) → supabase.from(table) → Postgres → back as .data`.
> Writes go the same way and then **invalidate** the read so the UI refreshes.

To see writes in action, open the detail page `eingangsrechnungen/$nr.tsx`: it calls
`useUpdateBeleg`, `useAddNotiz`, `useSoftDeleteBeleg`. Editing a field and saving runs the
mutation → DB update → invalidate → re-render.

### Step 6 — Understand the shaping: format + types.

- `src/lib/data/types.ts` — the **TypeScript shape of every table row**, in plain interfaces:
  `Beleg` (an invoice), `Lieferant` (a supplier), `Gesellschaft` (a company), `BelegVerlauf`
  (history/notes), etc. When you wonder "what fields does an invoice have?", read this file.
  It is hand-written to mirror the database (`pipeline/db_schema.sql`).
- `src/lib/data/format.ts` — **display logic and design constants**: `formatEUR`, `formatDate`,
  `formatIBAN`, the status → label+color maps (`STATUS_META`, `WORKFLOW_META`), the
  confidence "traffic-light" thresholds (`konfidenzAmpel`: green ≥ 0.95, yellow ≥ 0.8, red below),
  channel labels, etc. **This is the other place design/labeling decisions live.** Badges in
  layer 4 pull their colors and labels from here.

### Step 7 — The database client.

`src/integrations/supabase/client.ts` creates the `supabase` object (project URL + public key)
that every hook in `queries.ts` imports. It stores the login session in the browser's
`localStorage`. The matching `client.server.ts` / `auth-middleware.ts` / `auth-attacher.ts`
exist for server-side rendering; for reading the app you can treat `client.ts` as _the_ entry point.

`src/integrations/supabase/types.ts` declares which tables exist (`belege`, `lieferanten`,
`gesellschaften`, `beleg_dateien`, `verarbeitungs_log`, …) so the queries are type-checked.

That's the full descent: **route → frame → widgets → feature pieces → hooks → format/types → Supabase table.**
To go back _up_ from a database column to the screen, search for the column name in `types.ts`,
then in `queries.ts`, then in the route `.tsx`.

---

## How to read ANY module (the repeatable recipe)

1. **Open `src/components/layout/app-shell.tsx`** → the `nav` array lists every module and its URL.
2. **Open `src/routes/<module>/index.tsx`** → this is the list/landing page. The exported
   component function is the whole screen. `$<param>.tsx` is the detail page.
3. **Scan the imports** to classify what's on screen:
   - `@/components/ui/*` → generic widget (read it only if you need its props).
   - `@/components/<feature>/*` → project-specific piece (design lives here).
   - `@/lib/data/queries` → **the data**: which `useXxx` hooks → which tables.
   - `@/lib/data/format` → labels, currency/date formatting, status colors.
   - `@/lib/data/types` → the shape of the rows.
4. **Read the top of the component**: `useState` = local UI state; `useXxx()` = server data.
5. **For a write/CRUD action**, find the `useMutation` hook in `queries.ts`, read its
   `mutationFn` (the actual `supabase...update/insert`) and its `onSuccess` (what gets refreshed).
6. **For the data origin**, jump to `types.ts` for the columns and `integrations/supabase/` for the connection.

---

## The modules at a glance

All under `src/routes/`. Each is the same shape (list `index.tsx`, optional detail `$param.tsx`):

| Folder                | German term        | What it is                                              |
| --------------------- | ------------------ | ------------------------------------------------------- |
| `index.tsx` (root)    | Übersicht          | Dashboard / home overview                               |
| `eingangsrechnungen/` | Eingangsrechnungen | **Incoming** invoices (the main, most-developed module) |
| `ausgangsrechnungen/` | Ausgangsrechnungen | **Outgoing** invoices                                   |
| `lieferanten/`        | Lieferanten        | Suppliers / vendors (master data)                       |
| `objekte/`            | Objekte            | Properties / buildings                                  |
| `auswertungen/`       | Auswertungen       | Reports / analytics (charts via `recharts`)             |
| `protokoll/`          | Protokoll          | Processing log / audit trail                            |

---

## German glossary (the words you'll keep meeting)

**Core entities**

- **Beleg / Belege** — document / receipt / invoice (the central record). The whole `belege` table.
- **Eingangsrechnung** — incoming invoice (a bill the company received). **Ausgangsrechnung** — outgoing invoice (a bill it sent).
- **Lieferant** — supplier / vendor. **Rechnungssteller** — the issuer/biller named on the invoice.
- **Gesellschaft** — company/entity (the firm has several; each has a short `code` like IMKO, IMGM).
- **Objekt** — a property/building the cost belongs to.

**Invoice fields**

- **Betrag** — amount. **Betrag_netto / \_brutto** — net / gross amount. **USt (Umsatzsteuer)** — VAT/sales tax. **USt_satz** — VAT rate %.
- **Rechnungsnummer** — invoice number. **Beleg_datum** — invoice date. **Leistungsdatum** — service/delivery date. **Fälligkeit** — due date.
- **IBAN / BIC** — bank details. **Verwendungszweck** — payment reference. **Kostenkategorie** — cost category.

**Status & workflow**

- **Status** — extraction status from the AI: only `erkannt` (recognized) or `zu_pruefen` (to be checked).
- **Workflow_status** — the approval chain (separate column): eingegangen → in_pruefung → freigegeben_assistenz
  → beim_vorgesetzten → uebergeben_datev → ueberwiesen (received → in review → approved by assistant →
  with supervisor → handed to DATEV accounting → paid).
- **Konfidenz** — AI confidence per field (0–1). Shown as a traffic-light dot (**Ampel** = traffic light): grün/gelb/rot.
- **Freigeben** — to approve/release. **Zuweisen / Zuordnung** — to assign / assignment. **Prüfen** — to check/verify.

**Actions & meta**

- **Verlauf** — history / activity log of a document (notes + audit). **Notiz** — note.
- **Eingangskanal** — how it arrived: E-Mail, Upload, Scan, E-Rechnung, Drive.
- **Soft-Delete** — not really deleted; `geloescht_am` (deleted-at), `geloescht_von` (deleted-by),
  `loesch_grund` (reason) are set so the record stays for audit (_revisionssicher_ = audit-proof).
- **Verarbeitungs-Log** — processing log of the external pipeline. **Stufe 1 / Stufe 2** — build phase 1 (read-only) / phase 2 (editing).
- **Überweisung** — bank transfer. **Auswertung** — report/analysis.

---

## Things that will save you confusion

- **There is no backend in this repo.** The browser talks straight to Supabase (Postgres).
  All "API calls" are `supabase.from(...)` calls inside `src/lib/data/queries.ts`.
- **`@/` means `src/`** everywhere (path alias).
- **`routeTree.gen.ts` is generated** — don't edit it; it regenerates from the files in `routes/`.
- **`src/components/ui/*` is generated shadcn** — design _primitives_, not feature code.
  Project look-and-feel decisions live in `components/belege/badges.tsx` and `lib/data/format.ts`.
- The AI extraction itself (the thing that fills in invoice fields) is **not** in this repo — it's a
  separate Python pipeline (`pipeline/db_schema.sql`, `pipeline/prompts/...` are referenced in comments).
  This app _reads and corrects_ what that pipeline produced.
- Comments in the code reference **"Stufe 1 / Stufe 2"** (build phases). Stufe 1 = read-only display;
  Stufe 2 = editing/assigning/approving. That's why some Kanban columns are still placeholders.

---

_Start here: open `app-shell.tsx` for the menu, then `routes/eingangsrechnungen/index.tsx`,
and keep `lib/data/queries.ts` + `lib/data/types.ts` open beside it. That trio explains 80% of the app._
