# Workflow bar navigation (Beleg-Detail)

**Status:** implemented.
**Screen:** `src/routes/eingangsrechnungen/$nr.tsx`, the header card of the invoice detail page.
**Supersedes:** the `Workflow-Aktionen` dropdown described in `docs/BELEG_DETAIL_REDESIGN.md`
§1.7 / §4.2. That doc's §1.1 layout sketch and §1.8 geometry block are updated to match; anything
else it says about the dropdown is history, not current behaviour.

---

## 1. What was asked for

The progress ladder in the header was a read-only picture. Next to it sat a `Workflow-Aktionen`
dropdown offering the very transitions the ladder was already drawing, in different words. The
briefing:

1. Make the ladder the control, clickable only where this person may actually move the invoice.
   (The node shapes were revised twice, see item 12.)
2. Dotted connector from the current step to the step that can be reached, an arrow above that
   step, and a tooltip saying what clicking does.
3. Drop the duplicate menu entries. No step at `bezahlt` or after it may be _moved to_, because no
   person sets those states (the DATEV circle still links to its own screen, see item 9).
4. Keep Rückfrage and Ablehnen as buttons directly under the bar, only for people allowed to use
   them.
5. Keyboard-reachable, labelled, and quiet enough that the header does not turn into a button bar.

Follow-ups from the same review, all implemented:

6. Clickable steps get `cursor-pointer`; steps the user cannot click get `cursor-not-allowed` and
   say on hover **why** they cannot.
7. Paid, Bei DATEV and Abgeschlossen were all giving the same reason. They are blocked by three
   different mechanisms, so each names its own (§2.2.1).
8. "Erst möglich, wenn…" names the event a step is waiting for, so Freigegeben (Vorgesetzter)
   reads as waiting on the assistant's approval rather than on a position on the ladder.
9. The DATEV circle links to the DATEV handover screen (§2.2.2). It is the one blocked step with
   somewhere to go.
10. Step labels one size up (`text-xs`).
11. `skip_step` and `mark_already_approved` dropped altogether. Both did the same thing to the
    invoice as a plain approval, so the supervisor clicks the circle instead (§2.1).
12. Node shapes settled: a completed step is a **full coloured circle**, an incomplete one is
    **empty** (§2.2). This replaces the circle-in-a-circle of item 1.
13. A supervisor closes a DATEV-handed invoice from the bar, not only from the Workflow tab's
    status correction, which is for corrections (§2.2.3).

## 2. What is implemented

### 2.1 Which circle is clickable

Derived next to the ladder state (`$nr.tsx`, just below `abseitsDerKette`):

