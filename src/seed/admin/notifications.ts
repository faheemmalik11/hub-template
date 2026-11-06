import { sampleId } from "../shared";
import { team } from "./team";

/** Slack off, email configured but off too -- the two channels the settings screen offers. */
export const notificationChannels = [
  { key: "slack", enabled: false, config: {}, updated_at: "2026-01-01T00:00:00Z" },
  { key: "email", enabled: false, config: {}, updated_at: "2026-01-01T00:00:00Z" },
];

export const notificationSettings = [
  {
    user_id: team[0].id,
    bell_events: ["assigned", "query", "rejected"],
    bell_ack: true,
    digest_enabled: false,
    digest_events: [],
    digest_channel: null,
    digest_time: null,
    timezone: "Europe/Berlin",
    last_digest_sent_at: null,
    updated_at: "2026-01-01T00:00:00Z",
  },
];

/** One unread bell event, so the bell badge and the list both have something to show. */
export const notificationEvents = [
  {
    id: sampleId(65, 1),
    type: "assigned",
    payload: { invoice_number: "TK-88120", from_name: team[1].name },
    recipient_user_id: team[0].id,
    delivered: true,
    acknowledged_at: null,
    created_by: "supervisor@example.com",
    created_at: "2026-09-21T07:00:00Z",
  },
];

export const notificationDispatchLog = [
  {
    id: sampleId(66, 1),
    started_at: "2026-09-21T07:00:00Z",
    finished_at: "2026-09-21T07:00:02Z",
    ok: true,
    events: 1,
    digests: 0,
    errors: null,
  },
];
