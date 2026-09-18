# Feature: Trigger BANKSapi Payments from the Hub ("Jetzt bezahlen")

Reference for the payment-initiation feature: what was asked for, what's built, and what's
still open before it can run against a real bank. Companion to
`docs/BANKSAPI_IMPLEMENTATION_SPEC.md` and `docs/BANKSAPI_RECONCILIATION_IMPLEMENTATION.md`
(the read-only reconciliation half) — this doc covers payment-initiation.

> **Provenance note:** the schema (`payment_orders`, migration `0081_payment_orders.sql`) and
> the three Edge Functions (`payment-initiate`, `payment-callback`, `payment-cancel`) were
> **ported verbatim from immonetz** (`0081`'s own header: _"ported verbatim from immonetz's
> 0053_payment_orders.sql"_) in an earlier pass on this repo — before this doc existed here.
> **The frontend ("Jetzt bezahlen" UI on the invoice detail page) was missing entirely until
> 2026-08-06**, when it was ported to close that gap (see §3). This doc itself is also ported
> from immonetz's own `docs/BANKSAPI_PAYMENT_INITIATION.md` and trimmed/adapted for this repo —
> the BANKSapi API research below (§2) describes the shared BANKSapi product both repos
> integrate against, so it transfers directly; the file/migration references and "what's built"
> section have been rewritten to describe staeyhub's own code.

## 1. What was asked for

Client requirement (per immonetz's own handover doc, inherited as the shared product spec both
repos implement against): _"Payments: after final approval, payment is initiated via BanksAPI
from the platform ('two clicks out'), instead of manual typing into a banking app. This is a
money-moving operation: build it with explicit confirmation steps, strict permissions
(supervisor role only), and a full audit trail."_

Decisions carried over from immonetz's build (not independently re-confirmed with Stäy's
client — worth a gut-check before this goes live for real money):

- v1 is single-invoice payments only — no batch/collective transfers.
- Supervisor + admin + super_admin can trigger a payment (not literally supervisor-only).
- Payments get their **own** mode switch, `BANKSAPI_PAYMENT_MODE`, independent of the read-side
  `BANKSAPI_MODE` — so flipping account/transaction reads to live never accidentally makes
  payments live too. Defaults to `mock` even when the read side is `live`. Currently set to
  `mock` in this repo's Supabase secrets (set 2026-08-06, this session) — flip to `live`
  explicitly once ready for real transfers.

## 2. BANKSapi payment API — the researched facts (apply to both repos, same product)

Both immonetz and Stäy Hub integrate against the same BANKSapi ONE/Connect product family. This
research was done against immonetz's sandbox/tenant but describes the API itself, not anything
tenant-specific — re-verify against Stäy's own tenant before trusting it fully live, but treat
it as the accurate starting point rather than re-deriving from scratch.

- **Endpoint**: `POST /customer/v2/payment/bulk-transfer` (a one-item `transferDetails[]` array
  even for a single payment — NOT `single-transfer`, despite what the endpoint name suggests).
- **SCA flow is the same webform redirect `bank-connect` already uses** for account connection —
  a `451` response + `Location` header + `relations: [{rel: "get_webform", href: "..."}]`,
  structurally identical to `createBankAccessSession`'s REG/Protect flow.
