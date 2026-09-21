# Banktransaktionen (Bank Transactions) — Issues

Screen: `http://localhost:7070/banktransaktionen` (list) and `http://localhost:7070/banktransaktionen/$id`
(detail), the Zahlungen nav group's first entry: every bank movement BANKSapi delivers, with the
match state against Eingangsrechnungen.
Found via code review (`src/routes/banktransaktionen/index.tsx`, `$id.tsx`,
`src/components/bank/match-candidates.tsx`, `no-receipt-action.tsx`, `badges.tsx`,
`useBankTransactionsPage` / `useBankTransactions` / `useBankTransaction` / `useConfirmMatch` /
`useRejectMatch` in `src/lib/data/queries.ts`, migrations `0003_hub_bank_reconciliation.sql`,
`0059_hub_roles_access_trash.sql`, `0069_hub_bank_transaction_auto_categorize.sql`) plus a live
pass against the real dev database through the running app (2,756 transactions, 12 accounts,
4 companies). **Read-only**: the search box and the filters were exercised (both only re-run a
query), no transaction was hidden, no match confirmed or rejected, and "Jetzt synchronisieren" was
deliberately never clicked, since `BANKSAPI_MODE` is live here and a sync talks to the real bank.

Direct SQL was NOT available in this pass (no DB credentials in the sandbox), so every RLS claim
below is read from the migration files rather than from `pg_policies`. Those are marked where they
occur and should be re-checked against the live database before being acted on.

Each item is tagged with which of these it falls under: **Current bug** (broken right now), **Future
bug** (works today only under a narrow/lucky assumption that a plausible near-future condition will
break), **Usability** (can someone get their task done efficiently), **UI** (the visual layer),
**UX** (the flow and feel of the interaction).

1. **Searching for an amount silently finds nothing, on the one screen where looking up a payment by its amount is the obvious move.** Reproduced live against a transaction that is on the list: Techniker Krankenkasse, −9.304,15 €, 17.08.2026. Typing `9304,15` gives "Keine Banktransaktionen", so does `9304.15`, so does `9304`; typing `Techniker` finds 3 rows. `useBankTransactionsPage` sends every query through `textSearch("fts", …)`, and the `fts` column only covers counterparty, payment reference and booking text, never the numeric amount. The sibling hook `useBankTransactions` (used by Offene Posten) already solves exactly this with `looksLikeAmountQuery()` plus a client-side amount filter, and its own comment records the bug being fixed there. The paginated variant this screen uses never got that path. The failure is silent: no hint that the number was matched as text, just an empty table.

   **FIXED 19.08.2026** in all three Hubs (this client, a sister Hub, another client `/buchhaltung`). `amountQueryFilter()` in `queries.ts` turns a numeric query into a PostgREST `or` filter on `amount` instead of sending it to `fts`, so the match happens in the database and survives paging and the exact count. It accepts every spelling a person types (`9304,15`, `9.304,15`, `9304.15`, `-9304`, `9304,15 €`), matches both signs, and treats a query without decimals as a euro prefix (`9304` finds -9.304,15). Wired into all three transaction hooks (the paginated list, the unpaginated Offene-Posten scope and the manual-link picker), so the two search boxes that used to disagree now behave identically; the picker also keeps its exact count instead of fetching the whole scope to filter in memory. The placeholder now says Betrag is searchable. Cover: `e2e/banktransaktionen.spec.ts` ("#1 an amount can be searched"), which derives the amount from a row the list itself returned, asserts every returned row really carries it, and checks the text search, unparseable input and filter combination. Verified live: 5/5 on this client (2,756 transactions) and 5/5 on another client (65); on a sister Hub 2 pass and 3 skip, since that database holds no bank movements. The spec was re-run with the fix disabled in both populated Hubs and fails there, so it does catch the regression.
   _Categories: Current bug, Usability_

