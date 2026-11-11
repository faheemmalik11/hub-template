# PropStack payment due date fields

Two new PropStack custom fields, from Fabian's 11 November briefing (§4.2–4.4). **Both fields now
exist in PropStack**, created 11 November 2026 directly in `https://crm.propstack.de/app/admin/custom_fields/for_properties`,
logged in as Lea, at the user's explicit request. Confirmed on that same visit: PropStack's API can
read and write a custom field's value once it exists, but creating the field itself is not an API
call — that one-time step had to happen by hand inside PropStack, same as Living Immo's own setup.

## What exists in PropStack now

1. **Zahlungsziel** — date-type custom field, key `zahlungsziel`.
2. **Zahlungsziel Hinweis** — free-text (Textarea) custom field, key `zahlungsziel_hinweis`, for
   when no fixed date exists (e.g. "as soon as possible after registration").

Both live in a new custom-field group also called "Zahlungsziel" (Objekte tab), and both were also
added to the actual property-edit form ("Objekt-Ansicht" → "Verkauf" group), directly alongside
"Realisierter Preis" and "Vermittlungsdatum" — matching the briefing's instruction that they sit
next to the four already-required fields. Confirmed after a hard reload that both the fields and
their placement persisted. Nothing else on the form, and no other custom-field group, was touched.

Adding a custom field in PropStack does **not** make it visible on the edit form by itself —
PropStack flags a freshly created field with "This field is currently not visible in the form" until
it's separately added to the form layout, which is why both steps above were done.

## What's left to build, now that the real keys are known

**Correction**: an earlier version of this doc claimed a `partial_custom_fields`/
`GET /custom_field_groups` pattern was "already used" in `_shared/propstack.ts`. That was wrong —
confirmed by direct search, this codebase has never called PropStack's custom-field endpoints at
all. The four fields already read today (realised price, sale date, external/internal commission)
are plain top-level attributes on PropStack's own `/units` response, not custom fields. Reading a
genuine custom field is new work, not an extension of something already built — now unblocked since
the real keys (`zahlungsziel`, `zahlungsziel_hinweis`) are known and don't need to be guessed.

1. **Done**: reading both fields alongside the existing four, in `toSyncedProperty()`
   (`src/lib/crm/propstack.ts`, copied to `supabase/functions/_shared/propstack.ts` via
   `scripts/build/copy-edge-shared.mjs`) — stored on `properties.payment_due_date` /
   `properties.payment_due_date_note`. No change needed in `propstack-client.ts`'s `syncUnits()`
   itself, since it already spreads `toSyncedProperty(unit)` straight into the upsert. Verified
   against the real PropStack API: set a real (test) value on a real property, confirmed via direct
   API call that it appears as `unit.custom_fields.zahlungsziel.value` /
   `unit.custom_fields.zahlungsziel_hinweis.value`, confirmed the mapping function parses that
   shape correctly, then cleared the test value from PropStack again. Also confirmed the mapping
   degrades safely to `null` when a unit has no custom fields at all or the value is empty.
2. **Done**: payment-terms derivation (§3.3/§4.3). `create_deal_invoices`
   (`supabase/schema/0011_functions.sql`) now reads the deal's property's `payment_due_date` and
   sets it as the new invoice's `due_date` at creation time — `null` when the property has none yet,
   matching the briefing's "without a date: do not dun" rule exactly (the existing
   `set_expected_payment_on()` trigger from `0023_expected_payment.sql` already only derives its own
   "expected payment" date when `due_date is null`, so this needed no further change there).
   `lexoffice-invoice-push`'s `buildInvoicePayload` now passes that `due_date` through as Lexware's
   own `dueDate` field (added to `LexofficeInvoiceInput`, previously never set). Verified inside a
   rolled-back transaction against two real deals: one where the property has a due date (the
   invoice correctly got that date), one where it doesn't (the invoice's `due_date` correctly stayed
   `null`) — nothing persisted either way.
3. **Two-way sync** (§4.4), explicitly modelled on Living Immo, not designed fresh: a prompt in the
   Hub when a property is missing the realised price, sale date, or either commission rate (pointing
   at it, with a link to the property), and a write-back to PropStack the moment a value is added
   or corrected in the Hub. No existing pattern anywhere in this repo to copy for either half of
   this — confirmed no outbound PropStack write exists, and no auto-detecting "missing field"
   banner exists either (`NOTIFY_SOMEONE` is person-initiated, not auto-detected).

## Status

**The six-week notary reminder (§4.3) is built and does not need to wait** — it only needed the new
column, not the real PropStack field, since it fires on "still null" regardless of why:
`public.notify_missing_payment_dates()` (`supabase/schema/0041_propstack_payment_due_date.sql`),
modelled directly on the existing `notify_overdue_payments()` (`0023_expected_payment.sql`): scans
deals six weeks past their notary date whose property has neither a due date nor a note yet, notifies
administrators once, stamps `properties.payment_due_date_notified_at` so it never re-fires. Wired
through the template's own `scheduled_jobs` mechanism (`payment_due_date_reminder` in
`supabase/catalogue.sql`, Edge Function `payment-due-date-reminder`), off by default like every
other scheduled job, rather than the one-off `cron.schedule` shortcut the overdue-payment job used.

**Reading the two fields into the Hub (item 1 above) is also done.** Deriving the invoice due date
and the two-way sync are not started, but are no longer blocked — the fields exist and their real
keys are known. The spec above is concrete enough to build from directly. Next real-world check:
confirm the actual hourly `propstack_sync` job (once deployed/enabled) picks up a real due date the
next time someone enters one in PropStack — not yet verified end-to-end since deploying the updated
Edge Function is a separate, pending step.
