# Invoice detail screen — UX improvements

Scope: `src/routes/eingangsrechnungen/$nr.tsx` (4.6k lines on this client; 4.8k a sister Hub, 5.0k another client,
6.2k another client). Everything below was measured on this client against the live database on 2026-08-25; line
numbers are this client's and will have drifted in the other three.

The complaint that started this: _"too much info which is of no use"_ on landing.

---

## 0. What the screen actually is

Worth stating, because the first instinct is "add structure" and the structure is already there.

The page is **already tabbed** (`$nr.tsx:1964`) — six tabs, wildly unequal:

| Tab          | Line | Size      | Sections                                                      |
| ------------ | ---- | --------- | ------------------------------------------------------------- |
| `uebersicht` | 1994 | 658 lines | Rechnungsinfo, Zuordnung                                      |
| `freigabe`   | 2652 | 370       | Freigabe, Rückfragen, Freigabe-Verlauf, Stufendauern          |
| `zahlung`    | 3022 | **27**    | Zahlungsstatus, Zahlung & Abgleich                            |
| `details`    | 3049 | 185       | Weitere, Positionen, Steuer, Rohdaten                         |
| `lieferant`  | 3234 | 169       | Lieferant, **Jetzt bezahlen**, Volltext, E-Mail, Verarbeitung |
| `verlauf`    | 3403 | —         | Notizen & Historie                                            |

Left of the tabs sits a sticky column with the document preview (capped at 420px) and a meta card.
Above them, the header: title, chips, four status axes, and the lifecycle action buttons.

So the problem was never "one long dump". It is that **the landing tab weights sixteen fields
equally and never says what you are there to do**, and that two tabs are in the wrong shape — one
nearly empty, one carrying a payment button that has no business being there.

---

## 1. Landing tab: say what to do, show less — **DONE**

Implemented on this client, not yet ported.

### 1a. Decision banner

The four axes state what is _true_ — confidence, review, workflow, payment — and leave the reader to
work out the verb. A derived one-liner now states the next step, resolved in triage order, first
match wins:

| Condition                           | Says                                     | Offers                                |
| ----------------------------------- | ---------------------------------------- | ------------------------------------- |
| `gruende.length > 0`                | "N checks to review" + first two reasons | → Review fields                       |
| `legalActions.length > 0`           | "Your decision is pending"               | the real Approve/Query/Reject buttons |
| not in `APPROVAL_TERMINAL_STATUSES` | "Waiting on someone else"                | → View workflow                       |
| approved, `!paid_at`                | "Approved — not yet paid"                | → View payment                        |

Nothing new is computed. It reads the same `wf`, `gruende` and `legalActions` the axes and the
Freigabe tab already read, and it renders `WorkflowActions` rather than re-implementing the buttons,
so "what may this person do next" has one implementation instead of two that can drift.

Incidental fix: `APPROVAL_TERMINAL_STATUSES` was module-private in `format.ts` and is now exported.
Its call site needs `(APPROVAL_TERMINAL_STATUSES as string[]).includes(wf)` — widening the list
rather than asserting `wf` into `WorkflowStatus`, because `workflow_status` is a plain string column
and the assertion would claim something the data does not guarantee. **This is the same expression
as the pre-existing error at `another client2/src/routes/eingangsrechnungen/$nr.tsx:2828`; the same
one-line fix clears it.**

### 1b. Rechnungsinfo opens with six fields, not sixteen

Kept: invoice number, invoice date, due date, net, **VAT rate**, VAT amount, gross.
Folded: order number, service date/from/to, currency, and the whole deductibility and income-tax
grids. A "Show all fields" link at the foot of the section brings them back, remembered per person
in `localStorage` under `beleg-detail-alle-felder`.

**VAT rate is deliberately not foldable**, and was briefly folded by mistake. Its cell is a
composite — the rate `Field`, the "als USt-Regel speichern" button and the rule hint all describe the
same value, but the two controls sit _outside_ the `Field`. Folding only the `Field` left a button
offering to pin a rule for a percentage no longer on screen. The rate also belongs with
Netto / USt-Betrag / Brutto as a figure the reviewer checks, so it stays either way.

