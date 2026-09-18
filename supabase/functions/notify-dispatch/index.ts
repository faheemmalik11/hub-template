// notify-dispatch — the notification system's delivery loop (docs/NOTIFICATIONS.md phase 3).
//
// Producers write notification_events and know nothing about delivery; THIS function routes.
//
// Called three ways:
//   {mode: "event", id}  the insert trigger on notification_events (migration 20260911100000),
//                        immediately, for that one row. This is how a notification normally
//                        travels now.
//   {}                   pg_cron every 15 minutes (migration 20260827130000). Still needed: it
//                        runs the daily briefing, which is clock driven, and it retries anything
//                        the instant path failed to send.
//   {mode: "test"}       the settings screen's test button. Idempotent per call: events carry a per-channel delivery stamp, the
// daily briefing carries a per-user per-day stamp, so a re-run never double-sends. Delivery is
// AT-LEAST-ONCE by design: the stamp is written after a successful send, so a crash between
// send and stamp can repeat one message on the next tick. The 15 minute cadence with a 60s
// timeout makes overlapping ticks practically impossible; exactly-once would need a claim
// protocol nothing here justifies.
//
// Channel adapters share one interface: deliver(db, channel, payload) -> resolves or throws.
// Adding a channel is one adapter plus one notification_channels row; nothing upstream changes.
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

type ChannelRow = { key: string; enabled: boolean; config: Record<string, unknown> };

type OutPayload = {
  kind: "event" | "digest" | "test";
  [key: string]: unknown;
};

// A call that hangs must not eat the function's whole runtime budget.
const SLACK_TIMEOUT_MS = 10_000;
// Per tick, not per lifetime: a bigger backlog simply continues next tick.
const EVENT_BATCH = 200;
// A channel enabled a month late must not blast the whole historic backlog. Older undelivered
// events stay unstamped but are never picked up again.
const EVENT_MAX_AGE_DAYS = 7;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; code?: string };
    if (p.message || p.code) return [p.message, p.details, p.code].filter(Boolean).join(" | ");
  }
  return String(e ?? "unknown error");
}

// ---------------------------------------------------------------------------
// Channel adapters.
// ---------------------------------------------------------------------------

async function channelSecret(db: Db, channel: string): Promise<string> {
  const { data, error } = await db.rpc("get_channel_secret", { p_channel: channel });
  if (error) throw error;
  return String(data ?? "").trim();
}

async function slackWorkspaceGuard(db: Db, channel: ChannelRow, token: string): Promise<void> {
  const known = String(channel.config.team_id ?? "");
  const data = await slackApi(token, "auth.test", {});
  const team = String(data.team_id ?? "");
  if (!team || team === known) return;
  if (known) {
    await db.from(TABLE.appUsers).update({ slack_user_id: null }).not("slack_user_id", "is", null);
  }
  await db
    .from(TABLE.notificationChannels)
    .update({ config: { ...channel.config, team_id: team }, updated_at: new Date().toISOString() })
    .eq("key", channel.key);
  channel.config = { ...channel.config, team_id: team };
}

async function slackApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`slack: ${method} answered ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`slack: ${method} failed (${data.error ?? "unknown"})`);
  return data;
}

async function slackGet(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`slack: ${method} answered ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`slack: ${method} failed (${data.error ?? "unknown"})`);
  return data;
}

