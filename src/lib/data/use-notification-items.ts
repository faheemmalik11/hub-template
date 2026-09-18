import { useMemo } from "react";
import { MessageSquare, UserPlus } from "lucide-react";

import type { NotificationCategory, NotificationItem } from "@/components/notifications/types";
import { useAuth } from "@/lib/auth";
import {
  useActingAs,
  useBankMatchingCounts,
  useInvoicesAssignedToMe,
  useInvoicesRejectedToMe,
  useInvoicesReturnedToMe,
  useNotificationCounts,
  useNotificationSettings,
  usePingsForMe,
  usePipelineHealth,
  useSentPings,
} from "@/lib/data/queries";
import { formatDateTimeShort, formatRelativeTime } from "@/lib/data/format";
import { readNotificationTarget, targetLabelKey } from "@/lib/data/notification-target";
import { useTranslation } from "@/lib/i18n";

const PING_ACK_KEY = "ping:at";
const PING_KEY_PREFIX = "ping:id:";
const PING_SENT_PREFIX = "ping:sent:";
const PING_HISTORY = 5;
// One key per assigned receipt, so the bell can link each to its own document. All of them share
// the single "zuweisung" toggle on /benachrichtigungen.
const ASSIGNED_KEY_PREFIX = "zuweisung:id:";

/**
 * The one source for "what needs attention right now". The bell, the dashboard alert strip and
 * the notifications page all read THIS list, so a count shown in one place is the same count in
 * every other. Items are already translated, already filtered to count > 0, and respect the
 * user's bell toggles (an explicit false hides the row, a missing key is ON).
 */
