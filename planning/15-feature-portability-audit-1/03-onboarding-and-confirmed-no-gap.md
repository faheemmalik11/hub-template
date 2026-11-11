# Onboarding-tour gap, and areas confirmed already shared

## Onboarding/tour infrastructure — mostly already superseded, one small gap

The template's `src/kit/onboarding/` and this client's Hub's `src/lib/onboarding/` are **the same
architecture** (near-identical filenames: `practice-workflow-lock.ts`, `practice-progress.ts`,
`practice-start-state.ts`, `practice-mode-session.ts`, `resolve-practice-task.ts`,
`event-bus.ts`) — the template simply moved it into a shared `kit`/`@hub-kit/core` package and
trimmed it to two tours (`process-an-invoice`, `when-does-it-stop`). This client's Hub still carries
two more task types.

## 16. Payment-file practice tour

`payment-file-practice-task.ts` + route: **generic, portable as-is, low effort** — the template's
`/payment-file` route is already feature-identical to this client's Hub's `zahlungsdatei`, so this is
just a missing tour definition riding an engine the template already owns.

The acquisition-case practice tour (point 14 in `02-stays-client-specific.md`) stays
client-specific, tied to the project-management module.

(Note: an earlier working assumption about a `practice-datev-handover.tsx` component was wrong —
no such file exists in this client's Hub; DATEV handover is referenced only as a string inside a generic
"stand-in step" type, not a standalone component.)

## 17. Confirmed "no gap" — mechanisms already shared

Verified by direct file comparison, not assumption:

- **postfach/inbox** (mailbox config, document-sources) — file-for-file match, renamed
  `postfach`→`inbox`. One extra component of this client's own, `filing-target-picker.tsx`, is tiny and not
  worth a separate line item.
- **dropbox** — identical mechanism, only import-path differences.
- **bank-import** (manual bank-statement import) — identical file set and mechanism, confirmed
  against the template's `module-payments` skill, which documents this exact path. this client's Hub has
  two extra test files (`duplicates.test.ts`, `normalize.test.ts`) worth copying over, not a
  feature gap.
- **MS Graph mailbox folders / DATEV-handover mail sending** — same mechanism both sides (see
  point 4 in `00-generic-port-as-is.md` for the one real gap, SharePoint).
