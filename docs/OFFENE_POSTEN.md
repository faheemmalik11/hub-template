# Offene Posten (Open Items)

The reconciliation cockpit at `/offene-posten`, three tabs:

- **A. Offene Belege** incoming and outgoing invoices with no confirmed bank match
- **B. Offene Banktransaktionen** bank movements with no receipt, with an inline category cell
- **C. Manuell verknüpfen** the manual linking picker

Audience: a future session picking this up cold. Everything below is verifiable against the files
and migrations it names.

---

## What the briefing asked for

Screen 8/10 of `docs/PROJECT-ROADMAP.md`: open items readable as a EUR total and not just an item
count, missing receipts standing out early and clearly per company, service provider and project,
and excluded amounts staying visible rather than silently disappearing.

## Where the code is

| Piece           | File                                                                              |
| --------------- | --------------------------------------------------------------------------------- |
| The screen      | `src/routes/offene-posten/index.tsx`                                              |
| Tab C           | `src/components/bank/manual-link-tab.tsx`                                         |
| Row actions     | `src/components/bank/no-receipt-action.tsx`                                       |
| Open-item hooks | `useOffeneBelege`, `useNichtAbgleichbareBelege` in `src/lib/data/queries.ts`      |
| Coverage rule   | `isFullyCovered`, `coveredAmount`, `paymentTolerance` in `src/lib/data/format.ts` |
| Date helpers    | `heuteLokal`, `tageSeit` in `src/lib/data/format.ts`                              |
| Row type        | `OpenItemRow`, `OpenItemBlocker`, `OPEN_ITEM_COLUMNS` in `src/lib/data/types.ts`  |
| The view        | migration `20260819210000_hub_open_items_view.sql`                                |

## How "open" is decided

`public.v_open_items` answers it, so the browser never has to. The view is built on
`payment_tolerance(numeric)`, the same function the paid trigger uses, and mirrors
`isFullyCovered()` + `coveredAmount()` clause for clause:

```
matched_sum   sum(abs(amount_matched)) over confirmed invoice_transaction_matches
is_covered    invoice_is_fully_covered(amount_gross,
                paid_at is not null ? abs(amount_gross) : matched_sum)
is_open       not is_covered and amount_gross > 0 and not already_paid
open_blocker  why a NOT-covered receipt is still not an open item
```

The view's `where` repeats the exclusions `useBelege()` applies: `deleted_at`, `archived_at`,
`not_relevant_at` all null, and `status <> 'aufgeteilt'` (the container row of a split scan is not
an invoice).

### open_blocker: the rows that could never leave the list

Coverage is measured against the gross amount, so three kinds of receipt used to sit here for ever
with no action on the screen able to close them:

