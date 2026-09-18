# Gesellschaften (companies list + detail)

The two company screens, `/gesellschaften` (`src/routes/gesellschaften/index.tsx`) and
`/gesellschaften/$id` (`src/routes/gesellschaften/$id.tsx`).

This doc covers the 2026-09-01 UI/UX pass, which brought both screens onto the pattern the
supplier screens established (`docs/LIEFERANTEN_LISTE.md`) and closed two data gaps found while
reading the code.

## What the pass changed

### List

| Before                                                                                                   | Now                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loose search input, a bare "Archivierte anzeigen" checkbox, and a `SortControl` dropdown, all on one row | `ListToolbar` (search) + `FilterPopover` (everything else) + `FilterPills` under it                                                                                                                  |
| Archived was a boolean: active, or active-plus-archived                                                  | Status is three states, `aktiv` (default) / `archiviert` / `alle`, so "what did I archive" is reachable                                                                                              |
| No area filter                                                                                           | Select: all / Hospitality / Stäy RE / no area                                                                                                                                                        |
| No way to see which companies file nowhere                                                               | Toggle "Ohne Ordner (N)", counted over the loaded companies                                                                                                                                          |
| Sorting from a toolbar dropdown                                                                          | `SortableColumnHeader` on Code, Name, Objekte, Verbuchte Belege, Erstellt, Aktualisiert; the dropdown survives inside the filter sheet on mobile (`mobileExtra`), since the table is `sm:block` only |
| Default sort: `updatedAt desc`                                                                           | Default sort: `code asc`                                                                                                                                                                             |
| Columns: Code, Name, Verbucht, Erstellt, Aktualisiert                                                    | Adds **Bereich** and **Objekte**                                                                                                                                                                     |
| Totals rendered inline, twice (table + cards)                                                            | `InvoiceSummaryCell`, one component, both renderings                                                                                                                                                 |

Columns are now `Code | Name | Bereich | Objekte | Verbuchte Belege | Erstellt | Aktualisiert`.

Property counts come from `usePropertyCompanies()` × `useObjekte()`, both unscoped single requests
that feed every row. A property can belong to several companies at once (migration 0083), so the
number counts **links**, not rows in `objekte`. While either query is in flight the cell shows a
skeleton rather than `—`: an em dash there is an affirmative "owns nothing" printed before
anything is known.

### Detail

