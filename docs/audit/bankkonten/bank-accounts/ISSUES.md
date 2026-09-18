# Bankkonten (Bank Accounts) — Issues

Screen: `http://localhost:7070/bankkonten`, the Zahlungen nav group's account master data: which
accounts the Hub knows, which company each belongs to, whether BANKSapi is feeding it, plus an
admin-only "Entfernte Konten" section.
Found via code review (`src/routes/bankkonten/index.tsx`, `src/components/bank/bank-account-dialog.tsx`,
`remove-bank-account-dialog.tsx`, `src/lib/api/bank-accounts.functions.ts`, `useBankAccounts` /
`useExcludedBankAccounts` / `useExcludeBankAccount` / `useRestoreBankAccount` in
`src/lib/data/queries.ts`, `supabase/functions/bank-sync/index.ts`, migrations
`0003_hub_bank_reconciliation.sql`, `0025_pipeline_bank_transaction_company.sql`,
`0059_hub_roles_access_trash.sql`, `20260813150000_super_admin_company_access.sql`) plus a live
pass against the real dev database through the running app. **Read-only**: no account was created,
edited, removed or restored, and no sync was triggered. Live state: 12 active accounts across 4
companies (IMPV, INFI, STAY, STGR), all on two connections to the same bank, plus one removed
account ("Sonstige Darlehen", removed 15.08.2026, reason "Privates Darlehenskonto, gehört nicht in
die Buchhaltung").

Direct SQL was NOT available in this pass, so RLS statements below are read from the migration
files rather than from `pg_policies`.

Each item is tagged with which of these it falls under: **Current bug** (broken right now), **Future
bug** (works today only under a narrow/lucky assumption that a plausible near-future condition will
break), **Usability** (can someone get their task done efficiently), **UI** (the visual layer),
**UX** (the flow and feel of the interaction).

1. **The screen for bank accounts never shows a balance, although the balance is synced and sitting in the row.** `bank-sync` writes `balance: a.saldo` and `balance_date: a.saldoDatum` on every account it touches (`supabase/functions/bank-sync/index.ts`), `BANK_ACCOUNT_COLUMNS` in `bank-accounts.functions.ts` selects both, and `BankAccount` in `types.ts` declares both. Neither the desktop table (Konto, Gesellschaft, IBAN, Kreditinstitut, Art, BANKSapi) nor the mobile card nor any other screen in the app renders them. Somebody asking "what is on the Festgeldkonto" gets no answer anywhere in the Hub, from data the Hub refreshes hourly, including the balance date that would say how current it is.
   _Categories: Current bug, Usability_

2. **This route carries a private copy of `formatIBAN`, and the copy is the version with the bug the shared one already fixed.** `src/routes/bankkonten/index.tsx` defines its own `formatIban()` as `iban.replace(/\s+/g,"").replace(/(.{4})/g,"$1 ")`. The shared `formatIBAN` in `src/lib/data/format.ts`, used by the invoice detail and the transaction detail, splits on `;` first and formats each IBAN separately, precisely because a field can hold more than one (`immonetz/docs/audit/lieferanten/ISSUES.md` #3 is that bug). The local copy runs straight through the semicolon and shifts the second IBAN's grouping by one character. Bank accounts hold one IBAN each today, so nothing is visibly wrong on screen right now; what is wrong today is that one rule has two implementations and they have already drifted apart, on the screen whose main identifying column is the IBAN.
   _Categories: Future bug, UI_

3. **Ten of the twelve accounts share two names, because `account_name` is BANKSapi's product category rather than a name.** Live: "Sichteinlagen" ×5, "Sonstige Darlehen" ×5, "Befristete Einlagen", "BusinessCard". Here the IBAN and the Gesellschaft column pull them apart, so this screen is readable; every other screen inherits the raw names and is not (see `docs/audit/banktransaktionen/bank-transactions/ISSUES.md` #3, where the account filter offers five identical "Sichteinlagen" options). The infrastructure for fixing it is already in place and unused: `bank_accounts.name_is_custom` exists so a hand-edited name survives the next sync, and the edit dialog can set it. Nothing on this screen indicates that the default names collide or invites anyone to rename them, so nobody has.
   _Categories: Usability, UI_

4. **An account may be saved with no company, and that quietly makes its movements visible to everybody.** `EditableFieldsSchema` declares `companyId: z.string().uuid().nullable()`, so neither create nor edit requires one, and the table renders the result as a neutral "Keine Gesellschaft". The consequence is not neutral: `propagate_account_company` (migration 0025) copies the account's `company_id` onto its `bank_transactions`, `bank_transactions_select` is `has_company_access(company_id)`, and `has_company_access(null)` returns **true** by design ("Watch-all … a receipt that is not assigned to a company yet has to stay visible to every reviewer", `20260813150000_super_admin_company_access.sql`). That rule was written for unassigned receipts in the intake queue; applied to a bank account it means every movement on an unassigned account is readable by every authenticated user, including one restricted to a single company. All 12 accounts happen to have a company today, so this is one blank field away rather than currently broken.
   _Categories: Future bug, Usability_

5. **The removal dialog cannot say what it is about to destroy, and the success toast reports only part of what it destroyed.** `excludeBankAccount` counts the collateral before deleting it and returns `{ purgedTransactions, purgedMatches, purgedFiles }`; `bank_transactions` cascades into `invoice_transaction_matches`, `outgoing_invoice_transaction_matches` and `invoice_files` (`on delete cascade`, migration 0003). The dialog says in prose that movements "samt ihrer Zuordnungen zu Belegen" go, with no numbers, because nothing is counted until the deed is done, and it never mentions receipt files at all. The toast then uses only `purgedTransactions` (`bankkonten.entfernen.toastUmsaetze`, "{{anzahl}} Umsätze gelöscht"), dropping the match and file counts the server already handed it. For the one irreversible action on the screen, the two numbers that say how much reconciliation work was just unpicked are computed and thrown away.
   _Categories: Current bug, UX_

6. **Restore is one unconfirmed click, and it cannot bring back what removal deleted.** "Wiederherstellen" fires `useRestoreBankAccount` immediately, while removal is gated behind a dialog with a reason field. The asymmetry is the wrong way round in one respect and misleading in another: the purge is a hard delete, so restoring only clears `excluded_at` and waits for the next sync to re-import whatever the bank still offers. Bank APIs serve a bounded history (BANKSapi's own limit, plus whatever the institution keeps), so restoring an account removed months ago silently returns a shorter history than it had, with the older movements, their invoice matches and their receipt files gone for good. The hint above the section ("Beim Wiederherstellen holt der nächste Abgleich die Umsätze erneut") states the optimistic half of that and none of the limit.
   _Categories: Current bug, UX_

7. **For a non-admin, a removed account is simply absent, with nothing saying why.** `useBankAccounts` filters `excluded_at is null` for everyone, and the "Entfernte Konten" section is wrapped in `isAdmin`. The section's own docstring gives its reason as making it "visible WHY an account the bank keeps delivering never shows up in the tables above", which is exactly the question a non-admin cannot get answered: they see 12 accounts, the bank statement shows 13, and the screen offers no explanation.
   _Categories: Usability, UX_

8. **`?bank=` treats every value except `connected` as a connection failure.** `validateSearch` accepts any string and the effect is a two-branch `if (bank === "connected") … else` that fires the red "Verbindung fehlgeschlagen" toast for anything else, including `?bank=foo` or a truncated redirect. The param comes from the bank-callback Edge Function, so it arrives from outside the app and is worth validating against the two values that mean something. Same class as `docs/audit/banktransaktionen/bank-transactions/ISSUES.md` #4.
   _Categories: Current bug_

9. **The Kreditinstitut column says the same thing on every row.** `bankNameOf` falls back to the connection's `bank_name`, and both live connections are "Sparkasse Rhein-Haardt Bad Dürkheim", so the column repeats one value 12 times and separates nothing. It becomes useful only once a second institution is connected; until then it is a column's worth of width spent on a constant, on a table that has no room for the balance from #1.
   _Categories: UI_

10. **No search, no filter, no sort control, no pagination.** The order is fixed (company code, then account name) and the whole list is rendered at once. Twelve rows do not need any of it; the screen sits behind a product whose selling point is connecting several banks per company, and the count grows by whole connections at a time, not by ones.
    _Categories: Future bug, Usability_

---

## Resolution

Fixed in this pass, verified live at `http://localhost:7070/bankkonten` against the real dev
database (12 active accounts across 4 companies, 1 removed — the figures the findings quote).

| # | Status | What changed |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 | **Won't do** | A Saldo column was built and then removed on request, across all three Hubs. On the Immonetz Hub the balances proved to be a one-off import (all accounts `connection_id = NULL`, every balance written in a single burst weeks ago, both connections `pending`), so a "Saldo" column would imply a freshness the data does not have. Dropped here too rather than leaving the Hubs inconsistent. |
| 2 | **Fixed** | The private `formatIban` is deleted; the route uses the shared `formatIBAN` from `format.ts`, which splits on `;` and uppercases. |
| 3 | **Fixed (UI)** | Names shared by more than one account get a "Name doppelt" badge, computed over the whole set so a collision the filter hides is still flagged. Live this marks 10 of the 12 rows ("Sichteinlagen" ×5, "Sonstige Darlehen" ×5) and leaves "Befristete Einlagen" and "BusinessCard" clean. The badge's tooltip names renaming as the cure and points at `name_is_custom`. |
| 4 | **Fixed (UI)** | "Keine Gesellschaft" is now an amber warning chip whose tooltip states the actual consequence, the summary carries a counter when any are unassigned, the company filter has an explicit "Keine Gesellschaft" option, and `BankAccountDialog` warns while the field is empty. The `has_company_access(null)` rule itself is deliberately unchanged — the intake queue depends on it. |
| 5 | **Fixed** | The dialog now counts **before** destroying: `useBankAccountPurgePreview` reports transactions, invoice matches and receipt files, and says plainly that it cannot be undone. A failed count says so rather than reading as "nothing to lose". The success toast now names all three returned counts (`purgedTransactions`, `purgedMatches`, `purgedFiles`) instead of only the first. |
| 6 | **Fixed** | Restore goes through an `AlertDialog` stating that purged movements do **not** come back and that older history, invoice matches and receipt files are gone for good. The section hint no longer promises "der nächste Abgleich holt die Umsätze erneut" without that limit. |
| 7 | **Fixed** | `RemovedAccounts` takes `isAdmin` instead of being wrapped in it: a non-admin sees a one-line count and the reason, without the restore controls. Excluded rows are already readable to them, so this lifted a UI gate, not an RLS one. |
| 8 | **Fixed** | `validateSearch` narrows `?bank=` to `"connected"                                                                                                                                                                                                                                                                                                                                                 | "error"`; anything else is dropped. Verified: `?bank=error`→ red toast + URL stripped,`?bank=foo` → neither. |
| 9 | **Not addressed** | The Kreditinstitut column still repeats one value. It was going to be traded for the balance; with #1 dropped there is no replacement. |
| 10 | **Fixed** | Search (name / IBAN / holder, space-insensitive so a pasted IBAN matches), a company filter including "no company", and a sort control (company, name). Filtered state gets its own summary ("1 von 12 Konten") and its own empty state with a reset button. |

### Verified live

- 12 rows, no balance column; 10 of 12 badged "Name doppelt", the two unique names clean.
- Searching "BusinessCard" → 1 row, summary "1 von 12 Konten · 1 Gesellschaften".
- The restore control now carries `aria-haspopup="dialog"` — it is a confirmation trigger, not a bare click.
- The removed-accounts hint renders the corrected text naming the history limit.
- `?bank=foo` produced no toast and left the URL alone; `?bank=error` toasted and stripped it.

### Note on RLS (differs from Immonetz)

`bank_accounts` here has **only** a SELECT policy — writes go through service-role server functions
with explicit `checkCompanyAccess`. The Immonetz Hub's copy of this table had `INSERT`/`UPDATE`
policies of bare `true`, which combined with `trg_propagate_account_company` into a read escalation
(see that Hub's finding #12). **Stäy was never exposed to it**; no migration is needed here.
Confirmed against `pg_policies` on the live database, not inferred from the migration files.

### Not done

- No committed e2e spec for this screen.
- The removal dialog was not exercised end-to-end: confirming it would destroy live data.

---

## Later: the screen was merged with Bankverbindungen

The two screens are now one page at `/bankkonten`. See `docs/BANKKONTEN.md` for what it does and
what is still open. Two findings above changed status in that pass:

- **#9 (Kreditinstitut repeats one value)** is addressed. The table is grouped by bank connection,
  so the institution is named once on the group header instead of on every row, and the column is
  rendered only in the ungrouped view and only when a second institution exists.
- **#10 (no search, filter, sort)** is fixed differently than described in the table above. The
  ad-hoc search field and sort dropdown were replaced by the shared `ListToolbar` +
  `FilterPopover` + `FilterPills` used on the supplier and company lists, and sorting moved onto
  the column headers via `SortableColumnHeader`. Filters are company, BANKSapi state, and a sandbox
  toggle that appears only when a sandbox account exists.
