# Tier 2 — generic concept, real implementation work needed before porting

Points 10–12. The need behind each of these is real and not specific to this one client, but the current
implementation cannot be copy-pasted — it needs genuine design work, or (for point 12) should not
be ported at all because the template already has something better.

## 10. Private vs. business expense classification ("Privat")

A register of "private people" (with name-spelling aliases) a document can be filed under instead
of a company/property, a filter/count-by-person view of documents held back as private, and a
one-click "reclassify as business" action that routes the document to a company, property, or the
general inbox.

- Files: `src/routes/privat/index.tsx` (591 lines), `src/lib/private-person.ts` (101 lines);
  schema already has its own migration (`20261029200000_private_post_follows_its_person.sql`)
- Template equivalent: **none**. Zero hits for `private_person`/`PrivatePerson`.
- Verdict: **generic concept, needs real stripping/generalization before porting** — "some
  incoming mail is a private person's, not the business's" is a real need for any owner-managed
  company, not just this one, but the current implementation is wired tightly to this client's own
  people/alias model and German legal framing. Also feeds the private-post filter in point 6 of
  `00-generic-port-as-is.md`. Treat as a feature to redesign data-driven, not copy-paste.
- Size: medium (2 files, but a real entity concept behind it)

## 11. Input tax keys ("Vorsteuerschlüssel")

A maintained lookup table of VAT-deduction keys — code, label, VAT percent, deductible percent,
validity date range, active flag — used for DATEV-style bookkeeping on expenses.

- Files: `src/routes/vorsteuerschluessel/index.tsx` (316 lines)
- Template equivalent: **partial overlap, different mechanism**. The template's `/vat-rules` is a
  rule-engine (assignment rules targeting `vat_rate`, scoped by company/supplier/category) plus a
  VAT-reserve report — not a static lookup table of deduction keys with validity windows. Same
  domain (VAT treatment of expenses), genuinely different data model.
- Verdict: **needs design work, not a strip-and-ship** — porting this well means deciding whether
  it becomes a third target type on the template's existing assignment-rule engine, or stays a
  separate lookup table. Not a quick port.
- Size: medium (1 route)

## 12. Voice search button — no action (superseded)

The template's own `src/components/documents/voice-search-button.tsx` is already a more advanced
build (ported from a different client). **No action — do not port this client's version, it would
be a regression.**
