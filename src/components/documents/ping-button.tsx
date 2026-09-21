import { useMemo } from "react";

import {
  NotifySomeoneButton,
  NotifySomeoneDialog,
  NotifyBanner,
  type NotifySomeoneLabels,
  type NotifyBannerLabels,
} from "@/kit/components/notify-someone";

import {
  useAcknowledgeNotification,
  useChainPeople,
  useRecordNotifications,
  useSendPing,
} from "@/data";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/data/format";
import type { NotificationTargetKind } from "@/lib/data/notification-target";

/**
 * "Notify someone": a direct message to one colleague about the record you are on (a client meeting
 * 26.08, and again on 09.09 for payments with no document).
 *
 * THE UI IS IN src/kit, the data is here. Every Hub shows the same dialog and the same banner, and
 * none of them share a data layer, so what the kit gets is a recipient list, some labels and a
 * callback. Everything below is this Hub's half of that contract.
 */

/**
 * The notifiable people: every active account, minus yourself.
 *
 * This used to be the approver rows that happened to have `app_user_id` set, so anybody never
 * registered as an approver could not be reached at all. The chain names accounts now (migration
 * 20260901160000), so there is no second table to be absent from.
 *
 * Yourself is filtered out rather than left in and rejected: the RPC refuses it too (migration
 * 20260910210000), but a name you can pick and then get an error for is worse than a name that was
 * never offered.
 */
export function usePingRecipients(): { value: string; label: string }[] {
  const peopleQ = useChainPeople();
  const { appUserId } = useAuth();
  return useMemo(
    () =>
      (peopleQ.data ?? [])
        .filter((p) => p.is_active && p.name && p.id !== appUserId)
        .map((p) => ({ value: p.id, label: p.name as string })),
    [peopleQ.data, appUserId],
  );
}

function useNotifyLabels(): NotifySomeoneLabels {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      action: t("ping.aktion"),
      title: t("ping.titel"),
      description: t("ping.desc"),
      recipientLabel: t("ping.empfaenger"),
      recipientPlaceholder: t("ping.empfaengerPlaceholder"),
      noteLabel: t("ping.notiz"),
      notePlaceholder: t("ping.notizPlaceholder"),
      cancel: t("ping.abbrechen"),
      send: t("ping.senden"),
      sending: t("ping.wirdGesendet"),
      sent: t("ping.gesendet"),
      failed: (message: string) => t("ping.fehlgeschlagen", { error: message }),
      unknownError: t("ping.unbekannterFehler"),
      noRecipients: t("ping.keineEmpfaenger"),
    }),
    [t],
  );
}

/**
 * What the caller hands either component: which record the message is about.
 *
 * A kind and an id, not a column per record type. That is what lets the same button sit on an
 * invoice, a transaction, a supplier or a screen that does not exist yet, without this file or the
 * RPC learning anything new (migration 20260911100000).
 */
export interface PingTarget {
  kind?: NotificationTargetKind;
  /** The record's id, or for `kind: "page"` the path itself. */
  id?: string;
}

/**
 * Both omitted sends a notification with no target: a general reminder, which is what the
 * notifications screen offers. It lands in the bell and says who it is from, and clicking it opens
 * the bell rather than a record.
 */
function useSendHandler({ kind, id }: PingTarget) {
  const sendPing = useSendPing();
  return async ({ recipientId, note }: { recipientId: string; note: string | null }) => {
    await sendPing.mutateAsync({
      recipientUserId: recipientId,
      targetKind: kind,
      targetId: id,
      note: note ?? undefined,
    });
  };
}

/** Trigger plus dialog, for a header or a toolbar. */
export function NotifySomeone({ kind, id, className }: PingTarget & { className?: string }) {
  return (
    <NotifySomeoneButton
      labels={useNotifyLabels()}
      recipients={usePingRecipients()}
      onSend={useSendHandler({ kind, id })}
      className={className}
    />
  );
}

/**
 * The dialog on its own, for callers that already own the trigger.
 *
 * A dropdown item cannot own it: the menu closes on select and takes the dialog with it, so the
 * open state has to live outside the menu.
 */
export function PingDialog({
  kind,
  id,
  recipients,
  open,
  onOpenChange,
}: PingTarget & {
  recipients: { value: string; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <NotifySomeoneDialog
      labels={useNotifyLabels()}
      recipients={recipients}
      onSend={useSendHandler({ kind, id })}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

/**
 * "Somebody asked you to look at this", shown on the record itself.
 *
 * Renders nothing at all when there is nothing waiting, so it is safe to drop at the top of any
 * detail page unconditionally.
 */
export function PingNotice({ kind, id, className }: PingTarget & { className?: string }) {
  const { t } = useTranslation();
  const notificationsQ = useRecordNotifications({ kind, id });
  const acknowledge = useAcknowledgeNotification();

  const labels: NotifyBannerLabels = useMemo(
    () => ({
      fromUnknown: t("ping.banner.vonUnbekannt"),
      noNote: t("ping.banner.ohneNotiz"),
      dismiss: t("ping.banner.schliessen"),
    }),
    [t],
  );

  const items = useMemo(
    () =>
      (notificationsQ.data ?? []).map((n) => ({
        id: String(n.id),
        fromName: n.fromName,
        note: n.note,
        sentAt: formatDateTime(n.createdAt),
      })),
    [notificationsQ.data],
  );

  return (
    <NotifyBanner
      items={items}
      labels={labels}
      onDismiss={(id: string) => acknowledge.mutate(Number(id))}
      className={className}
    />
  );
}
