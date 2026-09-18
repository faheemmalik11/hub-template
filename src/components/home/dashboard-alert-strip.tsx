import { AlertStrip } from "@/components/notifications/alerts";
import { SetupPriorityCard } from "@/components/home/setup-priority-card";
import { useNotificationItems } from "@/lib/data/use-notification-items";
import { useSetupChecklist } from "@/lib/data/use-setup-checklist";
import { useTranslation } from "@/lib/i18n";

/**
 * The dashboard's top alert slot: the setup checklist while it's incomplete, general
 * notifications once it's done — never both at once. Both halves are already exception-only
 * (render nothing when there's nothing to say), so this naturally shows nothing at all once
 * setup is done and the inbox is empty.
 */
export function DashboardAlertStrip() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  const { items } = useNotificationItems();

  if (!checklist.ready) return null;
  if (checklist.doneCount < checklist.steps.length) return <SetupPriorityCard />;

  return (
    <AlertStrip
      items={items}
      max={3}
      seeAllTo="/benachrichtigungen"
      seeAllLabel={t("notifications.alleAnsehen")}
      className="mb-4"
    />
  );
}