| Before                                                                                       | Now                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Two equal-weight header buttons (Bearbeiten + Archivieren)                                   | Primary "Bearbeiten" + a `⋮` menu, the shape the supplier and invoice detail pages use                                                   |
| No route out to the company's other configuration                                            | `⋮` links to `/datev-uebergabe` and `/objekte`                                                                                           |
| Hand-written `<dl>` for master data                                                          | `FactList`, shared with the supplier and invoice detail pages                                                                            |
| Grid `1fr / 1.1fr`                                                                           | Grid `minmax(0,1fr) / minmax(0,1.7fr)`, matching the supplier page                                                                       |
| Properties were an unlabelled chip strip inside the Stammdaten card, hidden entirely at zero | Their own section with a count, an empty state and a link to `/objekte`                                                                  |
| Invoice list showed everything, always                                                       | `ZeitraumPicker` on the section heading (months / quarters / years derived from this company's own invoices, plus a custom range)        |
| Count + total in a tinted box above the table                                                | On the heading line, as a subtitle, the way the supplier page states them                                                                |
| Desktop table only                                                                           | Cards below `sm`, table above, both windowed                                                                                             |
| One page-level skeleton                                                                      | `SectionSkeleton` per section                                                                                                            |
| Archive confirm nested inside an `AlertDialogTrigger` in the header                          | State-driven `AlertDialog` rendered outside the `⋮` menu (selecting a menu item unmounts anything rendered inside it before it can open) |

## The two data gaps this closed

### 1. `companies.booking_basis` had no UI at all

`booking_basis` (`'invoice_date' | 'payment_date'`, migration 0041) decides which date puts an
invoice into a period in the Kostenanalyse. It is read in `src/lib/data/use-bwa-scope.ts:214` and
`src/features/cost-analysis/kostenanalyse.tsx:182`, both with `?? "payment_date"`.

Nothing anywhere in the Hub wrote it. Every company therefore ran on the payment-date fallback
unless someone had set the column by hand in SQL. It is now a `Select` in the edit dialog and a
fact on the Stammdaten card.

Two details worth keeping:

- The card shows the **effective** value, not the stored one: a `NULL` renders as "Zahlungsdatum"
  rather than as `—`, because a blank would hide a decision that is in fact being made.
- `speichern()` treats `payment_date` on a company whose column is `NULL` as **no change**, so
  opening and saving the dialog does not write a row for a value that was already in force.

### 2. `drive_folder_id` was printed raw

The Dropbox filing folder (migration 20260831170000) was rendered as its provider id
(`id:aBc123…`) — unreadable, unverifiable, and the same shape for every company, so the one field
saying where a company's documents land said nothing. It now resolves to a path
(`Buchhaltung / 2026 / IMKO`) by walking `parentId` through `useFilingFolders()`, with a cycle
guard, falling back to the raw id when the folder list has not loaded or the folder is gone. That
fallback is deliberate: an id that resolves to nothing is itself worth seeing.

### Also surfaced: DATEV routing

A compact section states, per direction, whether an upload address is configured and switched on,
reading `useDatevRoutes()`. It never shows an address — the DB refuses `SELECT` on
`datev_routes.address` — which is fine, because the question on this page is only "would a
handover reach anyone". Labels are reused from `datevUebergabe.*`.

## Modular extraction

The entity-agnostic pieces moved out of `src/components/suppliers/` (named after one entity, used
by three screens) into **`src/components/records/`**:

| File                               | Export               | Was                                                            |
| ---------------------------------- | -------------------- | -------------------------------------------------------------- |
| `records/list-toolbar.tsx`         | `ListToolbar`        | `suppliers/supplier-toolbar.tsx` → `SupplierToolbar` (renamed) |
| `records/fact-list.tsx`            | `FactList`, `Fact`   | `suppliers/fact-list.tsx`                                      |
| `records/plain-section.tsx`        | `PlainSection`       | `suppliers/plain-section.tsx`                                  |
| `records/section-skeleton.tsx`     | `SectionSkeleton`    | `suppliers/section-skeleton.tsx`                               |
| `records/invoice-summary-cell.tsx` | `InvoiceSummaryCell` | `suppliers/invoice-summary-cell.tsx`                           |

None of them imports a query, a route, a domain type or an i18n key — they take data, labels and
formatters as props. Importers updated: `routes/lieferanten/index.tsx`,
`routes/lieferanten/$id.tsx`, `features/invoice-detail/InvoiceDetailPage.tsx`.

What stayed in `src/components/suppliers/` is what genuinely knows about suppliers: the IBAN cell,
the merge band, the bank-account dialog and drafts, the extracted-accounts list.

### Porting these screens to a sibling hub

1. Copy `src/components/records/*` and
   `src/components/data-table/{sortable-column-header,filter-fields,filter-popover,filter-pills,table-pagination,zeitraum-picker}.tsx`.
2. Copy `src/lib/use-table-view.ts` and `src/lib/use-infinite-rows.ts`.
3. Repository-specific work is the same short list the supplier port needed: `pageTitle()` from
   `@/lib/brand`, the header row's own layout, the `gesellschaften` i18n block, and the route's own
   `filterFields` / `sortValue` / query hooks.

Watch for: `FilterPopover` needs `@/hooks/use-mobile` and the `brand` / `brand-wash` /
`brand-dark` Tailwind tokens; `ZeitraumPicker` takes every label as a prop but expects a
`zeitraumToRange`-shaped helper on the host side.

## The invoice list is fetched, not just windowed

The first cut of this pass used `useInfiniteRows`, which windows an array that has **already been
fetched whole**. The request behind the company detail page was still:

```
GET /rest/v1/invoices?select=*&...&offset=0&limit=1000
```

...issued through `fetchAllRows`, which pages until exhausted — so a company with 3,000 invoices
sent three of those. `select=*` on `invoices` means every column, and `invoices` carries
`embedding` (a pgvector, serialised as a JSON array of ~1500 numbers per row), `ocr_fulltext` (the
document's entire OCR text), `fts` (a tsvector) and the `extracted` / `validation` / `positions`
jsonb blobs. None of it is rendered. The page moved megabytes to draw five columns.

All three master-data detail pages (company, supplier, property) had the same bug.

### What it is now

**Narrow columns.** `BELEG_ZEILE_SPALTEN` in `queries.ts` lists the ten scalar columns these tables
actually render; `BELEG_ZEILE_SPALTEN_UST` adds `vat_rate` and `tax` for the property page's VAT
badge. Keep them in step with the pages — a column added to a cell and not to this list renders as
undefined, not as an error.

**Real paged fetching.** `useBelegeFuerGesellschaftSeiten` and `useBelegeBySupplierSeiten` are
`useInfiniteQuery` over `.range()`, `BELEG_SEITEN_GROESSE` (50) rows per scroll, with
`count: "exact"` so the header can state the real total without loading it. The period is a
**server** filter (`gte`/`lte` on `document_date`), so picking a quarter narrows the query instead
of hiding rows that were fetched anyway.

Both order by `document_date DESC, id ASC`. The second key is not cosmetic: `document_date` alone
is not a unique ordering, and Postgres is free to return same-date rows differently per request,
which duplicates and drops rows across a `range()` boundary.

**Aggregates stay whole, but narrow.** The header total, the period picker's options, the
direct-debit count, the unusual-amount baseline and the foreign-property warning all describe the
_complete_ set, so none can come from one page. `useGesellschaftBelegAggregat` /
`useLieferantBelegAggregat` fetch `BELEG_AGGREGAT_SPALTEN` — five scalar columns, roughly 50 bytes
a row — for that and nothing else. `detectUnusualAmounts` was narrowed to
`Pick<Beleg, "id" | "amount_gross" | "document_date">` so it accepts that projection.

This is still O(rows), and it is the remaining known cost. Pushing it into Postgres needs an RPC
that reproduces each page's matching rule exactly. **`invoices_kpis` will not do**: it matches a
company by `company_code`, where these pages match by `company_id` with a code fallback (see
`gesellschaftBelegFilter`), so its totals would disagree with the rows underneath — which is worse
than the current state, not better.

The count and the sum now come from two different queries and are gated separately. Sharing one
readiness flag meant whichever landed first published the other's zero as a settled figure.

### The sentinel hook

`useFetchNextSentinel` (`src/lib/use-fetch-next-sentinel.ts`) drives the `fetchNextPage()` calls.
It was previously a private copy inside `components/bank/match-panel/manual-search.tsx`; that copy
is gone and the file imports the shared one.

Both it and `useInfiniteRows` observe **every mounted sentinel**, not just the most recent. These
screens render the same list twice — a table above `sm`, cards below — and both stay in the DOM at
every width, one merely `display:none`. Keeping a single node meant the second sentinel to mount
disconnected the first, so on a wide window nothing was observed and scrolling fetched nothing. A
hidden node never intersects, so observing both is safe. Removal uses React 19's ref-callback
cleanup, which takes out exactly the node that unmounted; reacting to a `null` argument could only
clear all of them and would take a still-mounted sibling with it.

`useInfiniteRows` survives for lists that genuinely are already in memory (the supplier's bank
accounts, the property page's invoices). Its doc comment now says plainly that it does not reduce
fetching, which is the confusion that produced this bug.

### Not done here

`useBelegeByProperty` (the property detail page) got the narrow `select` but is still
`fetchAllRows` — it was outside this pass's two screens. It should get the same paged treatment.

## Still open

- **Access is not shown here.** `user_company_access` decides who may see a company
  (`useSetCompanyAccess`, `docs/ROLES_AND_ACCESS.md`); it is still only editable on the team
  screen, not visible from the company.
- **Approval rules are not shown here.** `useApprovalRules()` carries `company_id`, so a
  "N rules target this company" line is available, but the pass did not add one.
- **Opening balances** (`fiscal_year, account, company_id`) are not surfaced.
- **The area filter's counts are not shown.** Unlike "Ohne Ordner (N)", the area options do not
  carry how many companies each would match.
- **Property counts are client-side.** Fine at this table size; if `property_companies` grows,
  this wants a view like `v_company_invoice_totals` rather than two unscoped fetches.
