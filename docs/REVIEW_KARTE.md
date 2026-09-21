# Review-Karte und Ausgangsrechnungs-Flag

Two things on the incoming-invoice screens that both read what the ingest pipeline wrote and
turn it into something a reviewer can act on. Written down together because they were built in
one pass and share the same portability rule.

## 1. The review card

**Where:** `src/features/invoice-detail/ReviewKarte.tsx`. The page renders it at `REVIEW_ANKER`
(`id="review-box"`, defined in `config.ts`); the header's review chip scrolls to it and flashes it
(`zeigeReview`). The component takes already-translated lines plus a jump callback, so nothing
repo-specific is baked into it.

### What it shows

Exactly the checks from `invoices.validation_detail` that did **not** pass, and nothing else.

- No passed-checks list. It used to carry every check that held, collapsed behind
  "N Prüfungen bestanden". That is an affirmation nobody acts on, sitting in the space of the
  list that has work in it.
- No AI confidence, no traffic-light sentence, no free-text `decision_reason`. Those describe
  the receipt, not a check, and each has its own place on the screen.
- **When nothing failed the card does not render at all.** A panel whose whole content is
  "nothing was flagged" is screen space spent confirming the absence of work. The header chip
  already says as much in one word.
- Each entry carries the German gate label, the German reason, and the compared figures where
  there are any (`pruefGrundZahlen`, currently `sum_matches` only). The pipeline's English
  `message` is **not** rendered next to the German reason: for a known gate the two say the same
  thing in two languages, which reads as the card repeating itself. It is still the fallback text
  for a check this app has no wording for yet (`g.id === null`).
- The card is titled for the question a reader arrives with ("Warum dieser Beleg zur Prüfung
  liegt"), not for the mechanism ("Diese Prüfungen sind fehlgeschlagen"). The failed checks are
  the answer to that question.

### The review chip has two states

`ReviewBadge` in `src/features/invoice-detail/ReviewChip.tsx`. It takes `reasonCount` and nothing
else:

| findings | colour  | label                                      |
| -------- | ------- | ------------------------------------------ |
| 0        | emerald | "Keine Prüfung nötig" / "No review needed" |
| > 0      | red     | "Zu prüfen · N" / "Needs review · N"       |

It used to carry three states off `status` and `traffic_light`. Two problems with that. The label
came from `status`, which stays `zu_pruefen` until a person signs the receipt off and says nothing
about whether a check failed, so a clean receipt wore a green chip reading "Zu prüfen" that opened
an empty panel (invoice `84183ae5-ed09-47cf-a483-880416efe100`). And the amber middle tier
("Bestätigen") answered the same question as the green one in different words and a different
colour, so the chip had two ways of saying yes.

The same component renders in the invoice list's Review column and in the detail header, from the
same `reasonCount`, so the two screens cannot disagree. The card takes the chip's red, because it
only renders when the chip is red.

On the detail screen the chip is an `InfoTipButton` when there are findings: clicking scrolls to
the card and flashes it, and the tooltip says the count plus what the click does. With none there
is no card to open, so the chip is a plain `Tooltip` around a bare span. No pointer, no hover
lift, out of the tab order, and a one-line tooltip stating the verdict rather than promising a
click that would land on nothing.

### Every entry is a button

A failed check whose field exists on this page is a full-width button. Clicking it:

1. switches to the tab that holds the field (`springeZu` → `handleTabChange`),
2. scrolls the section into view once it has mounted (the `scrollZiel` effect polls across
   frames, because Radix mounts `TabsContent` a render or two after `activeTab` flips),
3. **flashes the section** with an amber ring for 1.8 s, applied to the DOM node directly.

The field → destination map is `FELD_SPRUNGZIEL` in `config.ts`, the per-repo file, because the
destinations are this repo's own sections. A check with no entry there (a safety invariant, an
exclusion rule) renders as plain text, not a dead button. Each actionable row carries "Beheben →"
beside the field name rather than a bare arrow at the far right: an arrow floating in empty space
says something is clickable without saying what happens.

### Where the data comes from

