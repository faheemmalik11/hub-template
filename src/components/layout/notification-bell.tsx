import { NotificationBell as BellCore } from "@/components/notifications/bell";
import { useNotificationAcks } from "@/lib/data/use-notification-acks";
import { useNotificationSeen } from "@/lib/data/use-notification-seen";
import { useNotificationItems } from "@/lib/data/use-notification-items";
import { useTranslation } from "@/lib/i18n";

/**
 * This project's bell adapter (docs/NOTIFICATIONS.md phase 1): the shared item list
 * (use-notification-items.ts) plus the shared acknowledgement (use-notification-acks.ts).
 * The badge counts NEWS; opening the dropdown stamps everything as seen.
 */
export function AppNotificationBell() {
  const { t } = useTranslation();
  const { items } = useNotificationItems();
  const { visible, acknowledge } = useNotificationAcks(items);
  const { unseenCount, markAllSeen } = useNotificationSeen(visible);

  return (
    <BellCore
      items={visible}
      unseenCount={unseenCount}
      onOpened={markAllSeen}
      onItemClick={acknowledge}
      title={t("notifications.title")}
      emptyText={t("notifications.empty")}
      ariaLabel={t("notifications.title")}
      seeAllLabel={t("notifications.alleAnsehen")}
      seeAllTo="/benachrichtigungen"
    />
  );
}