2. **A search or filter that matches nothing claims the database is empty.** The empty state reads "Keine Banktransaktionen / Noch keine Umsätze importiert. Verbinde ein Konto unter „Bankverbindungen" und starte einen Sync." It is rendered whenever `txns.length === 0`, with no distinction between "no data at all" and "your filter excluded all 2,756 rows". Reproduced live twice: once via the amount search in #1, once via `?matching=bogus` (see #4). The instruction it gives is actively wrong here: two connections are live and syncing hourly, and following it would have someone re-authorising a bank that is already connected.

   **FIXED 19.08.2026** in all three Hubs. The list now tells the two states apart: with a search term or any filter active it shows "Keine Treffer" plus a "Filter zurücksetzen" button (a new optional `action` slot on the shared `EmptyState`), and the "connect a bank and sync" message is reserved for a database that genuinely holds no movements. Reset clears the search, all four filters, the page number and the deep-linked `?matching=` parameter, so a reload cannot put the filter back. Cover: `e2e/banktransaktionen.spec.ts` ("#2 the empty state says which kind of empty it is"), which asserts the filtered state never shows the import advice and that reset restores the full list. Verified live on this client and another client for the filtered branch; the unfiltered branch is verified on a sister Hub, the one Hub whose bank feed is genuinely empty.
   _Categories: Current bug, UX_

3. **Twelve accounts, and the Konto column can tell only three of them apart.** `account_name` comes from BANKSapi and holds the product CATEGORY, not an account name. Live, the account filter's own option list reads: "Alle Konten", "Befristete Einlagen", "BusinessCard", "Sichteinlagen" ×5, "Sonstige Darlehen" ×5. Ten of the twelve options are visually identical, and the table's Konto column repeats the same word down the page. Those five "Sichteinlagen" belong to four different companies (IMPV, INFI, STAY twice, STGR per `/bankkonten`), and the list shows no company column at all, so on a screen whose whole job is "which of our accounts moved money", neither the column nor the filter answers it. The combobox does match on IBAN through `keywords`, but only if the user already knows the IBAN to type. `/bankkonten` disambiguates the same accounts perfectly well by showing IBAN and Gesellschaft beside the name.

   **FIXED 19.08.2026** in all three Hubs. `kontoLabel()` and `eindeutigeKontoLabels()` in `format.ts` render an account as name · company code · last-four IBAN, and guarantee that no two labels in one list are the same: any that would still collide are extended with more of the IBAN, and with a slice of the id if even that repeats. Used by the Konto column, the account filter and the transaction detail page. The uniqueness rule was not decoration: the test found two a sister Hub accounts that share a name AND their last four digits, which the first version still rendered identically. Cover: "#3 accounts are told apart", which fails on any duplicate option label. Verified live in all three Hubs (43 accounts on a sister Hub, 12 on this client).
   _Categories: Current bug, Usability, UI_

4. **`?matching=` accepts any string and turns a typo into "nothing was ever imported".** `validateSearch` passes through `typeof search.matching === "string"` unchecked, and the value is used directly as `matchingStatus`, which becomes `.eq("matching_status", …)`. Live with `?matching=bogus`: the Abgleich dropdown falls back to showing its placeholder (the value matches no option), the table is empty, and the empty state from #2 appears. The link that produces these URLs is Offene Posten's "N ausgeblendet" link, so the format is real and shareable, and a hand-edited or stale one fails with a message that points somewhere else entirely.

   **FIXED 19.08.2026** in all three Hubs. `MATCHING_FILTER` allow-lists the four values the Abgleich filter offers (`offen`, `vorschlag`, `zugeordnet`, `ignoriert`); anything else means "no filter" instead of being passed into `.eq("matching_status", …)`. A stale or hand-edited link therefore lands on the full list rather than on an empty one that blames the import. Cover: `e2e/banktransaktionen.spec.ts` ("#3 a deep-linked filter value is validated"), which checks that `?matching=ignoriert` still filters and that `?matching=bogus` returns exactly the unfiltered row count. Verified live on this client and another client; skipped on a sister Hub for lack of bank data.
   _Categories: Current bug, UX_