`pruefKarte()` / `pruefGruendeDetail()` in `src/features/invoice-detail/pruefung.ts`, in this
order:

| #   | Source                                                                           | Why it is still read                               |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `invoices.validation_detail` (column, migration `0007_validation_detail_column`) | what the pipeline writes today                     |
| 2   | `extracted.validation_detail`                                                    | the same map's first home, before it got a column  |
| 3   | `extracted.review_checks`                                                        | the older array shape                              |
| 4   | `extracted.validation` / `invoices.validation` (flat booleans)                   | receipts ingested before any per-check map existed |

`validierungDetail()` reads 1 then 2 and treats an empty object as absent. Both `pruefKarte` and
`pruefGruendeDetail` try the per-check map before the `review_checks` array: where both exist
they describe the same run, so preferring the array only meant rendering the older account of it.

### The checks the column carries

Nine field-level checks and five review-decision reasons, all named in English:

`gross_present` · `issuer_present` · `date_present` · `invoice_number_present` · `sum_matches` ·
`vat_rate_valid` · `iban_checksum_valid` · `date_not_future` · `is_small_amount` ·
`recipient_present` · `payable_iban_present` · `iban_unambiguous` · `relevance_ok` ·
`assignment_resolved`

Each entry has `status` (`ok` | `failed` | `not_applicable`, plus `skipped`/`missing`/`unknown`
from the older contract), an English `message`, and free-form `values`.

Three things about that list are load-bearing:

- **`is_small_amount` is a modifier, not a gate.** Its `failed` means "this is NOT a small
  amount, so the full §14 checks apply". It sits in `VALIDIERUNG_MODIFIER` and is never listed
  as a problem. Without that, 33 of the 48 invoices carrying the column showed a bogus finding
  telling the reader to go and fix the invoice for being large.
- **Status handling is an allow-list.** `ok`, `not_applicable` and `skipped` pass; anything else
  is a problem. A status the pipeline invents later surfaces rather than being swallowed.
- **No Kleinbetrag relaxation is applied to the map.** The map states each check's own status,
  so a gate the pipeline means to waive is written `not_applicable` or `skipped` and passes on
  that alone. What the map says failed, the card shows. Re-deriving a waiver from
  `is_small_amount` on top of that let one check silently suppress another: invoice
  `72647ba7-b23b-41d8-b858-db5cf3065420` in a sister Hub is -270,44 EUR and the pipeline compared the negative
  number against the 250 EUR threshold, so it came through as "small amount, lighter checks
  apply" and a genuinely missing invoice number vanished from the card. The flat-boolean fallback
  (source 4) keeps its own relaxation, because there the gates cannot say "waived" and somebody
  has to apply the rule.

Field → reason id lives in `VALIDIERUNG_FELD_GRUND` (`pruefung.ts`), field → German label/hint
under the i18n key
`belege.validierung.gate.<field>.{label,hint}` in `de.ts` / `en.ts`. A check with no wording yet
renders the pipeline's own `message` instead of vanishing.

### The card's verdict is not `invoices.status`

`reviewTon` is derived from the failed-check list, once, and both the header chip and the card
wear it. `status = 'zu_pruefen'` answers a different question (has a person signed this off), and
stays set until somebody does even when every check passed. So a receipt can read "needs review"
in the header and green in the card. That is the truth on both counts.

## 1b. Re-checking after a correction

The pipeline's verdict is a snapshot of what the document said at ingest. By the time somebody is
looking at the screen a company may have been assigned, an invoice number typed in, an amount
corrected. A card that still reports "no company could be resolved" beside a visibly assigned
company is not reporting a problem, it is reporting its own staleness.

**Every check that can be re-run is re-run against the invoice's current data, before anything is
displayed.** `belegNachgeprueft()` in `src/features/invoice-detail/nachpruefung.ts`.

### The rules are a port, not a rewrite

Each one is the same rule `core/rules/packs/german_invoice/validation.py` and `pack.py` apply in
the ingest pipeline (the `book-keeping` repo), including ISO 13616 mod-97 from
`core/rules/iban_checksum.py` and the 0,02 EUR tolerance from `Thresholds.summe_toleranz`. A check
that passes here has passed the pipeline's own test.

