# Backend brief: field-driven review status

**Pipeline:** `book-keeping`, pack `german_invoice`. (Not `pipeline_new/` in this repo, which
is a vendored copy and was not touched.)
**Hubs:** this Hub and a sister Hub, both implemented.
**Status:** **implemented on both sides.** Section 8 records what shipped and where it differs from
the spec above.

The Hub currently reads `status`, `traffic_light`, `confidence_score` and the validation gates
exactly as the pipeline writes them today. This brief changes **what decides** those values, not
their names, types or vocabularies. Read section 5 before changing anything: breaking one of those
is a silent, invisible-in-testing break of the invoice list, the Kanban and the review card.

---

## 1. What has to change

1. **Mandatory-field presence decides `status` and `traffic_light`.** Today the traffic light is a
   confidence band that deterministic checks can cap (`core/rules/packs/this client/scoring.py`), and
   `status` is derived from it (`pack.py`: `status = "erkannt" if (ampel == "gruen" and verdict ==
"ok") else "zu_pruefen"`). After this change, a missing mandatory field is what puts an invoice
   in review, and AI confidence no longer decides it.
2. **AI confidence becomes reported, not deciding.** Keep writing `confidence_score`. The review
   card shows it as its own line. It must stop being able to send a complete, valid invoice into
   review on its own, and it must stop being able to keep an incomplete one out of review.
3. **Say which fields are absent, per field.** Emit `extracted.validation_detail` (section 3) so
   the card can name the fields rather than printing one generic sentence.

## 2. The decision rule

**`status` answers "does a person need to look at this". `traffic_light` answers "how bad is it".**
Two questions, and the light is a severity gauge over the same tally, not a second pass/fail flag.

Count the problems: every check whose entry is `missing` or `failed` (section 3) counts one.
`kleinbetrag` never counts. A check that is `ok`, `not_applicable` or `skipped` never counts.

| Problems                | `status`     | `traffic_light` | Reads as                                 |
| ----------------------- | ------------ | --------------- | ---------------------------------------- |
| 0                       | `erkannt`    | `gruen`         | everything present and valid             |
| 1 to `ampel_rot_ab - 1` | `zu_pruefen` | `gelb`          | review needed, only a few things missing |
| `ampel_rot_ab` or more  | `zu_pruefen` | `rot`           | review needed, a lot is missing          |

Add the threshold to `core/rules/packs/this client/thresholds.py` next to the existing bands, so it is
tunable per tenant rather than a literal in the branch:

```python
ampel_rot_ab: int = 3   # this many problems or more makes the light red
```

`3` is a starting value, not a decided one. Pick it against real data: run the tally over the
existing corpus and look at where the distribution actually splits.

A check that came back `unknown` (section 2.3) means review is needed but nothing is provably wrong,
so it produces `zu_pruefen` + `gelb` on its own and does **not** count toward the red threshold.

Two rules that already exist and must survive:

- **Assignment only ever tightens.** `pack.py` forces `zu_pruefen` when no company resolves
  (catch-all), when the resolver returns a `review_reason`, or when no resolver is wired. Keep that,
  and keep it one-directional: it may push `erkannt` to `zu_pruefen`, never the reverse.
- **Relevance still discards.** `verdict == "discard"` still means `ausgeschlossen`, ahead of all of
  the above.

### 2.1 Mandatory fields

The gates that answer "is it there at all". A miss here is one problem in the tally above:

| Check field             | Means                              | Mandatory when    |
| ----------------------- | ---------------------------------- | ----------------- |
| `steller_vorhanden`     | the document names a supplier      | always            |
| `brutto_vorhanden`      | the document has a gross amount    | always            |
| `rechnungsnr_vorhanden` | the document has an invoice number | not a Kleinbetrag |
| `datum_vorhanden`       | the document has an invoice date   | not a Kleinbetrag |

`kleinbetrag` (gross ≤ 250 €, `thresholds.kleinbetrag_max`) relaxes the last two per §14 UStG. It is
**not itself a check**: it never puts an invoice in review and must never be reported as a reason.

If the payable-invoice rules in today's `scoring.py` are to stay mandatory (an IBAN and a recipient
name are required when a real transfer is needed), give them their own presence gates rather than
folding them into the four above:

