# Incoming-invoice detail screen — audit resolution (Stäy Hub)

The audit itself was carried out on Immonetz. Its full write-up, including the reasoning behind
each finding and two findings that were withdrawn after re-testing, lives in the sibling repo at
`immonetz/docs/audit/eingangsrechnungen/invoice-detail/ISSUES.md`. This file records what is
implemented **here**, so a session working only in this repo can verify it against the code.

Screen: `src/routes/eingangsrechnungen/$nr.tsx`. Cover: `e2e/beleg-detail.spec.ts`.

## What is implemented

1. **Unsaved edits are never discarded silently.** `geaenderteFelder` derives the dirty field list
   from `diffChanges(form, basis)`, the same helper the save path uses, and maps the raw
   `FormState` keys through `FELD_LABEL_DE` so the dialog names fields the way the screen does
   ("Rechnungsnummer", not `invoice_number`). Two routes reach the same dialog: `tabWunsch` for a
   tab click, which keeps the person on the invoice, and `useBlocker` for leaving it, with
   `enableBeforeUnload` covering a reload or a closed tab. An opened but untouched form asks
   nothing. The guard also covers the three ways an edit could still be lost (see "Follow-up
   fixes" below): another section's edit button, the supplier combobox, and unparseable numeric
   input.
2. **A free-text category is shown rather than hidden.** `freitextKategorie` falls back to
   `cost_category` when `category_id` is null, rendered as "… (nur Freitext)" with a note saying
   assignment rules match on it while the cost analysis counts it as unassigned.
   `passendeKategorie` offers one-click linking via `kategorieVerknuepfen()` when the free text
   names a real category exactly, case aside; a near-miss is left to a person. The link writes
   `cost_category_source: "human"` alongside `category_id` and logs through `feldAenderungDe`,
   exactly like a hand-made edit.
3. **The workflow axis is named "Workflow-Status"** and both axes carry a permanent hint
   (`belege.detail.axis.workflowHint` / `zahlungHint`) rather than one state's paragraph.
4. **The browser tab title names the receipt**, supplier first and invoice number second, set from
   an effect in `BelegDetail` over the route's static `head:`.
5. **The `<h1>` wraps both branches**, linked supplier and not, so the normal case is no longer a
   page without a heading. `sm:truncate` is gone: the name wraps instead of clipping.

## Verification (18.08.2026)

- `e2e/beleg-detail.spec.ts`: 7 passed, 2 skipped. Both skips are data-dependent, not failures.
  This database holds **zero** receipts with a free-text `cost_category` and no `category_id`, so
  #2 has nothing to match, and #3 needs a receipt at the paid step within the first ten rows.
- #2 was still verified live, by clearing one receipt's `category_id` in place, checking the screen
  showed "Software / Lizenzen (nur Freitext)" with its link button, then restoring the original
  value and `updated_at`. The database was re-checked back to zero free-text-only receipts.
- `bunx tsc --noEmit` clean. No receipt left modified.

## Follow-up fixes (19.08.2026)

A review of the commit above found six ways the new guard could still lose an edit, plus the
category link's missing provenance stamp. All are fixed in `src/routes/eingangsrechnungen/$nr.tsx`
unless noted:

1. **`kategorieVerknuepfen` now stamps `cost_category_source: "human"`.** `apply_assignment_rules`
   (migration `0083_direct_property_company.sql`) only skips a field when
   `coalesce(cost_category_source,'ai') = 'human'`, so without the stamp the next "Regeln anwenden"
   overwrote the link a reviewer had just made, and `QuelleBadge` kept showing KI/Regel next to it.
2. **One section at a time is enforced.** `kannBearbeiten(section)` disables every other section's
   "Bearbeiten" button (`Section` gained an `editDisabled` prop plus the
   `belege.detail.action.bearbeitenGesperrt` hint). Before, switching from "Rechnung" to
   "Zuordnung" on the same tab ran `startEdit`, which resets `form` from `beleg`, and threw away
   everything typed with no dialog.
3. **The supplier reassignment counts as unsaved.** The Lieferant section edits `lieferantWahl`,
   not `form`, so `diffChanges` never saw it; `lieferantGeaendert` now feeds `geaenderteFelder`.
4. **Dirtiness is measured against `basis`, a snapshot taken in `startEdit`,** not the live
   `beleg`, which refetches on window focus and after every mutation. `speichern()` diffs against
   `basis` too, so a save writes only the fields the reviewer actually touched and can no longer
   revert a rule run that happened while the section was open; the history's `before` values are
   still read from the live `beleg`, since that is what the write actually replaces.
5. **The redirect after "Verwerfen" is not blocked.** `verwerfen()` sets the `eigeneNavigation`
   ref before navigating, and `shouldBlockFn` honours it. Before, the dialog appeared after the
   soft delete and "Weiter bearbeiten" cancelled the redirect, leaving the reviewer on a deleted
   receipt.
6. **`vat_deductible_pct` and `vat_special_case` have `FELD_LABEL_DE` entries** (`src/lib/data/
format.ts`), so the dialog and the history no longer print English column names in German text.
   `feldWertDe` renders `vat_deductible_pct` with a "%" suffix, like `vat_rate`.
7. **Unparseable numeric input counts as unsaved.** `diffChanges` returns it in `invalid` rather
   than `labels`, so it never reached the dialog. Defensive rather than reachable today: every
   `NUM_KEYS` field is rendered as `<input type="number">`, and the browser sanitises "1.2.3" to an
   empty value before React sees it. It matters the moment one of those fields is rendered as text.
8. **The category link's history line goes through `feldAenderungDe`** instead of a hand-rolled
   string, so every entry keeps the same "Kategorie (BWA): X → Y" shape.

### Verification (19.08.2026)

- `e2e/beleg-detail.spec.ts` grew a `#1b` block covering the three loss paths that are reachable
  from the UI: another section's edit button is present but disabled while one section is open, a
  supplier change counts as unsaved and names "Lieferant" (not `supplier_id`) in the dialog, and an
  untouched open section does not block leaving the receipt — the same path the post-discard
  redirect takes. Nothing in it saves.
- Full run: **10 passed, 2 skipped**. The two skips are the same data-dependent ones as on
  18.08.2026, not failures.
- `bunx tsc --noEmit` clean, `bun run lint` clean (0 errors; the 19 warnings are pre-existing and
  none are in this screen).
- The two ad-hoc Playwright scratch scripts the audit left at the repo root (`check-err.mjs`,
  `check-obs.mjs`) moved into `e2e/`, which `.gitignore` already covers.
