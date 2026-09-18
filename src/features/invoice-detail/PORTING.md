# Invoice detail — portable feature folder

The invoice detail page lives here so it can be carried between the hub repos
(Staeyhub, Immonetz, Mayestate, …) as a unit. The rule that makes that work:

> **Every file in this folder except `config.ts` is meant to be byte-identical
> across repos.** All intentional differences live in `config.ts`. If you are
> editing any other file here for one repo only, stop — what you are changing
> is probably config.

Checking for drift between two repos:

```sh
diff -r --exclude=config.ts <repoA>/src/features/invoice-detail <repoB>/src/features/invoice-detail
```

An empty diff means the repos share the page; anything else is either an
update that has not been carried over yet, or a mistake.

## What's in the folder

| File                       | Role                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `InvoiceDetailPage.tsx`    | The page: header (identity, chips, workflow bar, control row), tabs, cards, dialogs. Exports `BelegDetailPage`.      |
| `WorkflowVerlaufListe.tsx` | The workflow-history timeline (nodes, solid rail, upward arrows, qualifier chips). Pure rendering.                   |
| `verlauf.ts`               | Pure helpers that read `invoice_history` rows back into the reader's language, including the legacy-German recovery. |
| `config.ts`                | **The only per-repo file.** Chain shape and history vocabularies.                                                    |
| `PORTING.md`               | This file.                                                                                                           |

## What `config.ts` carries

- `CHAIN_ACTION_IDS` — which approval actions get a circle on the workflow bar.
  A repo with a 3-step chain (Immonetz) adds `approve_stufe2` here.
- `AUTO_STUFEN` — steps stamped by DB triggers, never clickable.
- `CORRECTABLE_STATUSES` — targets the super-admin correction may set.
- `APPROVAL_VERLAUF_TYPES` — which `invoice_history.type`s belong to the
  approval history (vs the general Verlauf tab).
- `LADDER_DONE` — the workflow bar's "done" palette (circle fill, current-step
  outline, walked connector). Default across the hubs: Immonetz's brand green
  `oklch(0.55 0.052 196)`; Immonetz itself writes plain `brand` classes.
- `LEGACY_ACTION_IDS` / `AKTION_ZIELSTATUS` — the vocabulary used to recover
  action + target status from history rows written before they were stored as
  data. Must list every action id the repo's chain has ever had.

## The contract with the host repo

The folder deliberately keeps importing the host's own modules rather than
bundling copies — the hubs share this architecture, and duplicating it would
fork it. To port, the target repo must provide:

1. **Route file** `src/routes/eingangsrechnungen/$nr.tsx` — a thin shell that
   calls `createFileRoute("/eingangsrechnungen/$nr")` with
   `component: BelegDetailPage`. The page finds its route via
   `getRouteApi("/eingangsrechnungen/$nr")`, so the path must match.
2. **`@/lib/data/format`** — `formatDauer`, `formatDateTime`, `formatEUR`,
   `workflowLabelDe`, `approvalActionLabelDe`, `WORKFLOW_REIHENFOLGE`,
   `pruefKarte`/`pruefGruendeDetail` and friends, `abgleichStatus`,
   `nextLegalActions`, `ApprovalActionId`, `AMPEL_*`/`ABGLEICH_META`.
3. **`@/lib/data/types`** — `Beleg`, `BelegVerlauf`, `WorkflowStatus`, …
4. **`@/lib/data/queries`** — `useBeleg`, `useBelegVerlauf`, `useActingAs`
   (with `ACTING_AS_NONE`), `useApprovalRule`, `useBelegMatches`, the
   mutations.
5. **`@/lib/auth`** — `useAuth()` exposing `user`, `role`, `canBook/Approve/Pay`.
6. **`@/lib/i18n`** — with the `belege.detail.*` key tree, including
   `belege.detail.historie.*` (the one-line history vocabulary) and
   `belege.detail.tip.*`.
7. **`@/components/ui/*`** (shadcn kit), **`@/components/belege/badges`**
   (`ReviewBadge` with the `ton` prop, `KonfidenzPill` with `mitLabel`,
   `WorkflowBadge`), **`@/components/bank/badges`** (`AbgleichBadge`).

## Porting steps

1. Copy `src/features/invoice-detail/` into the target repo.
2. Rewrite `config.ts` for that repo's chain (start from the source repo's and
   edit — the comments say what each list means).
3. Point the target's route file at `BelegDetailPage` (copy the thin shell
   from this repo and keep the target's own `validateSearch` if it differs).
4. `tsc --noEmit` — every missing item from the contract list above surfaces
   here. Add the missing exports/keys to the host repo, don't fork the folder.
5. Diff the folder against the source repo (command above) and confirm only
   `config.ts` differs.

## Current status

`verlauf.ts`, `WorkflowVerlaufListe.tsx` and this file are byte-identical between Staeyhub and
Immonetz (verify with the diff command above, adding `--exclude=InvoiceDetailPage.tsx`).
`InvoiceDetailPage.tsx` is NOT yet unified: each repo's page body still carries its own domain
features (Immonetz: business lines, property assignments, the 3-step ladder wiring; Staeyhub:
its own payment flow), on top of a shared ~75% core. New shared work should land in the
extracted files or behind config; page-body unification is the remaining step before the folder
is copy-only.
