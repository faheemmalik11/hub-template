# Allowed payment difference, and closing a match that has one

Covers meeting items **H5** (fuzzy matching as a second pass) and **H6** (confirm a match despite a
payment difference) from `MEETING_2026-09-09_STAEY.md`, plus the settings page they moved to.

## What was asked

H6, from Saskia: a payment that is a few cents or a few euros short of the invoice is still that
invoice being paid — Skonto, a bank fee taken off the transfer, a rounding difference. Before this,
the match either fell inside a hard-coded one-cent window or it did not exist at all, and there was
no way to say "yes, this is the one, here is why the numbers differ".

H5 asked for the window to be a setting rather than a constant.

## What is implemented

### One setting, not three

`matching_settings` (migration `20260910170000_matching_threshold_and_difference_reason.sql`) holds
a single row. Only **`amount_tolerance`** is surfaced: the euro amount by which a payment may differ
from the invoice and still count as the same amount.

The other two columns on the table (`auto_match_threshold`, `candidate_threshold`) exist but are not
editable from the UI and are not exposed on the settings page. They are score gates, not amounts,
and mixing them into the same screen was the thing the client asked to remove.

RLS: readable by any authenticated user, writable only by `is_admin()`.

### Where it lives

`src/routes/bank-einstellungen/index.tsx` — **Bank → Einstellungen**. Everybody can read the value;
only an admin can change it. That is deliberate: the number explains behaviour people see every day,
and hiding it from non-admins made the matching look arbitrary. The old
`matching-settings-dialog.tsx`, reached from a button on the transaction list, is deleted.

### How the score uses it

The amount is the heaviest signal at **0.45** of 1.0 (`WEIGHT` in `src/lib/matching/score.ts`;
reference 0.25, IBAN 0.2, name 0.1, customer number 0.05, plus a 0.03 date bonus). Gates: 0.60 to
suggest, 0.90 for the top band.

`amountMatch(invoiceGross, transactionAmount, tolerance)` lives in **hub-kit**
(`@hub-kit/core/bank-matching`, `src/lib/bank-matching/fuzzy.ts`) and returns
`{ matched, exact, difference }`. When a pair matches only because of the allowance, the scorer
deducts `TOLERANCE_PENALTY` (**0.05**), so 0.45 becomes 0.40 — an exact hit always outranks a
tolerated one, but a tolerated one still clears 0.60 on amount plus invoice number, which is the
point of widening the window.

**There is no auto-linking.** `auto_match_threshold` names a band, not an action: a suggestion is
written and a person accepts it. Nothing is ever linked without someone confirming.

### The Deno copy

`supabase/functions/_shared/matching.ts` carries a **byte-identical** copy of `amountMatch` and
`TOLERANCE_PENALTY`. Edge functions cannot import from `node_modules`, so the nightly `bank-sync`
scorer and the browser scorer are two files that must be kept the same by hand. Both carry a comment
saying so. If you change one, change the other and redeploy `bank-sync`.

### Saying so in the UI

When a suggestion only matched because of the allowance, the match panel labels it — the reviewer
sees "this one needs the allowance" rather than being shown a tolerated match and an exact match as
the same kind of fact. Carried on the score as `reasons.amountTolerated` /
`reasons.amountDifference` (`src/components/bank/match-score.tsx`).

## Closing both sides by hand

Migration `20260910190000_close_sides_manually.sql`.

A manual link allocates the smaller of the two open sides and leaves a remainder on the other. Two
kinds of remainder are not really open, and each end now has its own checkbox in the confirm dialog
(`src/components/bank/match-panel/link-confirm-dialog.tsx`):

| Leftover on | Checkbox | Mechanism |
|---|---|---|
| the invoice | mark the invoice fully paid | `payment_tolerance` + `difference_reason` |
| the payment | mark the transaction fully used | `set_transaction_fully_used(id, note)` |

The two are independent — either, both, or neither.

The transaction side needed a new mechanism because `sync_transaction_matching_status` derives the
status purely from allocated amounts and would recompute a hand-closed transaction back to `offen`
on the next write. So it is a **fact on the row** (`fully_used_at/_by/_note`), which that trigger now
reads, not a status a screen sets. The trigger honours the stamp only when `v_alloc > 0`: "fully
used" describes a payment that paid something, not a way to file an untouched one away.
`clear_transaction_fully_used` reverses it and reopens the remainder.

`ignoriert` still wins over both, and still means what it always meant — "no receipt is expected for
this at all", which is a different statement from "this payment is spent".

### Closing it after the fact, from either detail page

