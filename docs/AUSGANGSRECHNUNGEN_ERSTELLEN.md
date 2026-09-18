# Outgoing invoices: the create flow

## Scope note (read first)

There is **no `/ausgangsrechnungen/neu` form**. `src/routes/ausgangsrechnungen/` holds exactly two
routes: `index.tsx` (the list) and `hochladen.tsx` (upload a PDF, let the AI extract it, correct the
fields, create the invoice). An earlier version of this doc described a hand-entry form with zod
validation, per-field messages and an always-enabled submit button. None of that was built. The
sections below say what is in the tree today and what is still open.

## What was reported

Four things, on `/ausgangsrechnungen` and the create flow behind it:

1. No KPI tiles at all, unlike the incoming-invoice screen sitting under the same nav entry.
2. A native `<input type="date">` calendar, no schema validation, no examples.
3. The company dropdown offered companies that cannot be invoiced from this screen, and only said
   so after the whole form was filled in, through a toast that switched to English mid-sentence.
4. Required fields were not marked, and the only feedback on a failed submit was a toast that
   disappeared in about two seconds.

## What is implemented

### KPI tiles (1) — done

`src/routes/ausgangsrechnungen/index.tsx` opens with a five-tile row: Rechnungen, Offen,
Überfällig, Volumen (Brutto), Noch offen. The three count tiles toggle their own status filter, the
two money tiles are read-only, and a voided invoice counts in neither total. Computed in the
`kennzahlen` `useMemo` over the rows the search matches but NOT the status filter, so the tiles keep
working as toggles, exactly as they do on the incoming screen.

### The date picker (2) — done

`src/components/ui/date-picker.tsx` is the one date control in the app. It takes and returns ISO
`yyyy-mm-dd`, so it is a drop-in for the native inputs it replaced, and it builds and reads dates
from LOCAL parts, never `toISOString()`, which shifts a date across midnight west of Greenwich.

It is a **text field with a calendar beside it**, not a calendar alone: the value is typed in the
numeric format of the selected language (`31.12.2026` / `12/31/2026`), and `inputToIso` also accepts
ISO and the separator-free `31122026`. A calendar-only control would have taken typing away from the
bulk paths (the manual bank-import table, the invoice detail edit) and put any date outside the
months it offers out of reach. The calendar's `startMonth`/`endMonth` span `[now-30, now+10]` years,
stretched further to cover whatever is selected or bounded, because in react-day-picker v9 those
bound navigation and not just the dropdown. The clear control and the calendar trigger are separate
real `<button>`s, so both are keyboard-reachable.

Month names in the caption dropdown follow the app's language, not the browser's:
`src/components/ui/calendar.tsx` derives `monatsSprache` from the date-fns `locale` it is handed.

Call sites that went through it: `ausgangsrechnungen/hochladen.tsx`, the invoice detail's editable
date fields (`eingangsrechnungen/$nr.tsx`), and the from/to filters on the invoice list, the
evaluations screen, the supplier page and the manual bank-link tab.

### Validation (2, 4) — partly done

`src/lib/forms/kunde-schema.ts` holds the customer rules as a zod schema. Its **one** call site is
the new-customer dialog on the Kunden screen (`src/routes/kunden/index.tsx`), which passes
`adressePflicht: false`. On a failed submit every message appears at once under the field it is
about, required fields carry an asterisk (`src/components/ui/form-field.tsx`), the Gesellschaft
combobox is marked with `invalid` like every other control, and the toast is the second signal
rather than the only one.

`adressePflicht: true` is the LexOffice rule (it refuses to invoice a contact with no billing
address). It has no call site yet, because no screen hands a customer to LexOffice.

**Still open:** `hochladen.tsx` has none of this. It validates nothing with zod, marks no required
fields, and still gates its submit button (`disabled={!canSubmit || createInvoice.isPending}`),
which is the greyed-out dead end item 4 was about.

### The dead-end company (3) — not done

`ComboboxOption` in `src/components/ui/combobox.tsx` has `disabled` and `hint` fields, and
`Combobox` renders both (a non-selectable row with a muted second line). **No call site passes
either.** The company dropdowns still list every company with no indication of which can be invoiced
from this screen.

The server's English `NOT_CONFIGURED` message (`src/lib/api/datev-handover.functions.ts:251`,
`src/lib/api/outgoing-invoice-extraction.functions.ts:139`) is still thrown and never caught for
translation in a UI, so it can still reach a German screen in English.

## Open items

- Wire `ComboboxOption.disabled` / `hint` to the company dropdowns on the outgoing-invoice screens
  and the Kunden dialog, or drop the unused API.
- Catch `NOT_CONFIGURED` in the outgoing-invoice failure handler and show a translated message that
  names the alternative (the upload route).
- Give `hochladen.tsx` the same treatment the Kunden dialog got: a zod schema, per-field messages,
  required-field asterisks, and a submit button that explains itself instead of being disabled.
- Decide whether a hand-entry `/ausgangsrechnungen/neu` form is wanted at all, or whether upload +
  AI extraction is the intended only path.

## Second pass on the same screen

- **The create button no longer hides the reason.** It used to disable itself whenever company,
  customer or any line item was incomplete, with no tooltip and no marked field, so a click did
  nothing and said nothing. It now only disables while a request is in flight; pressing it on an
  incomplete form writes a message under each field that needs one.
- **Menge and Nettobetrag are checked while you type.** They are text fields (German decimals, so
  `type="number"` is no help) and letters in them used to fail a background check that surfaced
  nowhere. An empty field says nothing yet; a filled one that is not a number says so at once, and
  the message clears itself the moment it becomes one.
- **The disabled delete icon says why.** An invoice needs at least one line item, so the trash
  button is disabled on the last one. The explanation sits on a wrapping `span`, because a disabled
  button fires no mouse events and a `title` on the button itself never appears.
- **Search covers the invoice number.** It matched the customer name and nothing else, so looking an
  invoice up by its number, the way anyone holding a paper copy would, found nothing. Both fields
  are matched now, and the placeholder says so.
- **Not reproduced, not changed:** a freshly created invoice briefly showing "Bezahlt" was seen once
  and did not recur. The status for `source in ('app','lexoffice')` is written by the accounting
  tool's own sync, never by this screen, so a shared dev database with another process running
  against it is the likely explanation. Worth re-checking if it appears again.
