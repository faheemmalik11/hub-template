# Offene Posten (Open Items) — Issues

Screen: `http://localhost:7070/offene-posten`, the Zahlungen nav group's reconciliation cockpit:
tab A "Offene Belege" (incoming and outgoing invoices with no confirmed bank match), tab B "Offene
Banktransaktionen" (bank movements with no receipt, with an inline category cell and a hide
action), tab C "Manuell verknüpfen" (the manual linking picker).
Found via code review (`src/routes/offene-posten/index.tsx`, `src/components/bank/manual-link-tab.tsx`,
`no-receipt-action.tsx`, `useBelege` / `useBankTransactions` / `useConfirmedAllocations` /
`useConfirmedOutgoingAllocations` / `useOutgoingInvoices` / `useNoReceiptCount` /
`useSetTransactionCategory` in `src/lib/data/queries.ts`, `coveredAmount` / `isFullyCovered` in
`src/lib/data/format.ts`, migrations `0029_pipeline_opos_whitelist.sql`,
`0069_hub_bank_transaction_auto_categorize.sql`) plus a live pass against the real dev database
through the running app, including a measured page load. **Read-only**: filters, tabs and paging
were exercised (all of them only re-run or re-slice a query), no category was set, no transaction
hidden and nothing linked. Live state: 418 open invoices, 2,715 open bank transactions.

Direct SQL was NOT available in this pass; the DB-side claims below come from the migration files
and from what the app renders.

Each item is tagged with which of these it falls under: **Current bug** (broken right now), **Future
bug** (works today only under a narrow/lucky assumption that a plausible near-future condition will
break), **Usability** (can someone get their task done efficiently), **UI** (the visual layer),
**UX** (the flow and feel of the interaction).