async function slackDirectory(db: Db): Promise<Record<string, unknown>> {
  const token = await channelSecret(db, "slack");
  if (!token) throw new Error("slack: no bot token stored");

  const out: Record<string, unknown> = { channels: [], people: [], members: [] };

  try {
    const data = await slackGet(token, "conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });
    out.channels = ((data.channels ?? []) as Db[])
      .map((c) => ({ id: String(c.id), name: String(c.name) }))
      .sort((a: Db, b: Db) => a.name.localeCompare(b.name));
  } catch (e) {
    out.channelError = errorMessage(e);
  }

  try {
    const data = await slackGet(token, "users.list", { limit: "500" });
    const byEmail = new Map<string, string>();
    const members: { id: string; label: string }[] = [];
    for (const m of (data.members ?? []) as Db[]) {
      if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
      const mail = String(m.profile?.email ?? "")
        .trim()
        .toLowerCase();
      if (mail) byEmail.set(mail, String(m.id));
      const label =
        String(m.profile?.real_name ?? "").trim() ||
        String(m.real_name ?? "").trim() ||
        String(m.name ?? "").trim();
      members.push({ id: String(m.id), label: label || String(m.id) });
    }
    members.sort((a, b) => a.label.localeCompare(b.label));
    out.members = members;

    const { data: users } = await db
      .from(TABLE.appUsers)
      .select("id, name, email, slack_user_id")
      .eq("is_active", true)
      .order("name");
    out.people = ((users ?? []) as Db[]).map((u) => ({
      id: String(u.id),
      name: u.name,
      slackUserId: u.slack_user_id ?? null,
      autoMatch:
        byEmail.get(
          String(u.email ?? "")
            .trim()
            .toLowerCase(),
        ) ?? null,
    }));
  } catch (e) {
    out.peopleError = errorMessage(e);
  }

  return out;
}

async function slackUserId(
  db: Db,
  token: string,
  user: { id?: string; email?: string; slack_user_id?: string },
  notes: string[],
): Promise<string | null> {
  if (user.slack_user_id === "") return null;
  if (user.slack_user_id) return user.slack_user_id;
  if (!user.email) {
    notes.push(`slack dm: no email on ${user.id ?? "user"}`);
    return null;
  }
  let found: string;
  try {
    const data = await slackGet(token, "users.lookupByEmail", { email: user.email });
    found = String((data.user as Record<string, unknown> | undefined)?.id ?? "");
  } catch (e) {
    notes.push(`slack dm: lookup ${user.email} failed: ${errorMessage(e)}`);
    return null;
  }
  if (!found) {
    notes.push(`slack dm: lookup ${user.email} returned no id`);
    return null;
  }
  if (user.id) {
    const { error } = await db
      .from(TABLE.appUsers)
      .update({ slack_user_id: found })
      .eq("id", user.id);
    if (error) notes.push(`slack dm: could not cache id: ${errorMessage(error)}`);
  }
  return found;
}

async function deliverSlack(
  db: Db,
  channel: ChannelRow,
  payload: OutPayload,
  notes: string[],
): Promise<void> {
  const token = await channelSecret(db, channel.key);
  if (!token) throw new Error("slack: no bot token stored");
  await slackWorkspaceGuard(db, channel, token);
  const teamChannel = String(channel.config.team_channel ?? "").trim();
  const dmEnabled = channel.config.dm !== false;

  const person =
    payload.kind === "digest"
      ? payload.destination === "personal"
        ? payload.user
        : null
      : payload.recipient;

  let target = "";
  if (dmEnabled && person) {
    target = (await slackUserId(db, token, person as Record<string, unknown>, notes)) ?? "";
  } else if (dmEnabled) {
    notes.push("slack dm: event has no recipient");
  }
  if (!target) target = teamChannel;
  if (!target) throw new Error("slack: no team channel configured");

  await slackApi(token, "chat.postMessage", {
    channel: target,
    text: slackText(payload, String(channel.config.hub_url ?? "")),
    unfurl_links: false,
  });
}

function slackText(payload: OutPayload, hubUrl = ""): string {
  const hubLink = (pfad: string, id: unknown): string => {
    const base = hubUrl.replace(/\/+$/, "");
    if (!base || !id) return " Details im Hub.";
    return ` <${base}/${pfad}/${id}|Im Hub öffnen>`;
  };
  const invoiceLink = (id: unknown): string => hubLink("eingangsrechnungen", id);

  // WHAT A NOTIFICATION POINTS AT.
  //
  // Kept in step with src/lib/data/notification-target.ts, which does the same job for the bell.
  // Rows written since migration 20260911100000 carry `target: {kind, id, path}`; older ones carry
  // document_id or transaction_id at the top level and are not backfilled, so both shapes are read.
  //
  // The path arrives ready made, because routes live in the front end and a couple of screens
  // address a record by something other than its primary key. Nothing here has to know what an
  // invoice is.
  const targetOf = (p: Record<string, unknown>): { kind: string | null; path: string | null } => {
    const raw = p.target as Record<string, unknown> | undefined;
    if (raw && (raw.kind || raw.path)) {
      return {
        kind: (raw.kind as string | undefined) ?? null,
        path: (raw.path as string | undefined) ?? null,
      };
    }
    if (p.transaction_id) {
      return { kind: "transaction", path: `/banktransaktionen/${p.transaction_id}` };
    }
    if (p.document_id) return { kind: "invoice", path: `/eingangsrechnungen/${p.document_id}` };
    return { kind: null, path: null };
  };

  // German, like every other string the recipient reads. An unknown kind falls back to "etwas"
  // rather than leaking the raw key into a Slack message.
  const TARGET_NAMES: Record<string, string> = {
    invoice: "eine Eingangsrechnung",
    transaction: "eine Banktransaktion",
    supplier: "einen Lieferanten",
    customer: "einen Kunden",
    property: "ein Objekt",
    page: "eine Seite im Hub",
  };

  // Sending "Details im Hub" with no address is how the recipient ends up searching for the thing
  // somebody just asked them to look at.
  const zielLink = (p: Record<string, unknown>): string => {
    const path = targetOf(p).path;
    const base = hubUrl.replace(/\/+$/, "");
    if (!base || !path) return " Details im Hub.";
    return ` <${base}${path}|Im Hub öffnen>`;
  };
  if (payload.kind === "digest") {
    const f = (payload.figures ?? {}) as Record<string, number>;
    const lines: string[] = ["*Guten Morgen!* Der Stand für heute:"];
    if (f.faellig !== undefined) lines.push(`• Überfällige Rechnungen: *${f.faellig}*`);
    if (f.zuPruefen !== undefined) lines.push(`• Warten auf Prüfung: *${f.zuPruefen}*`);
    if (f.vorschlaege !== undefined) {
      lines.push(`• Zahlungsvorschläge zu bestätigen: *${f.vorschlaege}*`);
    }
    if (f.fehler !== undefined) lines.push(`• Fehler im letzten Lauf: *${f.fehler}*`);
    const personen = (payload.personen ?? []) as { name: string; offen: number }[];
    if (personen.length > 0) {
      lines.push("Offene Punkte je Person:");
      for (const person of personen) lines.push(`• ${person.name}: *${person.offen}*`);
    }
    return lines.join("\n");
  }
  if (payload.kind === "event") {
    const p = (payload.payload ?? {}) as Record<string, unknown>;
    const to = (payload.recipient ?? {}) as Record<string, unknown>;
    if (payload.type === "ping") {
      // Names WHAT, not just "something": a notification about a payment and one about a supplier
      // are different errands, and the recipient should know which before clicking.
      const kind = targetOf(p).kind;
      const was = (kind && TARGET_NAMES[kind]) || "etwas";
      const note = typeof p.note === "string" && p.note.trim() ? `\n> ${p.note.trim()}` : "";
      return `*${p.from_name ?? "Jemand"}* bittet ${to.name ?? "dich"}, sich ${was} anzusehen.${zielLink(p)}${note}`;
    }
    if (payload.type === "zuweisung") {
      const wer = to.name ?? p.assigned_to ?? "jemand";
      const nr = p.invoice_number ? ` (${p.invoice_number})` : "";
      return `Rechnung${nr} wurde *${wer}* zugewiesen.${invoiceLink(p.document_id)}`;
    }
    if (payload.type === "rueckfrage" || payload.type === "abgelehnt") {
      const wer = to.name ?? p.returned_to ?? "das Team";
      const nr = p.invoice_number ? ` (${p.invoice_number})` : "";
      const was = payload.type === "rueckfrage" ? "eine Rückfrage" : "eine Ablehnung";
      return `Rechnung${nr}: ${was} zurück an *${wer}*.${invoiceLink(p.document_id)}`;
    }
    return `Neue Benachrichtigung (${payload.type}) für ${to.name ?? "das Team"}.`;
  }
  return "Testnachricht aus dem Hub. Der Kanal funktioniert.";
}

const ADAPTERS: Record<
  string,
  (db: Db, c: ChannelRow, p: OutPayload, notes: string[]) => Promise<void>
> = {
  slack: deliverSlack,
};

// ---------------------------------------------------------------------------
// Event delivery: recent events not yet stamped for at least one enabled channel. The filter is
// built from the enabled channel keys, so fully delivered events never load again and the
// partial undelivered index stays the working set.
// ---------------------------------------------------------------------------

async function deliverEvents(
  db: Db,
  channels: ChannelRow[],
  errors: string[],
): Promise<Record<string, number>> {
  const sent: Record<string, number> = {};
  if (channels.length === 0) return sent;

  const cutoff = new Date(Date.now() - EVENT_MAX_AGE_DAYS * 86_400_000).toISOString();
  const missingStamp = channels.map((c) => `delivered->>${c.key}.is.null`).join(",");
  const { data, error } = await db
    .from(TABLE.notificationEvents)
    .select(
      `id, type, payload, delivered, created_at, recipient:${TABLE.appUsers}!notification_events_recipient_user_id_fkey(id, name, email, slack_user_id)`,
    )
    .gte("created_at", cutoff)
    .or(missingStamp)
    .order("created_at", { ascending: true })
    .limit(EVENT_BATCH);
  if (error) throw error;

  for (const ev of (data ?? []) as Db[]) {
    await deliverOneEvent(db, channels, ev, sent, errors);
  }
  return sent;
}

/**
 * One event across every enabled channel. Split out of the batch loop so the instant path
 * (mode "event", fired by the insert trigger in migration 20260911100000) delivers exactly the row
 * that was just written instead of draining the backlog: two notifications a second apart would
 * otherwise start two runs that both read the same batch and both post it.
 */
async function deliverOneEvent(
  db: Db,
  channels: ChannelRow[],
  ev: Db,
  sent: Record<string, number>,
  errors: string[],
): Promise<void> {
  {
    const delivered = { ...((ev.delivered ?? {}) as Record<string, string>) };
    let changed = false;
    for (const channel of channels) {
      if (delivered[channel.key]) continue;
      const allowed = (channel.config.events ?? {}) as Record<string, boolean>;
      const enabledAt = String(channel.config.enabled_at ?? "");
      if (allowed[ev.type] === false || (enabledAt && ev.created_at < enabledAt)) {
        delivered[channel.key] = new Date().toISOString();
        changed = true;
        continue;
      }
      try {
        await ADAPTERS[channel.key](
          db,
          channel,
          {
            kind: "event",
            type: ev.type,
            payload: ev.payload ?? {},
            recipient: ev.recipient ?? null,
            created_at: ev.created_at,
          },
          errors,
        );
        delivered[channel.key] = new Date().toISOString();
        sent[channel.key] = (sent[channel.key] ?? 0) + 1;
        changed = true;
      } catch (e) {
        // Leave unstamped; the next tick retries (until the event ages out). A dead webhook
        // must not block the loop, but it must also not fail silently forever.
        errors.push(`event ${ev.id} via ${channel.key}: ${errorMessage(e)}`);
      }
    }
    if (changed) {
      const { error: updateError } = await db
        .from(TABLE.notificationEvents)
        .update({ delivered })
        .eq("id", ev.id);
      if (updateError) errors.push(`event ${ev.id} stamp: ${errorMessage(updateError)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The daily briefing.
// ---------------------------------------------------------------------------

function localParts(now: Date, timeZone: string): { date: string; minutes: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    // An invalid stored timezone must not kill everyone's digest; fall back to the default.
    return localParts(now, "Europe/Berlin");
  }
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    // "24" can appear for midnight in some ICU versions; normalize into 0..1439.
    minutes: ((Number(parts.hour) % 24) * 60 + Number(parts.minute)) % 1440,
  };
}

function parseDigestTime(raw: unknown): number {
  const [h, m] = String(raw ?? "08:00")
    .split(":")
    .map(Number);
  if (!Number.isFinite(h) || h < 0 || h > 23) return 8 * 60;
  return h * 60 + (Number.isFinite(m) && m >= 0 && m < 60 ? m : 0);
}

// Every figure independent: a view another Hub does not have (bank matching, pipeline) drops
// that figure instead of killing the whole digest. That is what makes this file portable.
// PER-HUB: the only part of this function that knows THIS Hub's schema. digestFigures queries
// this project's tables to compile briefing figures. Stäy has no bank matching, pipeline, or
// workflow history tracking, so this returns only what exists locally. Each figure fails
// independently (allSettled / try-catch), so a Hub without a source simply omits that line
// from the briefing.
async function digestFigures(db: Db, today: string): Promise<Record<string, number>> {
  const head = { count: "exact" as const, head: true };
  const figures: Record<string, number> = {};
  const results = await Promise.allSettled([
    db
      .from(TABLE.vOpenItems)
      .select("id", head)
      .eq("is_open", true)
      .not("due_date", "is", null)
      .lt("due_date", today)
      .then((q: Db) => ({ key: "faellig", q })),
    db
      .from(TABLE.documents)
      .select("id", head)
      .is("deleted_at", null)
      .is("archived_at", null)
      .is("not_relevant_at", null)
      .eq("status", "zu_pruefen")
      .then((q: Db) => ({ key: "zuPruefen", q })),
    db
      .from(TABLE.vBankTransactionsList)
      .select("id", head)
      .eq("has_suggested_match", true)
      .then((q: Db) => ({ key: "vorschlaege", q })),
  ]);
  for (const r of results) {
    if (r.status === "fulfilled" && !r.value.q.error) {
      figures[r.value.key] = r.value.q.count ?? 0;
    }
  }
  const lastRun = await db
    .from(TABLE.pipelineRuns)
    .select("error_count")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastRun.error) figures.fehler = lastRun.data?.error_count ?? 0;
  return figures;
}

const PERSON_SCAN_LIMIT = 2000;
const PERSON_LINES = 10;

async function personFigures(db: Db): Promise<{ name: string; offen: number }[]> {
  const { data, error } = await db
    .from(TABLE.vOpenItems)
    .select("assigned_to")
    .eq("is_open", true)
    .not("assigned_to", "is", null)
    .limit(PERSON_SCAN_LIMIT);
  if (error) return [];
  const tally = new Map<string, number>();
  for (const row of (data ?? []) as { assigned_to: string }[]) {
    const name = (row.assigned_to ?? "").trim();
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, offen]) => ({ name, offen }))
    .sort((a, b) => b.offen - a.offen)
    .slice(0, PERSON_LINES);
}

async function deliverDigests(db: Db, channels: ChannelRow[], errors: string[]): Promise<number> {
  if (channels.length === 0) return 0;
  const { data, error } = await db
    .from(TABLE.notificationSettings)
    .select(
      `user_id, digest_time, digest_channel, digest_events, timezone, last_digest_sent_at, user:${TABLE.appUsers}!notification_settings_user_id_fkey(id, name, email, is_active, slack_user_id)`,
    )
    .eq("digest_enabled", true);
  if (error) throw error;

  const now = new Date();
  let sentCount = 0;
  const figuresByDate = new Map<string, Record<string, number>>();
  const teamSentForDate = new Set<string>();

  for (const row of (data ?? []) as Db[]) {
    try {
      // A settings row whose user was deleted (join null) or deactivated sends nothing.
      if (!row.user?.is_active) continue;
      const tz = row.timezone || "Europe/Berlin";
      const { date: today, minutes: nowMinutes } = localParts(now, tz);
      if (nowMinutes < parseDigestTime(row.digest_time)) continue;
      if (
        row.last_digest_sent_at &&
        localParts(new Date(row.last_digest_sent_at), tz).date === today
      ) {
        continue;
      }

      let figures = figuresByDate.get(today);
      if (!figures) {
        figures = await digestFigures(db, today);
        figuresByDate.set(today, figures);
      }
      const toggles = (row.digest_events ?? {}) as Record<string, boolean>;
      const selected: Record<string, number> = {};
      for (const [key, value] of Object.entries(figures)) {
        if (toggles[key] !== false) selected[key] = value;
      }
      const personen = toggles.personen !== false ? await personFigures(db) : [];

      // Everything toggled off produces an empty briefing: stamp it as handled rather than
      // retrying an empty message every 15 minutes for ever.
      const destination = row.digest_channel ?? "team";
      let delivered = Object.keys(selected).length === 0 && personen.length === 0;
      if (!delivered && destination === "team" && teamSentForDate.has(today)) delivered = true;
      if (!delivered) {
        for (const channel of channels) {
          try {
            await ADAPTERS[channel.key](
              db,
              channel,
              {
                kind: "digest",
                date: today,
                destination,
                user: {
                  id: row.user.id,
                  name: row.user.name,
                  email: row.user.email,
                  slack_user_id: row.user.slack_user_id,
                },
                figures: selected,
                personen,
              },
              errors,
            );
            delivered = true;
            if (destination === "team") teamSentForDate.add(today);
          } catch (e) {
            errors.push(`digest ${row.user_id} via ${channel.key}: ${errorMessage(e)}`);
          }
        }
      }
      if (delivered) {
        const { error: stampError } = await db
          .from(TABLE.notificationSettings)
          .update({ last_digest_sent_at: now.toISOString() })
          .eq("user_id", row.user_id);
        if (stampError) errors.push(`digest ${row.user_id} stamp: ${errorMessage(stampError)}`);
        else sentCount++;
      }
    } catch (e) {
      // One broken row (corrupt time, dead join) must not stop the other users' briefings.
      errors.push(`digest ${row.user_id}: ${errorMessage(e)}`);
    }
  }
  return sentCount;
}

// ---------------------------------------------------------------------------
// mode=test: the settings screen's "send test" button. The gateway (verify_jwt) already checked
// the signature; here only the ROLE is checked, against app_users via the JWT's email claim.
// ---------------------------------------------------------------------------

function jwtEmail(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

// The permission these endpoints require. Matches PERMISSIONS.notificationsSettings in
// src/lib/permissions.ts and the key in supabase/permissions.seed.sql; a different Hub swaps those
// two and this one.
const SETTINGS_PERMISSION = "notifications.settings";

/**
 * May the caller manage notification settings?
 *
 * Resolved the same way current_permissions() does -- a personal override wins, otherwise the
 * role's default -- rather than by a hardcoded role list. This runs on the service-role client,
 * which has no JWT, so has_permission() (which reads auth.jwt()) cannot be used and the same rule
 * is applied explicitly. A role check here would silently override the Notifications switch on
 * Team & Rollen, so switching it on for someone would not actually let them use it.
 */
async function darfEinstellungen(db: Db, email: string): Promise<boolean> {
  const { data, error } = await db
    .from(TABLE.appUsers)
    .select("id, is_active, role_id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error || !data?.is_active) return false;

  const { data: override } = await db
    .from(TABLE.userPermissions)
    .select("granted")
    .eq("user_id", data.id)
    .eq("permission_key", SETTINGS_PERMISSION)
    .maybeSingle();
  if (override) return override.granted === true;

  const { data: fromRole } = await db
    .from(TABLE.rolePermissions)
    .select("permission_key")
    .eq("role_id", data.role_id)
    .eq("permission_key", SETTINGS_PERMISSION)
    .maybeSingle();
  return !!fromRole;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const db = serviceClient();
  let body: { mode?: string; channel?: string; id?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    // Cron posts '{}'; an empty or invalid body means the normal tick.
  }

  try {
    const { data: channelRows, error } = await db
      .from(TABLE.notificationChannels)
      .select("key, enabled, config")
      .eq("enabled", true);
    if (error) throw error;
    // Unknown channel keys (a row without an adapter in THIS build) are ignored, not fatal.
    const channels = ((channelRows ?? []) as ChannelRow[]).filter((c) => ADAPTERS[c.key]);

    if (body.mode === "directory") {
      const email = jwtEmail(req);
      if (!email || !(await darfEinstellungen(db, email))) {
        return jsonResponse({ error: "admin only" }, 403);
      }
      return jsonResponse(await slackDirectory(db));
    }

    if (body.mode === "test") {
      const email = jwtEmail(req);
      if (!email || !(await darfEinstellungen(db, email))) {
        return jsonResponse({ error: "admin only" }, 403);
      }
      const target = channels.find((c) => c.key === body.channel);
      if (!target) return jsonResponse({ error: "channel not enabled" }, 400);
      const notes: string[] = [];
      await ADAPTERS[target.key](db, target, { kind: "test", requested_by: email }, notes);
      return jsonResponse({ ok: true, notes });
    }

    // THE INSTANT PATH. Fired by the insert trigger on notification_events (migration
    // 20260911100000) with the id of the row just written, so a ping reaches Slack in seconds
    // rather than on the next quarter hour. Only this one event: draining the backlog here would
    // race the cron and every other insert firing at the same moment.
    //
    // No run log entry. These fire once per notification, and burying the four cron ticks an hour
    // under hundreds of single-event rows would cost the log the thing it is read for. A failure
    // is returned to the caller and the event simply stays unstamped for the cron to retry, which
    // is the same safety net it always had.
    if (body.mode === "event") {
      const id = body.id;
      if (id === undefined || id === null || id === "") {
        return jsonResponse({ error: "id is required" }, 400);
      }
      const { data: row, error: rowError } = await db
        .from(TABLE.notificationEvents)
        .select(
          `id, type, payload, delivered, created_at, recipient:${TABLE.appUsers}!notification_events_recipient_user_id_fkey(id, name, email, slack_user_id)`,
        )
        .eq("id", id)
        .maybeSingle();
      if (rowError) throw rowError;
      // Already gone, or never there. Nothing to deliver and nothing to complain about.
      if (!row) return jsonResponse({ ok: true, events: {}, skipped: "no such event" });
      const sent: Record<string, number> = {};
      const oneErrors: string[] = [];
      await deliverOneEvent(db, channels, row as Db, sent, oneErrors);
      return jsonResponse({ ok: oneErrors.length === 0, events: sent, errors: oneErrors });
    }

    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    const events = await deliverEvents(db, channels, errors);
    const digests = await deliverDigests(db, channels, errors);
    try {
      await db.from(TABLE.notificationDispatchLog).insert({
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        ok: errors.length === 0,
        events,
        digests,
        errors,
      });
      await db
        .from(TABLE.notificationDispatchLog)
        .delete()
        .lt("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    } catch (_e) {
      // Observability must not break delivery (log table may lag a migration on another Hub).
    }
    // Errors are reported, not thrown: partial delivery is success for the parts that worked,
    // and the stamps guarantee the failed parts retry next tick.
    return jsonResponse({ ok: errors.length === 0, events, digests, errors });
  } catch (e) {
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