Audited the six remaining fold sites afterwards: each wraps a plain `<Field>` or an entire grid
`<div>`, with no sibling control left outside. VAT was the only composite.

The rule button's label now names the value — `"{{satz}} % als USt-Regel speichern"` — instead of
"Als USt-Regel speichern", which sat among several fields and never said which one it applied to.

The part that matters: **a field the extraction was unsure about is never hidden**, whatever the
toggle says — `zeigeFeld(konf.x)` reveals any secondary field scoring below 0.8 even in compact
mode. The compact view exists to reach what needs checking _faster_; hiding the uncertain fields
would do the exact opposite. This uses the per-field confidence the page was already passing to
every `Field` and previously did nothing with.

---

## 2. Header actions → `⋮` dropdown — **DONE**

The header carried **four** actions as full-width buttons, not three as first counted: _Regeln
anwenden_, _Nicht relevant_ / _Zurück in Prüfung_, _Archivieren_ / _Aus Archiv zurück_, and
_Verwerfen_. Two only appear in one status each, so the header was sized for controls most people
never press.

**Done:** all four now sit behind a `⋮` `DropdownMenu` (`dokumentAktionen`). Wording and effects are
unchanged; only the trigger moved. Archivieren and Verwerfen carry `text-destructive`.

The one non-obvious part: the three confirm dialogs are **controlled** via a single
`aktionDialog: "nichtRelevant" | "archivieren" | "verwerfen" | null` state and rendered as siblings
of the menu, not wrapped in `AlertDialogTrigger` inside a `DropdownMenuItem`. Selecting a menu item
closes the menu, which unmounts its children — a trigger nested in there takes the dialog down with
it before it can open.

---

## 3. "Not relevant" vs "Discard (not a document)" — **RELABELLED** (merge still open)

They look like synonyms. They are not. Traced through both mutations:

|                       | Discard (not a document)                                | Not relevant                                                      |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Writes                | `deleted_at`, `delete_reason: "Verworfen — kein Beleg"` | `not_relevant_at/_by/_note`, `workflow_status = 'nicht_relevant'` |
| Lands in              | Trash (recoverable)                                     | Drops out of processing                                           |
| **The source email**  | untouched                                               | **handed back to the mailbox by the pipeline**                    |
| Shown when            | `status === 'zu_pruefen'` only                          | always                                                            |
| **Live usage (this client)** | **92**                                                  | **0**                                                             |

The real distinction is what happens to the _email_: Discard means "this was never a document" and
keeps it in the trash; Not relevant means "this is a real document but not ours" and returns it to
the mailbox for someone else to handle. That is a genuine difference, and **neither label
communicates it**. Zero uses against 92 says nobody has understood it.

**Done — relabelled** around the consequence rather than merged, so the email hand-back is not lost:

|                        | before                   | after                                     |
| ---------------------- | ------------------------ | ----------------------------------------- |
| `action.verwerfen`     | "Verwerfen (kein Beleg)" | **"Kein Beleg — in den Papierkorb"**      |
| `action.nichtRelevant` | "Nicht relevant"         | **"Nicht für uns — zurück ins Postfach"** |

Labels only; no code path changed, so this is reversible and safe to judge from usage.

**Still open:** whether to merge them at all. If one action is preferred, drop _Not relevant_ and add
a "return the email to the mailbox" checkbox inside the Discard dialog. Watch whether the relabel
moves that 0 before deleting a code path.

---

## 4. Decision banner → Overview section — **DONE**

**Done.** The banner moved from the header into the first position of
`TabsContent value="uebersicht"`, above Rechnungsinfo, and lost its `mt-4` since it is now a card of
its own rather than a strip under the title.

Accepted consequence: it will not appear on the other five tabs. That is the right trade — it is a
call to action about the document's content, and the Overview is where you act on it. The four axes
stay in the header and remain visible everywhere, so status is never hidden; only the verb moves.

---

## 5. Payment & reconciliation — **TODO, biggest item**

