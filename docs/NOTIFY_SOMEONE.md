# Notify someone

Covers meeting item **H11** (`MEETING_2026-09-09_STAEY.md`) and the 11.09.2026 request that
generalised it. Saskia, at 19:20, describing what Petra does when a payment has no document:
*"she has to request it from somebody… Or, what she does today, she makes a list. But then she has
to maintain that list manually and write down every missing item. That's exactly what we want to
avoid."*

**Deliberately not an assignment.** No record gains an assignee. A notification is a message:
nobody holds the record afterwards and there is no second state to clear, which is what makes it
*replace* Petra's list rather than become another one.

## Three parts

| Part | Where |
| --- | --- |
| The dialog and the banner | `@hub-kit/core/notify-someone` |
| The data | each hub's own `queries.ts` |
| Target validation, acknowledgement, instant delivery | migration `20260911100000` |

## 1. The UI is shared, the data is not

`@hub-kit/core/notify-someone` exports:

| Export | What |
| --- | --- |
| `NotifySomeoneButton` | trigger plus dialog, for a header or a toolbar |
| `NotifySomeoneDialog` | the dialog alone. A dropdown item cannot own it: the menu closes on select and takes the dialog with it, so the open state must live outside the menu |
| `NotifyBanner` | the notice shown on the record itself |
| `englishNotifySomeoneLabels`, `englishNotifyBannerLabels` | the label contracts |

The kit never learns what an invoice or a transaction is. It receives `recipients`, `labels` and
`onSend({recipientId, note})` already bound to whatever the button sits on. That is what lets one
dialog serve four hubs whose data layers have nothing in common.

staeyhub's half is `src/components/belege/ping-button.tsx`: `usePingRecipients`, `useSendPing`, the
German labels, and thin wrappers `NotifySomeone` / `PingDialog` / `PingNotice`.

## 2. The target is open ended

The RPC used to name its targets in its own signature: `p_invoice_id`, then `p_transaction_id`
bolted on beside it. Every further record type meant another parameter, another branch in the bell
and another branch in the Slack text.

```sql
send_notification(p_recipient, p_note, p_target_kind, p_target_id, p_target_path) returns bigint
```

`notification_target_kinds` says which kinds exist and which table backs each:

| kind | source_table |
| --- | --- |
| `invoice` | `invoices` |
| `transaction` | `bank_transactions` |
| `supplier` | `suppliers` |
| `customer` | `customers` |
| `property` | `properties` |
| `outgoing_invoice` | `outgoing_invoices` |
| `page` | none, a screen with no record behind it |

Adding a kind is one insert plus a label in `notifications.ziel.*`. Nothing else changes.

Guards, all verified live on 11.09.2026:

- unknown kind rejected (`23514`)
- record must exist. The `EXISTS` is dynamic, but **both identifiers come from the registry, not
  the caller**, so the statement cannot be steered from outside
- `p_target_path` must match `^/[^/]`, which rejects `https://evil.example/x` and the
  protocol-relative `//evil.example/x`. A notification must not be able to carry somebody off-host
- cannot notify yourself. The picker filters you out too, so reaching this means a stale page
- both kind and id omitted sends a general reminder, which is what the notifications screen does

**The path is supplied by the caller, not derived in SQL.** Routes live in the front end, differ per
hub, and `objekte` addresses records by `code` rather than id. The registry validates *what*; the
caller says *where*. `src/lib/data/notification-target.ts` holds both halves so they cannot drift.

`request_approval_ping` still exists and delegates here, so older callers keep working.

### Legacy rows are read, not rewritten

Rows written before this carry `invoice_id` / `transaction_id` at the top level and are **not
backfilled**: the history is a log, and rewriting what it said is worse than reading two shapes.
`readNotificationTarget` (front end) and `targetOf` (dispatcher) each handle both. New rows write
both, which is also why the two readers could be migrated after the fact rather than in the same
breath.

## 3. The toast on the record