| value            | meaning                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kein_betrag`    | no gross amount was extracted, so `isFullyCovered` can never be true                                                                                                         |
| `gutschrift`     | a negative gross, a supplier credit note. Coverage works on `abs()`, so the row demanded to be "paid", and the matcher only ever routes a bank credit to an outgoing invoice |
| `privat_bezahlt` | `already_paid`, settled from a private account, so no company bank movement can match it                                                                                     |

They are reported, not dropped. Tab A shows "N Belege lassen sich nicht abgleichen" with an
**Anzeigen** toggle that lists exactly those rows, each with a badge naming the reason and a tooltip
saying what to do about it. Live: 13 here (7 `kein_betrag`, 6 `gutschrift`), 0 on a sister Hub.

## The Fällig / Alter column

`invoices.due_date` used to be written by nobody on the incoming side: at the time this section was
written the pipeline extracted no due date at all, and the column was 0 of 433 filled here and 0 of
30 on a sister Hub — a column of dashes whose whole job is "which of these is late". The pipeline
started extracting `faelligkeit` on 20.08.2026, but it is still thin: 24 of 525 filled as of
28.08.2026, so the age fallback below is what most rows show.

Two changes, both needed:

1. **A due date can now be entered by hand** on the invoice detail, next to Rechnungsdatum
   (`src/routes/eingangsrechnungen/$nr.tsx`, field `due_date`, logged to the history through
   `FELD_LABEL_DE`).
2. **The column falls back to age** when there is no due date: "seit 1.605 Tagen offen", counted
   from `document_date` and otherwise from `created_at`, with the same escalation colours
   (amber from 30 days, red from 90). Sorting the column uses the same fallback date, so the order
   can never contradict the cell.

Overdue is decided against `heuteLokal()`, the local day. `new Date().toISOString().slice(0,10)` is
the UTC day, which between local midnight and 01:00/02:00 is still yesterday.

## The Fällig filter, and the link that used to do nothing

`?typ=` and `?due=` were validated by `validateSearch` and then never read: the page destructured
only `match` and `skonto`. Every urgency tile on the overview links here with
`?typ=incoming&due=<bucket>`, so those links landed on the full unfiltered list while the tile said 21. Both params now seed the tab-A filter state, and `due` also has a dropdown of its own next to
the Typ filter (`offenePosten.due.*`, the same labels the tiles use). Filtering uses `dueBucket()`,
so the band on the screen and the band behind the link are decided by one function.

## Filtering, sorting, searching

- **Sortable** on both list tabs: Gegenpartei, Betrag (by what is still OPEN, not the original
  total), Eingang, Rechnungsdatum, Fällig/Alter on tab A; Datum, Gegenkonto, Betrag on tab B.
  `aria-sort` on the header, an arrow in it. Default stays newest received first.
- **"Datum" was renamed "Eingang"**. It is `created_at`, when the receipt reached the Hub, not a
  business date, and that was unguessable beside a column called "Rechnungsdatum".
- **The counterparty box on tab A** now matches issuer/customer, invoice number, company code and
  name, property code, cost category and the amount in both German and plain spelling. It used to
  match the name and the number only, while the identical-looking box one tab over searched the
  bank's full text.
- **"Ohne Gesellschaft"** is a filter value on both tabs. It is the most common value in that
  column (225 of 433 rows here, 20 of 28 on a sister Hub) and used to be the one thing that could
  not be isolated.
- Both tabs get a **Filter zurücksetzen** link once anything is set.

## The figures above each table

Tab A: `N Posten · X € offen`, plus `davon N überfällig oder über 90 Tage offen (Y €)` in red. The
second half deliberately does not say "überfällig" alone, because with no due dates most of what it
counts is "nobody has settled this in three months".

Tab B: `N Transaktionen · X € Abgänge · Y € Eingänge`. One figure would have been wrong: the total
used to reduce over `abs(amount)` with the direction filter defaulting to "Alle Richtungen", so a
10.000 € debit and a 10.000 € credit read as "20.000 € offen", neither the net nor either side.

## Badges

Tab A carries `BelegTypBadge` (Eingangsrechnung / Ausgangsrechnung, sky / violet, with an arrow
icon). Tab B keeps `RichtungBadge` (the direction of the MONEY). Both tabs used to render
`RichtungBadge`, one fed with the invoice type and one with `bank_transactions.direction`, so
"Eingehend" meant "money will go out" on one tab and "money came in" on the next, in the same colour
and the same shape.

## Links, not just click handlers

Every row's counterparty cell is a real anchor: `<Link>` to the invoice detail, or a `<Link>` to `/ausgangsrechnungen` for an
outgoing invoice, which has no detail page in this Hub at all (source is always 'upload', migration
0086). Those rows used to have no click handler whatsoever while looking exactly like their
clickable neighbours. The
row's own `onClick` stays as a mouse convenience and skips when the click landed on the anchor.

## Tab C, manual linking

- The **confidence panel moved above the two pickers**, next to the Verknüpfen button. It used to
  sit below two 26rem scroll panels, so judging a pair meant scrolling past both lists and back up.
- The invoice picker now applies **the same "open" as tab A**. `zahlung: "offen"` alone is
  `paid_at is null`, so it offered the `open_blocker` rows too and its count disagreed with the tab
  beside it (418 against 405 here; both read 405 now).
- The disabled Verknüpfen button **says why** it is disabled.
- Each picker row's radio has an accessible name, and the details expander is translated (it was the
  untranslated literal "Details", identical on every row).

## What this costs to load

Measured here, on the larger of the two ledgers. Both figures are the sum of
`pg_column_size` over the rows the screen fetches:

| request           | before                                                                                                    | after                              |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| invoices          | 5,735 kB (`select *`, of which 2,510 kB embedding, 1,002 kB fts, 1,116 kB extracted, 584 kB ocr_fulltext) | 61 kB (`v_open_items`, 15 columns) |
| bank_transactions | 4,197 kB (`select *`)                                                                                     | 314 kB (11 columns)                |

`useBelege()` is no longer called by this screen at all. `useBankTransactions` takes an optional
`select` so only this caller narrows; every other consumer still gets `*`.

## Still open

- **Tab B is still unpaginated.** It has to be: it totals and counts the whole open set. Narrowing
  the columns took it from 4.2 MB to 314 kB, which makes it comfortable at 2,718 rows, but a
  server-side aggregate (count + sum per direction) is the real answer if that grows by an order of
  magnitude.
- **Outgoing invoices are still assembled client-side.** There are few of them and their coverage
  math is the same helper, so they never justified a view of their own. A zero-amount outgoing
  invoice would be listed with no way to close it, the same bug `open_blocker` fixes on the incoming
  side; there are none in either database today.
- **Due dates are extracted, but rarely.** This section used to say the pipeline extracted none at
  all. That stopped being true on 20.08.2026: `faelligkeit` now appears in 74 `extracted` blobs, of
  which 23 carry a value, and 24 of 525 invoices have `due_date` set. `skonto_frist` is present on
  the same 74 and filled on none, so `early_payment_deadline` is still 0 rows and every Skonto
  feature on this screen shows nothing. The remaining 501 receipts fall back to age, as below.
- **`invoices.urgency` and `invoices.days_until_due` are written by nobody.** The columns exist
  (migration 20260827170000) and reach the Hub through `v_open_items`, but no code fills them and
  the Hub does not read them — it derives the band in the browser with `dueBucket()`, from
  `due_date` and the local day. Either fill them in the extraction service or drop them; a column
  that is always null reads as "not urgent" rather than as "unknown".
