# DATEV handover — portable feature folder

The DATEV-Übergabe screen lives here so it can be carried between the Hub repos (Immonetz, Stäy,
Mayestate, Eiffler's accounting module) as a unit. The rule that makes that work:

> **Every file in this folder except `adapter.ts` and `config.ts` is meant to be byte-identical
> across repos.** All intentional differences live in those two. If you are editing any other file
> here for one repo only, stop — what you are changing is probably config.

Checking for drift between two repos:

```sh
diff -r --exclude=adapter.ts --exclude=config.ts \
  <repoA>/src/features/datev-handover <repoB>/src/features/datev-handover
```

In Eiffler the folder lives at `src/accounting/features/datev-handover`, and only `adapter.ts`
differs there (its `config.ts` needed no change). **Do not run that repo's prettier over this
folder**: Eiffler has no `.prettierrc`, so prettier falls back to 80 columns and rewraps every file,
which leaves the diff above reporting drift on all of them and hides real drift in the noise. Its
eslint does not enforce formatting, so the files are fine as copied.

An empty diff means the repos share the screen; anything else is either an update that has not been
carried over yet, or a mistake.

## Why this folder exists

The screen shipped as four independent copies and they had already drifted: Mayestate grew a bounce
banner, Stäy a branded `pageTitle()`, Immonetz a bespoke status pill while still importing the
shared `RouteStatus` and never using it. Each divergence was a reasonable local decision; together
they meant every fix had to be made and reviewed four times, and the shared component the comments
kept pointing at was the one nobody was using.

## What's in the folder

One page, no tabs. The company table is the content; everything else opens over it in a right-side
drawer.

| File                    | Role                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DatevHandoverPage.tsx` | The page: header + page-level send, the one summary line, the toolbar, and the drawer state. Exports `DatevHandoverPage`. |
| `CompanyTable.tsx`      | The table and its mobile cards: setup status, ready/sent counts, last sent, and the contextual row actions.               |
| `SetupDrawer.tsx`       | Configure / edit one company's DATEV destination. The only place an address is ever typed.                                |
| `SendDrawer.tsx`        | The confirmation before an irreversible send, and the result after it. Page-level and row-level both land here.           |
| `HistoryDrawer.tsx`     | One company's previous handovers, straight from `datev_handover_batches`.                                                 |
| `model.ts`              | Pure derivation: setup state, the row action rule, row ordering, the fleet summary, search/filter, byte formatting.       |
| `adapter.ts`            | **Per-repo file #1.** Every `@/…` specifier the folder uses, in one place.                                                |
| `config.ts`             | **Per-repo file #2.** Which directions actually send, the detail-page navigation, the document title.                     |
| `index.ts`              | Public surface: `DatevHandoverPage`, `DatevHandoverConfig`, `istRichtungAktiv`.                                           |
| `PORTING.md`            | This file.                                                                                                                |

## Two constraints that are not styling

Both come from migration 0038 and will bite anyone redesigning this screen again.

1. **The address can never be prefilled or displayed.** `authenticated` holds SELECT on every
   `datev_routes` column EXCEPT `address`, and has no direct INSERT/UPDATE at all; every write goes
   through a SECURITY DEFINER RPC so no grant ever has to include the column. It is a blind write —
   an admin can set or replace an address, nobody can read one back, including their own a second
   after saving. `SetupDrawer` opens the field empty with a "•••• hinterlegt" placeholder and says
   what blank means. That is the maximum the database permits, not a shortcut.
2. **Blank means "leave it alone", never "clear it".** `useSaveDatevRoutes` writes an address only
   for a direction actually typed into, and routes a switch-only change through the status-only RPC.
   Undo that and saving one address wipes the two the drawer did not touch.

## What `config.ts` carries

- `aktiveRichtungen` — which directions this Hub can actually SEND, as opposed to merely store an
  address for. Immonetz and Stäy send `incoming` only; Eiffler has wired `outgoing` as well. Every
  direction not listed still gets its field, its switch and its stored value, marked
  "noch nicht aktiv" — hiding it would quietly drop configuration somebody entered deliberately.
- `onOpenBeleg` — open one incoming invoice, using the Hub's own typed navigate call. Omit in a Hub
  with no detail route; the preview rows are then plain text rather than links to nowhere.
- `documentTitle` — the route's `<title>`.

## The contract with the host repo

`adapter.ts` names every symbol the folder needs. If one does not exist in a target repository, that
is a real gap in its data layer, not something to paper over in the adapter. What has to be there:

1. **Route file** `src/routes/datev-uebergabe/index.tsx` — a thin shell that builds a
   `DatevHandoverConfig` and renders `<DatevHandoverPage config={…} />`. No `validateSearch`: the
   screen has no tabs and no URL state.
2. **`@/lib/data/queries`** — `useGesellschaften`, `useDatevRoutes`, `useSaveDatevRoutes`,
   `useTriggerDatevHandover`, plus:
   - `useDatevHandoverStatus()` → `Record<companyId, { ready, blocked, handedOver }>`, one pass for
     the whole fleet. Replaces the per-company `useDatevReadiness`, which returned only counts and
     could not be totalled across companies.
   - `useDatevHandoverBatches(companyId?, { enabled? })` — no id means the whole fleet (the table's
     last-sent column); an id plus `enabled` is the history drawer. `enabled` is separate from the
     id precisely because a null id already means "fleet", so it cannot also mean "don't run".
3. **`@/lib/datev/attachment-rules`** — `datevBlockReason` / `resolveDatevMime`, imported by BOTH
   the send function and `useDatevHandoverStatus` so the preview and the send cannot disagree about
   which receipts are sendable.
4. **`@/lib/data/types`** — `Gesellschaft`, `DatevRoute`, `DatevDirection`, `DATEV_DIRECTIONS`,
   `DatevHandoverBatch`, `DatevReadyInvoice`, `DatevCompanyStatus`.
5. **`@/lib/data/format`** — `formatDate`, `formatDateTime`, `formatEUR`, `formatNumber`,
   `fehlerText`.
6. **`@/lib/i18n`** — the whole `datevUebergabe.*` key tree in both locales.
7. **Components** — `@/components/ui/*` (button, input, label, switch, skeleton, table, sheet,
   dropdown-menu, collapsible, combobox), `@/components/integrations/route-status` (`RouteStatus`,
   the three-state pill — Immonetz is the only Hub that has it today, so the other three need it
   copied), `@/components/belege/query-states` (`ErrorState`, `TableSkeleton`).
8. **CSS tokens** — `--success/-soft`, `--warning/-soft`, `--danger/-soft` mapped into the `@theme`
   block as `--color-*`. Without them Tailwind v4 emits no rule at all for `text-warning` or
   `bg-danger-soft` and every tone on this screen renders as plain body text, silently.

## Porting steps

1. Copy `src/features/datev-handover/` into the target repo.
2. Rewrite the specifiers in `adapter.ts` if the repository's layout differs (Eiffler: `@acc/…`).
3. Write `config.ts` for that repo (start from this one — the comments say what each field means).
4. Point the target's route file at `DatevHandoverPage`, and delete its `validateSearch: tabSearch`.
5. Copy the `datevUebergabe` block into both locales.
6. Copy `src/lib/datev/attachment-rules.ts` and point the target's send function at it, deleting its
   own `resolveMime` copy and its inline mime allow-list.
7. Add `useDatevHandoverStatus` to the target's `queries.ts`, give `useDatevHandoverBatches` its
   optional id and `enabled` option, and delete `useDatevReadiness` once nothing calls it.
8. Add the status tokens to `styles.css` if they are missing.
9. `tsc --noEmit` — every missing item from the contract list above surfaces here. Add the missing
   exports/keys to the host repo, don't fork the folder.
10. Diff the folder against this repo (command above) and confirm only `adapter.ts` and `config.ts`
    differ.

## Current status

Immonetz only, so far. This is the source copy.

The **bounce banner is now in the folder**, ported back from Mayestate, so that is no longer the
blocker it was. A target repo needs three things beyond the folder itself:

1. `20260901190000_datev_bounced_handover.sql` (or the Mayestate original) applied.
2. The send function minting its batch id BEFORE the send and putting `[ref: <id>]` in the subject.
   Bounce matching is entirely on that string.
3. The pipeline tenant config listing the `datev_bounce` stage. The stage is provider-agnostic and
   supports both Graph and Gmail; it is per-tenant opt-in, so a Hub that does not list it simply
   never records a bounce.

Note that Mayestate's `acknowledge_datev_batch` gates on `is_admin()` while Immonetz's uses
`has_company_access()`. That difference is deliberate and follows each Hub's own access model, so it
is one to keep rather than reconcile when the folder is copied.