| Check field            | Means                               | Mandatory when                  |
| ---------------------- | ----------------------------------- | ------------------------------- |
| `iban_vorhanden`       | a payable invoice carries an IBAN   | `payable` and not a Kleinbetrag |
| `empfaenger_vorhanden` | a payable invoice names a recipient | `payable` and not a Kleinbetrag |

**Decide this explicitly and say which way you went.** Today a payable invoice with no IBAN is a
hard red. If these two are dropped, that invoice becomes `erkannt` and nobody looks at it before
payment. If they are kept, note that under the count rule a single missing IBAN is one problem, so
it lands amber rather than red. If a missing IBAN on a payable invoice should be red **on its own**,
it needs an explicit escalation list rather than a bigger count:

```python
# Problems serious enough to be red alone, whatever the tally says.
ampel_rot_immer: frozenset[str] = frozenset({"iban_vorhanden", "summe_ok"})
```

Say whether you want that list. Without it, "how many" is the only thing the colour reports, which
is exactly what was asked for and is simpler to reason about.

### 2.2 Validity checks

Present but wrong. Separate from presence, and a failure here is also one problem in the tally:

`summe_ok` (net + VAT equals gross) · `ust_satz_ok` (the rate is one of the tenant's active rates) ·
`iban_ok` (checksum) · `datum_plausibel` (not in the future).

### 2.3 Undecidable

A check that could not run against real data, where the honest answer is neither pass nor fail.
Today's example: no AI confidence at all. Use `status: "unknown"` on the entry and let it produce a
`gelb` light. Do **not** use `not_applicable` for this, which means "this check does not apply to
this document" and must never put an invoice in review.

## 3. `extracted.validation_detail`

One entry per check, keyed by the check field name.

```jsonc
"validation_detail": {
  "brutto_vorhanden": {
    "field": "brutto_vorhanden",
    "status": "missing",
    "values": {},
    "message": "No gross amount on the document."
  },
  "summe_ok": {
    "field": "summe_ok",
    "status": "ok",
    "values": { "found": 173.78, "expected": 173.78 },
    "message": "Net plus VAT matches the invoice total."
  },
  "iban_ok": {
    "field": "iban_ok",
    "status": "not_applicable",
    "values": { "iban_count": 0 },
    "message": "no IBAN on the document to check"
  }
}
```

- `field`: repeat the key. Redundant on purpose: entries get passed around individually.
- `status`: see the table below.
- `values`: whatever the check compared. Free-form, may be `{}`. Include the numbers behind a
  failure (`found` / `expected`) so a reviewer can see the discrepancy without reopening the PDF.
- `message`: one sentence. Currently English. See section 4.

### Status vocabulary

| `status`         | Meaning                                   | Puts the invoice in review      |
| ---------------- | ----------------------------------------- | ------------------------------- |
| `ok`             | the check passed                          | no                              |
| `not_applicable` | the check does not apply to this document | no                              |
| `skipped`        | the check did not run                     | no                              |
| `missing`        | a mandatory field is absent               | **yes**, counts one problem     |
| `failed`         | present but wrong                         | **yes**, counts one problem     |
| `unknown`        | could not be decided                      | **yes**, `gelb`, does not count |

**The front end already treats `ok`, `not_applicable` and `skipped` as passing and everything else
as a problem** (`pruefGruendeDetail` in `src/lib/data/format.ts`). That is an allow-list, so a status
you invent later still surfaces in the card rather than being silently swallowed. It also means a
typo in a status string reads as a failure. Do not add a passing status without telling the FE.

Emit an entry for **every** check, including the ones that passed. The card only lists failures, but
"the check ran and passed" and "the check never ran" have to be distinguishable.

## 4. Language

`message` is currently English while the Hub's UI is German. The front end handles this: for the
eight known gates it ignores `message` and renders its own German wording, keyed by the field name,
and it uses `message` only for a gate it has no wording for yet.

So: **you may keep writing English messages**, and a new check will surface with its English
sentence until the FE adds a German one. If you would rather the message be shown as-is, write it in
German. Either works. What must not happen is a check being dropped because it has no translation.

## 5. Do not change

Each of these would break the Hub without any error surfacing.

| Thing                       | Constraint                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoices.status`           | `erkannt` \| `zu_pruefen` \| `ausgeschlossen` \| `duplikat`. The Hub's list filter, KPIs and Kanban all key off these.                                                                                                                                                    |
| `invoices.traffic_light`    | German values `gruen` \| `gelb` \| `rot`, enforced by `invoices_traffic_light_chk`. `core.contracts.decision` uses English GREEN/YELLOW/RED internally; `_TRAFFIC_LIGHT_TO_DB` in `adapters/repo/receipts.py` maps back on write. Keep that translation in that one file. |
| `invoices.confidence_score` | **0..1 float**, not a percentage. `receipts.py` writes `decision.confidence / 100.0`. The Hub multiplies by 100 to display and compares against 0.8 / 0.95.                                                                                                               |
| `invoices.validation`       | Keep writing the flat booleans. Invoices ingested before `validation_detail` existed still render from them, and the Hub falls back to them per invoice.                                                                                                                  |
| `workflow_status`           | Untouched by any of this. It is the approval chain, a different axis. Do not let a validation result write it.                                                                                                                                                            |

## 6. Acceptance

Each of these is one invoice, checked in the Hub's detail screen:

1. Complete, valid, company resolves → badge **No review needed**, green, review card collapsed.
2. Supplier missing, nothing else → one problem, so **amber**, badge reads **Confirm**, and the card
   lists **Rechnungssteller** by name.
3. Gross 100 €, net 50 + VAT 19, everything else present → one problem, so **amber** and the badge
   reads **Confirm**. The card lists **Beträge**, and the entry carries `found` and `expected`.
4. Supplier, gross and invoice number all missing → three problems, so **red** and the badge reads
   **Needs review**. This is the case that proves the colour counts.
5. Gross ≤ 250 €, no invoice number → **No review needed**, green. The Kleinbetrag relaxation
   applies and `kleinbetrag` is not listed as a reason.
6. Gross > 250 €, no invoice number → one problem, so **amber**, card lists **Rechnungsnummer**.
7. Complete and valid, AI confidence 0.42 → **No review needed**, green, and the card shows
   "AI confidence: 42 %" on its own line. This is the case that proves confidence stopped deciding.
8. An invoice with no `validation_detail` at all (an old row) → renders exactly as it does today,
   from the flat `validation` gates.

## 7. What the front end does once this lands

Already built, no FE work needed for the first three:

- Reads `extracted.validation_detail`, falling back to `extracted.validation`, then to the
  `invoices.validation` column.
- Lists each failed check in the review card as **field name: reason**, in German for the eight
  known gates, otherwise the pipeline's own `message`.
- Shows AI confidence as its own line in the card, already separated from the review reasons.
- **Lists the checks that passed too**, collapsed behind "N weitere Prüfungen bestanden", and the
  card now renders the reported checks and nothing else — see §9.

Still to do on the FE, once the statuses above are real:

- German wording for `missing` vs `failed` where the two currently share one string.
- ~~Show `values.found` / `values.expected` inline on an amount mismatch.~~ Done:
  `pruefGrundZahlen()` renders them as "Erwartet 173,78 €, auf dem Beleg 100,00 €".

---

## 8. What shipped

### Pipeline (`book-keeping`)

| File                                                           | Change                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation.py`                                                | `MISSING` status added, so an absent field reads differently from a wrong one. `explain()` takes `payable` and emits the two transfer gates. Kleinbetrag relaxation moved **here**: a relaxed §14 gate is emitted `not_applicable`, so no consumer counts it. `problem_fields()` added as the one tally. |
| `scoring.py`                                                   | `score()` takes `detail` and counts problems instead of banding confidence. Falls back to `_problems_from_flat()` for a caller with no detail. Confidence is still returned and stored.                                                                                                                  |
| `thresholds.py`                                                | `ampel_rot_ab: int = 3` and `ampel_rot_immer: tuple[str, ...] = ("iban_vorhanden",)`.                                                                                                                                                                                                                    |
| `pack.py`                                                      | `explain()` now runs **before** `score()` and feeds it, so the light and the card count the same dict.                                                                                                                                                                                                   |
| `config/defaults.json`, `admin-ui/.../registry.generated.json` | both new thresholds registered.                                                                                                                                                                                                                                                                          |

Tests: 2266 passing (was 2258), ruff clean, import-linter contracts kept.

### Differences from the spec above

- **`ampel_rot_immer` was implemented, not left as a question.** A payable invoice with no IBAN is
  one problem by count and would have gone amber, quietly downgrading a payment-blocking condition
  that `test_a_transfer_invoice_without_an_iban_is_still_red` had been guarding. Blocking problems
  now outrank the tally. Empty the tuple and the colour reports nothing but "how many".
- **`skipped` is not emitted.** The FE accepts it; nothing produces it yet.
- **`unknown` is not emitted either.** "No AI confidence at all" used to force amber, and under the
  new rule confidence does not decide anything, so the case disappeared rather than needing a
  status of its own.
- **One test changed meaning.** `test_step_pipeline_matches_the_pack` asserted both paths reach the
  same colour. They deliberately no longer do: the generic scorer in `core/rules/scorer.py` is
  shared with the other packs and is still "a rejection is red, otherwise the bands decide", while
  this pack now counts. The test was rewritten to assert what still has to hold, that neither path
  lets a broken document through as green, and it says why the colours differ.

### Front end (both hubs)

- Two new reason ids, `iban_fehlt` and `empfaenger_fehlt`, with German and English wording and gate
  labels, so the transfer gates render like every other one.
- `pruefGrundZahlen()` formats the pair behind a failed total, shown under the reason as
  "Erwartet 173,78 €, auf dem Beleg 100,00 €".
- No change was needed for the count-based light. The badge already reads `gelb` as **Confirm** and
  anything else as **Needs review**, which is exactly "a few things" versus "a lot".

---

## 9. The card is check-driven (FE, both hubs)

The review card renders exactly what `pruefKarte()` returns — the reported checks, split into failed
and passed — and derives nothing of its own.

**`bestanden` now comes from `validation_detail`.** It previously came only from the older
`review_checks` array, so a receipt carrying the per-check map showed its failures and dropped
everything that had passed — the "N checks passed" line could never render for the shape this
contract specifies. Both sources feed it now.

**A passed check is `status: "ok"` only.** `not_applicable` and `skipped` are excluded from _both_
halves of the card: they mean the check never ran, and listing "IBAN gültig ✓" for a document that
carries no IBAN states a verdict nobody reached. So the §3 example payload — nine entries, all
passing — renders as **7 passed**: `kleinbetrag` is dropped as a modifier (§2.1) and `iban_ok` as
`not_applicable`. This is the acceptance behaviour for case 1 and case 5.

**Nothing that is not a check appears in the card.** Four sentences were removed from the list: a
confidence band, a traffic-light description, the pipeline's free-text `decision_reason`, and a
"nobody has confirmed this yet" fallback. The confidence one is what §1.2 removes and sat directly
under the card's own "KI-Konfidenz: 92 %" line; the fallback shipped and was visible in production
as a card headed "1 check" above its own text "No automatic check failed", drawn as a red bullet
behind a warning triangle.

**The card no longer reads `invoices.status`.** Its verdict is `reviewReasons.length > 0`. Status
answers whether a person still has to sign the receipt off and stays `zu_pruefen` until somebody
does, even when every check passed; binding the card to it is what forced those fallbacks to exist.
A receipt in review with nothing wrong now reads "Keine Beanstandung · 9 Prüfungen bestanden" in the
card and still reads as in review in the header. Both are true independently.

**What this means for the pipeline.** The card is now a pure function of what you send it, so:

- **Emit an entry for every check, passed ones included.** §3 already says this; it is now
  load-bearing rather than advisory. A check that stops being emitted disappears from the UI with no
  error anywhere.
- **A problem that is not expressed as a check is invisible.** `decision_reason` no longer surfaces
  here. If `pack.py`'s assignment catch-all forces `zu_pruefen` because no company resolved, that has
  to arrive as a check entry (the FE already maps a field named `assignment` to a
  "Gesellschaft" gate) or nothing in the card will mention it.
- **Watch for `status = 'zu_pruefen'` with every check passing and a green light.** Under §2 that
  combination should be `erkannt`/`gruen`. Where it still occurs the row either predates the
  field-driven status or was forced by the catch-all above.
