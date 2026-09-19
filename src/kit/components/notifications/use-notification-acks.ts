import { useEffect, useState } from "react";

import type { NotificationItem } from "./types";
import type { AckStore } from "../../adapters/notifications";

// Hides an item once acknowledged, until its count grows past the acknowledged value.
// Items with an `ack` marker use that key and value instead of their own key and count.
export function useNotificationAcks(
  items: NotificationItem[],
  store: AckStore,
): {
  visible: NotificationItem[];
  isAcknowledged: (item: NotificationItem) => boolean;
  acknowledge: (item: NotificationItem) => void;
} {
  const [localAcked, setLocalAcked] = useState<Record<string, number> | null>(null);
  const acked = localAcked ?? store.acked;

  useEffect(() => {
    const lowered: Record<string, number> = {};
    for (const item of items) {
      if (item.ack) continue;
      const ackedCount = acked[item.key];
      if (ackedCount !== undefined && item.count < ackedCount) lowered[item.key] = item.count;
    }
    if (Object.keys(lowered).length > 0) setLocalAcked({ ...acked, ...lowered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const ackKey = (item: NotificationItem) => item.ack?.key ?? item.key;
  const ackValue = (item: NotificationItem) => item.ack?.value ?? item.count;

  const isAcknowledged = (item: NotificationItem) => {
    if (item.passive) return true;
    const ackedValue = acked[ackKey(item)];
    return ackedValue !== undefined && ackValue(item) <= ackedValue;
  };

  return {
    visible: items.filter((item) => !isAcknowledged(item)),
    isAcknowledged,
    acknowledge: (item) => {
      const next = { ...acked, [ackKey(item)]: ackValue(item) };
      setLocalAcked(next);
      store.save(next);
    },
  };
}
