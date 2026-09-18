---
name: staey-gotchas
description: Known bugs, footguns, hardcoded values, and security caveats in the Stäy Hub. Use before editing, debugging, or planning a feature so you don't trip over existing issues or assume something works that doesn't. Complements docs/CODEBASE_AUDIT.md §9–§10.
---

# Stäy — gotchas & known issues

## Correctness bugs (live in the code today)

- **German number parsing loses data.** On invoice save, `"1.234,56"` → `replace(",",".")` →
  `"1.234.56"` → `Number()` → `NaN` → stored as `null` (silent loss). Only bare decimals work.
  (`eingangsrechnungen/$nr.tsx`.)
- **Company FK not updated.** Editing a company writes `gesellschaft_code` but leaves the FK
  `gesellschaft_id` stale — anything joining on the FK disagrees with the shown code.
- **Objekt has no table.** `objekt_code` is free text on `belege`; the "Objekte" pages just
  aggregate distinct codes. Editing a code can create phantom objects.
- **Soft-deleted invoices still reachable by URL.** `useBeleg(id)` doesn't filter `geloescht_am`,
  and there's no restore UI.
- **No supplier-link UI.** You can edit free-text `rechnungssteller` but cannot set/change
  `beleg.lieferant_id` from the app — that link is created only by the external pipeline.

## Data integrity / performance

- **Upload is non-transactional:** `belege.insert` then `beleg_dateien.insert` (then verlauf) with
  no rollback → mid-failure orphans a row. No duplicate detection on manual upload.
- **Files stored as Postgres `bytea`** (hex over JSON), not Supabase Storage. `belege.storage_path`
  exists but is unused. Large PDFs blow request size + browser memory (whole file hex-decoded in tab).
- **No pagination anywhere.** Every list loads the full `belege` table; the detail page reloads the
  whole table again just to sum one supplier's volume.
- **Writes are untyped (`sb = supabase as any`).** The queries.ts comment says the generated DB type
  is empty — per the audit the generated `integrations/supabase/types.ts` is actually complete, so a
  column typo silently fails at runtime. Two parallel type systems (generated vs hand-written
  `lib/data/types.ts`) can drift.

## Security (verify against the live project, not this repo)

- **Auth gating is client-side only** (`AuthGate`). Real protection = **Supabase RLS**, which is NOT
  in this repo and must be confirmed. The publishable/anon key is hardcoded in `client.ts`. If RLS is
  permissive, data is exposed with the public key.
- Server-side auth (`requireSupabaseAuth`, `supabaseAdmin`, `client.server.ts`) is **dead code** —
  the only server function is an unused `getGreeting` example. `SUPABASE_SERVICE_ROLE_KEY` is not set.
- No role/permission model: any logged-in user can set any `workflow_status` (no state machine) and
  assign to either hardcoded name.

## Hardcoded values that will go stale or surprise you

- Date-range presets hardcoded to **2026** months (`eingangsrechnungen/index.tsx`) — stale in 2027.
- Assignee names: `ZUWEISBAR = ["Anja Kienbaum", "Philipp Netz"]` (format.ts).
- Company-code union hint: `GesellschaftCode = "IMKO"|"IMGM"|"JPGB"|"PNPR"|"NOGR"|"IMOS"` (types.ts).
- Supabase URL + publishable key are string literals in `client.ts` (the `VITE_*` env vars are unused
  by the browser client). Kanban's 3 later columns are hard "kommt mit Stufe 2" placeholders.

## What simply isn't built (don't assume it exists)

Gmail import, OCR, AI extraction, `validierung` computation (all external pipeline); bank-transaction
import, invoice↔transaction matching, missing-receipt detection, approval rules, DATEV export,
Lexware export, the entire `/ausgangsrechnungen` page.

## Build hygiene

Mixed lockfiles: both `bun.lock` and `package-lock.json` present — bun is the intended PM. No tests, no `test` script.

Full detail + severity ranking: `docs/CODEBASE_AUDIT.md` §9 (hardcoded), §10 (bugs/risks), §11 (fix plan), §12 (open questions for the client).