1. **The Fällig column is empty for every incoming invoice, and nothing in the product can fill it.** Sampled live across pages 1 to 3 of tab A: **75 of 75 rows show "—"**. `invoices.due_date` is read in four places (this screen, the manual-link picker, the invoice detail's Meta row) and written by nobody: the pipeline's rules path returns `"due_date": None` unconditionally (`pipeline_new/core/rules/payment_facts.py`), and the invoice edit form has no due-date field at all (`TEXT_KEYS`/`NUM_KEYS` in `src/routes/eingangsrechnungen/$nr.tsx` do not include it), so a reviewer cannot set one by hand either. The column, the red text and the "überfällig" suffix are therefore inert for the incoming half of the list, which is 418 of the rows. Outgoing invoices do carry a real `due_date`, so the feature looks alive on a mixed list while being dead for the majority of it, and "which of these is late" (the reason this screen exists) cannot be answered.
   _Categories: Current bug, Usability_

2. **An invoice with no gross amount can never leave the open-items list.** `isFullyCovered()` returns `false` when `Math.abs(brutto ?? 0) <= 0`, with the comment "no gross amount to measure against, so never judged covered". `coveredAmount()` for a receipt marked paid returns `Math.abs(amountGross ?? 0)`, which for such a row is 0, so even marking it paid by hand does not close it. Live proof: a receipt from 12.08.2026 with Gegenpartei "—", Nr. "—" and **0,00 €** sits on page 1 of tab A and cannot be removed from it by any action on this screen. The only exits are archiving it or marking it not relevant on the invoice detail, neither of which is what somebody looking at an open item thinks to do.
   _Categories: Current bug, Usability_

3. **The screen is assembled in the browser out of the whole ledger: ~5.0 MB over 15 REST requests before the first table appears.** Measured live: 6.2 s to the first rendered table, 5,026,698 bytes across 15 `/rest/v1/` responses, before any row is shown; switching to tab B took another 6.5 s. The page loads every invoice (`useBelege` → `fetchAllRows`), every outgoing invoice, every confirmed allocation on both sides, and all 2,715 open transactions unpaginated, then filters, sorts and pages all of it client-side. The paging helper means nothing is silently truncated, which is the right call; the cost is that load time, memory and bandwidth grow linearly with the ledger, on the screen that is meant to be opened repeatedly through a working day. Every filter on the screen is a client-side one, so none of that traffic can be narrowed by asking for less.
   _Categories: Future bug, UX_

4. **The same badge means opposite things on the two tabs of the same screen.** Tab A feeds `RichtungBadge` with the invoice TYPE (`row.type === "incoming" ? "eingehend" : "ausgehend"`), so a supplier invoice the company still has to pay is labelled "Eingehend". Tab B feeds the same component with `txn.direction`, the direction of the MONEY, where "Eingehend" means cash came in. So on tab A "Eingehend" means money will go out, and one click later on tab B it means money came in, in the same colour and the same shape.
   _Categories: Current bug, UI_

5. **The Summe on the missing-receipts tab adds money out and money in together.** `fehlendTotal` reduces `Math.abs(t.amount) - allocated` over the filtered rows, and the direction filter defaults to "Alle Richtungen". With both directions present the figure is the sum of absolute values, so a 10.000 € debit and a 10.000 € credit read as 20.000 € "offen" rather than netting or being reported separately. The label (`offenePosten.fehlend.summe`) presents it as the open total for the rows shown.
   _Categories: Current bug_

6. **Setting a category writes silently: no confirmation, no toast, no error if it fails.** The Kategorie cell's Combobox calls `setCategory.mutate({…})` with no callbacks, and `useSetTransactionCategory` has no `onError` of its own, so a failed `opos_set_category` RPC leaves the dropdown showing the value the user picked while the database still holds the old one, with nothing on screen. A successful one is equally silent. This is the write that decides how a receipt-less payment lands in the Kostenanalyse, and it is the only mutation on this screen with no feedback at all (the hide action next to it does toast on both outcomes).
   _Categories: Current bug, UX_

7. **Outgoing invoice rows are dead ends, with nothing saying so.** Tab A rows for incoming invoices navigate to `/eingangsrechnungen/$nr`; outgoing rows get no `onClick`, no link and no `cursor-pointer`. Since the two kinds sit interleaved in one table under one "Rechnungstyp" column, half the rows respond to a click and half do nothing, and the screen never explains that an outgoing invoice has no detail page in the Hub. The manual-link picker has the same asymmetry.
   _Categories: Usability, UX_

8. **"Überfällig" is decided against a UTC date.** `const today = new Date().toISOString().slice(0,10)` is the UTC day, and the app runs in Europe/Berlin (UTC+1/+2). Between local midnight and 01:00 or 02:00 the comparison still uses yesterday's date, so an invoice that becomes overdue at midnight is not flagged for the first hour or two of the day. Only outgoing invoices can show this today (see #1), which is also the half where the due date is real.
   _Categories: Current bug_

9. **Neither list can be sorted, and the "Datum" column is not the date it looks like.** Tab A is fixed to `created_at desc`, tab B to whatever `useBankTransactions` returns (`booking_date desc`); no column is clickable. Tab A's columns are Datum, Rechnungsdatum and Fällig, where "Datum" is `created_at`, the moment the receipt was ingested into the Hub, not a business date. Sorting by amount to work the big items first, or by Rechnungsdatum to work the oldest, is not available on either tab.
   _Categories: Usability_

10. **The counterparty filters search two fields and stop there.** Tab A matches the typed text against the supplier/customer name and the invoice number only, case-insensitively, client-side. Tab B's box is passed to `useBankTransactions` as `search`, which for a plain number takes the amount path and otherwise goes to full-text search. So the same-looking input on two adjacent tabs behaves differently, and on tab A an amount, a category or a company name finds nothing.
    _Categories: Usability_

11. **Rows are clickable but not reachable by keyboard.** Both tabs use `<TableRow onClick>` and `<div onClick>` for the mobile cards, with no `href`, no `role`, no `tabIndex` and no key handler, so neither the invoice detail nor the transaction detail can be opened from here without a mouse, and no row can be middle-clicked into a new tab. Same finding as `docs/audit/banktransaktionen/bank-transactions/ISSUES.md` #11; this screen has it on two tabs.
    _Categories: UI, UX_

12. **A receipt with a negative amount sits in the open list demanding to be "paid".** Live on page 1: an incoming receipt of **−839,45 €** (issuer "this client GmbH", Nr. RE-ST-25-1050, i.e. money coming back rather than going out) is listed as an open item, because the coverage test works on `Math.abs(amount_gross)` and simply asks for 839,45 € of matched payment. Closing it means matching an incoming credit against it, which the matcher only proposes for outgoing invoices (`isCredit` in `TransactionMatches` routes credits to `outgoing_invoice_transaction_matches`). So a supplier credit note has no path to closure here and stays on the list.
    _Categories: Current bug, Usability_

---

## Resolution (19.08.2026)

Screen rewritten across all three tabs. Feature doc: `docs/OFFENE_POSTEN.md`. The same pass ran on
a sister Hub, the another client Hub and the Living Immo cockpit.

| #        | Status               | What was done                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Fixed, with a caveat | `due_date` is now enterable by hand on the invoice detail (`$nr.tsx`, logged through `FELD_LABEL_DE`), and the column falls back to the receipt's AGE when there is none ("seit N Tagen offen"), counted from `document_date` and otherwise `created_at`, amber from 30 days, red from 90. Sorting uses the same fallback date. The caveat: the pipeline still extracts no due date, which belongs in `book-keeping`. |
| 2        | Fixed                | `open_blocker` names the three kinds of receipt that could never leave the list (`kein_betrag`, `gutschrift`, `privat_bezahlt`). They are off the working queue but counted on screen, with an "Anzeigen" toggle that lists them and a badge saying why.                                                                                                                                                              |
| 3        | Fixed                | `v_open_items` (migration `20260819210000_hub_open_items_view.sql`) decides openness server-side and the screen asks for 15 columns instead of `select *`. Measured here: invoices 5,735 kB to 61 kB, bank_transactions 4,197 kB to 314 kB. `useBelege()` is no longer called by this screen.                                                                                                                         |
| 4        | Fixed                | Tab A carries a new `BelegTypBadge` (Eingangsrechnung / Ausgangsrechnung, sky/violet, with an icon). `RichtungBadge` is left to mean exactly one thing, the direction of the money, on tab B.                                                                                                                                                                                                                         |
| 5        | Fixed                | Tab B reports debits and credits separately: "N Transaktionen · X € Abgänge · Y € Eingänge".                                                                                                                                                                                                                                                                                                                          |
| 6        | Fixed                | The category Combobox toasts on success and on failure, and is disabled while the write is in flight.                                                                                                                                                                                                                                                                                                                 |
| 7        | Fixed                | Outgoing rows now link to `/ausgangsrechnungen` instead of having no click handler at all while looking exactly like their clickable neighbours. There is no detail page for them in this Hub (source is always 'upload', migration 0086).                                                                                                                                                                            |
| 8        | Fixed                | `heuteLokal()` in `format.ts` replaces the UTC date.                                                                                                                                                                                                                                                                                                                                                                  |
| 9        | Fixed                | Both tabs sort by clickable headers with `aria-sort`. "Datum" is renamed "Eingang". The default stays newest received first, by product decision.                                                                                                                                                                                                                                                                     |
| 10       | Fixed                | Tab A's box now matches issuer/customer, invoice number, company code and name, property code, cost category and the amount in both spellings, debounced like tab B's.                                                                                                                                                                                                                                                |
| 11       | Fixed                | Every counterparty cell is a real anchor, so rows are keyboard reachable and middle-clickable. The row's `onClick` stays as a mouse convenience and skips clicks that landed on the anchor.                                                                                                                                                                                                                           |
| 12       | Fixed                | The -839,45 EUR credit note the audit found on page 1 is now on the "nicht abgleichbar" list with a `gutschrift` badge, out of the working queue and still visible.                                                                                                                                                                                                                                                   |
| 13 (new) | Fixed                | "Ohne Gesellschaft" is a filter value on both tabs.                                                                                                                                                                                                                                                                                                                                                                   |

Tab C was outside the audit's numbering and got its own pass: the confidence panel moved above the
two pickers, the invoice picker now applies the same "open" as tab A (its count used to disagree),
the disabled Verknüpfen button says why, and the picker rows gained accessible names.