The Zahlung tab is 27 lines: a manual "paid" toggle and the reconciliation list. Two things are
wrong with that.

**The payment button is on the wrong tab.** `JetztBezahlenSection` renders at `:3364`, inside
`TabsContent value="lieferant"`. The control that moves money is filed under supplier master data.

**`payment_orders` is never shown.** The Hub fetches it (`queries.ts:4043`) only to drive that
button's own state. Status, recipient IBAN, reference, `is_sandbox`, fraud flags, initiator and
timestamps are all invisible in the UI.

> This is not hypothetical. On 2026-08-25 a misclick initiated a payment on invoice 136 (€1.199,12).
> Answering "did that actually pay the client's account" required reading `payment_orders` directly
> in psql. The answer was no — `banksapi_payment_id` was `mock-payment-executed-…`, minted only by
> `mockPaymentWrapper()` (`_shared/banksapi.ts:173`), and `is_sandbox` was true against a live debit
> account, which per `payment-initiate/index.ts:178` can only mean `BANKSAPI_PAYMENT_MODE=mock`. Had
> this panel existed, the screen would have answered it. The invoice was reset to
> `freigegeben_vorgesetzter` and the order marked `cancelled`.

**Rebuild the tab** as one card answering "has this been paid, how, and does the bank agree":

1. **Status line** — due date / overdue, amount, paid manually vs. by payment order.
2. **Payment orders** — one row each: status, amount, recipient IBAN, reference, initiator,
   timestamps, and a clear **sandbox/mock badge** when `is_sandbox`. This is the missing audit trail.
3. **Jetzt bezahlen**, moved here from the Lieferant tab, behind a confirm dialog naming recipient,
   IBAN and amount.
4. **Reconciliation** — existing `ZahlungAbgleichSection`, unchanged. It is the one part already
   doing its job.
5. **IBAN check** — recipient IBAN vs the supplier's default and known accounts, now that
   `supplier_bank_accounts` exists (migration `20260824100000`). This is the invoice-specific half of
   the Lieferant tab worth keeping, and it belongs next to the payment.

Item 3 also closes the guard gap: today one click goes from button to `executed` with nothing in
between, because in mock mode `payment-initiate` auto-finalises (`index.ts:258`) instead of waiting
for SCA. On a live deployment only the SCA webform stands between that click and real money — the UI
itself offers no confirmation either way.

---

## 6. Not doing yet

Raised, deliberately deferred:

- **Document preview width.** Capped at 420px on the landing tab while the job is reading a field
  _against_ the document. Closer to 50/50 on Übersicht would suit that better.
- **Prev/next through the worklist.** No navigation between invoices exists (0 matches). Someone
  reviewing 40 invoices returns to the list 40 times. Small, independent, probably the change users
  would notice most.
- **Collapsible `Section`.** `Section` (`:4500`) has no collapse. "Rohdaten" and "Verarbeitung" are
  forensic and most people never open them. `defaultOpen` + `localStorage`.
- **Whole-document edit.** Sections edit one at a time and the rest grey out (`editDisabled`), which
  produces a "why can't I click this" moment.
- **Shrink the Lieferant tab** once item 5 lands — what remains largely duplicates the supplier
  detail page.

---

## Order of work

| #   | Item                                  | Effort           | Blocked on                      |
| --- | ------------------------------------- | ---------------- | ------------------------------- |
| 1   | Landing tab (banner + compact fields) | **done on this client** | port to the other three         |
| 4   | Banner → Overview                     | **done on this client** | port                            |
| 2   | Header `⋮`                            | **done on this client** | port                            |
| 3   | Relabel the two discard actions       | **done on this client** | port; merge decision still open |
| 5   | Payment & reconciliation rebuild      | large            | **not started**                 |

this client passes `tsc`, `eslint` and `vite build` after 1–4.

## Port status

Items 1–4 are implemented on **this client** only. a sister Hub, another client and another client still have the original
header, landing tab and labels. Item 5 is not started anywhere.
another client uses `@acc/` path aliases, `errorText` instead of `fehlerText`, and keeps this screen under
`src/accounting/`.