| Name                  | What it holds                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CHAIN_ACTION_IDS`    | `send_for_review`, `approve`, `final_approve`. The only ids that may own a circle.                                                 |
| `NAV_GRENZE`          | `WORKFLOW_STUFEN.indexOf("bezahlt")`. Nothing at or after it is clickable.                                                         |
| `stufenAktionen`      | `Map<workflow_status, ApprovalAction>`. The step a circle moves the invoice to.                                                    |
| `naechsteAktionStufe` | Lowest index in `stufenAktionen`. Drives the arrow and the dotted run.                                                             |
| `nebenAktionen`       | Every legal action not consumed by a circle: Rückfrage, Ablehnen, Zahlung fehlgeschlagen. Three at most, so they need no overflow. |

What is legal still comes from `nextLegalActions()` (`src/lib/data/format.ts`). The bar never
invents a transition; it only re-renders the list that function returns. An action is dropped from
the bar when it is off the ladder (`rueckfrage`, `abgelehnt`), backwards (`payment_failed`), or in
the trigger-driven tail (`bezahlt` and later, stamped by migrations 0036/0038 on `paid_at` /
`datev_handed_over_at`, never by a click).

**`skip_step` and `mark_already_approved` were removed** (`nextLegalActions`, `ApprovalActionId`,
`APPROVAL_ACTION_ICON`, and their `actions.*` / `actionZiel.*` labels in both dictionaries). Both
were manager-only, both landed on `freigegeben_vorgesetzter`, and both wrote the same
`workflow_status` as a plain approval. The only thing that separated the three was the history line,
so with the bar as the navigation a manager now approves by clicking the step circle.

Their two `typ` values, `bereits_freigegeben` and `uebersprungen`, **stay** in the `ApprovalAction`
union, in `InvoiceHistoryType` and in `APPROVAL_VERLAUF_TYPES`, along with their
`belege.detail.verlaufTyp.*` labels. Rows written before the removal still have to render in the
Freigabe-Verlauf.

### 2.2 The node states

Every node is one `size-5` circle with a 2px border. **Done is filled, not done is empty**, and
nothing else changes shape:

| State                  | Test                                 | Rendering                                                                                                                    | Cursor               |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Passed                 | `i < aktuelleStufe`                  | Solid: `border-brand bg-brand`.                                                                                              | `cursor-default`     |
| Current                | `i === aktuelleStufe`                | Solid, plus `ring-2 ring-brand/30 ring-offset-2 ring-offset-card`. Label in `font-medium text-foreground`, plus `stufeSeit`. | `cursor-default`     |
| Reachable              | `stufenAktionen.has(stufe)`          | Empty with a brand rim: `border-brand bg-background`, `hover:bg-brand`. Arrow above, label in `text-brand-dark`.             | `cursor-pointer`     |
| DATEV, not yet reached | `datevZiel != null`                  | Empty, muted rim, `hover:border-brand hover:bg-brand/20`. A `<Link to="/datev-uebergabe">` (§2.2.2).                         | `cursor-pointer`     |
| Blocked ahead          | `stufenSperrGrund(i, stufe) != null` | Empty, muted rim: `border-border bg-background`. Focusable, tooltip naming the reason (§2.2.1).                              | `cursor-not-allowed` |

`Abgeschlossen` is reachable too, for a manager on a DATEV-handed invoice (§2.2.3).

An earlier version drew a reached step as a ring **with a filled centre** and an unreached one as a
solid grey disc, so "filled" meant done in one place and not-done in the other. Two nested shapes at
20px read as noise rather than as a state, and the grey disc looked heavier than the brand ring it
was supposed to rank below. One circle, filled or empty, says it in the way a reader already
expects. The current step keeps a halo rather than a fifth fill style, so "where it is" stays
separate from "how far it got".

Hovering a reachable step fills it solid, which previews exactly what clicking does.

Step labels are `text-xs`; they were `text-[11px]` and read too small at seven columns. The
`stufeSeit` line under the current step stays at `text-[11px]`, so the two still read as label and
sub-label.

The blocked node is a **focusable `<span>`** (`tabIndex={0}`, `role="note"`, `aria-label` =
`"<step>: <reason>"`), not a `<button disabled>`. A disabled button swallows its own pointer events,
so the tooltip would never open, and the reason would be invisible to exactly the person who needs
it. Every node kind carries the same `before:-inset-2` hit area, so hovering is as forgiving as
clicking.

### 2.2.1 Why a blocked step is blocked

`stufenSperrGrund(index, stufe)` returns the sentence shown on hover and focus, in this order:

| Case                                                          | Key                                                   | Reads as                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Reached or current                                            | `null`                                                | Nothing to explain.                                                                                               |
| `index >= NAV_GRENZE`                                         | `stufenNav.gesperrt.stufe.<status>`                   | Per step, see the table below.                                                                                    |
| No legal action at all                                        | `keineAktionen.<grund>`                               | The existing four-way explanation (not an approver, rule without approvers, someone else's step, chain finished). |
| `freigegeben_vorgesetzter`, and this person may never take it | `stufenNav.gesperrt.nurVorgesetzter` / `nurFreigeber` | Only a supervisor (or the rule's named step-2 approver) can approve this step.                                    |
| Before the reachable step                                     | `stufenNav.gesperrt.uebersprungen`                    | Your next step goes straight past this one.                                                                       |
| Further along                                                 | `stufenNav.gesperrt.voraussetzung.<status>`           | The **event** this step is waiting for. Falls back to `gesperrt.spaeter`, built from the preceding step's label.  |
| Fallback                                                      | `stufenNav.gesperrt.nichtErlaubt`                     | Not your move right now.                                                                                          |

It reuses `keineAktionenGrund`, so the circle and the sentence under the bar never disagree about
why nothing can be done.

**Who may act beats what has to happen first.** `final_approve` is gated on the manager role, or on
being the rule's `step_2_approver` when a rule applies. An assistant hovering
"Freigegeben (Vorgesetzter)" was told "once the assistant has approved it", which reads as a promise
that the circle unlocks for them after their own approval. It never does. So that step checks the
role first and says who can actually do it, naming the person when a rule does
(`nurFreigeber`, `{{name}}` = `step_2_approver`) and the role when none applies (`nurVorgesetzter`).

Everything else further along is waiting for an **event**, so the sentence names the event, not a
position on the ladder:

| Step                       | Reason shown                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `in_pruefung`              | "Erst möglich, wenn der Beleg zur Prüfung gegeben wurde."           |
| `freigegeben_assistenz`    | "Erst möglich, wenn der Beleg in Prüfung ist."                      |
| `freigegeben_vorgesetzter` | "Erst möglich, wenn der Beleg von der Assistenz freigegeben wurde." |

`gesperrt.spaeter` ("…wenn der Beleg bei „{{stufe}}“ angekommen ist", built from
`WORKFLOW_STUFEN[index - 1]`) survives only as the `defaultValue` for a step with no sentence of its
own. It was the original wording and it was accurate but clumsy: "once the invoice has reached
„Freigegeben (Assistenz)“" says less than "once the assistant has approved it". Pointing at
whichever circle happens to be clickable right now, which is what it did before that, said least of
all.

**The last three steps are blocked for three different reasons**, so they get three different
sentences (`stufenNav.gesperrt.stufe.*`) rather than one shared line:

| Step               | Set by                                                                                                | Reason shown                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bezahlt`          | Trigger `advance_workflow_on_payment` on `paid_at` null→non-null (migration 0049)                     | "The system sets this step itself as soon as the payment for this invoice is confirmed."        |
| `uebergeben_datev` | Trigger `advance_workflow_on_datev_handover` on `datev_handed_over_at` null→non-null (migration 0051) | "The system sets this step itself as soon as the DATEV handover for this invoice is confirmed." |