5. **The filters never reach the URL, so the deep link only works inbound.** `?matching=ignoriert` seeds `fStatus` once on mount; from then on every filter, the search text, the page number and the page size live in component state only. Verified live: after picking a direction filter the URL is still `http://localhost:7070/banktransaktionen`. Consequences: a filtered view cannot be shared or bookmarked, the browser Back button does not undo a filter (it leaves the screen), and returning from a transaction detail resets everything to page 1 with no filters, which is precisely the walk somebody doing a reconciliation session repeats all day. `/eingangsrechnungen` keeps its list state in the URL (`useListSearch`), so the pattern exists in this repo already.

   **FIXED 19.08.2026** in all three Hubs. The search term, all four filters, the date range, the sort column and direction, the page and the page size are mirrored into the URL (`replace`, so the history stays one entry per screen) and seeded back out of it on mount. A filtered view can be shared and bookmarked, a reload restores it, and coming back from a transaction returns to the same page of the same filtered list instead of an unfiltered page 1. another client needed its own shape here, since its router shim has no `validateSearch`. Cover: "#5 the list state lives in the URL", which filters, reloads, opens a transaction and goes back. Verified live on this client and another client.
   _Categories: Usability, UX_

6. **No date filter and no sorting, on 2,756 rows across several years.** The only order is `booking_date desc`, hard-coded, with an `id` tiebreak; the only controls are search plus four equality filters. At the default 25 per page that is 111 pages, and there is no way to jump to a month, to sort by amount to find the big items, or to sort by counterparty. The Manuell-verknüpfen picker on Offene Posten has all of it (`useOpenBankTransactionsInfinite` takes `bookingDateVon/Bis`, `valueDateVon/Bis`, `sort`, `dir`), so this screen is the one place with the full transaction history and the weakest tools for walking it.

   **FIXED 19.08.2026** in all three Hubs. `useBankTransactionsPage` gained `bookingDateVon`/`bookingDateBis`, `sort` and `dir`; Datum, Gegenkonto and Betrag are clickable headers (descending first, second click flips, `aria-sort` on the cell), and a booking-date range sits in the filter bar. Sorting happens server-side, so the order holds across every page rather than within the 25 rows on screen; `amount` sorts by the signed value, since ordering by magnitude would need an expression PostgREST cannot express. Cover: "#6 the list can be sorted and bounded by date", which checks the returned rows really are ordered and that both controls reach the URL. Verified live on this client and another client.
   _Categories: Usability_

7. **The detail page never says which account or which company the transaction belongs to.** `$id.tsx` renders exactly: Buchungsdatum, Wertstellung, Buchungstext, Gegenkonto, IBAN, BIC, Verwendungszweck. Not `account_id`, not `company_id`, although the movement inherits its company from the account (trigger, migration 0025) and that company decides who may even see the row. So the list's Konto column is unreadable (#3) and the detail page does not have the column at all: nowhere in the app does a single transaction state which of the twelve accounts it came from.

   **FIXED 19.08.2026** in all three Hubs. The transaction card now names the account (via `kontoLabel`), its IBAN and the company, so the screen a row click lands on answers which of our accounts moved the money. another client reads the company from the account, because its `bank_transactions` row carries no `company_id` of its own. Cover: "#7 #8 #13 the detail page identifies the transaction". Verified live on this client and another client.
   _Categories: Current bug, Usability_

8. **A transaction's own BWA category is invisible here, although it is what the receipt-less ones are booked under.** Migration 0069 added `bank_transactions.category_id` / `category_source`, sets it by rule on insert, and the Kostenanalyse reads it for movements that will never have a receipt. The only place it can be seen or changed is the Kategorie cell on Offene Posten's "Offene Banktransaktionen" tab, and only for `amount < 0`. Open the same transaction's detail page, which is where somebody lands after clicking the row, and the category is neither shown nor editable. A transaction that has already been hidden as "kein Beleg" has left Offene Posten entirely, so its category becomes unreachable from the UI at exactly the moment it is the only thing carrying that spend into the P&L.

   **FIXED 19.08.2026** in all three Hubs. The BWA category is shown on the detail page and, for a debit, editable there through the same `opos_set_category` RPC the Offene-Posten cell uses, so a transaction that has already been hidden as "kein Beleg" stays reachable. Unlike that cell, this one reports the outcome: a toast on success and on failure. A credit says instead that it is booked through its outgoing invoice. Cover: the same "#7 #8 #13" block, which asserts the control is present and enabled; the write itself is deliberately not exercised, to avoid mutating a real transaction's category.
   _Categories: Current bug, Usability_

