import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { NotificationItem } from "@/components/notifications/types";
import { useAuth } from "@/lib/auth";
import { useNotificationSettings, useSaveNotificationSettings } from "@/lib/data/queries";

/**
 * PER-ROW acknowledgement, shared by every alert surface (bell, dashboard strip, notifications
 * page). Acknowledging an item (following it or dismissing it) hides it until its count GROWS
 * past what was acknowledged. Standing work counts (23 overdue) cannot be cleared by clicking,
 * so without this a visited row would nag for ever; with it a surface only shows what the
 * reader has not acted on yet. Falling counts (work got done) lower the snapshot silently; only
 * new arrivals bring a row back. Stored in the user's settings row
 * (notification_settings.bell_ack), so it follows them across devices.
 *
 * The React Query cache is the ONE copy every surface reads and writes. Each surface used to keep
 * its own local snapshot, which went stale the moment another surface saved: dismissing a row on
 * the dashboard then wrote that stale copy back and resurrected whatever had been acknowledged in
 * the bell.
 */
export function useNotificationAcks(items: NotificationItem[]): {
  visible: NotificationItem[];
  isAcked: (item: NotificationItem) => boolean;
  acknowledge: (item: NotificationItem) => void;
  acknowledgeAll: (toAck: NotificationItem[]) => void;
} {
  const { appUserId } = useAuth();
  const qc = useQueryClient();
  const settingsQ = useNotificationSettings(appUserId ?? null);
  const saveSettings = useSaveNotificationSettings(appUserId ?? null);
  const acked = settingsQ.data?.bell_ack ?? {};

  const write = useCallback(
    (next: Record<string, number>) => {
      const key = ["notification-settings", appUserId ?? null];
      qc.setQueryData(key, (old: unknown) =>
        old && typeof old === "object" ? { ...old, bell_ack: next } : old,
      );
      saveSettings.mutate(
        { bell_ack: next },
        // A failed write must not leave the row hidden on screen and visible again after a
        // reload: resync from the server so what is shown is what is stored.
        { onError: () => void qc.invalidateQueries({ queryKey: ["notification-settings"] }) },
      );
    },
    [qc, appUserId, saveSettings],
  );

  useEffect(() => {
    const lowered: Record<string, number> = {};
    for (const item of items) {
      if (item.ack) continue;
      const a = acked[item.key];
      if (a !== undefined && item.count < a) lowered[item.key] = item.count;
    }
    if (Object.keys(lowered).length > 0) write({ ...acked, ...lowered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const ackKey = (item: NotificationItem) => item.ack?.key ?? item.key;
  const ackValue = (item: NotificationItem) => item.ack?.value ?? item.count;

  const isAcked = (item: NotificationItem) => {
    if (item.passive) return true;
    const a = acked[ackKey(item)];
    return a !== undefined && ackValue(item) <= a;
  };

  return {
    visible: items.filter((item) => !isAcked(item)),
    isAcked,
    acknowledge: (item) => write({ ...acked, [ackKey(item)]: ackValue(item) }),
    acknowledgeAll: (toAck) => {
      if (toAck.length === 0) return;
      const next = { ...acked };
      for (const item of toAck) next[ackKey(item)] = ackValue(item);
      write(next);
    },
  };
}
