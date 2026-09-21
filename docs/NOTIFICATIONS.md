# Notifications and Slack

Two ways the Hub tells people something needs doing:

1. **In the Hub** — the bell top right, plus the alert strip on the overview page.
2. **In Slack** — a private message to one person, and one summary each morning in a team channel.

Both come from the same list, so a number shown in the bell is the same number sent to Slack.

Asked for in the client meeting of 26.08: Lukas wanted _"the relevant person gets pinged directly
in a private Slack message"_, Saskia wanted a daily brief in a shared channel so the team can see
who still has work, and Fabian asked that the actual notes stay in the Hub.

---

## How to connect Slack

You need to be an admin in the Hub, and able to install apps in your Slack workspace.

**1. Open Notifications → Settings → Slack.**

**2. Click "Create Slack app".** This opens Slack with everything filled in already. Pick your
workspace, click Create, then Install to Workspace, then Allow.

**3. Copy the token.** In Slack, go to OAuth & Permissions. Copy the **Bot User OAuth Token**.
It starts with `xoxb-`. This is not the same as the Verification Token on the Basic Information
page, which is a different value and will not work.

**4. Paste it into the Hub and click Connect.** The card changes to "Slack is connected".

**5. Pick the team channel** and turn the switch on, top right of the card.

**6. Click "Send test message".** A message should appear in that channel. If it does, you are done.

The token is encrypted and stored in the database vault. Nobody can read it back out of the Hub,
including admins.

### Check who will get private messages

Under Personal notifications there is a line like "3 of 7 people found in Slack". Expand it to see
everyone.

The Hub matches a person to their Slack account **by email address**. If someone's email in the Hub
is not the one they use in Slack, there is no match, and their messages go to the team channel
instead of privately to them.

You do not have to change anyone's email. Use the dropdown next to their name to pick their Slack
account directly. Options are:

- **A Slack person** — send them private messages
- **Team channel only** — never send this person a private message

### Disconnecting

The switch top right stops all sending but keeps the token. **Disconnect** deletes the token
entirely. You can reconnect later by pasting a new one.

---

## What the settings mean

### Bell in the Hub

Which items appear in your own notification bell. This is per person.

### Slack → Notifications

Which events are sent to Slack the moment they happen:

- **Question raised on an invoice** — someone sent an invoice back with a question
- **Invoice rejected and sent back**
- **Approval or feedback requested** — someone used "Ask someone to look at this" on an invoice

### Slack → Personal notifications

On: these go privately to the person concerned. Off: everything goes to the team channel.

### Slack → Daily summary

One message each morning in the team channel, with the counts you tick under "Include in the
summary". The time is in **your** time zone, shown under the field.

---

## Currently connected (test setup, 2026-08-28)

Slack is connected to a **test workspace**, posting to the **`#breifing`** channel, with one test
person linked so private messages could be checked. A private message, a daily summary and a
channel post were all received successfully.

Two things to redo before the team starts using it: connect the real this client workspace, and open the
Slack settings on the live site and press Save once, so the links inside Slack messages point at
the real Hub.

## Troubleshooting

| What you see                                | What it means                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Channel dropdown is empty                   | The app is missing `channels:read`. Add it in Slack under OAuth & Permissions, reinstall, paste the new token. |
| Everyone says "no Slack address"            | Emails do not match, or the app is missing `users:read.email`. Use the dropdown to link people directly.       |
| Message went to the channel instead of a DM | That person has no Slack link. Check the list under Personal notifications.                                    |
| `not_in_channel` on the test                | Invite the bot to that channel.                                                                                |
| Nothing arrives at all                      | The switch top right is off, or the channel name is wrong.                                                     |

To see what actually happened on the last run:

```sql
select started_at, ok, events, errors
from public.notification_dispatch_log
order by started_at desc limit 5;
```

`errors` names the exact reason. Lines starting `slack dm:` mean the message was sent, but to the
channel rather than privately.

---

## How it works (for developers)

Producers write rows into `notification_events` and know nothing about delivery. A scheduled
function reads undelivered rows and routes them.

**Edge function:** `supabase/functions/notify-dispatch/index.ts`. Deploy with
`npx supabase functions deploy notify-dispatch`. Called three ways:

| Call | From | Does |
| --- | --- | --- |
| `{mode: "event", id}` | an AFTER INSERT trigger on `notification_events` (migration `20260911100000`) | delivers that one row, at once |
| `{}` | pg_cron every 15 minutes (migration `20260827130000`) | the daily briefing, plus a retry of anything still unstamped |
| `{mode: "test"}` | the settings screen | one test message |