Only those **two** steps get that treatment now. `abgeschlossen` used to be a third row here, saying
"the approval chain never sets this step, only the manual status correction can". That is no longer
true: see §2.2.3.

`gesperrt.automatisch` stays as the `defaultValue` fallback, so a new tail step added to
`WORKFLOW_REIHENFOLGE` without its own sentence still says something sane.

### 2.2.3 Closing the invoice is a real step now

`abgeschlossen` had no route into it at all: no trigger, and `nextLegalActions()` returned no action
for it, so the only way to close an invoice was the manual status-correction select on the Workflow
tab. That control exists to fix a **wrong** status, not to perform a normal one.

`nextLegalActions()` now returns a `complete` action (`nextStatus: "abgeschlossen"`, history type
`abgeschlossen`, no comment required) when the invoice is at `uebergeben_datev` **and** the acting
person is a `manager`. It is in `CHAIN_ACTION_IDS`, so it owns the **Abgeschlossen** circle and is
clicked on the bar like every other step.

Two mechanics had to change to let it through:

- `uebergeben_datev` stays in `APPROVAL_TERMINAL_STATUSES` (nothing left to _approve_ there, and the
  "chain is finished" sentence must still read that way for anyone who cannot close the invoice) but
  is excluded from that early `return []`.
- The inert tail was `index >= WORKFLOW_STUFEN.indexOf("bezahlt")`, an index cut-off that swallowed
  `abgeschlossen` along with the two trigger steps. It is now the named list
  `AUTO_STUFEN = ["bezahlt", "uebergeben_datev"]`, so only what a DB trigger actually stamps is
  inert.

The **Abgeschlossen** tooltip changed with it. It no longer says the chain cannot set the step:

| Reader                    | Reads as                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Manager, invoice at DATEV | The ordinary click tooltip: "Klicken, um zu „Abgeschlossen“ zu wechseln" over "Beleg abschließen". |
| Not a manager             | `gesperrt.nurVorgesetzterAbschluss`: "Nur ein Vorgesetzter kann den Beleg abschließen."            |
| Invoice not yet at DATEV  | `gesperrt.voraussetzung`: "Erst möglich, wenn der Beleg an DATEV übergeben wurde."                 |

### 2.2.2 The DATEV step navigates

`uebergeben_datev` is the one blocked step whose event is produced on a screen of its own, so its
circle is a `<Link to="/datev-uebergabe">` rather than an inert disc: `cursor-pointer`, a hover
state, and a tooltip carrying both lines, what sets the step and where the click leads
(`stufenNav.datevLink`). It gets **no arrow**. The arrow means "you can move the invoice here", and
this click does not move anything. It applies only while the invoice has not reached the step yet
(`!erreicht`), so a passed step keeps the ring-and-dot rendering.