9. **"Zuordnen" is one unconfirmed click, it is irreversible from this screen, and it also writes an assignment rule.** `useConfirmMatch` sets the match to `bestaetigt`, which fires the DB trigger that flips `bank_transactions.matching_status` and the invoice's paid state, then calls `learn_assignment_rule_from_match`, so one click also teaches the rule engine from that pair. There is no confirmation dialog. Afterwards the row renders a plain status label instead of the confirm/reject buttons (`offen` is only `kandidat`/`auto`), so the screen offers no way back. Rejection has the mirror-image problem: `TransactionMatches` filters `status !== "abgelehnt"` out of the list, so a suggestion rejected by mistake disappears with no trace and no undo, and `bank.matches.empty` then says there are no candidates. The undo half is already solved in the sibling Hub: a sister Hub's copy of this component has an `UnlinkMatchButton` ("Trennen", with a reason field) on a confirmed match, so the fix is a port rather than a design question (see `a sister Hub/docs/audit/banktransaktionen/bank-transactions/ISSUES.md`).

   **FIXED 19.08.2026** on this client and another client by porting a sister Hub's `UnlinkMatchButton`: a confirmed match now offers "Trennen" with an optional reason, so a mis-click is recoverable on the screen where it happens. Cover: "#9 a confirmed match can be undone". It currently SKIPS in all three Hubs, because none of the three databases holds a single reconciled transaction (`?matching=zugeordnet` returns nothing anywhere); creating one to exercise the button would mark a real invoice paid and teach an assignment rule, so it was not done. The button is typechecked and identical to the one a sister Hub already ships.
   _Categories: Current bug, UX_

10. **Read from the migrations, not verified live: any authenticated user can create and confirm matches for companies they cannot see.** `0059_hub_roles_access_trash.sql` re-scoped `bank_accounts` and `bank_transactions` to `has_company_access(company_id)` but left `invoice_transaction_matches` on its original policies from `0003_hub_bank_reconciliation.sql`: `matches_insert … with check (true)` and `matches_update … using (true) with check (true)`, both granted to `authenticated`. `useConfirmMatch` and `useRejectMatch` write that table directly from the browser. A confirmed match marks an invoice paid and a transaction reconciled through triggers, so this is a write path into another company's payment state, reachable by a user whose SELECT policies forbid them from reading either row. Same class as `a sister Hub/docs/audit/manuelle-buchungen/manual-bookings/ISSUES.md` #2 and `.../datev-uebergabe/datev-handover/ISSUES.md` #1. **Needs a `pg_policies` check before being acted on** (see the header).

    **MIGRATION WRITTEN, NOT APPLIED (19.08.2026).** `supabase/migrations/20260819150000_match_write_scope.sql` scopes the match tables' insert and update policies to `has_company_access` on BOTH sides of the pair (the transaction and the invoice), mirroring what 0059/0046 did for the bank tables, and accepts either table name since the a sister Hub rename lives outside its migration folder. It is deliberately NOT applied: this pass had no database access, so unlike the sibling migrations 20260819130000/140000 the live policies were never measured. The file opens with the `pg_policy` query to run first. Apply and verify before treating this finding as closed.
    _Categories: Current bug_