**The trigger is the normal path now.** A notification reaches Slack in about a second (measured
0.7s to 1.3s on 11.09.2026) instead of waiting up to a quarter hour. It fires on the table, so every
producer gets it without knowing: the ping, assignment notifies, the gaps job, and whatever is added
next.

**The cron is not redundant.** It still owns the daily briefing, which fires when a user's local
send time passes and is therefore clock driven, and it is the retry: a failed send is deliberately
left unstamped so the next tick tries again. Drop it and one Slack outage loses a message for good.

The instant path delivers only the row it was given, not the whole undelivered batch. Two
notifications written a second apart would otherwise start two runs that both read the same batch
and both post it. Instant runs write no `notification_dispatch_log` row, so the log stays a record
of the four cron ticks an hour rather than of every notification.

**Tables**

| Table                       | Holds                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `notification_events`       | The queue. `delivered` is `{channel: timestamp}` per channel.                                           |
| `notification_channels`     | One row per channel. `config` holds `team_channel`, `dm`, `events`, `hub_url`, `team_id`, `enabled_at`. |
| `notification_settings`     | Per user: bell toggles, acknowledgements, daily summary time and contents, timezone.                    |
| `notification_dispatch_log` | One row per run. Kept 30 days.                                                                          |
| `app_users.slack_user_id`   | The Slack member id. `''` means never DM. `null` means match by email.                                  |

**Functions**

| Function                                          | Who can call it                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `set_channel_secret(channel, secret)`             | admins. Writes to Vault. Null clears it and disables the channel.               |
| `get_channel_secret(channel)`                     | service_role only. Takes a channel name, so it cannot read other vault secrets. |
| `channel_secret_present(channel)`                 | admins. Returns a boolean, never the value.                                     |
| `set_user_slack_id(user, slack_id)`               | admins.                                                                         |
| `send_notification(recipient, note, target_kind, target_id, target_path)` | any signed-in user. Any record type, see `NOTIFY_SOMEONE.md`. Returns the new event id. Cannot notify yourself. |
| `request_approval_ping(recipient, invoice, note, transaction)` | any signed-in user. Kept for older callers; delegates to `send_notification`. |
| `acknowledge_notification(event_id)` | the RECIPIENT of that event only. Dismisses the banner shown on the record. |
| `mark_notifications_seen()`                       | any signed-in user.                                                             |

**Slack scopes used:** `chat:write`, `chat:write.public`, `channels:read`, `groups:read`,
`users:read`, `users:read.email`, `im:write`. They are in the app manifest in
`src/routes/benachrichtigungen/index.tsx`, so a newly created app gets them all.

**Migrations:** `20260827090000`, `20260827110000`, `20260827130000`, `20260827150000`,
`20260828120000` (channel secrets), `20260828160000` (user Slack link).

### Things that are easy to get wrong

- `users.lookupByEmail` and `users.list` only accept query parameters. Sending a JSON body returns
  `invalid_arguments`. `chat.postMessage` and `auth.test` do accept JSON.
- Slack member ids are per workspace. When the dispatcher sees a different workspace it clears every
  cached `slack_user_id`. It does not clear on the very first run, when no workspace was recorded.
- `hub_url` is captured from the browser when the Slack card is saved, and localhost origins are
  ignored. Save it once from the deployed Hub or the Slack links will be missing.
- Turning a channel on stamps `enabled_at`. Older events are marked delivered without being sent, so
  switching Slack on does not fire a week of history at everyone.

---

## Not built yet

- **"Approvals I cover that are overdue"** appears as a bell toggle and has full translations, but
  nothing produces that event. The toggle does nothing.
- **Per-person daily summary.** `digest_channel` is forced to `team`. Sending each person their own
  figures would need per-user queries, and nobody asked for it.
- **Per-person counts in the summary** come from `invoices.assigned_to`. Invoices with no assignee
  produce no lines.
- **The Settings tab is admin only**, so non-admins cannot configure their own bell or their own
  daily summary, even though both are per-user settings.
- **Acknowledgements can be lost.** Each surface keeps its own local copy of `bell_ack`, so
  dismissing an alert on the dashboard can overwrite one acknowledged in the bell. See
  `src/lib/data/use-notification-acks.ts`.
