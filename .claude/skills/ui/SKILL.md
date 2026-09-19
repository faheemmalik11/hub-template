---
name: ui
description: UI conventions for the this Hub — adding routes/pages, the English-code/German-UI language rule, formatting helpers, badges/chips, loading & error states, and the three overlapping status axes (status / workflow_status / bezahlt_am). Use when building or editing any page, label, badge, or user-facing text.
---

# this Hub UI conventions

## Language rule (from CLAUDE.md — non-negotiable)

- **Code in English:** comments, new variable/function/component names, commits.
- **UI text in German:** every string the user sees (labels, buttons, headings, placeholders,
  toasts, empty/error/badge text).
- **Exception:** DB-derived names stay German (`Beleg`, `Lieferant`, `gesellschaft_code`,
  `betrag_brutto`, `workflow_status`, …). Don't rename them.
  Rule of thumb: rendered to user → German; everything else → English.

## Adding a route (file-based, TanStack Start)

A file in `src/routes/` **is** a URL. `$param` = dynamic (bare `$`, e.g. `$nr.tsx` → `:nr`).
Never make `src/pages/` or Next/Remix-style layouts. `routeTree.gen.ts` is auto-generated — don't edit.
Boilerplate:

```ts
export const Route = createFileRoute("/eingangsrechnungen/upload")({
  head: () => ({ meta: [{ title: "Beleg hochladen — this Hub" }] }),
  component: UploadPage,
});
function UploadPage() {
  /* the page */
}
```

Read params with `Route.useParams()`; navigate with `useNavigate()`; link with `<Link to=...>`.
The page renders inside `AppShell` automatically (via `__root.tsx` → AuthGate). To add it to the
top nav, edit the `nav` array in `src/components/layout/app-shell.tsx`.

## Formatting helpers (`src/lib/data/format.ts`) — always use these, don't reinvent

`formatEUR(n)` · `formatNumber(n, digits=2)` · `formatIBAN(s)` (4-groups) · `formatDate(iso)` ·
`formatDateTime(iso)` — all German locale, all return `"—"` for null. `istUstRelevant(satz)`.

## Badges & chips (`src/components/documents/badges.tsx`) — colors/labels come from format.ts

`<StatusBadge status/>` · `<KanalBadge kanal/>` · `<UstBadge ustSatz/>` (>0 → teal "USt 19 %") ·
`<ZahlungBadge bezahltAm/>` (paid→green "Bezahlt" else "Offen") · `<GesellschaftChip code/>` ·
`<KonfidenzDot score/>` (traffic-light: grün ≥0.95, gelb ≥0.8, rot below). Design decisions live
in `badges.tsx` + `format.ts` (label/color maps: `STATUS_META`, `WORKFLOW_META`, `KANAL_LABELS`, `AMPEL_*`).

## Loading / error / empty states (`src/components/documents/query-states.tsx`)

`<TableSkeleton rows cols/>` · `<CardsSkeleton count/>` · `<ErrorState error onRetry/>` ·
`<EmptyState title hint/>`. Standard pattern: `q.isLoading ? <Skeleton/> : q.isError ? <ErrorState/> : <content/>`.

## The three status axes (a known source of confusion — keep them straight)

1. **`status`** (extraction, from AI): `erkannt | zu_pruefen`. Drives list KPIs, list filter, Kanban.
2. **`workflow_status`** (approval chain, 7 states since migration 0002): `eingegangen → in_pruefung →
rueckfrage → freigegeben_assistenz → freigegeben_vorgesetzter → uebergeben_datev → abgeschlossen`.
   Must match the DB CHECK exactly (`WORKFLOW_REIHENFOLGE` in format.ts). Labels/colors in `WORKFLOW_META`.
   The **Kanban is driven by this** dimension. (`zu_pruefen` and `ueberwiesen` are NOT workflow values.)
3. **`bezahlt_am`** (timestamp) + bank match → paid/unpaid ("Bezahlt"/"Offen") — a SEPARATE signal.

## Assignment

`ZUWEISBAR = ["Anja Kienbaum", "Philipp Netz"]` (format.ts) — hardcoded two-name list, no roles.

## Styling

Tailwind v4 utility classes only (no per-component CSS). Merge classes with `cn()` from `@/lib/utils`.
`@/` = `src/`. Brand tokens: `bg-brand`, `text-brand-dark`, `bg-brand-wash`, `bg-brand-tint`.
UI scale/zoom is global via `UIScaleProvider` (`src/lib/ui-scale.tsx`, localStorage key `hv.ui-scale`).