- **`callbackUrl` must be appended (URL-encoded) to the returned webform `Location` URL**, the
  same way `bank-connect` already does it — passing it only as a POST query param is silently
  ignored for a REG/Protect tenant (confirmed against the full OpenAPI spec, correcting an
  earlier wrong assumption during immonetz's own research).
- **Verification of Payee (VoP) has no separate API call** — confirmed against the full
  operation catalog, no dedicated VoP endpoint exists anywhere. For a REG/Protect tenant (which
  this integration uses), VoP appears to run automatically inside the webform flow. **Never
  independently confirmed end-to-end against a real completed payment** on immonetz's side —
  treat as a strong inference, not a settled fact, until Stäy's own sandbox/live testing
  confirms it.
- **No `status` field on the payment-status response.** `GetSingleTransfer`'s response
  (`SingleTransferResult`) has `messages[]` (`{level, code, message, details}`), not a clean
  enum. Status must be derived from message codes: `BA1111` → executed, `BA1112` → authorized,
  any `ERROR`-level message → failed, else → pending (conservative default — never guesses
  `executed`). See `mapBulkTransferMessages` in `supabase/functions/_shared/banksapi.ts`.
- **`vopOptOut` does not apply** — it only exists on the bulk-transfer _data shape_ for actual
  batch transfers; the single-transfer data shape this feature uses doesn't have it, and v1 is
  single-invoice-only anyway.

## 3. What's built

### Schema — `supabase/migrations/0081_payment_orders.sql`

- `payment_orders`: one row per payment **attempt** (a failed attempt + retry is two rows).
  Recipient fields (`recipient_name/iban/bic`, `amount`, `currency`, `payment_reference`) are a
  **snapshot** taken at trigger time, not a live join to `suppliers` — a later IBAN change never
  retroactively changes an already-submitted payment's audit record. Status lifecycle:
  `draft → pending_sca → authorized → executed` (or `failed`/`cancelled`). `idempotency_key`
  (unique) makes a repeat call a no-op instead of a second live transfer.
  `recipient_iban_changed_recently` + `fraud_flags` capture the IBAN-change fraud check
  (`supplier_iban_history`, 90-day lookback) as part of the audit trail, not just a runtime
  warning.
- RLS: `SELECT` scoped via the existing company-access model. `INSERT` restricted to
  supervisor/admin/super_admin. **No client `UPDATE` policy at all** — only the service-role
  Edge Functions transition status.

### Backend — `supabase/functions/`

- `_shared/banksapi.ts`: `BanksapiPaymentWrapper` (`initiatePayment`, `getPaymentStatus`), mock
  and live implementations, driven by `BANKSAPI_PAYMENT_MODE`. Mock mode is deterministic and
  stateless (outcome encoded in the mock `paymentId` itself, since a Deno Edge Function instance
  can't rely on memory between calls).
- `payment-initiate/index.ts`: verifies the caller's role server-side (the actual authorization
  boundary — the frontend's role gate is UX only). Enforces `workflow_status ===
'freigegeben_vorgesetzter'` server-side. Flow: idempotency short-circuit → load invoice/
  supplier → workflow-status check → IBAN-change fraud check → insert `draft` row → call
  `initiatePayment` → update row with the returned status/webform URL → log
  `zahlung_ausgeloest`. In mock mode, auto-completes synchronously (calls `getPaymentStatus`
  immediately and applies the outcome) — no webform round trip needed for a mock "Jetzt
  bezahlen" click.
- `payment-callback/index.ts`: public (`verify_jwt = false`), mirrors `bank-callback`'s "only
  ever UPDATEs a row that already exists" shape — but does **not** trust the query string's own
  claim of success/failure, since this moves real money. Re-asks BANKSapi's own
  `getPaymentStatus` for the authoritative outcome and only writes what that call reports.
  Refuses to regress a row already `executed`/`failed`/`cancelled`.
- `payment-cancel/index.ts`: lets a stuck attempt (`draft`/`pending_sca`/`authorized`) be
  abandoned so a fresh "Jetzt bezahlen" try becomes possible again — without it, a payment whose
  SCA webform never opened (popup blocked) or got closed by mistake leaves the invoice
  permanently unpayable via the UI.

### Frontend — added 2026-08-06 (this port)

- `src/features/invoice-detail/InvoiceDetailPage.tsx`, `JetztBezahlenSection` component, mounted
  as the `actions` of the `PaymentAccounts` panel in the Zahlung & Abgleich tab's „Überweisung"
  card, and NOWHERE else. It used to sit on the Lieferant tab as well; the button now exists once,
  on the tab where the payment is worked on. Role-gated client-side (hidden entirely for
  `assistant`) — the real boundary is `payment-initiate`'s own server-side check.
- The Lieferant tab shows the same accounts under a „Bankkonten" heading, master data only, with
  a line pointing at the Zahlung tab. The link runs through `springeZu("zahlung",
UEBERWEISUNG_ANKER)`, so it switches tab, scrolls to the transfer card and flashes it.
- Confirming opens a `Dialog` (deliberately not an `AlertDialog`: this one closes on a click
  outside, and Radix's AlertDialog hard-blocks outside interaction in a way no prop can undo)
  showing amount, recipient, IBAN/BIC, and a bank-account picker (`useBankAccounts()` filtered to
  the invoice's company and BANKSapi-connected accounts). Its summary block is the only place the
  transfer payload (IBAN, amount, payment reference) is shown, assembled from the choices made in
  the dialog rather than restated on the card behind it. If `supplier_iban_history` shows a change
  within the last 90 days, a hard-to-miss amber warning renders inside the dialog, not a
  dismissible toast.
- New hooks in `src/lib/data/queries.ts`: `usePaymentOrders(invoiceId)`, `useInitiatePayment()`,
  `useCancelPaymentOrder()`. New `PaymentOrder`/`PaymentOrderStatus` types in
  `src/lib/data/types.ts`.
- On success, a returned `webformUrl` opens in a new tab, opened SYNCHRONOUSLY (a blank tab via
  `window.open("", "_blank")` inside the click handler, redirected once the URL is known) —
  browsers' popup-block heuristics key off "was this a direct continuation of a user gesture." A
  manual "Zahlungsseite öffnen" link is also shown as a fallback for as long as the attempt
  stays `pending_sca`. A status line shows the latest attempt's state, with a "Zahlungsversuch
  abbrechen" action next to it whenever an attempt is non-terminal. Once `executed`, the
  existing `paid_at`-driven UI (paid switch, badges) picks it up automatically via the existing
  trigger — no separate "paid" UI was added.
- Translated under `belege.detail.lieferant.zahlung.*` in `de.ts`/`en.ts`.

## 4. What's NOT built / not verified for Stäy

- **Live payment execution against a real bank is unverified for this tenant.** The API research
  in §2 came from immonetz's own sandbox testing — re-verify against Stäy's actual BANKSapi
  contract/tenant before trusting it live. Concrete open risks: real-bank TAN/SCA behavior
  (sandboxes typically skip it), whether a bank batch-books the transfer as one lump sum (would
  break strict 1:1 transaction↔invoice matching), and the `messages[]` status-parsing mapping
  above being confirmed against a real completed payment.
- **Reconciliation poll** — `payment_orders` rows stuck in `pending_sca`/`authorized` (browser
  closed mid-flow, callback never arrives) are not reconciled by a scheduled job. Folding this
  into `bank-sync`'s existing cron is a natural fit, not yet done.
- **Batch/collective payments** — out of scope. One `payment_orders` row pays exactly one
  invoice (the bulk-transfer _endpoint_ is still used with a one-item array — an API-shape
  detail, not a batching feature).
- **A "default payment account per company" concept** — the user must pick an account every
  time; nothing remembers a preference.
- **`BANKSAPI_ONE_CONNECT_API_KEY`** (this repo's Supabase secret) must be a real, live key
  before payments can run in `live` mode — confirm this session's earlier env-var work applies
  here too.

## 4a. Two-person rule and direct debit (2026-08-28)

Two gaps closed in `payment-initiate`; see `docs/ROLES_AND_ACCESS.md` for the full write-up.

- **The approver may no longer pay.** `invoices.approved_by` records who moved the invoice to
  `freigegeben_vorgesetzter`; `refuseIfApprover()` rejects a caller who matches it, and
  `payment_orders_insert`'s RLS policy carries the same clause so a direct PostgREST call is
  refused too. Verified live against all three cases (approver, other supervisor, no-`can_pay`).
- **`can_pay` is now required**, alongside the role, in `requirePaymentRole`. Backfilled to today's
  effective permissions so nothing changed on deploy.
- **A direct-debit invoice is refused.** `isDirectDebit()` in `_shared/payment-auth.ts` mirrors
  `istLastschrift()` in `format.ts` (duplicated — an Edge Function cannot import the Vite app's
  source; keep the two in step). The detail screen already warned "wird automatisch eingezogen"
  while leaving the button underneath it enabled; 109 of the active invoices are Lastschrift or
  SEPA-Lastschrift, so this was a live double-payment risk, not a theoretical one.

Note `payment-cancel` imports the same shared module, so cancelling an attempt now also requires
`can_pay`.

## 5. Open questions (inherited from immonetz's research — re-confirm for Stäy specifically)

- Whether BANKSapi requires SCA for every payment or only some.
- IBAN-change lookback window: currently a hardcoded 90 days in both `payment-initiate/index.ts`
  (`IBAN_CHANGE_LOOKBACK_DAYS`) and `$nr.tsx` (client-side preview, same constant name, kept in
  step manually — no shared config between the Deno function and the app).
- **Which of the connected bank accounts is a valid payment source per company?** There's no
  "default payment account" concept — every BANKSapi-connected account for the invoice's
  company shows up in the picker, including any deposit/reserve accounts that shouldn't be used
  for routine supplier payments. Worth asking Stäy's client which accounts should even be
  offered.
- **Amount threshold / dual authorization** — is role-gating alone sufficient at any payment
  amount, or should a larger transfer need a second approver?
- **Payment failure notification** — a failed payment currently only shows as a toast + a badge
  on the invoice; nobody is proactively notified. Does Stäy want an email/notification on
  failure, and to whom?
- **SEPA Instant vs. standard** — the endpoint takes an `instant` boolean; instant settles in
  seconds but may cost more per transfer, standard SEPA is free but next-business-day. Which
  should be the default?
- **Scheduled/future-dated payments** — the request schema supports `requestedExecutionDate`;
  not used here (always executes immediately on click). Worth asking whether Stäy wants the
  option to schedule for the invoice's due date instead.
