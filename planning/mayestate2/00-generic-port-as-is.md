# Tier 1 — generic, valuable, port as-is (or with trivial renaming)

Points 1–9. Each of these is missing from the template, carries no mayestate-specific business
logic, and needs no stripping before a port.

## 1. Bulk data export tool

Full-database CSV/ZIP export, organized by group (documents, master data, rules, bank, access),
with a "download everything" action and one-click-per-table export.

- Files: `src/routes/export/index.tsx` (251 lines), `src/lib/data/table-export.ts` (365 lines)
- Template equivalent: **none**. Grepped for `EXPORTABLE_TABLES`/`table-export` — zero hits.
- Verdict: **generic as-is**. No client name, no business logic — just a table list and CSV
  writer. Any client would want "export my data."
- Size: small-medium (~2 files, ~600 lines)

## 2. MFA / two-factor authentication

TOTP-based 2FA via Supabase Auth's native MFA (`supabase.auth.mfa`), wired into sign-in and a
settings dialog to enroll/verify factors.

- Files: `src/lib/mfa.ts` (30 lines), `src/components/auth/two-factor-dialog.tsx` (483 lines),
  wired in `src/components/layout/auth-gate.tsx`
- Template equivalent: **none**. No `src/components/auth/` directory at all; grepped for
  mfa/2fa/factor — zero hits.
- Verdict: **generic as-is**. Pure Supabase Auth feature, no client-specific data.
- Size: medium (~3 files, ~550 lines)

## 3. Document types catalogue (admin screen)

Editable taxonomy of document types — code, label, "maps from" spelling aliases (so OCR output
text folds onto a canonical type), a fallback/default type, active/inactive (never hard-deleted,
since a booked document must stay resolvable).

- Files: `src/routes/dokumenttypen/index.tsx` (468 lines); backing table/functions already have
  their own migrations (`20261013140000_client_document_type_catalogue.sql`,
  `20261013160000_document_types_come_from_the_catalogue.sql`,
  `20261013190000_a_document_type_says_what_it_means.sql`)
- Template equivalent: **none as a screen**. `document_type_canonical()` and a `document_type`
  column exist in the template's schema/data layer, but there is no admin screen to maintain the
  taxonomy — it appears to be a fixed/hardcoded set there.
- Verdict: **generic as-is**. Any client ingesting documents via OCR needs a way to manage type
  aliases without a migration.
- Size: medium (1 route file, but real schema work already proven out)

## 4. SharePoint browsing/search via MS Graph

Extends the existing mailbox-folder-picker mechanism to also browse SharePoint sites/folders and
full-text search across SharePoint, on the same app-only Graph token the mailbox already uses.

- Files: `src/lib/graph/client.server.ts`, `drive-folders.server.ts`, `search-sharepoint.server.ts`
  (~260 lines total)
- Template equivalent: **partial** — the template's `src/lib/graph/` has mailbox folder-picking
  and DATEV-handover mail-sending (same as mayestate2), but **no SharePoint browsing/search at
  all**.
- Verdict: **generic as-is**. Nothing mayestate-specific; useful to any client whose documents
  live in SharePoint/OneDrive rather than (or alongside) a mailbox.
- Size: small (3 files)

## 5. Confidence/recognition-threshold admin screen

Tunes the OCR/AI-extraction pipeline's routing thresholds — a "relevance" floor, a non-invoice
ceiling, and traffic-light (green/yellow) bands for auto-approval confidence — edited as whole
percents, stored as fractions, with an ordering constraint enforced both client-side and in the
DB.

- Files: `src/routes/erkennungsschwellen/index.tsx` (235 lines); table has its own migration
  (`20260824230000_confidence_settings.sql`)
- Template equivalent: **none**. Zero hits for `confidence_settings`/`ampel_green` anywhere in
  the template.
- Verdict: **generic as-is**. Any client running the same ingestion pipeline needs to tune these
  thresholds without a developer.
- Size: small-medium (1 route, backed by an existing-pattern settings table)

## 6. Document-intake triage log ("Posteingang")

A unified log of everything that arrived — tabs (all/open/done), source badge (mail/scan/upload),
per-item outcome badge, sender/subject/type/company columns, a detail sheet — distinct from the
mailbox-configuration screen (`postfach`/`inbox`).

- Files: `src/routes/posteingang/index.tsx` (371 lines),
  `src/components/posteingang/posteingang-detail-sheet.tsx`
- Template equivalent: **none** as a screen, but the underlying table (`imported_messages`)
  already appears in the template's generated Supabase types — the data exists, nothing reads it
  into a screen.
- Verdict: **generic but needs one piece stripped**: the "private post" filter/badge on this
  screen is downstream of the `privat` feature (see `01-generic-needs-generalizing.md`, point 10)
  and should be stripped or made conditional on whether that feature is also ported. The rest —
  "what arrived, where from, what happened to it" — is generic.
- Size: medium (1 route + 1 detail component, reading an existing table)

## 7. Voice dictation → create a document

Record a short voice note describing an expense, transcribe it, let the user edit the transcript,
then upload it as a new document with the transcript attached as context.

- Files: `src/components/belege/dictate-beleg-button.tsx`, reusing
  `src/components/voice/voice-orb.tsx` + `use-voice-recorder.ts`
- Template equivalent: **none**. The template's voice feature
  (`src/components/documents/voice-search-button.tsx`) only covers voice *search*, and is actually
  a more advanced build than mayestate2's own voice-search button (ported from a different
  client, "immonetz" — real-time mic-reactive glow, Safari/codec fallbacks). Mayestate2's
  voice-search is strictly behind and **not worth porting**; its dictation-to-upload feature is
  the one piece with no counterpart (see point 12 in `01-generic-needs-generalizing.md`).
- Verdict: **generic as-is**, small, reuses primitives the template would still need to add (the
  recorder/orb) unless it already has equivalent primitives buried in its voice-search build —
  worth checking before porting.
- Size: small (1 dialog component)

## 8. Region-restricted sign-in

Blocks sign-in from outside a configured list of countries (geo-IP from the hosting platform's
header), with a per-account timed exception.

- Files: `src/lib/region.ts` (139 lines) + test, `src/lib/api/region.functions.ts` (67 lines)
- Template equivalent: **none**.
- Verdict: **generic but needs stripping**: the mechanism (geo-IP header → allow/deny → timed
  exception) is generic and valuable, but the hardcoded "geographic Europe" country list is this
  client's own policy, not a universal default — it should become a per-client setting, not
  baked-in code.
- Size: small (2 files)

## 9. Client-side crash logging to the database

Persists a browser crash (message/stack/boundary) to a `client_error_log` table so an admin can
see it later, independent of any third-party error service.

- Files: `src/lib/error-log.ts` (31 lines)
- Template equivalent: unclear — the template has `error-capture.ts`, `error-page.ts`,
  `lovable-error-reporting.ts` but no DB-backed log found in the same grep pass; worth a
  two-minute check before porting, but low stakes either way.
- Verdict: **generic as-is**, trivial.
- Size: tiny