11. **Rows are clickable but not reachable by keyboard.** Both the desktop `<TableRow className="cursor-pointer" onClick={…}>` and the mobile card `<div onClick={…}>` carry no `href`, no `role="link"`, no `tabIndex` and no key handler. There is no other route to a transaction detail page, so the whole detail screen is keyboard-unreachable, and none of the rows can be middle-clicked or opened in a new tab either, which is the natural way to work through a reconciliation list.

    **FIXED 19.08.2026** in all three Hubs. Rows carry `role="button"`, `tabIndex={0}`, an `aria-label` naming the counterparty and the amount, and an Enter/Space handler, the same shape the Protokoll rows use. Cover: "#11 #12 the list is reachable without a mouse", which focuses the first row and opens it with the keyboard. Verified live on this client and another client.
    _Categories: UI, UX_

12. **The search box is the screen's only unlabelled control.** `<Input value={suche} … placeholder={t("bank.list.search")} />` with no `<Label>` and no `aria-label`. Placeholder-only labelling disappears as soon as somebody types and is not a label for a screen reader. Worth naming specifically because the repo just completed a pass on exactly this (`e7f0324 Label every form field, one error per section`) and this input was missed. Same finding as `a sister Hub/docs/audit/manuelle-buchungen/manual-bookings/ISSUES.md` #7.

    **FIXED 19.08.2026** in all three Hubs. The search input has an `aria-label`, and the placeholder now also names Betrag as searchable (see #1). Cover: the same "#11 #12" block, which looks the box up by its accessible name. Verified live in all three Hubs.
    _Categories: Current bug, UI_

13. **The browser tab says "Transaktion" for every transaction.** `head: () => ({ meta: [{ title: pageTitle("Transaktion") }] })` is static, so several open tabs are indistinguishable and the history is a wall of identical entries. This is the same finding the invoice detail already fixed (`docs/audit/eingangsrechnungen/invoice-detail/ISSUES.md` #4, "the browser tab title identifies the receipt"), by setting the title from an effect over the route's static `head:`. The fix is transferable verbatim; counterparty plus amount plus date would identify the row.

    **FIXED 19.08.2026** in all three Hubs. The tab title is built from the transaction: counterparty (or booking date, when there is none) plus the signed amount. another client needed the title moved out of its static `RouteEntry` wrapper into the component that has the data. Cover: the "#7 #8 #13" block, which asserts the title is no longer the generic one and names the row. Verified live on this client and another client.
    _Categories: UX_

14. **Also changed while closing #9: rejected suggestions are no longer hidden.** `TransactionMatches`
    used to filter `status === "abgelehnt"` out of both directions, so a suggestion rejected by mistake
    vanished with no trace and the panel then said no candidates had been proposed at all. They stay
    listed now, sorted last and muted, with their own badge. Filed as its own finding on the sibling
    Hub (`a sister Hub/docs/audit/banktransaktionen/bank-transactions/ISSUES.md` #10) and fixed in all
    three.
    _Categories: Usability_

15. **Unlink parked the pair in "rejected", where it could never be linked again.** Found by running
    the flow in the live app after the port: _Match_ then _Unlink_ left the row reading "Rejected"
    with no Match button, although the dialog promises both sides go back to being open. The cause
    was the ported button reusing the REJECT mutation (`status = 'abgelehnt'`), which is also what
    a sister Hub shipped. Measured on the this client database afterwards: one match on the tested transaction,
    `confirmed_at 12:10:59`, `rejected_at 12:11:14`, fifteen seconds apart, with the confirmation
    stamp still on the row.

    **FIXED 19.08.2026** in all three Hubs. New `useUnlinkMatch` / `useUnlinkOutgoingMatch` write
    `status = 'kandidat'` and clear the confirmed/rejected stamps, so the pair comes back as a
    suggestion with its score and its Match button; `sync_transaction_matching_status` returns the
    transaction to 'offen' by itself, since it counts only 'bestaetigt' rows. The dialog text now
    says the suggestion stays and can be matched again. Verified live on this client by the reporter
    (Match, Unlink, Match). The one row stranded by the old behaviour was repaired with a scoped
    UPDATE back to 'kandidat'. Note the assignment rule that the first Match taught is not unlearned
    by unlinking.
    _Categories: Current bug, UX_