### 2.3 Connector

Belongs to the node it leaves, as before. Three cases:

- `i < aktuelleStufe` → solid `border-brand`.
- `aktuelleStufe <= i < naechsteAktionStufe` → `border-dotted border-brand`.
- otherwise → solid `border-border`.

The dotted state is a **run**, not a single segment. A manager approving out of `in_pruefung` lands
on `freigegeben_vorgesetzter`, two nodes along, and a single dotted segment would have pointed at
`freigegeben_assistenz`, a circle nobody can click.

### 2.4 Affordances

- `ArrowDown`, `animate-bounce`, `motion-reduce:animate-none`, sitting in a reserved `h-4 w-5` box
  above every node so the row of circles keeps one baseline as the arrow moves along.
- Tooltip, two lines: `belege.detail.stufenNav.tooltip` ("Klicken, um zu „In Prüfung“ zu wechseln")
  over the action's own name (`belege.workflow.actions.<id>`). The circle shows the destination; the
  audit trail will show the action name, so the tooltip carries both.
- The same tooltip text is the button's `aria-label`. The `<ol>` carries
  `belege.detail.stufenNav.aria`, the current `<li>` carries `aria-current="step"`.
- The button is `size-5` with a `before:-inset-2` pseudo-element, so the hit area is ~36px while the
  circle stays small enough to sit on a line. Focus ring: `focus-visible:ring-2 ring-brand`.

### 2.5 The action row underneath

Below a `border-t` divider, only when `legalActions.length > 0`:

`[Mit Rückfrage zurückgeben] [Ablehnen] [Zahlung fehlgeschlagen]`

Small outline buttons; `reject` and `payment_failed` are tinted destructive. Each keeps the
"where does this land" tooltip (`belege.workflow.actionZiel.<id>`) the dropdown used to carry.
There is no overflow menu: with the two manager shortcuts gone, the row is never longer than three.
When there are no legal actions at all, the row is replaced by the `keineAktionen.<grund>` sentence
that explains why, unchanged from before.

## 3. i18n

Added under `belege.detail` in both `de.ts` and `en.ts`:

```ts
stufenNav: {
  aria: "Freigabelauf",                  // "Approval chain"
  tooltip: "Klicken, um zu „{{stufe}}“ zu wechseln",
  datevLink: "Klicken, um die DATEV-Übergabe zu öffnen",
  gesperrt: {
    stufe: { bezahlt, uebergeben_datev, abgeschlossen },   // §2.2.1, one per tail step
    automatisch,                                            // fallback for an unlisted tail step
    nurVorgesetzter, nurFreigeber,                          // role gate, beats voraussetzung
    voraussetzung: { in_pruefung, freigegeben_assistenz, freigegeben_vorgesetzter },  // §2.2.1
    spaeter,                                                // fallback: "…once it has reached {{stufe}}"
    uebersprungen,                                          // "…your next step skips this one"
    nichtErlaubt,
  },
},
```

Removed: `belege.detail.workflowAktionen` (the dropdown it labelled no longer exists), and the
`actions.mark_already_approved` / `actions.skip_step` pairs plus their `actionZiel` entries, in both
dictionaries. The `verlaufTyp.bereits_freigegeben` and `verlaufTyp.uebersprungen` labels stay:
history rows written earlier still use them.
`{{stufe}}` is interpolated from `belege.workflow.<status>`, so step names never drift from the
badges.

## 4. Open / deliberately not done

- **`rueckfrage` has no node.** It is a loop back to review, not a stage, so a receipt in
  `rueckfrage` still marks **In Prüfung** as current. The query itself is carried by the review chip
  and the Freigabe tab.
- **No drag or keyboard arrow-key traversal along the bar.** Circles are ordinary tab stops.
  Reachable ones are buttons; blocked ones ahead of the invoice are focusable spans, so a keyboard
  user reaches the same reason a mouse user gets on hover. Passed and current steps stay out of tab
  order (`aria-hidden`), since they carry no information the label does not already show.
- **Manual correction is untouched.** Moving an invoice backwards, or out of a terminal state, is
  still the `korrektur` select on the `freigabe` tab ("Workflow" on screen), not the bar.
- `docs/BELEG_DETAIL_REDESIGN.md` §14 still lists the `stufen.*` i18n keys as unused leftovers.
  `stufen.abseits` is used (the off-chain box); the other five really are dead.
