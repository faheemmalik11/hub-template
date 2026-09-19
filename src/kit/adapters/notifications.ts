import type { NotificationItem } from "../components/notifications/types";

export interface AckStore {
  acked: Record<string, number>;
  save: (next: Record<string, number>) => void;
}

export interface BellEventGroup {
  key: string;
  events: string[];
}

export interface ReminderRecipient {
  value: string;
  label: string;
}

export interface NotificationsAdapter {
  useItems(): { items: NotificationItem[]; loading: boolean };
  useAckStore(): AckStore;
  useBellToggles(): {
    saved: Record<string, boolean> | undefined;
    isLoading: boolean;
    save: (next: Record<string, boolean>) => Promise<void>;
  };
  useReminderRecipients(): ReminderRecipient[];
  sendReminder(input: { recipientUserId: string; note?: string }): Promise<void>;
  bellEventGroups: BellEventGroup[];
}
