# Incoming invoice detail screen — complete change record

Everything changed on `/eingangsrechnungen/$nr` and its dependencies, in enough detail to reproduce
it exactly on another Hub. Written for a Claude Code session picking this up cold.

Reference implementation: **Stäy** (`staeyhub`). Line numbers are Stäy's at time of writing and
will drift; anchors are given as code snippets, not positions.

Path note for **Eiffler**: this screen lives under `src/accounting/`, imports use the `@acc/` alias,
and the error helper is `errorText` (from `@acc/lib/data/error-text`) rather than `fehlerText`.

Language rule throughout (per each Hub's CLAUDE.md): **code and comments English, UI strings German**,
English follows from the same i18n keys. DB column names stay as they are.

---

## 0. Files touched

| File                                         | Why                                    |
| -------------------------------------------- | -------------------------------------- |
| `src/routes/eingangsrechnungen/$nr.tsx`      | the screen itself                      |
| `src/components/belege/document-preview.tsx` | PDF pane chrome + height               |
| `src/components/layout/app-shell.tsx`        | sticky-positioning fix                 |
| `src/styles.css`                             | where horizontal clipping moved to     |
| `src/lib/use-tab-param.ts`                   | tab switching no longer scrolls to top |
| `src/lib/data/format.ts`                     | approval chain logic                   |
| `src/lib/data/queries.ts`                    | approval-rule RPC normalisation        |
| `src/lib/i18n/locales/de.ts`, `en.ts`        | all new strings                        |

**Verification after every batch**: `npx tsc --noEmit -p tsconfig.json`, `npx eslint --fix <files>`,
`npx vite build`. None of these catch a missing i18n key — see §12.

---

## 1. Header — rebuilt

The header was: title + four bordered "axis" cards (Konfidenz / Review / Workflow / Zahlung), each
wrapping a pill wrapping one word, above a row of outline buttons.

### 1.1 Final layout

```
← Eingangsrechnungen                                                    [⋮]

Yesef Woldu PutzKönig
136 ⧉ · Stäy GmbH · 1.199,12 €                        ▲ 96 Tage überfällig
✓ Keine Prüfung nötig · 99 % Konfidenz  ○ Noch keine passende Bankbuchung        Fällig 21. Mai 2026
────────────────────────────────────────────────────────────────────────
        ↓
◉━━━━━━━◍┈┈┈┈┈┈●───────●───────●───────●───────●
Eingegangen  In Prüfung  Freigegeben(A)  Freigegeben(V)  Bezahlt  DATEV  Abgeschlossen
heute
────────────────────────────────────────────────────────────────────────
[ Mit Rückfrage zurückgeben ] [ Ablehnen ] [ ⋮ Weitere Aktionen ]
```

> Superseded in part. The `Workflow-Aktionen ▾` dropdown that stood above the ladder is gone: the
> ladder itself is the control now, and only the actions that are NOT a step along it kept a button.
> See `docs/WORKFLOW_BAR_NAVIGATION.md`. §1.7 and §1.8 below are updated; §4.2 still describes the
> `send_for_review` logic correctly, just not the menu that used to invoke it.

Wrapped in `<div className="rounded-xl border border-border bg-card p-5">` — a bordered card, not
loose content. The separators inside only read as divisions of something if that something has an
edge.

### 1.2 Back-link row

`<div className="flex items-center justify-between gap-4">` holding the back `<Link>` and
`{dokumentAktionen}` (the `⋮` menu). The menu sits **here**, not next to the amount: a menu directly
above a total reads as acting on the total.

**No prev/next arrows and no "n of m" counter.** Both were built and then removed. If reinstating:
`useBelegeListe` re-runs the list's own query from the filter/sort/page params that `pickListSearch`
puts in the URL. Two limits are inherent — an AI natural-language search narrows by row `ids` the URL
does not carry, and arrows can only move within the loaded page.

### 1.3 Title row

- `<h1>` with the supplier name, wrapped in `InfoTip` (§9). The `<Link>` to `/lieferanten/$id` stays
  **inside** the `<h1>` when a supplier is linked, so the page always has an h1.
- The tooltip label is conditional and this matters: `lieferant` → `tip.lieferant` ("Lieferant"),
  otherwise `tip.rechnungssteller` ("Rechnungssteller (nicht verknüpft)"). `stellerName` resolves as
  `lieferant?.name ?? beleg.issuer ?? unknown` — a linked supplier and a raw letterhead name look
  identical and behave differently (only the first is clickable and has master data).
- The old native `title="Beleg beim Lieferanten öffnen"` was **removed** from the link: a browser
  tooltip and a Radix tooltip on one element show two overlapping bubbles. `openSupplierTitle` is now
  unused.

### 1.4 Meta line

`{invoice number}{CopyButton} · {company NAME} · {gross amount}`

- Company shows its **name**, not the code. Resolved via `gesellschaftenQ.data.find(g => g.code ===
beleg.company_code)?.name ?? beleg.company_code`. The code moved into the tooltip.
- **The gross amount lives here**, `text-base font-semibold tabular-nums`. It was previously a large
  right-aligned figure; before that it was buried in the Übersicht tab's stat tiles.
- **VAT was removed from the header entirely** — not relocated. It is one line of the Beträge card,
  where it reads as part of the calculation.
- Each of the three carries an `InfoTip`.

### 1.5 Status line

Directly under the meta line with `mt-2`, `text-xs text-muted-foreground`:
`<ReviewBadge>` (in an `InfoTip` listing the reasons, §6.2) · confidence percentage (in an `InfoTip`)
· `<AbgleichBadge>` (in an `InfoTip`).

Confidence is a subordinate clause on the review chip, not a headline metric.

### 1.6 Right-hand block

`<div className="flex shrink-0 flex-col items-end gap-1.5">` holding only:

- the overdue pill, when `tageUeberfaellig != null`:
  `bg-destructive/10 text-destructive` + `<AlertTriangle className="size-3.5" />` +
  `faellig.ueberfaelligKurz`
- the due date, `text-xs text-muted-foreground`, `faellig.am`

`tageUeberfaellig` derivation — **suppressed once paid**:

```ts
const tageUeberfaellig = useMemo(() => {
  if (!beleg.due_date || beleg.paid_at) return null;
  const tage = Math.floor(
    (Date.now() - new Date(beleg.due_date).getTime()) / (24 * 60 * 60 * 1000),
  );
  return tage > 0 ? tage : null;
}, [beleg.due_date, beleg.paid_at]);
```

### 1.7 Separator, then the ladder

`<Separator className="my-4" />` then the ladder itself (§1.8). There is no longer a
**Workflow-Aktionen** dropdown between the two: the ladder's own circles move the invoice along the
chain, and the actions that move it nowhere on the chain (Rückfrage, Ablehnen, Zahlung
fehlgeschlagen) sit in a small button row underneath it. Full write-up:
`docs/WORKFLOW_BAR_NAVIGATION.md`.

### 1.8 The progress ladder

Replaces the four axis cards. **All seven steps**, built from the canonical order rather than a
second list:

```ts
const WORKFLOW_STUFEN = useMemo(() => WORKFLOW_REIHENFOLGE.filter((s) => s !== "rueckfrage"), []);
const aktuelleStufe = WORKFLOW_STUFEN.indexOf(
  (wf === "rueckfrage" ? "in_pruefung" : wf) as (typeof WORKFLOW_STUFEN)[number],
);
const abseitsDerKette = wf === "abgelehnt" || wf === "nicht_relevant";
```

- `WORKFLOW_REIHENFOLGE` has **eight** entries; `rueckfrage` is a loop back to review, not a stage,
  hence seven. A receipt in `rueckfrage` marks **In Prüfung** as current.
- Labels come from the existing `belege.workflow.<status>` dictionary, **not** from a new `stufen.*`
  namespace — one set of status names, no drift. (`stufen.*` keys exist from an earlier iteration and
  are now unused; safe to delete.)
- `abgelehnt` / `nicht_relevant` are **not** drawn on the line — they are exits, not points. Those
  render `<WorkflowBadge>` + `stufen.abseits` in a muted box instead.

Geometry — the connector belongs to the node it **leaves**. The skeleton below is the original
read-only version; each node is now a circle-in-a-circle and the reachable ones are `<button>`s, so
read `docs/WORKFLOW_BAR_NAVIGATION.md` §2.2–§2.4 for the current node and connector classes:

```jsx
<ol className="flex w-full items-start">
  {WORKFLOW_STUFEN.map((stufe, i) => {
    const letzte = i === WORKFLOW_STUFEN.length - 1;
    const erreicht = aktuelleStufe >= 0 && i <= aktuelleStufe;
    const aktuell = i === aktuelleStufe;
    return (
      <li key={stufe} className={cn("flex min-w-0 flex-col", letzte ? "shrink-0" : "flex-1")}>
        <div className="flex items-center">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full border-2",
              erreicht ? "border-brand bg-brand" : "border-border bg-background",
            )}
            aria-hidden="true"
          />
          {!letzte && (
            <span
              className={cn("h-0.5 flex-1", i < aktuelleStufe ? "bg-brand" : "bg-border")}
              aria-hidden="true"
            />
          )}
        </div>
        <div
          className={cn(
            "mt-2 min-w-0 pr-2 text-[11px] leading-tight",
            letzte && "-translate-x-full pl-3 pr-0 text-right",
            aktuell ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          <div className="break-words">{t(`belege.workflow.${stufe}`)}</div>
          {aktuell && stufeSeit && (
            <div className="truncate text-[11px] text-muted-foreground">{stufeSeit}</div>
          )}
        </div>
      </li>
    );
  })}
</ol>
```

Two failed attempts are worth not repeating: giving the first item `shrink-0` and the rest `flex-1`
crams the first gap; centring each dot in an equal slice puts the first dot a tenth of the way in and
the last a tenth from the end, so the line neither starts nor finishes on a node. Labels **wrap**
(`break-words`, 11px) rather than truncate — "Freigegeben (Vorgesetzter)" cannot fit on one line and
truncating a status defeats showing the full ladder.

`stufeSeit` — how long it has been at this step, as a phrase:

```ts
const stufeSeit = useMemo(() => {
  const neueste = (verlaufQ.data ?? [])[0]?.created_at ?? beleg.created_at;
  if (!neueste) return null;
  const tage = Math.floor((Date.now() - new Date(neueste).getTime()) / (24 * 60 * 60 * 1000));
  if (tage <= 0) return t("belege.detail.seit.heute");
  if (tage === 1) return t("belege.detail.seit.gestern");
  return t("belege.detail.seit.vorTagen", { tage });
}, [verlaufQ.data, beleg.created_at, t]);
```

---

## 2. Two kinds of action, separated

This is the organising idea, not a cosmetic split.

- **Invoice actions** (`⋮`, top right) act **on** the document.
- **Workflow actions** (below the separator) move it **along** the approval chain. They were a
  dropdown; they are now the ladder's own circles plus a small button row under it
  (`docs/WORKFLOW_BAR_NAVIGATION.md`). The split itself is unchanged.

### 2.1 The `⋮` menu — `dokumentAktionen`

Contents, in order: **Zuordnungsregeln anwenden** → separator → **Nicht für uns, zurück ins
Postfach** / **Wieder in die Verarbeitung aufnehmen** → **Archivieren, fällt aus der Verarbeitung** /
**Aus dem Archiv zurück in die Verarbeitung** → **Kein Beleg, in den Papierkorb** (only when
`beleg.status === "zu_pruefen"`).

Every item: `className="cursor-pointer"`, destructive ones add `text-destructive
focus:text-destructive`.

**No tooltips in this menu.** Each item was wrapped in a `Tooltip side="left"` carrying
`belege.detail.action.tip.<key>`; those wrappers and the whole `action.tip` dictionary are gone. A
menu that has to be hovered item by item to be understood is a menu with bad labels, so what the
tooltip said is now _in_ the label. That is why the labels read as clauses rather than verbs.

Because the labels are long, the content is sized to them instead of to a fixed width, or the
longest one wraps to two lines:

```tsx
<DropdownMenuContent
  align="end"
  className="w-auto min-w-64 [&_[role=menuitem]]:whitespace-nowrap"
>
```

**Dialogs must be controlled and rendered as siblings of the menu**, never as
`AlertDialogTrigger` inside a `DropdownMenuItem`:

```ts
const [aktionDialog, setAktionDialog] = useState<
  "nichtRelevant" | "archivieren" | "verwerfen" | null
>(null);
```

Selecting a menu item closes the menu, which unmounts its children — a trigger nested there takes the
dialog down with it before it can open. Each `<AlertDialog open={aktionDialog === "x"}
onOpenChange={(o) => !o && setAktionDialog(null)}>`. Wording and effects unchanged from before.

Requires importing `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`,
`DropdownMenuSeparator`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`, and
`MoreVertical` from lucide.

### 2.2 Renamed actions — no em dashes

The em dash was smuggling the consequence into the label; that job moved to the tooltip.

| key                           | before                   | after                | tooltip                                     |
| ----------------------------- | ------------------------ | -------------------- | ------------------------------------------- |
| `action.verwerfen`            | "Verwerfen (kein Beleg)" | **Kein Beleg**       | In den Papierkorb, wiederherstellbar        |
| `action.nichtRelevant`        | "Nicht relevant"         | **Nicht für uns**    | Gibt die E-Mail zurück ins Postfach         |
| `regel.anwenden`              | (unchanged)              | Regeln anwenden      | Zuordnungsregeln erneut anwenden            |
| `action.archivieren`          | (unchanged)              | Archivieren          | Bleibt erhalten, fällt aus der Verarbeitung |
| `action.archivZurueck`        | (unchanged)              | Aus dem Archiv holen | Nimmt den Beleg zurück in die Verarbeitung  |
| `action.nichtRelevantZurueck` | (unchanged)              | Wieder aufnehmen     | Nimmt den Beleg wieder in die Verarbeitung  |

Keeping "zurück ins Postfach" in _Nicht für uns_'s tooltip is load-bearing: it is the **only** thing
distinguishing it from _Kein Beleg_. The two differ solely in what happens to the source email —
_Kein Beleg_ sets `deleted_at` (trash, recoverable), _Nicht für uns_ sets `not_relevant_at/_by/_note`

- `workflow_status='nicht_relevant'` and has the pipeline hand the email back. On Stäy: 92 uses vs 0.

---

## 3. `⋮` also gained `action.mehr` = "Weitere Aktionen" as its `aria-label`.

---

## 4. Approval chain — logic changes in `format.ts`

Four separate defects. All are in `nextLegalActions`.

### 4.1 Signature widened

```ts
export function nextLegalActions(
  status: WorkflowStatus | string | null,
  rule: Pick<ApprovalRule, "step_1_approver" | "step_2_approver"> | null,
  actingAs: Pick<Approver, "role" | "name"> | null,
): ApprovalAction[];
```

### 4.2 `send_for_review` added — `in_pruefung` was unreachable

The check-and-approve branch accepted `eingegangen` directly, so nothing ever entered "In Prüfung".

```ts
if (s === "eingegangen") {
  actions.push({ id: "send_for_review", nextStatus: "in_pruefung",
                 typ: "freigabe_pruefung", requiresComment: false });
} else if ((s === "in_pruefung" || s === "rueckfrage") && (!rule || istStep1)) {
  actions.push({ id: "approve", nextStatus: approveNextStatus,
                 typ: "freigabe_pruefung", requiresComment: false });
} else if (s === "freigegeben_assistenz" && (rule ? istStep2 : actingAs.role === "manager")) {
  ... final_approve ...
}
```

New id in `ApprovalActionId`, icon `send_for_review: Send` in `APPROVAL_ACTION_ICON`, labels
`belege.workflow.actions.send_for_review` and `belege.workflow.actionZiel.send_for_review`.

### 4.3 Approval status now derives from ROLE, not from the rule's shape

**Was**, and this was a control failure:

```ts
const hasSecondStep = !!rule?.step_2_approver;
const approveNextStatus = hasSecondStep ? "freigegeben_assistenz" : "freigegeben_vorgesetzter";
```

Every rule on Stäy has `step_2_approver` empty, so _every_ approval by _anyone_ — assistants
included — landed on `freigegeben_vorgesetzter`, which is the state that unlocks "Jetzt bezahlen".
An assistant could put an invoice into the payable state with no supervisor involved.

```ts
const approveNextStatus: WorkflowStatus =
  actingAs.role === "manager" ? "freigegeben_vorgesetzter" : "freigegeben_assistenz";
```

### 4.4 The rule now decides WHO may act

```ts
const istStep1 = !!rule && rule.step_1_approver === actingAs.name;
const istStep2 = !!rule && rule.step_2_approver === actingAs.name;
if (rule && !istStep1 && !istStep2) return [];
```

**No rule resolved is deliberately not a refusal.** Rules are scoped (company only, on Stäy) with no
catch-all, so most invoices match none; refusing there would leave them approvable by nobody. Role
decides in that case. So: **no company → no rule → any approver may act; company assigned → only the
rule's named approvers.**

### 4.5 `APPROVAL_TERMINAL_STATUSES` exported

Was module-private. The screen needs to distinguish "chain finished" from "somebody else's move" —
`nextLegalActions` returns `[]` for both.

Call it as `(APPROVAL_TERMINAL_STATUSES as string[]).includes(wf)` — widening the **list**, not
casting `wf`. `workflow_status` is a plain string column, so asserting it into `WorkflowStatus` claims
something the data does not guarantee. **This is the same expression as the pre-existing type error at
`mayestate2/src/routes/eingangsrechnungen/$nr.tsx:2828`; the same fix clears it.**

### 4.6 THE BIG ONE — `resolve_approval_rule` returns a record of nulls

`src/lib/data/queries.ts`, `useResolveApprovalRule`:

```ts
const row = data as ApprovalRule | null;
return row && row.id ? row : null;
```

The function returns `approval_rules%ROWTYPE`. **PostgREST serialises an empty row as an object with
every column null**, so `data ?? null` never fired and `approvalRuleQ.data` was a _truthy_ object for
every invoice matching no rule. Consequences before the fix:

- `if (rule && !istStep1 && !istStep2) return []` refused **every action on every unmatched invoice**
  (273 on Stäy).
- The reason message said "a rule applies and names no approver" when no rule applied.
- `responsibleApproverName` read `step_1_approver` off a phantom rule.

**Verify through PostgREST, not psql** — in psql an empty ROWTYPE really is null, so SQL testing hides
this entirely.

---

## 5. "Acting as" restricted to super admins

`useActingAs()` matches the login name against `approvers`, else falls back to a **localStorage**
override (`freigabe_acting_as`) freely chosen from a dropdown, with no server check.

In the Freigabe tab:

```ts
const { role: eigeneRolle } = useAuth();
const istSuperAdmin = eigeneRolle === "super_admin";
```

- `istSuperAdmin` → the `<Select>`, full width in its grid cell (§7.2), showing the current choice
  and switchable at any time.
- otherwise `actingAs` → read-only line `workflow.actingAs`.
- otherwise → `keineAktionen.keinFreigeber`.

**Clearing the pick needs its own stored value.** Every option in the list was a person, so there
was no way back to "nobody" short of editing localStorage. `ACTING_AS_NONE = "__keine"` is exported
from `queries.ts` and rendered as a first `<SelectItem>` labelled `workflow.nobody`. It cannot be
an empty string or an absent key, because `actingAs` resolves the **login name match before** the
override, so an empty override falls straight through and a super admin whose own name is in
`approvers` could never clear it. The check is therefore first in the memo:

```ts
if (override === ACTING_AS_NONE) return null;
const byLogin = user?.name ? approvers.find(...) : null;
```

The `<Select>`'s `value` is `actingAs?.name ?? ACTING_AS_NONE` — Radix needs a non-empty value, and
this way the sentinel is what "nobody" actually selects.

**Still client-side only.** The write is a plain `invoices.workflow_status` update under
`using (true)` RLS. `app_users.can_approve` exists and says the right thing but **nothing reads it** —
its own migration says "No new RLS policy needed". A real gate belongs in an RPC deriving the approver
from the JWT.

Also gated: **"Zugewiesen an"** renders only for `admin` / `super_admin`. Its wrapping grid becomes
`cn("grid gap-4", (istSuperAdmin || eigeneRolle === "admin") && "sm:grid-cols-2")` so it does not
leave an empty column. **Verantwortlich** stays visible to everyone — it is derived, not chosen.

### 5.1 Verantwortlich explains itself when no rule applies

```jsx
) : !approvalRuleQ.data ? (
  <span className="text-muted-foreground">
    {beleg.company_code
      ? t("belege.detail.workflow.keineRegel")
      : t("belege.detail.workflow.keineRegelOhneGesellschaft")}
  </span>
) : (
  <span className="text-muted-foreground">—</span>
```

---

## 6. Why an invoice is in review

### 6.1 One shared, readable derivation

`gruende` (from `pruefGruende`) holds validation **keys**, not text. The review box translated them
locally, so anything else showing the same reasons printed raw keys.

```ts
const pruefGruendeText = useMemo(() => {
  const out = gruende.map((g) => t(`belege.validierung.grund.${g}`));
  if (beleg.status === "zu_pruefen") {
    const pct = beleg.confidence_score != null ? Math.round(beleg.confidence_score * 100) : null;
    const s = beleg.confidence_score;
    if (s != null && s < 0.8) out.push(t("belege.detail.review.grund.konfidenz_niedrig", { pct }));
    else if (s != null && s < 0.95)
      out.push(t("belege.detail.review.grund.konfidenz_mittel", { pct }));
    if (beleg.traffic_light === "rot") out.push(t("belege.detail.review.grund.ampel_rot"));
    else if (beleg.traffic_light === "gelb") out.push(t("belege.detail.review.grund.ampel_gelb"));
    if (out.length === 0 && beleg.validation?.decision_reason)
      out.push(String(beleg.validation.decision_reason));
    if (out.length === 0) out.push(t("belege.detail.review.grund.nichtBestaetigt"));
  }
  return out;
}, [
  gruende,
  beleg.status,
  beleg.confidence_score,
  beleg.traffic_light,
  beleg.validation?.decision_reason,
  t,
]);
```

The review box uses `const reviewReasons: string[] = pruefGruendeText;` so the two cannot disagree.

**Why the traffic light was added**: it is a _separate axis_ from `status` (the pipeline's `scoring.py`
says so explicitly) and `pruefGruende` never read it. On Stäy, of 361 receipts in review only 58 had a
failing validation gate and **zero** had a `decision_reason`. Of the 303 unexplained: 121 `rot`, 18
`gelb`, 164 `gruen`.

**Why the old fallback was wrong**: `review.grund.manuell` — "Dieser Beleg wurde für eine manuelle
Prüfung markiert" — asserts something did the flagging when nothing did. The 164 green ones are
high-confidence and pass every check; they are in review only because nobody has confirmed them yet,
which is what `zu_pruefen` means. Replaced by `review.grund.nichtBestaetigt`.

### 6.2 The review box

- Suppressed only when the pipeline reported no checks at all — a row ingested before it emitted
  any. Everything else renders, including a receipt where every check passed: "every check passed"
  and "no check ever ran" are different facts and used to look identical (both: no card).
- Colours follow the checks: destructive when one failed **and** `traffic_light === "rot"`, amber
  when one failed otherwise, emerald when none did.
- Open when something failed, collapsed when nothing did — which is what this line always claimed
  and the initialiser never did (`useState(false)` opened a failing receipt collapsed). Now
  `useState(() => pruefGruendeDetail(beleg).length > 0)`. Initial value only; `onToggle` owns it
  after the first click, and the box stays controlled for the reason in the comment above it.

### 6.3 The card reports validation, and only validation

The card renders exactly what `pruefKarte()` returns — the checks the pipeline ran, split into
failed and passed — and derives nothing of its own. That is the whole rule; everything below is a
consequence of it.

**Passed checks come from `validation_detail`, not only from `review_checks`.** `pruefKarte`
returned `bestanden: []` for anything but the older array, so a receipt carrying the per-check map
showed its failures and silently dropped everything that had passed — the "N checks passed" line
could never render for the shape the pipeline actually writes today. Both sources feed it now.

**`bestanden` is `status === "ok"` only**, tightened from `!detailFehlgeschlagen`. `not_applicable`
and `skipped` mean the check never ran, and listing "IBAN gültig ✓" among the passed checks of a
document that carries no IBAN claims a verdict nobody reached. `kleinbetrag` is excluded from both
halves by `VALIDIERUNG_MODIFIER` — it is a relaxation, not a check.

**Four non-check sentences were removed from the list.** `pruefGruendeText` used to append, in
order: a confidence-band sentence, a traffic-light sentence, the pipeline's free-text
`decision_reason`, and "Keine automatische Prüfung ist fehlgeschlagen. Der Beleg wurde nur noch von
niemandem bestätigt." None of them is a check. The last one shipped and was visible in production
as a card headed **"1 check"** directly above its own text _"No automatic check failed"_, drawn as a
red bullet behind a `TriangleAlert` — a finding that does not exist. The confidence one also
contradicted the field-driven review status outright (`PIPELINE_REVIEW_CONTRACT.md` §1.2:
confidence is reported, not deciding) while sitting directly under the card's own "KI-Konfidenz:
92 %" line saying the same thing twice.

`pruefGruendeText` is now `gruendeDetail.map(...)` and nothing else.

**The card's verdict is read off the checks, not off `invoices.status`.** `needsReview` (which was
`status === "zu_pruefen"`) is replaced by `etwasFehlt = reviewReasons.length > 0`. The two answer
different questions: `status` says whether a _person_ still has to sign the receipt off, and stays
`zu_pruefen` until somebody does even when every check passed. Binding the card to `status` is what
forced the fallbacks to exist in the first place — the box had to say _something_ about a receipt
where nothing was wrong.

So a receipt in review with nothing wrong now reads **"Keine Beanstandung · 9 Prüfungen bestanden"**
here and still reads as in review in the header. Both are true, and neither is inferred from the
other.

**Wording follows.** `review.title` became "Diese Prüfungen sind fehlgeschlagen" / "These checks
failed" — the card is titled for what it lists rather than asking a question about an axis it no
longer reads. The all-clear is a **new** key, `review.ohneBefund` ("Keine Beanstandung" / "Nothing
flagged"), deliberately not the existing `review.none` ("Keine Prüfung nötig"), which `ReviewBadge`
uses for the status axis: reusing it would have put "Keine Prüfung nötig" beside a badge reading
"Zu prüfen" on the same screen.

**Removed as dead with them:** `hatPruefChecks()` (added for the fallbacks, then outlived by them),
`erkennungPositiv()` + `ErkennungGrundId` — the green branch's re-derived affirmations, replaced by
the real passed checks — the `decisionReason` memo, and the i18n blocks `review.grund.*`,
`erkennung.grund.*`, `review.hint` and `review.noReason`.

Verified against the payload in `PIPELINE_REVIEW_CONTRACT.md` §3: nine entries → 7 passed
(`kleinbetrag` dropped as a modifier, `iban_ok` dropped as `not_applicable`), 0 failed. With
`brutto_vorhanden: missing` and `summe_ok: failed` on the same payload → 2 failed, 5 passed, which
is the shape in the mockup.

### 6.4 The review tooltip lists reasons

`InfoTip`'s `label` is `React.ReactNode` (not `string`) so it can render a heading + bulleted list of
`pruefGruendeText.slice(0, 4)` with `tip.reviewMehr` for the remainder. `TooltipContent` gets
`className="max-w-[18rem]"`.

---

## 7. Tabs

### 7.1 Tab switching no longer scrolls to top

`src/lib/use-tab-param.ts`, in the `navigate({...})` call: **`resetScroll: false`**. Switching a tab
is not navigating to a new page, and on this screen the tabs sit below a tall header.

### 7.2 Freigabe (Workflow) tab — emptied down to what is unique

Removed:

- `<WorkflowStepper current={wf} />` **and the whole `WorkflowStepper` component** (~110 lines) — the
  header carries the ladder.
- `<WorkflowActions .../>` **and the whole `WorkflowActions` component** (~40 lines) — the header
  carries the actions. Its comment reference in `onApprovalAction` was updated.
- The **"Privat bezahlt"** block and its `workflow.privatBezahlt.*` strings (see §11).

- **Verantwortlich**, the read-only name derived from the rule. It repeated what the ladder already
  shows, and beside an assignment that now _overrides_ the rule it read as a contradiction. Only the
  displayed field went: `responsibleApprover` still drives the deactivated/overdue warnings above it
  (and, on Immonetz, the invoice list's own Verantwortlich column), which say something the ladder
  does not.

What remains: the deactivated/overdue approver warnings, **Handelnd als / Zugewiesen an side by
side**, manual correction, **Rückfragen**, **Freigabe-Verlauf**, **Stufendauern**.

**Layout.** Handelnd als and Zugewiesen an are one `grid gap-4` row (`sm:grid-cols-2` only when the
assignment cell renders at all) with the corrections disclosure full width below. Stacked full
width, a two-field card read as a column of three lonely rows.

**Zugewiesen an is admin/super-admin only, and is now an authority rather than a label.** See §7.2b.

**Manual correction is open to admins, not only approvers.** The gate was `{actingAs && (`, so an
administrator who is not in the `approvers` table could not reach the one tool that fixes a wrong
status. It is now `{(actingAs || istSuperAdmin || eigeneRolle === "admin") && (`. Nothing inside the
disclosure reads `actingAs`, so this is purely a widening.

### 7.2b Assignment overrides the approval rule (Stäy only)

`nextLegalActions` gained a fourth parameter, `assignedTo: string | null = null`, passed as
`beleg.assigned_to`. Defaulted so any caller that does not know about assignment keeps its exact
previous behaviour.

```ts
const istZugewiesen = !!assignedTo && assignedTo === actingAs.name;
const istStep1 = !!rule && rule.step_1_approver === actingAs.name;
const istStep2 = !!rule && rule.step_2_approver === actingAs.name;
if (rule && !istStep1 && !istStep2 && !istZugewiesen) return [];
```

It **adds** an actor and never removes one — everyone the rule names keeps exactly what they had.
The two step gates follow the same shape: the check-and-approve step accepts
`(!rule || istStep1 || istZugewiesen)`, and the final approval treats the assignee as "no rule
applies to me" — `(rule && !istZugewiesen ? istStep2 : actingAs.role === "manager")` — so an
assistant assignee still cannot perform a supervisor's final approval.

`keineAktionenGrund` had to follow, or an assignee with nothing to do at this step would be told
_"this invoice is assigned to {{namen}}, only they can approve it"_, which the assignment has just
made untrue. Its `drin` test now includes `beleg.assigned_to === actingAs.name`, and
`keineAktionen.nichtImRegelwerk` names the way out ("an administrator can assign the invoice to
you").

**Immonetz needs none of this.** Its `nextLegalActions` takes `Pick<Approver, "role">` and never
gates by name at all, so any approver can already act on any invoice; there is no gate for an
assignment to open. Only the UI changes ported (§7.2 layout, admin-gated assignment, corrections).

### 7.3 Details tab gained the source-channel card

Moved out of the sticky preview column into its own `<Section title={t("belege.detail.section.eingangskanal")}>`:
channel badge, `meta.eingegangen`, `meta.faellig`, `meta.belegart`.

**`meta.quelle` was dropped, not moved.** It printed the raw column — `mailbox`, lowercase and
untranslated — directly under "Eingangskanal: E-Mail", which says the same thing in the reader's
language.

### 7.4 Zahlung tab — the three payment axes moved in, and the switch got a dialog

The `Zahlungsstatus` section now opens with the `zahlungGruende()` lines lifted out of the card
described in §12, then the manual-paid switch, then `ZahlungAbgleichSection` under its
`ABGLEICH_ANKER`. The tab is where payment is worked on, so the payment state belongs next to the
controls that change it rather than on every tab at once.

**The switch is confirmed, not applied on the flip.** A manual paid mark is the one payment state
the bank reconciliation will never correct: `setBezahlt` writes `paid_source: "manual"`, and
migration 0024's trigger only ever withdraws a `paid_at` it set itself. A mis-click therefore makes
an unpaid invoice look settled, permanently and silently. `onCheckedChange` now only records the
intent:

```tsx
// null = no dialog; true = about to mark paid; false = about to withdraw the mark
const [bezahltDialog, setBezahltDialog] = useState<boolean | null>(null);
...
<Switch checked={!!beleg.paid_at} onCheckedChange={(c) => setBezahltDialog(c)} />
```

One `AlertDialog`, a sibling of the section (not nested in the switch), keyed on the direction —
the two ways round say genuinely different things, so both get their own title, body and confirm
label (`zahlung.bezahlt*` / `zahlung.bezahltZurueck*`). Confirming calls the unchanged `setBezahlt`;
cancelling leaves the switch as it was, because it renders from `beleg.paid_at` and never from local
state.

### 7.5 Gmail message ID truncated

`ReadField` gained `truncate?: boolean` → adds `truncate` to the value div and
`title={truncate && value ? value : undefined}`. Applied to the Gmail message ID: ~120 characters of
base64 that wrapped across three lines to show something nobody reads — they copy it.

---

## 8. Übersicht (Overview) tab — rebuilt

Order: **Braucht deine Eingabe** → **Beträge** → **Rechnungsdaten** → **Beteiligte**.

### 8.1 The decision banner — reduced to one case

Introduced with four cases, then stripped to one on request. What **remains** is only
`naechsterSchritt.pruefen` ("N Prüfhinweise" + jump to the fields). Removed: `entscheiden`
(duplicated the header buttons), `warten` (the ladder shows it), `zahlen` (the resting state of every
approved invoice). Their strings were deleted too. `useMemo` deps are `[beleg.deleted_at,
beleg.not_relevant_at, gruende, t]`.

### 8.2 Braucht deine Eingabe

Amber card, **renders only when something is undecided** — on a clean invoice it does not exist.

```ts
const KEINE_WAHL = "__keine";
const objektEntschieden = beleg.assignment_decided_by === "human";
const gesellschaftOffen = !beleg.company_code;
const objektOffen = !beleg.property_code && !objektEntschieden;
const kategorieOffen = !beleg.category_id && beleg.cost_category_source !== "human";
```

**Critical, and easy to get wrong**: `assignment_decided_by` is **one column covering both company and
property** (the existing `speichern()` stamps it when either changes). Keying both on it means
choosing "None" for the company silently marks the property decided and its row vanishes unanswered.

So: **company** needs no stamp — `NZO` ("Nicht zugeordnet") is a real `companies` row meaning exactly
"decided, none", and every filter and KPI tile already treats it as unassigned. The stamp is left to
**property**, which has no such code.

Three pickers, each: label, `Combobox` (with `ariaLabel`, not `label`), and a consequence line —
`objektFolge`, `kategorieFolge`, `gesellschaftFolge` — which states what happens if left empty, not
what the field is.

**"None" is the FIRST option** in all three lists.

Writers:

```ts
function zuordnungVerknuepfen(feld: "company_code" | "property_code", code: string) {
  commitSpeichern(
    { [feld]: code, ...(feld === "property_code" ? { assignment_decided_by: "human" } : {}) } as Partial<Beleg>,
    { [feld]: (beleg[feld] as string | null) ?? null },
    [feld],
    [feldAenderungDe(feld, beleg[feld], code, (v) => String(v ?? ""))],
    true);
}

function zuordnungAlsErledigt(feld: "property_code" | "category_id") {
  const stempel = feld === "category_id"
    ? { cost_category_source: "human" } : { assignment_decided_by: "human" };
  commitSpeichern(stempel as Partial<Beleg>, {}, [],
    [t("belege.detail.eingabe.keineWahlProtokoll", { feld: ... })], feld !== "category_id");
}
```

Company "None" → `zuordnungVerknuepfen("company_code", GESELLSCHAFT_OHNE)`. Property/category "None"
→ `zuordnungAlsErledigt(...)`. Each writes a history line so the choice is auditable.

**Provenance column names — do not guess.** There is no `property_source` or `company_source`. The
correct stamp is **`assignment_decided_by`**, and explicitly **not** `assignment_source`, which
belongs to the pipeline and records _how_ the company was resolved (migration 0027) — writing "human"
there erases it. Category uses `cost_category_source`.

### 8.3 "None" displayed as a decision

`ReadField` gained `leerAls?: ReactNode` — rendered instead of "—" when the value is empty.
`KeineWahlWert` renders `eingabe.keine` + **the existing `QuelleBadge source="human" hasValue`**, not
a new chip. Applied to **property** and **category** only; the company writes `NZO`, a real row, so it
is never empty.

### 8.4 Beträge

The four peer cells became the arithmetic:

```
              Netto      3.000,00 €
        USt 19 % [KI]      570,00 €
        ───────────────────────────
              Brutto     3.570,00 €
```

`<dl className="ml-auto w-full max-w-sm space-y-2 text-sm">`, right-aligned `tabular-nums`, a
`border-t border-border pt-2` rule above the gross. The VAT rate keeps its `QuelleBadge`.
**Currency disappeared into the symbol** — it was a labelled slot containing "EUR".

Footer, `border-t pt-3`: deductibility as a sentence (`betraege.abzugsfaehig` /
`betraege.abzugUnbestimmt`) beside the `NeueRegelDialog` trigger.

### 8.5 Rechnungsdaten

Split out of the old Rechnungsinformationen section, keeping the dates grid.

**Each card has its own edit key** — `betraege` and `rechnungsdaten`, not the shared `rechnung`.
Rekey `isEdit(...)`, `startEdit(...)`, `kannBearbeiten(...)` **inside each section's bounds**.
`speichern()` diffs the whole form against the snapshot taken when the section opened, so both save
independently with no changes to the save path.

Still to do (from the design handoff, not built): fold the due date into the invoice date when equal
("21. Mai 2026 · fällig gleichtags"), collapse the service period to one field that splits only when
from ≠ to, and put unset optional fields behind a "Nicht gesetzt: … + Ergänzen" footer.

### 8.6 Beteiligte

The former "Zuordnung" section, retitled. Holds Rechnungssteller (+ address), Gesellschaft, **Objekt
and Kategorie**, Leistungsbeschreibung.

Objekt/Kategorie live here **deliberately** — the design mockup shows them only in the attention card,
which disappears once they are set, leaving no way to see or change an assignment afterwards.

### 8.7 Compact field view

```ts
const [alleFelder, setAlleFelder] = useState(() => {
  try {
    return localStorage.getItem("beleg-detail-alle-felder") === "1";
  } catch {
    return false;
  }
});
const KONFIDENZ_SCHWELLE = 0.8;
const zeigeFeld = (k?: number | null) => alleFelder || (k != null && k < KONFIDENZ_SCHWELLE);
```

Folded behind `alleFelder`: Auftragsnummer, Leistungsdatum/von/bis, Währung, the whole deductibility
and income-tax grids. A footer link toggles it; the choice persists per person.

**A field the extraction was unsure about is never hidden** — `zeigeFeld(konf.x)` reveals any
secondary field below 0.8 even in compact mode. The point is to reach what needs checking faster.

**VAT rate must NOT be foldable.** Its cell is a composite — the rate `Field`, the "als USt-Regel
speichern" button and the rule hint all describe the same value, but the two controls sit _outside_
the `Field`. Folding only the `Field` leaves a button offering to pin a rule for a percentage no
longer on screen. Audit any other fold site for the same shape; VAT was the only composite.

The rule button's label names the value: `regel.alsRegelUst` = `"{{satz}} % als USt-Regel speichern"`,
called as `t("belege.detail.regel.alsRegelUst", { satz: beleg.vat_rate })`.

---

## 9. `InfoTip` — the tooltip component

```tsx
function InfoTip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help decoration-dotted underline-offset-4 hover:underline">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{label}</TooltipContent>
    </Tooltip>
  );
}
```

`asChild` keeps the trigger transparent to layout. Labels are **one noun phrase**, not sentences —
the question is "what is this?". The review tooltip is the exception (§6.4).

Applied to: supplier name, invoice number, company, gross amount, VAT rate (where still shown),
review chip, confidence, reconciliation chip.

---

## 10. PDF preview

`src/components/belege/document-preview.tsx`:

```ts
const pdfViewerUrl = previewUrl ? `${previewUrl}#toolbar=0&navpanes=0&view=FitH` : null;
const PANE_H = "h-[min(78vh,900px)] min-h-[480px]";
```

- `navpanes=0` removes the page-thumbnail rail; `toolbar=0` removes download/print/rotate (the card's
  own footer offers those); `view=FitH` fits page width so an A4 lands readable.
- `<iframe src={pdfViewerUrl ?? undefined}>`.
- **`PANE_H` is used by all three of** the loading skeleton (`<DocumentSkeleton className={cn(PANE_H,
"w-full")} />`), the in-frame placeholder, and the frame wrapper. They were three different values,
  so the card was 480px while loading and taller after — the page jumped, late, on a slow signed-URL
  fetch.

### 10.1 Column ratio

`<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(380px,0.85fr)_1fr]">`

The handoff proposed `[1fr_minmax(320px,420px)]`, which gives the PDF ~1050px of a 1512px screen —
too much. This lands between: source is the larger half, not dominant.

---

## 11. `position: sticky` was broken app-wide

`src/components/layout/app-shell.tsx` had `<div className="min-h-screen overflow-x-hidden bg-background">`.

**When `overflow-x` is anything but `visible`, CSS computes `overflow-y` to `auto` on the same box.**
That div became the page's scrollport, so _every_ `position: sticky` in the app resolved against a
container as tall as its own content and could never engage.

Fix: remove `overflow-x-hidden` there, and put the clipping on `body` in `src/styles.css` inside
`@layer base`, where the viewport stays the scrollport:

```css
body {
  overflow-x: hidden;
}
```

---

## 12. Removed elsewhere

- **"Privat bezahlt"** (Freigabe tab) and `workflow.privatBezahlt.*`. It called the same
  `setBezahlt(true)` as the Zahlung tab's switch — identical writes (`paid_at`, `paid_source='manual'`),
  two names. Note `invoices.already_paid` (→ `privat_bezahlt` in `v_open_items`) is a genuinely
  different concept that **nothing in the UI writes**; a privately-paid invoice therefore still waits
  for a bank movement that will never arrive.

- **The "Zahlung & Abgleich" card above the tabs** and its `belege.detail.zahlung.title` key. It sat
  in the right column, so it showed on _every_ tab, and its first two lines repeated what the header
  already states: the `AbgleichBadge` (with its tooltip and its click-through to the reconciliation
  anchor) and, via the ladder, whether the invoice has reached DATEV. Its three `zahlungGruende()`
  lines were not deleted, only relocated: they now open the **Zahlung tab's** `Zahlungsstatus`
  section, above the manual-paid switch, as a plain `<ul>` in `text-muted-foreground` instead of the
  slate box. `zahlungGruende()`/`zahlungReasons` are unchanged. The `Landmark` import went with it.

---

## 13. Traps — read before editing i18n

**`tsc`, `eslint` and `vite build` all pass with a wrong or missing translation key.** i18next renders
the raw key path, or silently uses `defaultValue`. This bit repeatedly. Always verify with a
path-resolving check after editing locales:

**Do not re-derive the key paths by parsing indentation.** An earlier version of this doc
recommended exactly that, and the walker reported seven freshly-added keys as missing _and_
`belege.detail.action.abbrechen`, which has always existed. Import the dictionary and index it,
which cannot disagree with what i18next does at runtime:

```js
// scratchpad/checkkeys.mjs -- run with: npx tsx checkkeys.mjs "$PWD/src/lib/i18n/locales/de.ts"
const m = await import(process.argv[2]);
const dict = m.default ?? Object.values(m)[0];
for (const k of ["belege.detail.zahlung.bezahltTitle" /* ...every key you touched... */]) {
  const v = k.split(".").reduce((o, p) => (o == null ? o : o[p]), dict);
  console.log(v === undefined ? `MISSING ${k}` : `ok ${k}`);
}
```

Run it against **all four** files (`de`/`en` × both Hubs) after any locale edit.

Specific traps hit while doing this work:

1. **Substring guards misfire.** `if "position" in file` matched an unrelated key and silently
   dropped seven insertions. Check for the **full dotted path**, never a bare name.
2. **Non-greedy regex across `import {` blocks** matches the _earliest_ opening brace that can reach
   the closing one, so it swallows unrelated imports. Find the closing line first, then walk back to
   its own `import {`.
3. **Multiple identical anchors.** `abbrechen:` exists in several namespaces; an insert keyed on it
   landed in the wrong one. Resolve the parent block by indentation first.
4. **Deleting a component by walking back to the nearest `//`** takes its neighbour with it — this
   removed `InfoTip` along with `WorkflowActions`, and `gesellschaftName`/`stufeSeit` along with the
   navigation block. Bound deletions by explicit start markers.
5. **Line-prefix filters delete real keys.** Removing lines starting with `manuell: ` also removed
   `manuell: {` — a _block opener_ — leaving orphaned contents. Three legitimate keys were lost and
   had to be restored from git.
6. **German quotes.** `„keine"` terminates the string; the closing character is `“` (U+201C).
7. **JSX comment position.** `{/* … */}` is invalid in _expression_ position (e.g. straight after
   `) : (`); use `//` there.
8. **The wrong i18n path renders the raw DB value.** `belege.workflow.status.${wf}` does not exist —
   the correct path is `belege.workflow.${wf}` — and the `defaultValue: wf` fallback printed the
   German column value into the English UI.

---

## 14. Known leftovers

- `stufen.*` i18n keys — superseded by `belege.workflow.*`, unused, except
  `stufen.abseits` which the off-chain box still renders.
- `openSupplierTitle` — unused since the native `title` was removed.
- `review.grund.manuell` — no longer referenced.
- `mayestate2/.../$nr.tsx:2828` — pre-existing `APPROVAL_TERMINAL_STATUSES.includes(wf)` type error,
  fixed by §4.5's widening.
