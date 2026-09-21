# Guided tours (this client)

Ported from a sister Hub to reach full page parity. A tour is a short, step-by-step overlay that
points at real elements on a page, opens automatically on a user's first visit to that page, and
can be reopened any time from the header button. Per-user progress is stored in the database, so a
dismissed or completed tour is not offered again, full stop. `version` is still recorded on the
row but no longer decides anything: gating on it meant a bump replayed the tour for everybody who
had already sat through it, which reads as the app having forgotten rather than as an update
(Saskia hit this live on a call). A tour worth showing again is a new tour with a new `id`.

Two ways a tour ends, and both count. Reaching the last step or pressing Überspringen records it,
and so does navigating away while it is open, as `skipped`. That last one used to record nothing,
which is what made the onboarding tour keep coming back: its checklist rows are links to the screen
where each step is done, so leaving mid-tour is the ordinary path through it.

## Engine

- `src/kit/components/tour/` provides `TourProvider`, `TourButton`, the seen-store contract, and the
  `data-tour` target resolver. The kit's `Shell` renders the sidebar anchors itself
  (`data-tour="shell-nav"` on the nav body, plus one per nav group from the `tourId` prop).
- `src/components/layout/app-shell.tsx` wires it up: `tourId="shell-nav-*"` on each nav group,
  `<TourProvider tours={tours} labels={tourLabels} seenStore={tourSeenStore}>` around the shell,
  and a `<TourButton />` in the header actions.
- `src/lib/tour/tours.ts` — every tour spec plus `useTours()`, which maps a route path (or a
  detail-path regex) to a built `TourDefinition`. `useTourLabels()` supplies the button/nav copy.
- `src/lib/tour/use-tour-seen-store.ts` — reads/writes per-user progress via React Query.
- `supabase/migrations/20260904130000_tour_progress.sql` — `tour_progress` table
  (`user_id, tour_id, version, status, last_step`), RLS policy `tour_progress_own_rows`
  (`user_id = auth.uid()`), and a `touch_tour_progress` trigger. Applied to the live DB.

## How a spec works

Each `TourSpec` is `{ id, version, namespace, steps }`. A step is `{ target, key, placement? }`.
`build()` turns each step into `{ target, title: t(namespace.key.title), content: [paragraph
(namespace.key.text), info callout (namespace.key.hint)], placement }`. Copy lives under the
`tour.*` namespace in `src/lib/i18n/locales/de.ts` and `en.ts` (German is what users see).

**A step whose `data-tour` target is not in the DOM is skipped silently**, which reads as the tour
jumping or closing early. So specs only offer a step when its anchor is really mounted: nav steps
only on desktop, write-only controls only for users who may write, and tab panels only for the
active tab (Radix unmounts inactive panels).

## Coverage

Tours exist for every real page. Route → spec in `tours.ts`:

- Overview `/`, incoming list `/eingangsrechnungen`, outgoing list `/ausgangsrechnungen`,
  mailbox `/postfach`, reconciliation `/offene-posten`.
- Master data lists: `/lieferanten`, `/kunden`, `/gesellschaften`, `/objekte`
  (header / toolbar / list). The toolbar anchor is the `dataTour` prop on
  `src/components/records/list-toolbar.tsx`; `objekte` anchors live in
  `src/features/properties/objekte-liste.tsx`.
- Master-data detail (`DETAIL_PATHS` regexes): `/lieferanten/$id`, `/kunden/$id`,
  `/gesellschaften/$id`, `/objekte/$code`, `/eingangsrechnungen/$nr`, `/banktransaktionen/$id`.
  Invoice-detail anchors live in `src/features/invoice-detail/InvoiceDetailPage.tsx`; property
  detail in `src/features/properties/objekt-detail.tsx`.
- Rules / tax: `/ausschlussregeln`, `/kategorien` (single, untabbed — one `assignment-categories`
  step), `/zuordnungsregeln` (tabs `regeln|spielplatz|vorschlaege`, step follows `?tab=`),
  `/ust-regeln`, `/steuerruecklage`, `/freigabe-regeln`, `/dateibenennung`.
- Bank: `/bankkonten` (tabs `konten|pleo|manuell` via `?tab=`; `pleo` has no panel anchor, so no
  panel step there), `/banktransaktionen`.
- Uploads: `/eingangsrechnungen/upload`, `/ausgangsrechnungen/hochladen`.
- Admin: `/auswertungen` (anchors in `src/features/cost-analysis/kostenanalyse.tsx`),
  `/benachrichtigungen`, `/team`, `/protokoll`, `/papierkorb`, `/datev-uebergabe` (anchors in
  `src/features/datev-handover/DatevHandoverPage.tsx`), `/manuelle-buchungen`, `/opos-whitelist`.

Tours behind a page permission are only mapped when the user has it (`freigabe-regeln`,
`dateibenennung`, `auswertungen`, `team`, `protokoll`, `papierkorb`); `opos-whitelist` and
`benachrichtigungen` are always mapped but gate the write/settings step.

## Deliberately excluded

- `/bankverbindungen` — a redirect-only stub to `/bankkonten`, no UI to anchor.
- Business lines (`geschaeftsbereiche`) — no such route in this client (a sister Hub has it, this client does not).
  The a sister Hub copy that referenced business lines was reworded on the way in.
- The a sister Hub LexOffice-tab tour and outgoing "neu" tour — this client has no matching screens.

## Differences from a sister Hub worth knowing

- The customer copy still mentions LexOffice: this client genuinely uses LexOffice (36 references in the
  app), so that wording is correct here, unlike the business-line wording which was removed.
- Overview omits the "spend by company" step (that panel is not on this client's dashboard).
- Team uses a simplified two-step tour (this client's screen is simpler than a sister Hub's tabbed matrix).
- Reconciliation is a single four-step tour (intro, tabs, filters, list) rather than a sister Hub's
  two tab-split tours; the `?tab=belege|fehlend` branches are conditionally rendered, so the same
  anchor names live in both branches and resolve to whichever tab is mounted.

## Verifying the port

- `npx tsc -p tsconfig.json --noEmit` and `npx eslint` are clean.
- Every `target:` in `tours.ts` resolves to a `data-tour` anchor (literal in markup, the
  `dataTour` prop on ListToolbar, or a kit-rendered `shell-nav*` anchor).
- Every `tour.<namespace>.<key>` referenced has `title` / `text` / `hint` in both locales.
- To re-offer a tour to a test user, delete their rows in `tour_progress`. Bumping the spec
  `version` no longer does it, by design.