| Check                                                                                            | Re-run from                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `gross_present`, `issuer_present`, `date_present`, `invoice_number_present`, `recipient_present` | the column, non-empty                                                                |
| `assignment_resolved`                                                                            | `company_code` non-empty (pack.py's `catchall`)                                      |
| `sum_matches`                                                                                    | `amount_net + vat_amount` vs `extracted.zwischensumme_brutto ?? amount_gross`, ±0,02 |
| `vat_rate_valid`                                                                                 | `round(vat_rate)` in `values.active_rates` from the pipeline's own entry             |
| `date_not_future`                                                                                | `document_date <= today`                                                             |
| `iban_checksum_valid`, `payable_iban_present`, `iban_unambiguous`                                | the supplier's IBAN when set, else `extracted.iban`                                  |

`relevance_ok` is not re-runnable: "is this an invoice worth processing" is a judgement about the
document, and nothing typed into this screen answers it. `is_small_amount` is a modifier and is
never corrected.

Three things the port has to get right:

- **The IBAN checks follow the supplier record.** The pipeline reads the IBANs it found on the
  document; a reviewer who types the account into the supplier record has answered the question
  the check was asking, so the supplier's IBAN wins when set. This is the one place a correction
  changes what a check looks at rather than only re-running it.
- **`payable` and Kleinbetrag are read back off the pipeline's entry**, not re-derived. The
  pipeline decides them from markers on the document (payment terms, direct-debit wording, a
  "bereits bezahlt" stamp), none of which is in a column here. `not_applicable` already IS its
  answer to "did this check apply", and that does not change when a field is corrected.

### Nothing is stored

There is no column and no write path. The verdict is derived from the invoice row every time
something reads it. `belegNachgeprueft()` returns a NEW object with `validation_detail` replaced
by the verified map; corrected entries carry `source: "human"` and a timestamp, in memory only.
It is idempotent, so calling it twice is harmless.

**The database is never written by any of this.** `validation_detail` is the record of what the
extraction actually found, and overwriting it would destroy the only evidence of what the document
said before a person touched it.

That was not the first design. The re-check originally wrote its result to a new
`invoices.user_edits` column, merged over `validation_detail` on read. The column existed for one
reason: the three IBAN checks need the supplier's account, the invoice list did not load
suppliers, so it had to fall back on something persisted. That is solving staleness by adding a
thing that goes stale, and it dragged a migration, a write path in `commitSpeichern` and a
"could not check is not the same as failed" merge rule along with it. Fetching the IBANs of the
suppliers the rows actually reference costs one query and removes all of it.

### Where it runs: at the read, not in the screens

`useBeleg` and `useBelegeListe` in `src/lib/data/queries.ts` both pass their rows through
`nachgeprueft()` before returning them. Every screen therefore receives invoices whose
`validation_detail` is already the verified map, and no component calls the validator at all.

That is the point of putting it there. A per-component call is a call somebody forgets, and two
screens that each verify separately are two screens that can disagree about whether an invoice
still needs review. `nachgeprueft()` also fetches the IBANs of the suppliers **those rows**
reference (`select("id, iban").in("id", ids)`), so the three transfer checks can run without any
screen having to arrange it.

| Caller                                                                      | Gets                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `useBeleg`                                                                  | one verified invoice                                                                                           |
| `useBelegeListe`                                                            | a verified page, including the range-fallback page                                                             |
| `validateInvoice` server fn (`src/lib/api/invoice-validation.functions.ts`) | every check plus `offen` / `korrigiert`, for an integration that should not reimplement fourteen checks in SQL |

All three are read-only. The one place the validator is still called by hand is
`commitSpeichern`, which runs it on the invoice as it _will be_ after the save, to work out which
checks the edit fixed or broke for the history entry. That is a future state, not a read.

### The audit trail

A check that flips is appended to the same `invoice_history` entry as the edit that caused it, as
`Prüfung behoben: <check>` or `Prüfung wieder offen: <check>` (German, via `tDe`, like every other
line there). `data.pruefungen_behoben` / `data.pruefungen_zurueck` carry the same thing
machine-readably.

## 2. The outgoing-invoice flag

A document issued **by** one of our own companies, sitting in the incoming queue. It is kept
rather than dropped so nothing the pipeline read is lost, but auto-assigning a company to it
would have that company paying itself, so it has to be visible at a glance.

| File                                          | Role                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/invoice-detail/ausgang.ts`      | `istAusgangsrechnung(beleg)` — reads `extracted.richtung === "ausgang"`. No `direction` column exists yet; when one arrives this is the only place that changes. |
| `src/features/invoice-detail/AusgangFlag.tsx` | `AusgangBanner` (the rose strip on the detail screen) and `AusgangBadge` (the short chip for a list row, with the full sentence as its tooltip).                 |

Rendered by:

- `InvoiceDetailPage.tsx` — `<AusgangBanner beleg={beleg} className="mt-6" />`, above the archive
  and mailbox banners.
- `src/routes/eingangsrechnungen/index.tsx` — `<AusgangBadge beleg={b} />` beside the supplier
  name, in the desktop table cell and in the mobile card. One chip per row, and next to the name
  rather than in the badge row below it: what it says is that this issuer is one of our own
  companies, and beside the issuer that reads as one fact instead of two.

Text: `belege.detail.banner.outgoing`, `…outgoingKurz`, `…outgoingUnknownRecipient`.

## Portability

Everything here is in `src/features/invoice-detail/` and is meant to be copied as it stands,
like the rest of that folder except `config.ts` (see its `PORTING.md`).

| File              | Portable?                                           |
| ----------------- | --------------------------------------------------- |
| `pruefung.ts`     | yes                                                 |
| `nachpruefung.ts` | yes                                                 |
| `ReviewKarte.tsx` | yes                                                 |
| `ReviewChip.tsx`  | yes                                                 |
| `ausgang.ts`      | yes                                                 |
| `AusgangFlag.tsx` | yes                                                 |
| `config.ts`       | **no** — anchors and `FELD_SPRUNGZIEL` are per repo |

### Porting to another hub

1. Copy the six portable files in.
2. **Delete the validation block from that repo's `src/lib/data/format.ts`** (everything from
   `ValidierungGateKey` through `pruefGruende`, plus `pruefScore`) and re-point its importers at
   `@/features/invoice-detail/pruefung`. `format.ts` must not import `pruefung.ts`: `pruefung.ts`
   imports `formatEUR` from it, and that is why `pruefScore` moved rather than staying behind.
3. Add `validation_detail` to the `Beleg` interface in `types.ts`. The list and detail queries
   both `select("*")`, so nothing else is needed to fetch it, and there is no migration.
   Call `nachgeprueft()` from that repo's `useBeleg` / list hook, so screens never see an
   unverified row.
4. Add the anchors and `FELD_SPRUNGZIEL` to that repo's `config.ts`, pointing at its own tabs.
5. Add the i18n keys: `belege.validierung.gate.<check>.{label,hint}` for all 14 checks,
   `belege.detail.review.{title,pruefungen,beheben,waehlen,needed,none}`,
   `belege.detail.tip.{reviewBefund,reviewAlleBestanden,reviewOhneBefund,reviewOeffnen}`,
   `belege.detail.banner.{outgoing,outgoingKurz,outgoingUnknownRecipient}`.
6. Render `<ReviewKarte>`, `<ReviewBadge>`, `<AusgangBanner>` and `<AusgangBadge>` from the page
   and the list. `tsc --noEmit` finds anything missing.

## Open

- Built in a sister Hub, ported here. Not yet carried to another client.
- `invoices.validation_detail` was populated on 48 rows in a sister Hub at the time of writing. Older invoices
  fall through to sources 2 to 4 above; there is no backfill.
- The pipeline compares the raw gross against the 250 EUR threshold for `is_small_amount`, not
  its magnitude, so every negative-gross row is reported as a small amount. It no longer hides
  anything in the card (no relaxation is applied to the map), but it is still wrong in the data.
