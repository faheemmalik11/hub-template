---
name: i18n
description: How to add or change translatable UI text in the this Hub (i18next + react-i18next). Use whenever you add a user-facing string, a new label/badge/toast, a new screen, or touch src/lib/i18n. Explains the German-default / English-selectable setup, the dictionary structure, and the hard rule that DB values and persisted audit text are never translated.
---

# this Hub i18n rules

Production-ready i18n (i18next + react-i18next). German (`de`) is the default; English (`en`)
is selectable in the header language switch in every environment. Foundation added on branch
`feat/extraction-review-ui`; first module wired = incoming invoices.

## Where things live

- `src/lib/i18n/index.tsx` — i18next instance, `I18nProvider`, `useLocale()`, re-exported
  `useTranslation`/`Trans`, and `tDe` (fixed-German translator). Import i18n from here.
- `src/lib/i18n/locales/de.ts` + `en.ts` — the dictionaries. **Single source of truth for label text.**
- `src/components/layout/language-switch.tsx` — the DE/EN header control.
- Provider is wired in `src/routes/__root.tsx` as the OUTERMOST app provider.
- Persistence: `localStorage` key `this Hub.locale`; default `de`; `<html lang>` updates client-side.

## The hard rules (do not break)

1. **Only UI display strings are translated.** Never translate:
   - DB values / enum values / column names (`workflow_status`, `belegart`, `gesellschaft_code`, …).
   - OCR text or invoice/PDF content.
   - **Persisted audit/history text** written to `document_history` / `protokoll` / soft-delete reasons.
2. **Persisted text stays German.** When one string is both shown AND written to the DB, split it:
   the toast/label uses `t(...)` (current language); the persisted `protokoll.text` uses a German
   literal or `tDe(...)` / `workflowLabelDe(...)`. See `$nr.tsx` handlers for the pattern.
3. **German output must not change.** New/edited German keys must reproduce the exact previous
   string (incl. `…`, `—`, `≤`, `§`, and the original mixed quotes `„ "`).
4. **Keys are i18n keys, not DB values** — but they may be _named after_ DB values
   (`documents.workflow.<value>`, `documents.belegart.<value>`); that is not renaming the DB.

## How to translate a component

- `const { t } = useTranslation();` then `t("documents.list.title")`.
- Interpolation: `t("documents.list.row.nr", { nr })`; plurals: `count_one`/`count_other` + `t(key, { count })`.
- A component that renders translated text MUST call `useTranslation()` itself so it re-renders on
  language change. Subcomponents that only receive already-translated strings via props don't need it.
- Unknown/dynamic values: `t(\`documents.belegart.${v}\`, { defaultValue: v })`.

## Styling vs. labels (format.ts)

`src/lib/data/format.ts` keeps only **styling** (`cls`) maps + ordered keys + derivation logic —
no label text. `STATUS_META`/`WORKFLOW_META`/`BELEGART_META` are `{ cls }` only; labels come from
`t("documents.status.<v>")` etc. `pruefGruende()` returns stable reason IDs; `VALIDIERUNG_GATES` is an
ordered key list. Do not reintroduce German label text into format.ts.

## Avoid drift (single source of truth)

Do not create parallel hard-coded label arrays (the old `STATUS_OPTIONS`, `ZAHLUNG_OPTIONS`,
`KANBAN_PHASEN` are gone). Derive option/column/Kanban labels from `t()` over the canonical value
lists (`STATUS_VALUES`, `WORKFLOW_REIHENFOLGE`, …).

## Adding a new key

1. Add it to **both** `de.ts` and `en.ts` under the same path (keep the tree shape identical).
2. German value = exact user-facing German. English value = natural, readable English.
3. Reference it via `t("…")`. Run `npx tsc --noEmit` and `npx eslint <files>`.

## Scope status (extend later)

Translated: incoming-invoice list + detail, shared documents badges, invoice query-states, status/
workflow/belegart/kanal/confidence/validation labels. **Not yet translated (still German):**
dashboard, suppliers, bank screens, reports, app-shell nav, and the two route `head` titles
(`… — this Hub`). When you translate a new module, reuse this foundation and these rules.

## Package manager

Repo uses **bun** (`bun.lock`). Never install with npm / never create `package-lock.json`.
