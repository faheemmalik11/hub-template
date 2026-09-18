# Feature: the invoice queue cards (incoming and outgoing lists)

The row of cards above the invoice lists, and the `Next action` column in the incoming table.
Built 28.08.2026 from the client's design for the incoming-invoices screen.

> **TL;DR** — a three-layer kit: a presentational card that knows nothing about invoices, a
> per-Hub config array naming which cards exist and what each one filters, and one SQL function
> per Hub that answers them. Porting to another Hub means writing the config array and the
> function; the components are copied unchanged.

---

## 1. The three layers

| Layer                                                     | File                                                        | Per Hub?                  |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| Card                                                      | `src/components/invoice-queue/queue-kpi-card.tsx`           | copy verbatim             |
| Row, skeleton, empty state                                | `src/components/invoice-queue/queue-kpi-row.tsx`            | copy verbatim             |
| Next-action cell                                          | `src/components/invoice-queue/next-action-cell.tsx`         | copy verbatim             |
| Which cards exist, what they filter, the next-action rule | `src/lib/data/invoice-queue-config.ts`                      | **rewrite**               |
| Counts and sums                                           | `supabase/migrations/20260828180000_invoice_queue_kpis.sql` | **rewrite**               |
| Hook                                                      | `useInvoiceQueueKpis()` in `queries.ts`                     | copy, adjust import paths |

The components import nothing but react, lucide, TanStack `Link`, `ui/*` and `cn`. They take
already-formatted strings, so no locale helper reaches the core.

`QueueKpiCard` renders a `<Link>` when given `to`, and a `<button>` when given `onSelect`. The
incoming list keeps its filter in the URL and uses the first; the outgoing list keeps it in local
component state and uses the second.

## 2. Cards on the incoming list

Five cards, defined in `QUEUE_CARDS`. Each is a filter the list already supports, so the arrow on
the card applies exactly the filter the count was measured with.

| Key                  | Counts                                    | Filters to                                                                                 | Tone    |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| `needs_action`       | `status = 'zu_pruefen'`                   | same                                                                                       | warning |
| `missing_assignment` | `company_id is null`                      | `gesellschaft = GESELLSCHAFT_OHNE`                                                         | warning |
| `ready_for_payment`  | approved and `paid_at is null`            | `workflow` + `zahlung=offen`                                                               | success |
| `pay_now`            | due, unpaid, not a direct debit           | `faellig=due_now` + `zahlung=offen` + `paymentType=transfer`, sorted by due date ascending | danger  |
| `completed`          | paid or `workflow_status='abgeschlossen'` | `zahlung=bezahlt`                                                                          | neutral |

**`pay_now` replaced `overdue` on 31.08.2026** (migration `20260901170000_pay_today.sql`). The old
card counted `due_date < p_today and paid_at is null` and linked to `faellig=overdue`. Three things
were wrong with it as the "pay today" list of meeting item 4: it excluded invoices falling due
today, its link did not carry `zahlung=offen` so choosing the filter by hand kept already-paid
rows, and it kept direct debits, which the supplier collects itself and which must never be
transferred as well. Measured on the day: 24 rows, of which 2 paid and 12 direct debits.

`pay_now` is also the only card that sets a sort order. `QueueCardSpec` gained optional
`sort`/`dir` for it, applied and cleared alongside `CARD_FILTER_KEYS`. A payment list worked
"one by one" has to start at the oldest debt; the received-date default put it anywhere.

**`missing_assignment` counts company only, on purpose.** The design's card reads "Missing company
or property", but `applyBelegeFilter` ANDs its axes and cannot express "company OR property
missing". A card counting both sent the reader to a list showing a different number (463 vs 270 on
Stäy). Company is also the blocking one. If the OR is ever wanted, the list filter needs a
combined sentinel first, and the SQL and the card must move together.

### Selection behaviour

`CARD_FILTER_KEYS` lists every filter key a card owns (`status`, `gesellschaft`, `workflow`,
`zahlung`, `faellig`). Selecting a card clears all of them and applies its own, so two cards can
never be active at once, and resets to page 1. Clicking the active card clears it again.

There is deliberately **no "All" card**: it would be active on every fresh page and read as a
filter nobody applied. The outgoing list learned the same lesson; its total is a plain line under
the cards instead.

## 3. The SQL function

`public.invoice_queue_kpis(p_today date default current_date)` returns `(key, count, amount)`, one
row per card plus an `all` row.

Three things worth knowing before editing it:

- **It is a NEW function, not more columns on `invoices_kpis()`.** That one has been extended by
  five migrations that splice text into `pg_get_functiondef` and re-execute it. Its full source
  exists in no single file, and `20260828120000` aborts if it finds a second overload. Adding
  counts to it risks dropping clauses nobody can reconstruct.
- **The body is composed from the columns the Hub actually has.** A Hub without `property_code`,
  `workflow_status`, `paid_at` or `amount_gross` gets a working function with fewer cards rather
  than a failed install. Pre-rename Hubs are covered too: `gesellschaft_id` and `objekt_code` are
  accepted alongside the English names.
- **`p_today` is a parameter, not `current_date`.** The database server's day is not the reader's.
  Same rule migration `20260828120000` set for the list's due filter, so the card and the list
  agree on what "overdue" means.

The migration drops every existing overload before creating, because this file already shipped once
with a no-argument signature and `create or replace` would have added a second overload rather than
replacing the first. Verified idempotent by running it twice.

## 4. Next action

`nextAction(row)` in the config returns `review | approve | match | none`:

1. review still open → `review`
2. approved and unpaid → `approve`
3. unpaid with no confirmed bank match → `match`
4. otherwise → `none`

Rendered by `NextActionCell` as a brown label with a trailing arrow, or muted plain text for
`none`. It is the last column, after Payment, and is not a button: the whole row already
navigates to the document.

## 5. Table columns (incoming)

Cut from twelve to nine: **Supplier · Company · Amount · Invoice date · AI recognition · Review ·
Payment · Bank reconciliation · Next action**.

VAT folded under Amount. Received, Channel, Workflow status and DATEV were dropped from the list;
they remain on the detail page, and the badges are still used by the Kanban cards.

`AI recognition` and `Review` stay **separate columns**, and `Payment` and `Bank reconciliation`
likewise. Both pairs answer different questions and legitimately disagree: a perfectly read invoice
with no company is 100 % and still needs review; a paid invoice can have no bank match. Merged into
one column each, they read as a contradiction. This was tried and reverted.

## 6. Cards on the outgoing list

Three cards (`offen`, `ueberfaellig`, `bezahlt`), driven by local state through `onSelect` rather
than the URL. Figures are computed client-side in the existing `kennzahlen` memo, extended to carry
a sum per bucket. **No migration is involved.**

The status dropdown stays: the cards cover four of the six status values, and `entwurf` and
`storniert` are only reachable through it.

## 7. Still open

- The design's **filter tabs** (All / Needs attention / Payment / Missing information) are not
  built. A first attempt reused the card keys and came out as the same row twice, so it was
  removed. They need their own grouping, which the client has not defined; the mock's tab counts
  match neither the cards nor anything in the database.
- The design's **toolbar** (row selection, bulk actions, "Review priority") is not built.
- Not ported to Immonetz.

## 8. Applied where

`20260828180000_invoice_queue_kpis.sql` is applied and recorded on the live Stäy project
(`xsgbdtdwhrrhoeximeon`). Nowhere else.
