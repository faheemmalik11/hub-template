# Übersicht: period filter

The Overview page (`src/routes/index.tsx`, route `/`) shows its figures for one selected period
instead of for all time. One dropdown governs the whole page.

## What was asked for

The invoice volume tile showed every invoice ever ingested. That number only grows, says nothing
about how a month is going, and could not be checked against any view of the invoice list. The ask
was a period dropdown on the Overview with five choices, with every card following the selection,
and a way to reach the full detail on the respective page.

## The five periods

Defined in `src/lib/data/format.ts` as `OVERVIEW_PERIODS`, in dropdown order:

| Value              | Range (`overviewPeriodRange`)                      | Label                       |
| ------------------ | -------------------------------------------------- | --------------------------- |
| `alle`             | no bounds at all                                   | "Gesamter Zeitraum"         |
| `letzte-30-tage`   | today and the 29 days before it                    | "Letzte 30 Tage" (default)  |
| `aktueller-monat`  | 1st to last day of the current month               | "August 2026" (month, year) |
| `letzter-monat`    | 1st to last day of the previous month              | "Juli 2026" (month, year)   |
| `letzte-6-monate`  | 1st of the month 5 months back to end of this one  | "Letzte 6 Monate"           |
| `letzte-12-monate` | 1st of the month 11 months back to end of this one | "Letzte 12 Monate"          |
| `aktuelles-jahr`   | 1 Jan to 31 Dec of the current calendar year       | "Jahr 2026"                 |
| `letztes-jahr`     | 1 Jan to 31 Dec of the previous calendar year      | "Jahr 2025"                 |

The two rolling options cover whole months, not a rolling 180/365 days, so their labels can name
months. The two year options are calendar years and are named by their year, the same way the month
options are named by their month: "current year" and "last year" would both have to be worked out
against today's date.

`alle` has open bounds (`{ von: null, bis: null }`), which `inDateRange` treats as no date test at
all. Records with no date count in that answer, exactly as they do in the list when its period
filter is off.

Labels are built in `overviewPeriodLabel` in `src/routes/index.tsx`; the two month options come from
`formatMonthYear`, the rest from `home.zeitraum.*` in `src/lib/i18n/locales/{de,en}.ts`.

## Where the selection lives

In the URL, as `?zeitraum=`, validated by the route's `validateSearch`. An unknown value falls back
to `letzte-30-tage`, which is also what the page opens on with no search param at all. That makes a view of the page linkable and keeps the period when you come back
from a document.

## What follows the period

| Tile / block                                                                         | Scoped by                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eingangsrechnungen (count, zu prüfen, erkannt, volume)                               | `invoices.document_date`, the same column the invoice list filters on                                                                                                                                              |
| Objekte (count)                                                                      | `properties.created_at`, i.e. properties ADDED in the period. It used to be distinct `property_code` values across invoices, which counts the properties that happen to have an invoice rather than the properties |
| Kostenanalyse (Rohertrag, or the invoice volume fallback for the assistant role, A7) | the period's invoices and outgoing invoices, plus `useManualBookings(null, von, bis)`                                                                                                                              |
| Ausgangsrechnungen (count)                                                           | `outgoing_invoices.voucher_date`                                                                                                                                                                                   |
| Lieferanten (count)                                                                  | `suppliers.created_at`, i.e. suppliers ADDED in the period                                                                                                                                                         |
| "Zuletzt eingegangen" list                                                           | the same invoice subset, newest received first                                                                                                                                                                     |

The master-data tiles count what was added, not what exists, so their captions read "neu angelegt"
rather than "im Stamm". Three under a caption saying "im Stamm" would be read as the creditor list
having shrunk to three.

Not scoped, and the line beside the dropdown says so: the **pipeline status**, which is current
system state and has no period to be in.

Invoices with no `document_date` are excluded, because the invoice list's own period filter cannot
match them either. `created_at` is a timestamp; only its date part is compared.

## Links out

Every tile and every linked count carries the period on to the page behind it, converted to that
page's own filter vocabulary by `overviewPeriodListSearch`:

- entire period → `?zeitraum=__alle`
- `letzte-30-tage` → `?zeitraum=letzte-30-tage`
- a month → `?zeitraum=monat-YYYY-MM`
- a year → `?zeitraum=jahr-YYYY`
- six or twelve months → `?zeitraum=individuell&von=…&bis=…`

The status links add their own filter on top (`?status=zu_pruefen`, `?status=erkannt`), so the list
opens on the exact set the number named. See `docs/EINGANGSRECHNUNGEN_FEATURE.md` for the list's
period select.

## Open points

- Ausgangsrechnungen keeps its period filter in component state, not in the URL, so the Overview
  cannot hand a period to that page yet. Its tile link stays unfiltered.
- The Kostenanalyse page has no period in its URL either, so its tile link also opens unfiltered.
  The tile's figure and that page's default view can therefore differ until it gains one.
