import { useEffect, useState } from "react";

import type { NotificationItem } from "@/components/notifications/types";
import { useAuth } from "@/lib/auth";
import { useNotificationSettings, useSaveNotificationSettings } from "@/lib/data/queries";

const SEEN_PREFIX = "seen:";

export function useNotificationSeen(listedItems: NotificationItem[]): {
  unseenCount: number;
  markAllSeen: () => void;
} {
  const { appUserId } = useAuth();
  const settingsQ = useNotificationSettings(appUserId ?? null);
  const saveSettings = useSaveNotificationSettings(appUserId ?? null);
  const [seenLocal, setSeenLocal] = useState<Record<string, number> | null>(null);
  const seenSnapshots = seenLocal ?? settingsQ.data?.bell_ack ?? {};

  const seenKey = (item: NotificationItem) => `${SEEN_PREFIX}${item.ack?.key ?? item.key}`;
  const currentValue = (item: NotificationItem) => item.ack?.value ?? item.count;

  useEffect(() => {
    const lowered: Record<string, number> = {};
    for (const item of listedItems) {
      if (item.ack) continue;
      const snapshot = seenSnapshots[seenKey(item)];
      if (snapshot !== undefined && item.count < snapshot) lowered[seenKey(item)] = item.count;
    }
    if (Object.keys(lowered).length > 0) setSeenLocal({ ...seenSnapshots, ...lowered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listedItems]);

  const unseenCount = listedItems.filter((item) => {
    if (item.passive) return false;
    const snapshot = seenSnapshots[seenKey(item)];
    return snapshot === undefined || currentValue(item) > snapshot;
  }).length;

  return {
    unseenCount,
    markAllSeen: () => {
      if (unseenCount === 0) return;
      const next = { ...seenSnapshots };
      for (const item of listedItems) {
        if (item.passive) continue;
        next[seenKey(item)] = currentValue(item);
      }
      setSeenLocal(next);
      saveSettings.mutate({ bell_ack: next });
    },
  };
}
