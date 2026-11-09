# Tier 3 — stays client-specific

Points 13–15. These are tied to mayestate's own business decisions (a buy-side acquisition
workflow, its own mailbox and named assignees, code-as-rules rather than data-as-rules) and are
not worth generalizing unless a second client with the same need shows up.

## 13. Project management / property-acquisition pipeline

A buy-side property-acquisition workflow: inbound broker offers get auto-scored (red/yellow/green)
against an editable acquisition profile (unit-count range, population minimum, property type,
town blocklist), triaged (express interest/decline/reply with templates), tracked against
German-specific legal deadlines ("Vorkenntnis" disclosure window), then moved into a kanban
"properties under review" board with phases and a deal-calculation tab (cost items, target margin,
discount defaults).

- Files: `src/routes/project-management/{index.tsx, acquisition-profile/index.tsx,
  properties/{index.tsx,$id.tsx,new.tsx}}`; `src/components/project-management/` (16 files —
  pm-header, phase-bar, calculation-tab, units-tab, documents-tab, notary/offer/nda actions,
  reply-dialog, etc.); `src/lib/data/{acquisition.ts, acq-properties.ts, calculation.ts}`;
  onboarding tie-in `src/lib/onboarding/{seed-acquisition-practice-case.ts,
  acquisition-practice-task.ts}`, `src/components/acquisition-practice-runner.tsx`. Permission key
  `PERMISSIONS.pageProjektmanagement`.
- Template equivalent: **none directly**; closest conceptual relatives are the template's
  `properties.crm_sync` (Propstack-synced listings) and `module.invoices`'s
  `commission-deals`/`broker-bonuses` — both built for the *sell-side* (an estate agency earning
  commission, ported from client "van Oepen"). Mayestate2's feature is the mirror image: *buy-side*
  intake and qualification before acquisition. Different direction, different data shape.
- Verdict: **stays client-specific**, large effort to generalize. The pattern (inbound-offer inbox
  → rule-based scoring against a configurable profile → kanban pipeline → deal-calculation
  defaults) is reusable in principle, but the implementation hardcodes a specific mailbox
  (`einkauf@mayestate.com`), named assignees as literal values rather than roles, and
  German-law-specific deadline concepts, and the "rules" are code, not data (unlike the template's
  own assignment/approval rules, which are rows). Revisit only if a second buy-side client
  justifies rebuilding the rule engine as data-driven.
- Size: large (~25-30 files)

## 14. Acquisition-case practice/tour

A guided-practice tour for the project-management screens above, using the same practice-mode
engine the template already has (see `03-onboarding-and-confirmed-no-gap.md`).

- Verdict: **stays client-specific** — tied one-to-one to point 13; portable only once/if that
  module is ported.
- Size: small (1 component + task definitions), not worth porting alone

## 15. "integrations" component — false alarm, not a feature at all

`src/components/integrations/route-status.tsx` is **byte-identical** to the template's own file
of the same name and path, already owned by `module.taxes` (the DATEV/LexOffice
"configured/enabled" status pill). Not a CRM, not Propstack-related, not client-specific — it's
the same shared file already in both repos. **No action needed.**
