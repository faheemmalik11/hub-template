# Feature portability audit — client Hub #1

This surveys a real client's Hub — forked from an earlier snapshot of this template with no shared
git history left — end to end against the template's current state (eight modules, English routes),
and lists every feature area it has that this template does not, with a portability call for each.

This is the first of what will be several such audits under `planning/`. Later ones get their own
numbered folder alongside this one, never a client's name — see CLAUDE.md's hard rule against
writing a client's name in this repository.

Standard screens already confirmed identical (not written up as points): incoming/outgoing
invoices, suppliers, customers, companies, properties, categories, bank accounts/transactions/
connections, open items, opos-whitelist, manual bookings, assignment/approval/exclusion rules, VAT
rules, tax reserve, DATEV handover, team, notifications, activity log, trash, file naming, payment
file — all map 1:1 onto the template's current routes.

| File | What it holds |
|---|---|
| `00-generic-port-as-is.md` | Points 1–9: missing, fully generic, no stripping needed |
| `01-generic-needs-generalizing.md` | Points 10–12: generic concept, real design/implementation work before porting |
| `02-stays-client-specific.md` | Points 13–15: tied to this client's own business decisions, not worth generalizing yet |
| `03-onboarding-and-confirmed-no-gap.md` | Point 16 (the one real onboarding-tour gap) and point 17 (areas checked and found already shared) |

## Checklist

Go through these one by one; mark a decision on each as it's made.

- [ ] 1. Bulk data export tool
- [ ] 2. MFA / two-factor authentication
- [ ] 3. Document types catalogue (admin screen)
- [ ] 4. SharePoint browsing/search via MS Graph
- [ ] 5. Confidence/recognition-threshold admin screen
- [ ] 6. Document-intake triage log ("Posteingang")
- [ ] 7. Voice dictation → create a document
- [ ] 8. Region-restricted sign-in
- [ ] 9. Client-side crash logging to the database
- [ ] 10. Private vs. business expense classification ("Privat")
- [ ] 11. Input tax keys ("Vorsteuerschlüssel")
- [ ] 12. Voice search button — no action (superseded)
- [ ] 13. Project management / property-acquisition pipeline
- [ ] 14. Acquisition-case practice/tour
- [ ] 15. "integrations" component — false alarm, no action
- [ ] 16. Payment-file practice tour (small, generic gap in the onboarding engine)
- [ ] 17. Confirmed "no gap" areas (postfach/inbox, dropbox, graph mailbox, bank-import)

## Suggested priority order if porting

1. Export tool, MFA, document-types catalogue, confidence-thresholds screen — all genuinely
   missing, fully generic, no stripping needed, clear value to every client.
2. SharePoint browsing/search, voice-dictation-to-upload, payment-file practice tour — small,
   generic, low effort.
3. Posteingang triage log, region-restricted sign-in — generic but each needs one specific thing
   generalized/stripped first (the private-post filter; the hardcoded country list).
4. Private-person classification, input-tax-keys — real but genuine design work before porting;
   don't copy-paste.
5. Project-management/acquisition pipeline — leave client-specific unless a second buy-side client
   appears.
