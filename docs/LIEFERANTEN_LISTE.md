# Lieferanten-Liste (supplier list screen)

The supplier list at `/lieferanten`, in `src/routes/lieferanten/index.tsx`.

This doc covers the 2026-08-27 UI/UX pass, ported here from Immonetz, where it was built first.
The split it rests on is between **portable** components and **repository-specific** wiring: the
same screen exists in Immonetz, Eiffler and Mayestate, and porting means writing adapters rather
than copying the page.

What the port actually cost, as a record for the two hubs still to do: the portable files copied
byte-identical, and the repository-specific work was five things. The page title goes through
`pageTitle()` from `@/lib/brand`, the header row keeps this repo's own layout, three comments name
the repo, and the `lieferanten` i18n block needed its new keys. Everything else applied unchanged,
because this repo's supplier page was line-for-line the same file.

## What the pass asked for, and what it does now

| Asked                                                        | Implemented                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicates panel takes too much vertical space               | Collapsible band, collapsed by default, header reads `Vorschläge zum Zusammenführen · 7`                                                                     |
| Long lists must not push the table down                      | The list scrolls inside the band (`max-h-[320px]`), not the page                                                                                             |
| Supplier names in suggestions clickable                      | Router `Link`s. Plain click navigates, Ctrl/Cmd-click and middle-click open a tab                                                                            |
| Merge action unchanged                                       | Same `MergeSupplierDialog`, same proposed survivor (first record of the group)                                                                               |
| Replace the loose filter switches with one **Filter** button | `FilterPopover` with an active-filter count badge; popover on desktop, bottom sheet on mobile                                                                |
| Filters: Status (All/Active/Deleted) + Without address       | `filterFields` in the route; `aktiv` is the default                                                                                                          |
| Sort from column headers, not a toolbar control              | `SortableColumnHeader` on Supplier, Belege, Erstellt, Zuletzt aktualisiert                                                                                   |
| Column renames                                               | `Name → Lieferant`, `Verbuchte Belege → Belege`, `Aktualisiert → Zuletzt aktualisiert`                                                                       |
| Drop the Frequency column                                    | Removed from the table AND the mobile cards                                                                                                                  |
| Invoices cell shows count and total                          | `InvoiceSummaryCell`, total on top, `{{count}} Belege` under it                                                                                              |
| Drop the row checkboxes                                      | Selection column and the bulk delete/restore bar removed (see below)                                                                                         |
| IBAN column shows the default account only                   | `SupplierIbanCell`. The "+N accounts" chip and the separate "IBAN geändert" badge are gone; a swap turns the IBAN itself amber with the explanation on hover |

Columns are now: `Lieferant | Adresse | IBAN | USt-IdNr | Belege | Erstellt | Zuletzt aktualisiert`.

## The portable half

> **2026-09-01.** The entity-agnostic pieces moved out of `src/components/suppliers/` into
> `src/components/records/`, so the Gesellschaften screens could use the same ones instead of
> importing from a folder named after a different entity. `SupplierToolbar` was renamed
> `ListToolbar` in the move; `FactList`, `PlainSection`, `SectionSkeleton` and
> `InvoiceSummaryCell` kept their names. What stayed in `suppliers/` is what actually knows
> about suppliers: the IBAN cell, the merge band, the bank-account editors. See
> `docs/GESELLSCHAFTEN.md`.

Nothing in these files imports a query, a route, a domain type or an i18n key. They take data,
labels and callbacks as props, which is what makes them liftable into a sibling hub unchanged.

| File                                                   | What it is                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/components/suppliers/types.ts`                    | `SupplierRef`, `MergeSuggestion`, `SupplierLinkComponent`, the prop shapes a host maps onto |
| `src/components/suppliers/merge-suggestions.tsx`       | The collapsible band: count in the header, scroll container inside, one row per suggestion  |
| `src/components/records/list-toolbar.tsx`              | Search field + a slot for the filter button (`ListToolbar`)                                 |
| `src/components/records/invoice-summary-cell.tsx`      | Amount over count, with its own loading state                                               |
| `src/components/suppliers/supplier-iban-cell.tsx`      | The default IBAN; amber + hover explanation when the caller passes a `warning`              |
| `src/components/data-table/sortable-column-header.tsx` | A `TableHead` that sorts, with `aria-sort` and a direction arrow                            |
| `src/components/data-table/filter-fields.ts`           | `FilterField` (select/toggle, with `fieldLabel`) + `countActiveFilters` / `clearFilters`    |
| `src/components/data-table/filter-popover.tsx`         | Renders a `FilterField[]`: trigger with count badge, popover ⇄ bottom sheet                 |

`useTableView` (`src/lib/use-table-view.ts`) gained **`toggleSort(key)`**. The same column flips the
direction, a different column starts ascending. That is what a header click means, and all six
lists using the hook can now use it.

### Two deliberate non-abstractions

- **Links are a component, not an href.** `SupplierLinkComponent` takes a supplier id and returns
  an element. Each hub routes differently, and only the host can build an `<a href>` its own router
  will intercept, which is what keeps Ctrl/Cmd-click and middle-click working without any code.
- **The merge control is a render prop.** `renderAction(suggestion)`. Merging is a host-side
  mutation with a host-side confirmation dialog, so the band never sees it.

## The repository-specific half

| File / symbol                                   | What is repository-specific about it                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/lieferanten/index.tsx`              | Queries (`useLieferanten`, `useLieferantBelegSummen`, `useSupplierDuplicates`, …), page composition, the create dialog, `pageTitle()` for the head |
| `LieferantenMergeSuggestions` (same file)       | Maps `v_supplier_duplicates` rows → `MergeSuggestion[]`, words the match reason, picks the proposed survivor, renders `MergeSupplierDialog`        |
| `filterFields` (same file)                      | The Status/Address filter definitions and the `sortValue` mapping behind them                                                                      |
| `src/components/lieferanten/lieferant-link.tsx` | `LieferantLink`, the one file that knows the detail route is `/lieferanten/$id`                                                                    |
| `src/lib/i18n/locales/{de,en}.ts`               | `lieferanten.list.filter.*`, `lieferanten.list.mergeSuggestions.*`, `steuerId.weitere*`, the renamed `col.*`                                       |