export function useNotificationItems(): {
  items: NotificationItem[];
  seenAt: string | null;
  loading: boolean;
} {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const countsQ = useNotificationCounts(appUserId ?? null);
  const { actingAs } = useActingAs();
  const returnedQ = useInvoicesReturnedToMe(actingAs?.id ?? null, actingAs?.name ?? null);
  const rejectedQ = useInvoicesRejectedToMe(actingAs?.id ?? null, actingAs?.name ?? null);
  const assignedQ = useInvoicesAssignedToMe(actingAs?.id ?? null);
  const bankQ = useBankMatchingCounts();
  const healthQ = usePipelineHealth();
  const settingsQ = useNotificationSettings(appUserId ?? null);
  const pingsQ = usePingsForMe(appUserId ?? null);
  const sentPingsQ = useSentPings(appUserId ?? null);

  const counts = countsQ.data;
  const returned = returnedQ.data?.length ?? 0;
  const rejected = rejectedQ.data?.length ?? 0;
  // One row per assigned receipt rather than a single count, for the same reason the pings below
  // are per-ping: a count linking to the unfiltered invoice list answers "how many" and not
  // "which", and there is no assigned-to-me filter on that list to link into. Each row goes
  // straight to the receipt it is about. The list is naturally short -- it only holds receipts
  // still in the approval phase, and it empties itself as they move on.
  const assigned = useMemo(() => assignedQ.data ?? [], [assignedQ.data]);
  const fehler = healthQ.data?.errorCount ?? 0;
  const bellEvents = useMemo(() => settingsQ.data?.bell_events ?? {}, [settingsQ.data]);
  const bellAck = useMemo(() => settingsQ.data?.bell_ack ?? {}, [settingsQ.data]);
  const pingAckAt = bellAck[PING_ACK_KEY] ?? 0;
  const recentPings = useMemo(() => {
    const list = pingsQ.data ?? [];
    const unread = list.filter((ping) => Date.parse(ping.created_at) > pingAckAt);
    const read = list
      .filter((ping) => Date.parse(ping.created_at) <= pingAckAt)
      .slice(0, PING_HISTORY);
    return [...unread, ...read];
  }, [pingsQ.data, pingAckAt]);
  const sentPings = useMemo(
    () => (sentPingsQ.data ?? []).slice(0, PING_HISTORY),
    [sentPingsQ.data],
  );

  const items = useMemo<NotificationItem[]>(() => {
    const all: NotificationItem[] = [
      {
        key: "neu",
        label: t("einstellungen.event.neu"),
        message: t("notifications.msg.neu", { count: counts?.neueBelege ?? 0 }),
        count: counts?.neueBelege ?? 0,
        tone: "default",
        link: { to: "/eingangsrechnungen" },
      },
      {
        key: "rueckfrage",
        label: t("einstellungen.event.rueckfrage"),
        message: t("notifications.msg.rueckfrage", { count: returned }),
        count: returned,
        tone: "warn",
        link: { to: "/eingangsrechnungen", search: { workflow: "rueckfrage" } },
      },
      {
        key: "abgelehnt",
        label: t("einstellungen.event.abgelehnt"),
        message: t("notifications.msg.abgelehnt", { count: rejected }),
        count: rejected,
        tone: "danger",
        link: { to: "/eingangsrechnungen", search: { workflow: "abgelehnt" } },
      },
      {
        key: "zuPruefen",
        label: t("einstellungen.event.zuPruefen"),
        message: t("notifications.msg.zuPruefen", { count: counts?.zuPruefen ?? 0 }),
        count: counts?.zuPruefen ?? 0,
        tone: "warn",
        link: { to: "/eingangsrechnungen", search: { status: "zu_pruefen" } },
      },
      {
        key: "faellig",
        label: t("einstellungen.event.faellig"),
        message: t("notifications.msg.faellig", { count: counts?.faellig ?? 0 }),
        count: counts?.faellig ?? 0,
        tone: "danger",
        link: { to: "/offene-posten", search: { typ: "incoming", due: "ueberfaellig" } },
      },
      {
        key: "vorschlaege",
        label: t("einstellungen.event.vorschlaege"),
        message: t("notifications.msg.vorschlaege", { count: bankQ.data?.vorschlag ?? 0 }),
        count: bankQ.data?.vorschlag ?? 0,
        tone: "warn",
        link: { to: "/banktransaktionen", search: { matching: "vorschlag" } },
      },
      {
        key: "fehler",
        label: t("einstellungen.event.fehler"),
        message: t("notifications.msg.fehler", { count: fehler }),
        count: fehler,
        tone: "danger",
        link: { to: "/protokoll" },
      },
    ];
    for (const beleg of assigned) {
      const nummer = beleg.invoice_number?.trim();
      all.push({
        key: `${ASSIGNED_KEY_PREFIX}${beleg.id}`,
        label: t("einstellungen.event.zuweisung"),
        message: t("notifications.msg.zuweisungEine", {
          beleg: nummer || t("notifications.belegOhneNummer"),
        }),
        count: 1,
        tone: "warn",
        highlight: nummer || undefined,
        icon: UserPlus,
        link: { to: `/eingangsrechnungen/${beleg.id}` },
      });
    }
    for (const ping of recentPings) {
      const sender = ping.payload.from_name?.trim();
      const note = ping.payload.note?.trim();
      // WHICH SCREEN IT IS ABOUT. The message says who wants what; without this it does not say
      // what the thing IS, so a row in the bell reads the same whether it points at an invoice, a
      // supplier or a payment. Resolved from the target rather than from a column per record type
      // (migration 20260911100000), and it reads the legacy shape too.
      const ziel = readNotificationTarget(ping.payload as Record<string, unknown>);
      const zielName = ziel.kind ? t(targetLabelKey(ziel.kind)) : null;
      all.push({
        key: `${PING_KEY_PREFIX}${ping.id}`,
        label: sender
          ? t("notifications.pingFrom", { name: sender })
          : t("einstellungen.event.ping"),
        message: sender
          ? note
            ? t("notifications.pingFromWithNote", { name: sender, note })
            : t("notifications.pingFrom", { name: sender })
          : t("notifications.msg.ping", { count: 1 }),
        count: 1,
        tone: "warn",
        // The screen, not the sender: the name is already in the message, and saying it twice
        // costs the row the one fact it was missing.
        highlight: zielName ?? sender,
        icon: MessageSquare,
        at: ping.created_at,
        atLabel: formatRelativeTime(ping.created_at),
        dateLabel: formatDateTimeShort(ping.created_at),
        ack: { key: PING_ACK_KEY, value: Date.parse(ping.created_at) },
        // One path, whatever it points at. Nothing here has to know what an invoice is any more.
        link: ziel.path
          ? { to: ziel.path }
          : { to: "/benachrichtigungen", search: { tab: "meldungen" } },
      });
    }
    for (const ping of sentPings) {
      const to = ping.recipient?.name?.trim();
      const note = ping.payload.note?.trim();
      all.push({
        key: `${PING_SENT_PREFIX}${ping.id}`,
        label: t("notifications.pingSent", { name: to ?? "" }),
        message: note
          ? t("notifications.pingSentWithNote", { name: to ?? "", note })
          : t("notifications.pingSent", { name: to ?? "" }),
        count: 1,
        tone: "default",
        passive: true,
        highlight: to,
        icon: MessageSquare,
        at: ping.created_at,
        atLabel: formatRelativeTime(ping.created_at),
        dateLabel: formatDateTimeShort(ping.created_at),
        link: ping.payload.transaction_id
          ? // A ping about a payment with no document behind it: the row to look at is the
            // transaction, not an invoice, and there may be no invoice at all.
            { to: `/banktransaktionen/${ping.payload.transaction_id}` }
          : ping.payload.document_id
            ? { to: `/eingangsrechnungen/${ping.payload.document_id}` }
            : { to: "/benachrichtigungen", search: { tab: "meldungen" } },
      });
    }
    return all.filter((i) => {
      const toggle = i.key.startsWith(ASSIGNED_KEY_PREFIX)
        ? "zuweisung"
        : i.key.startsWith(PING_KEY_PREFIX) || i.key.startsWith(PING_SENT_PREFIX)
          ? "ping"
          : i.key;
      return i.count > 0 && bellEvents[toggle] !== false;
    });
  }, [
    t,
    counts,
    returned,
    rejected,
    bankQ.data,
    fehler,
    assigned,
    recentPings,
    sentPings,
    bellEvents,
  ]);

  const decorated = useMemo(() => {
    const meta = (
      key: string,
    ): { category?: NotificationCategory; source?: string; action?: string } => {
      if (key === "neu")
        return {
          category: "info",
          source: t("notifications.source.intake"),
          action: t("notifications.action.view"),
        };
      if (key === "rueckfrage" || key === "abgelehnt" || key === "zuPruefen")
        return {
          source: t("notifications.source.review"),
          action: t("notifications.action.review"),
        };
      if (key === "faellig")
        return {
          source: t("notifications.source.invoices"),
          action: t("notifications.action.review"),
        };
      if (key === "vorschlaege")
        return {
          source: t("notifications.source.bankMatching"),
          action: t("notifications.action.reviewMatches"),
        };
      if (key === "fehler")
        return {
          category: "alert",
          source: t("notifications.source.processing"),
          action: t("notifications.action.viewErrors"),
        };
      if (key.startsWith(ASSIGNED_KEY_PREFIX))
        return {
          source: t("notifications.source.assignment"),
          action: t("notifications.action.open"),
        };
      if (key.startsWith(PING_SENT_PREFIX)) return { category: "info" };
      return {};
    };
    return items.map((item) => ({ ...item, ...meta(item.key) }));
  }, [items, t]);

  return {
    items: decorated,
    seenAt: counts?.seenAt ?? null,
    loading:
      countsQ.isLoading ||
      returnedQ.isLoading ||
      rejectedQ.isLoading ||
      bankQ.isLoading ||
      assignedQ.isLoading ||
      healthQ.isLoading,
  };
}
