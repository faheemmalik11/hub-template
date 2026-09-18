# Stäy — i18n Progress Tracker

_Separate living doc for the internationalization effort. Last updated: 2026-07-10._

Goal: production-ready i18n. **German stays the default**; **English is selectable in the UI in
every environment** (no localhost gate). Only UI display strings are translated — DB values, OCR/PDF
content, and persisted audit text stay German.

Library: **i18next + react-i18next** (added with bun). Locale persisted in `localStorage`
(`staey.locale`), default `de`.

---

## Status at a glance

| Area                                                 | State                           |
| ---------------------------------------------------- | ------------------------------- |
| Foundation (provider, instance, switch, persistence) | ✅ done                         |
| Incoming-invoice list (`/eingangsrechnungen`)        | ✅ translated                   |
| Incoming-invoice detail (`/eingangsrechnungen/$nr`)  | ✅ translated                   |
| Shared belege badges                                 | ✅ translated                   |
| Shared query-states (error/empty used by invoices)   | ✅ translated                   |
| Central label maps → i18n keys (format.ts)           | ✅ done                         |
| Dashboard, suppliers, bank screens, reports, nav     | ⬜ intentionally German (later) |

---

## Done (2026-07-10) — foundation + incoming-invoice module

### Foundation

- `src/lib/i18n/index.tsx` — i18next instance + `I18nProvider` + `useLocale()` + `tDe` (fixed-German
  translator for persisted text) + re-exported `useTranslation`/`Trans`.
- `src/lib/i18n/locales/de.ts` + `en.ts` — full dictionaries (single source of truth for labels).
- `src/components/layout/language-switch.tsx` — DE/EN header control (works in prod).
- Wired `I18nProvider` as outermost provider in `src/routes/__root.tsx`.
- SSR-safe: server renders `de`; client re-syncs saved locale after hydration (no hydration mismatch).
  `<html lang>` updated client-side on switch.

### Central labels (format.ts)

- `STATUS_META` / `WORKFLOW_META` / `BELEGART_META` reduced to `{ cls }` (styling only).
- Removed German text: `AMPEL_LABEL`, `KANAL_LABELS`, `kanalLabel`, `statusLabel`, `belegartLabel`.
- `VALIDIERUNG_GATES` → ordered key list; `pruefGruende()` → stable reason IDs; UI translates them.
- Added `workflowLabelDe()` (fixed-German) for persisted audit text.
- Removed drift-prone duplicate label sets (`STATUS_OPTIONS`, `ZAHLUNG_OPTIONS`, `KANBAN_PHASEN`).

### Screens/components translated

- `src/routes/eingangsrechnungen/index.tsx` — title/KPIs/filters/options/sort/columns/rows/empty/Kanban.
- `src/routes/eingangsrechnungen/$nr.tsx` — sections, field labels, validation panel, review-reason
  box, direct-debit banner, document type, buttons, dialogs, toasts.
- `src/components/belege/badges.tsx` — Status/Kanal/Ust/Zahlung/Gesellschaft/Belegart/Lastschrift/Konfidenz.
- `src/components/belege/query-states.tsx` — `ErrorState` (title/unknown/retry).

### Audit-safety (verified)

Persisted German kept in `beleg_verlauf` / soft-delete: `Felder geändert: …`,
`Status: <de> → <de>` (via `workflowLabelDe`), `Zugewiesen an …` / `Zuweisung entfernt`,
`Manuell als bezahlt markiert` / `Manuelle Bezahlt-Markierung entfernt`, `Verworfen — kein Beleg`.
Copied bank-transfer reference block also kept German (functional data).

### Checks

`npx tsc --noEmit` ✅ 0 errors · `npx eslint` (changed files) ✅ 0 errors (only pre-existing
`exhaustive-deps` + cosmetic `react-refresh` warnings) · `npx vite build` ✅.

---

## Known remaining hardcoded German in the invoice module (deliberate)

- Route `head` titles: `"Beleg — Stäy"`, `"Eingangsrechnungen — Stäy"` (static route meta,
  no hook; low value — browser tab title).
- The Zahlung-&-Abgleich section's **bank badge labels** (`AbgleichBadge`, `MatchStatusBadge` from
  `src/components/bank/badges.tsx`) stay German — shared bank components, out of scope for now.
- `formatMonthYear` / `formatDate` / `formatEUR` remain German-locale (`de-DE`) by decision —
  this patch is labels only, not regional number/date formatting.

---

## Next steps (future scope)

1. Translate app-shell nav + auth/logout.
2. Bank screens, suppliers, dashboard, reports, offene-posten.
3. Decide whether English mode should also switch number/date formatting.
4. Optionally move locale preference from localStorage to the user profile.
5. Consider splitting `i18n/index.tsx` provider vs. helpers to silence react-refresh warnings.