### Filter fields are one shape

Every field renders as a heading plus a control exactly `h-9` tall, the height of the Combobox
trigger. A toggle therefore needs a `fieldLabel` ("Adresse") above the switch's own text ("Ohne
Adresse (16)"); without one it was an unlabelled box beside a labelled dropdown, at a different
height whenever its text wrapped.

## Behaviour worth knowing

- **Status maps onto the existing query, it does not replace it.** `aktiv` → `useLieferanten({
includeDeleted: false })`, exactly the old default. `geloescht` → fetch including deleted, then
  keep only rows with `deleted_at`, exactly what the old "Nur gelöschte" switch did. `alle` is the
  one new state.
- **The suggestion count now matches the rows.** The old panel counted every group the view
  returned but skipped rendering groups whose records were not in the loaded list (deleted ones,
  with the status filter on `aktiv`), so "7 possible duplicates" sat over five rows. Groups are
  resolved before the count is taken.
- **Row selection and bulk actions are gone.** The checkbox column, the selection bar and its bulk
  delete/restore are removed. Deleting and restoring a supplier is still possible **one at a time
  on the detail page** (`$id.tsx`), which is where the reason field and the confirmation already
  live. `useBulkSetLieferantenGeloescht` in `queries.ts` now has no caller. It is left in place
  rather than deleted, since the RPC behind it is unaffected and bulk editing may come back.
- **The IBAN column states the default account and nothing else.** The chip counting a supplier's
  other accounts is gone, and with it this page's `useSupplierBankAccounts()` call;
  `supplier_bank_accounts` is still shown (and edited) on the detail page. A recent swap no longer
  gets its own badge. The IBAN itself goes amber, with
  `belege.badge.ibanGeaendertTitle` (previous account, new account, "bitte prüfen") as the hover
  title. A FIRST capture (`erstmalig`) stays neutral on purpose: it is not a change, and warning on
  it is what teaches people to ignore the warning.
- **Frequency data is untouched.** `v_supplier_invoice_totals.avg_tage` still arrives in `summen`;
  the list just stopped rendering a column that was `zu wenig Daten` in most rows. The supplier
  detail page (`$id.tsx`) computes and shows its own.
- **Mobile keeps its sort control.** The table is `sm:block` only, so the filter sheet carries a
  sort field + direction toggle (`mobileExtra`), the same columns the headers expose.

## Porting to a sibling hub

1. Copy `src/components/suppliers/*`, `src/components/records/*` and
   `src/components/data-table/{sortable-column-header,filter-fields,filter-popover}.tsx`.
   They depend only on that repo's shadcn primitives (`table`, `popover`, `sheet`, `switch`,
   `combobox`, `collapsible`, `skeleton`, `input`) and a `cn` helper.
2. Write the link component (≈10 lines) against that repo's router.
3. Map its duplicate/suggestion source onto `MergeSuggestion[]` and pass its own merge dialog
   through `renderAction`.
4. Declare its own `FilterField[]` and its own `sortValue`.

Watch for: `FilterPopover` imports `@/hooks/use-mobile` (a `matchMedia` hook at the 640px
breakpoint) and the `brand`/`brand-wash`/`brand-dark` Tailwind tokens on the filter trigger. Both
need an equivalent in the target repo. `InvoiceSummaryCell` takes formatters as props, so a
different currency or locale needs no change to the component.

## Open / not done

- Supplier names in the **main table** are still not links; the row itself navigates on click, as
  before. Ctrl/Cmd-click therefore does not open a new tab from the table (it does from the merge
  suggestions).
- With row selection gone there is no bulk delete/restore anywhere in the app. If that is wanted
  back, the mutation hook is still there and the bar can be re-added without a checkbox column
  (e.g. selection via a row menu).
- Filter state is component state, not URL state, so it does not survive a reload or a shared link.
  The receipts list (`eingangsrechnungen`) does this properly via search params if it is ever
  wanted here.
- **The migration for this repo has not been applied yet.** The supplier pages read `is_default`
  and `deleted_at` on `supplier_bank_accounts`; until
  `supabase/migrations/20260827170000_supplier_bank_accounts_default_and_soft_delete.sql` runs
  against this database, those reads fail. Immonetz took the same change as two migrations because
  0008 was already applied there; here both arrive in one file.
- Not verified in a running browser: the app is behind a Supabase login, and this pass was checked
  by `bun run lint`, `tsc --noEmit` and `bun run build`.
