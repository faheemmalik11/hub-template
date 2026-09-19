---
name: map
description: Architecture, navigation, and file map for the this Hub codebase. Use FIRST for any task in this repo — to understand where code lives, how the layers connect, how data flows browser→Supabase, what's real vs placeholder, and which doc answers a question. Load before editing so you don't re-read the whole tree.
---

# this Hub — codebase map

Internal accounting cockpit ("Buchhaltungs-Cockpit") for a German property company.
It **reads and corrects** invoices that a **Python ingestion pipeline** (Outlook/Graph +
Dropbox → OCR → AI extraction) has already written into Supabase. That pipeline is **not in
this repo**. It runs in the multi-tenant `book-keeping` service
(`github.com/fabiantscheu-ship-it/book-keeping`, branch `dev`, the sibling folder
`../book-keeping` locally), in which this repository is one tenant, with behaviour picked by one
`tenant_config` row edited in that project's admin panel. `pipeline_new/` here is a superseded
copy kept for reading only. Beyond it, there is **no custom backend in this repo**, the browser
talks directly to Supabase (Postgres).

## Stack

- **TanStack Start** (React 19 + TS) — file-based routing (`src/routes/*.tsx` → URLs).
- **TanStack React Query** — all data fetching/caching (`staleTime` 60s).
- **Supabase** (`@supabase/supabase-js`) — Postgres + auth, called from the browser with the
  public/publishable key + user bearer token. Data protection = **Supabase RLS** (not in repo).
- **shadcn/ui** (`src/components/ui/*`, ~46 vendored primitives — read, rarely edit) + Tailwind v4.
- Package manager **bun**. Lint `bun run lint`. Build `bun run build`. Dev `bun run dev`. **No tests exist.**

## The 7 layers (walk down this to read any feature)

```
1 ROUTE   src/routes/<module>/index.tsx, $param.tsx   ← the page = the exported component
2 LAYOUT  src/routes/__root.tsx + src/components/layout/  (providers, AppShell, AuthGate)
3 UI KIT  src/components/ui/*                          ← generic shadcn widgets
4 FEATURE src/components/documents/*, /brand/             ← project pieces (design lives here)
5 DATA    src/lib/data/queries.ts                      ← EVERY DB call (React Query hooks)
6 SHAPE   src/lib/data/format.ts, types.ts            ← labels/formatting + domain types
7 CLIENT  src/integrations/supabase/                   → Supabase tables
```

Data flow: `component → useXxx() hook → supabase.from(table) → Postgres → .data`.
Writes go the same way, then `onSuccess` calls `queryClient.invalidateQueries(...)` to refresh.

## Provider chain (`__root.tsx`)

`QueryClientProvider → UIScaleProvider → AuthProvider → AuthGate → <Outlet/>`.
AuthGate: `!ready`→blank; `!user`→LoginScreen; else `<AppShell>{page}</AppShell>`. Every route
sits behind it. **Gating is client-side only** — real security is RLS on the live project.

## The 80% trio

`src/routes/eingangsrechnungen/index.tsx` + `src/lib/data/queries.ts` + `src/lib/data/types.ts`.
Read those three and you understand most of the app. The nav/module list is `src/components/layout/app-shell.tsx` (`nav` array).

## Routes (all under `src/routes/`)

| URL                                | File                            | Status                                                  |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `/` dashboard                      | `index.tsx`                     | real (KPIs + tiles + last-6 invoices)                   |
| `/eingangsrechnungen`              | `eingangsrechnungen/index.tsx`  | real — list + Kanban, client filters, server FTS        |
| `/eingangsrechnungen/$nr`          | `eingangsrechnungen/$nr.tsx`    | real — view/edit/workflow/assign/paid/notes/delete      |
| `/eingangsrechnungen/upload`       | `eingangsrechnungen/upload.tsx` | real — writes file bytes to Postgres                    |
| `/suppliers`, `/suppliers/$id` | `suppliers/*`                 | real — supplier CRUD (soft-delete)                      |
| `/objekte`, `/objekte/$code`       | `objekte/*`                     | real but **derived** (distinct `objekt_code`, no table) |
| `/auswertungen`                    | `auswertungen/index.tsx`        | real — sums + recharts                                  |
| `/protokoll`                       | `protokoll/index.tsx`           | real — reads `processing_log` (pipeline output)      |
| `/ausgangsrechnungen`              | `ausgangsrechnungen/index.tsx`  | **PLACEHOLDER** (static empty state)                    |

## Real vs. not-in-repo

- **Real & wired:** login, invoice list/detail/edit, notes, soft-delete, workflow-status + assignment
  - paid toggle, supplier CRUD, manual upload (bytes → Postgres).
- **External pipeline (the `book-keeping` service, not this repo):** Outlook/Dropbox import,
  OCR, AI extraction, `validierung`, dedup. Change it there, never here.
- **Not built anywhere:** bank-transaction import, invoice↔transaction matching, missing-receipt
  detection, approval rules/roles, DATEV/Lexware export, Ausgangsrechnungen.

## Authoritative docs (read the matching one instead of re-scanning code)

- `READING-GUIDE.md` — layer-by-layer newcomer walkthrough + German glossary.
- `docs/CODEBASE_AUDIT.md` — deepest reference: every hook, flow trace, bugs/risks (§10), hardcoded data (§9).
- `docs/EINGANGSRECHNUNGEN_FEATURE.md` — the main invoice screen in detail.
  The live one is `book-keeping`.
- `docs/PIPELINE-OVERVIEW.md` — a different client's (immonetz) legacy pipeline; context only.
- `docs/PROJECT-ROADMAP.md` — client's 7-step product vision. `docs/HUB-ACTION-ITEMS.md` — front-end to-dos.
- `supabase/schema.sql` — version-controlled snapshot of the live DB schema (not applied from here).
- `CLAUDE.md` — language convention + project shape (READ THIS; rules override defaults).

## Related skills

- `instructions` — standing team rules to follow on EVERY task (load at the start).
- `data-layer` — how to add/change Supabase reads & mutations.
- `ui` — routes, badges, formatting, German/English rule, the 3 status axes.