The confirm dialog only exists at the moment of linking. A link made any other way leaves no route
back to that decision, and an invoice uploaded from a transaction is linked by a trigger
(`20260911190000`) once extraction reads the amount, so nobody ever sees a dialog. Both detail pages
now carry the same control, `src/components/bank/close-remainder.tsx`:

| Page | Shown when | Writes |
|---|---|---|
| Banktransaktion detail | something is allocated and a remainder is left | `set_transaction_fully_used(id, note)`, reversible with **Wieder öffnen** |
| Eingangsrechnung detail, Zahlung & Abgleich | same, on the invoice side | `paid_at` + `paid_source='manual'` and a `remainder_written_off` history entry |

The reason is required in both, same as in the dialog. **Wieder öffnen** takes either back:
`clear_transaction_fully_used` on the payment, `useReopenInvoiceRemainder` on the invoice (which
clears `paid_at`/`paid_source` and walks the workflow out of `bezahlt` with it).

A write-off only means something while the allocation it describes exists. `useUnlinkMatch` now
clears the paid mark when the unlink leaves **no confirmed match behind it**, rather than only when
`paid_source = 'bank_match'`. The old test could not see a write-off at all: the column has a CHECK
constraint (`'bank_match' | 'manual' | 'banksapi_payment'`), so a write-off stores `'manual'` and was
read as a human ticking the paid switch. The invoice stayed paid through an unlink, and re-matching
it then read "Restbetrag abgeschrieben" about a decision that no longer applied.
`'banksapi_payment'` is still never withdrawn: that money actually left the account.

Closing the invoice side also has to change what the card says about itself. `abgleichStatus()`
takes a fourth argument, `restAbgeschrieben`: with a confirmed allocation and `paid_at` set, a
partial coverage reads **Abgeglichen** rather than **Teilweise ... 92,86 EUR offen**, which is what
it said next to a workflow that already read "bezahlt". Passed at both call sites on the invoice
detail (header badge and the card).

The history row is written through the same structured-event route as the other match events
(`20260911220000`): the German sentence is persisted unchanged, `data.event = "remainder_written_off"`
carries the reason, and `verlaufZeilen` renders it in the reader's language. Rows written before this
keep their stored German text.

### Confirming a suggestion closes a side too

`useManualLink` and `useConfirmMatch` both end in `closeSidesAfterLink()`. They used not to: the
close logic lived inline in `useManualLink`, so confirming a suggestion from the **transaction
detail** screen showed the checkbox, required the reason, and then dropped both answers on the
floor. `match-candidates.tsx` also passed `invoiceGross: null` into the dialog, which made
`isFullyCovered()` return false with nothing to measure against, so an exact-match invoice was
announced as "Die Rechnung ist nicht vollständig bezahlt. 0,00 € bleiben offen."

### The reason is required

Free text, not a dropdown. Marked with `*`, and **Zuordnen stays disabled until it is filled in**.
The reason is written to the invoice's workflow history, so a later reader can see why the numbers
did not agree.

In **manual** matching a difference inside the tolerance does **not** offer "mark fully paid":
inside the allowance the invoice already counts as paid, so asking would be asking about a decision
that has already been made.

## Files

| Path | Role |
|---|---|
| `supabase/migrations/20260910170000_matching_threshold_and_difference_reason.sql` | `matching_settings`, `difference_reason` |
| `supabase/migrations/20260910190000_close_sides_manually.sql` | `fully_used_*`, the two RPCs, trigger change |
| `src/routes/bank-einstellungen/index.tsx` | the settings page |
| `src/lib/matching/score.ts` | browser scorer |
| `supabase/functions/_shared/matching.ts` | Deno mirror — keep identical |
| `supabase/functions/bank-sync/index.ts` | reads the tolerance from the DB per run |
| `src/components/bank/match-panel/link-confirm-dialog.tsx` | the two checkboxes and the reason |
| `src/components/bank/close-remainder.tsx` | the same decision on either detail page, after the fact |
| `hub-kit` `src/lib/bank-matching/` | `amountMatch`, `TOLERANCE_PENALTY`, `normalizeReference`, `hasTransposedDigits` |

## Open

- **77 pre-existing suggestions** (33 `auto`, 44 `kandidat`) were scored before this change and carry
  no `amountTolerated` flag. They will not show the "needed the allowance" label until re-scored.
- The **close-remainder half** is now in all four Hubs: the same component, the same two placements,
  and `20260911230000_close_sides_manually.sql` in immonetz, eiffler-hubv2 and mayestate2 (the same
  file as staeyhub's `20260910190000`, renumbered).
- The **tolerance half** is still staeyhub only. The other three have the hub-kit part
  (`@hub-kit/core`) but not `matching_settings`, the settings page or the link-confirm dialog.
