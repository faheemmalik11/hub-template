# Feature: BWA categories & account mapping (Kontenrahmen tab, `/zuordnungsregeln`)

Ported from immonetz's equivalent feature (`docs/BWA_ACCOUNT_MAPPING.md` there). Records what's
actually implemented here and the one thing that's structurally different: **this tab is
currently gated behind a "Coming Soon" placeholder** — everything below exists in code and is
kept up to date, but is not reachable from the UI until that gate is switched off.

## 1. Current state — gated, not deleted

`src/routes/zuordnungsregeln/index.tsx`'s `ZuordnungsregelnPage()` renders `<ComingSoon .../>`
for the `kontenrahmen` tab instead of `<KontenrahmenTab />` (own comment: _"KontenrahmenTab itself
is left in place (not deleted), just not rendered here, so this can come back by swapping
ComingSoon back for it"_). `KontenrahmenTab` and its supporting code are still maintained
underneath — both the company-scoping (§2) and the AI import (§3) landed there even though users
can't reach them today, so the feature is ready the moment the gate is lifted.

## 2. Company-scoped account mapping

`bwa_account_mapping` (migration `0043`) was seeded empty and, unlike immonetz, **has no data at
all yet for any company** — there is no equivalent of immonetz's IMKO/IMGM chart-of-accounts
confirmation here. Migration `0094_bwa_account_mapping_company_scoped.sql` added `company_id`
(FK to `public.companies`, `NOT NULL`) and replaced the `(fiscal_year, account)` unique index with
`(fiscal_year, account, company_id)` — schema/UI only, no data to backfill, validated against a
real Postgres instance including the empty-table assumption's failure guard.

- `src/lib/data/types.ts` — `BwaAccountMapping` gained `company_id: string`.
- `src/lib/data/queries.ts` — `useBwaAccountMapping(fiscalYear, companyId)` requires a company
  (`enabled: !!companyId`); `useImportBwaAccountMapping()`'s payload/`upsert` onConflict include
  `companyId`.
- `KontenrahmenTab` — company `Combobox` (no default company preferred, unlike immonetz's IMKO
  default, since every company starts equally empty here) alongside a searchable fiscal-year
  `Combobox` (`FISCAL_YEAR_OPTIONS`, replacing a plain number input that let the mouse scroll
  wheel silently change the year).
- No business-line dimension anywhere in this repo (`useScopeChips`/`RegelZeile` has no
  `business_line_id` chip) — Stäy Hub replaced that model with direct property↔company assignment
  before this feature landed, so there was nothing to port for it.

## 3. AI-assisted import ("Mit KI importieren") — the ONLY import path

Same design as immonetz: the old manual "Konto;Kategorie-Code" textarea import
(`ImportKontenrahmenDialog`, `parseKontenrahmenCsv`) was removed outright rather than kept
alongside — a tax-advisor file never already carries this app's own category codes. The dialog
owns its own company (single `Combobox`) and fiscal-year selection (`MultiCombobox`, one or more
years) independent of whatever the tab itself is browsing; the upload area is disabled until both
are set. Saving calls `useImportBwaAccountMapping()` once per selected year, sequentially.

- `src/lib/api/chart-of-accounts-extraction-shared.ts` — allowed file-mode MIME types and
  size/char ceilings, identical to immonetz's.
- `src/lib/api/chart-of-accounts-extraction.functions.ts` — `extractChartOfAccounts` server
  function. Same shape as immonetz's, adapted to this repo's own error class
  (`OpenAiApiError` from `./errors`, not immonetz's `AiExtractionError` — this repo has no such
  class). Takes `{ mode: "file", mime, fileBase64 }` (PDF/image) or
  `{ mode: "text", textContent }` (CSV/Excel, parsed to text client-side first). Fetches
  `bwa_categories` and only ever lets the model suggest a code from that list.
- `src/components/zuordnung/ki-import-kontenrahmen-dialog.tsx` — `KiImportKontenrahmenDialog`,
  copied verbatim from immonetz (no immonetz-specific dependencies in that file). XLSX/XLS are
  converted to CSV text client-side via the `xlsx` package (already a dependency here from the
  manual bank-transaction import feature, `src/lib/bank-import/xlsx.ts`) before being sent as
  `mode: "text"`.
- `useExtractChartOfAccounts()` in `src/lib/data/queries.ts` — the mutation wrapper.

The underlying OpenAI Responses API call/schema is identical to immonetz's, which was verified
end-to-end against the live API (2026-08-07) with a synthetic 3-row CSV — see immonetz's own doc
for that verification. Not repeated here since the logic is copy-identical, only the error class
differs.

## 4. What's still open

- **The Kontenrahmen tab needs to actually be un-gated** before any of this is usable by the
  client — swap `<ComingSoon .../>` back for `<KontenrahmenTab />` in `ZuordnungsregelnPage()` once
  that's the right call to make (a product decision, not made as part of this port).
- **No company has any chart-of-accounts data yet.** Unlike immonetz, there is no IMKO/IMGM-style
  copy migration here — every company starts genuinely empty and needs its own import once the
  tab is live.
- **RLS is unchanged** — this screen has no role gating today (any authenticated user can
  view/import for any company), consistent with immonetz's equivalent note.