`PingNotice` at the top of the invoice detail and the transaction detail. Renders nothing when
nothing is waiting, so it is safe to drop on any detail page unconditionally. Several stack.

The bell already lists what you were sent, but it lists it away from the thing it is about: you
click through, land on a transaction, and the sentence explaining why you are here is back on the
previous screen.

Each card is an initials avatar, the sender's name and the time, then the message, then the cross.
The name shown is the LIVE one from `app_users`, not `payload.from_name`, so a rename does not leave
an old name on screen; the payload copy is the fallback for a deleted account.

**Fixed to the viewport's top right**, the corner the bell and the account menu already occupy, so
a message addressed to the reader arrives where they already look for messages.

Width is capped against the viewport (`min(24rem, 100vw - 2rem)`) rather than set flat, so a narrow
window does not push it off the edge.

**No auto-dismiss.** The cross means "I have read this", so a timer would either fire that write for
somebody who never looked, or let the note come back on the next visit and turn into wallpaper. The
cost is that a toast covers the top corner until it is crossed.

**The cross animates before it writes.** Calling `onDismiss` straight from the click would write,
refetch, and drop the card between two frames with nothing to see. Instead the click marks the card
`leaving`, the card slides right and fades while its grid row collapses from `1fr` to `0fr` so the
cards below rise into the gap, and the write fires when that finishes (`EXIT_MS`, 200ms). Guards: a
second click on a card already in flight is ignored so it cannot queue two writes, pending timers
are cleared on unmount, and `motion-reduce` drops the transition entirely.

**Dismissing is a write, per event** (`acknowledge_notification`), so it never comes back for that
user: not on reload, not on that screen, not by another route to the same record. Cards dismiss
independently, and another person notified about the same record still sees theirs, because that is
a separate row. It does **not** clear the bell, so the message survives there as a record. The existing "seen" concept is
one timestamp per user (`app_users.notifications_seen_at`), and reusing it breaks both ways: opening
the bell would silence a note on a record you never opened, and dismissing one note would silence
every other notification you have. The recipient is scoped in the `WHERE` clause rather than checked
first, so another user's id cannot slip through a race. Verified: acknowledging as the *sender*
leaves `acknowledged_at` null.

## 4. The bell names the screen

Each row shows the record type beside it (Eingangsrechnung, Banktransaktion, Lieferant, Kunde,
Objekt, Ausgangsrechnung, Seite), in the highlight slot where the sender name used to sit. The name
is already in the message, and repeating it cost the row the one fact it was missing. The link is
`target.path`, so `use-notification-items.ts` no longer knows what an invoice is.

## 5. Slack

Text names *what*, links straight to it, and quotes the note:

> **Faheem Malik** bittet Thinkpad Lenovo, sich **einen Lieferanten** anzusehen. `<Im Hub öffnen>`
> \> Rechnungsadresse stimmt nicht

Delivery is now immediate, see `NOTIFICATIONS.md`. Measured 0.7s to 1.3s on 11.09.2026, against up
to 15 minutes before.

## Known gap

**A Hub user who is not in the Slack workspace gets their notification posted in the team channel.**
`slackUserId` falls back to `config.team_channel` when `users.lookupByEmail` returns
`users_not_found`, so it is delivered but publicly. Observed for `lukas.oldach@staey.de`.
Pre-existing, not introduced here, but it leaks "who was asked what" whenever Hub membership and
Slack membership differ.

## Open

- Only staeyhub is wired. The kit half is ready for the other three; each needs its own
  `useRecordNotifications` / `useAcknowledgeNotification` and the migration adapted. immonetz also
  lacks `invoice_files.transaction_id` entirely.
- The banner is only on the invoice and transaction details. Supplier, customer and property pages
  can take `PingNotice` and `NotifySomeone` as one line each.
- Migration `20260911100000` carries **this project's Supabase ref** in the trigger URL, exactly
  like the cron migration. Replace the host when porting.
- Test events 15, 16 and 17 remain in `notification_events`.
