# Porting the Objekte screens

Both screens (list + detail) live in this folder and are **byte-identical across the Hubs** apart
from `adapter.ts`. Nothing here imports from `@/…` or touches the router's typed route tree, which
is what makes the copy work.

Immonetz is the base. Stäy is ported. Mayestate and Eiffler still run their own older versions of
the two screens (Eiffler's live under `src/accounting/routes/objekte/`).

## Steps

1. **Copy the folder** `src/features/properties/` wholesale.
2. **Rewrite `adapter.ts`.** Two things in it need attention:
   - the import specifiers, if the repository's layout differs (Eiffler's accounting module lives
     under `src/accounting/`, so it would use `@acc/…`);
   - `useObjektGesellschaften()`, which is the one piece of real logic in the file. See below.
3. **Copy `src/components/data-table/zeitraum-optionen.ts`** if the target does not have it yet.
   It is the shared period list every ZeitraumPicker in the Hub reads.
4. **Wire the two routes** (`routes/objekte/index.tsx` and `routes/objekte/$code.tsx`). They are
   thin: a `validateSearch`, a document title, and a `PropertiesConfig` of navigation callbacks and
   slots. Copy Immonetz's and change the titles and the two slots.
5. **Copy the `objekte` i18n block** into both locales, plus `common.sort.*` and the
   `belege.list.filter.zeitraum*` keys the period picker reads, if they are missing.

## `useObjektGesellschaften()` — the part that genuinely differs

This is the relation both screens are about: which companies a property belongs to. The Hubs model
it differently, and the hook's job is to flatten either shape into one index.

| Hub             | Model                                                                                                             | `bereich`         |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| Immonetz        | `property_assignment`: one row per property × **business line** → company. Owned by the Geschäftsbereiche screen. | the business line |
| Stäy, Mayestate | `usePropertyCompanies`: a property is assigned straight to companies.                                             | `null`            |

It must return `{ bereit, byProperty, zuordnungenByProperty }`:

- `bereit` — whether the underlying queries have settled. Keep it honest: the list gates its table
  on the property query alone, so a row can render before this resolves, and the company column
  must then show a skeleton rather than an empty cell. An absent company and a company that has not
  arrived yet are different statements.
- `byProperty` — property id → distinct companies, **deduplicated by code** and sorted. This feeds
  the chips and the company filter.
- `zuordnungenByProperty` — property id → one entry per assignment, **not** deduplicated. This
  feeds the detail page, where collapsing two business lines into one chip would hide the very
  relation the section is about.

## Capabilities: the optional parts of a property

The Hubs do not model a property the same way. Immonetz carries an archive, an ownership type, a
review date and a Drive folder link on the row. Stäy carries the archive only: no `reviewed_at`, no
`ownership_type`, and its folder column is `drive_folder_id`, a Dropbox path the pipeline files
into rather than a link anybody opens.

So the screens read `ObjektDaten` (in `config.ts`), not a Hub's own `Objekt`: the common core is
required, everything else optional. A Hub's own type satisfies it structurally, no mapping needed.

Each optional field is paired with a **flag**, and the screens branch on the flag, never on the
value. `undefined` cannot tell "this Hub has no archive" apart from "this property is not
archived", and a Hub whose table has no `deleted_at` must not render an Archive button that would
silently write nothing.

| Flag                 | Column                        | Off hides                                                                   |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `stammdatenPruefung` | `reviewed_at`                 | the review badge, the review filter, the detail banner                      |
| `archivierung`       | `deleted_at`, `delete_reason` | the status filter, the archived badge, archive/restore, the archived banner |
| `eigentum`           | `ownership_type`              | the badge, the filter, the fact, both form fields                           |
| `driveOrdner`        | `drive_folder_url`            | the fact, the menu item, the form field                                     |

The two write paths (`useCreateObjekt`, `useUpdateObjekt`) only ever send an optional field when
its flag is on, and cast at the call because a Hub's own insert/update type is narrower without the
column. Those two casts are the only ones in the folder.

A Hub that lacks a capability still has to export the hooks behind it, because a hook cannot be
called conditionally. Export a no-op from `adapter.ts` and say in a comment that the flag is what
keeps it from ever being called.

## Config slots

Everything else per-Hub is a slot on `PropertiesConfig`:

- `zuordnungEditor` — supply it where the Hub lets this screen **edit** the assignments (Stäy and
  Mayestate pass their `CompanyAssignmentField`). Leave it out and the section renders read-only,
  which is Immonetz's arrangement: the Geschäftsbereiche screen owns the edit, and two screens
  half-managing one relation is the failure being avoided.
- `zuordnungHinweis` — the line under a read-only list saying where the edit actually lives.
- `schreibweisen` — the known-spellings card, or nothing.
- `zurueckLink` — wraps the back control in the Hub's router link so it stays middle-clickable.
- `oeffneGesellschaft` / `oeffneBereich` — omit either and the corresponding row simply is not a
  link, rather than pointing at a route the Hub does not have.

If a symbol re-exported by `adapter.ts` does not exist in a target repository, that is a real gap in
its data layer rather than something to paper over here. `useBelegeFuerObjektSeiten` and
`useObjektBelegAggregat` in particular are new — see `queries.ts` in this repo for both.
