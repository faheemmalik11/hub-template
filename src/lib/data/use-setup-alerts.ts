import { useEffect, useMemo, useState } from "react";

import type { NotificationItem } from "@/components/notifications/types";
import { useAuth } from "@/lib/auth";
import { checklistStepLink } from "@/lib/checklist-config";
import { useSetupChecklist } from "@/lib/data/use-setup-checklist";
import { useTranslation } from "@/lib/i18n";

const DISMISS_KEY_BASE = "staey.setupWarning.dismissed";
const PREFIX = "setup:";

export function isSetupAlert(item: NotificationItem) {
  return item.key.startsWith(PREFIX);
}

export function useSetupAlerts(): { items: NotificationItem[]; dismiss: () => void } {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const checklist = useSetupChecklist();
  const dismissKey = `${DISMISS_KEY_BASE}.${appUserId ?? "anonymous"}`;

  const found = useMemo(() => {
    if (!checklist.ready) return [];
    const result: { key: string; count: number; link: NotificationItem["link"] }[] = [];
    for (const step of checklist.steps) {
      if (step.state !== "problem") continue;
      if (step.key === "mailbox") {
        for (const kind of step.problemKinds) {
          result.push({
            key: `folder-${kind}`,
            count: 1,
            link: checklistStepLink("mailbox", "problem", [kind]),
          });
        }
      } else if (step.key === "bank") {
        result.push({ key: "bank", count: step.problemCount, link: { to: "/bankkonten" } });
      } else if (step.key === "companies") {
        result.push({
          key: "companies",
          count: step.problemCount,
          link: { to: "/gesellschaften" },
        });
      } else if (step.key === "properties") {
        result.push({ key: "properties", count: step.problemCount, link: { to: "/objekte" } });
      } else if (step.key === "datev") {
        result.push({
          key: "datev",
          count: step.problemCount,
          link: { to: "/datev-uebergabe" },
        });
      }
    }
    if (checklist.openCount > 0) {
      result.push({
        key: "incomplete",
        count: checklist.openCount,
        link: { to: "/onboarding" },
      });
    }
    return result;
  }, [checklist]);

  const signature = useMemo(
    () =>
      found
        .map((f) => `${f.key}=${f.count}`)
        .sort()
        .join("|"),
    [found],
  );

  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  useEffect(() => {
    setDismissedSignature(
      typeof window === "undefined" ? null : window.localStorage.getItem(dismissKey),
    );
  }, [dismissKey]);

  const items = useMemo<NotificationItem[]>(() => {
    if (dismissedSignature === signature) return [];
    return found.map((f) => ({
      key: `${PREFIX}${f.key}`,
      category: "alert" as const,
      label: t(`home.setupWarning.${f.key}.label`),
      message: t(`home.setupWarning.${f.key}.message`, { count: f.count }),
      count: f.count,
      tone: f.key === "incomplete" ? ("default" as const) : ("warn" as const),
      source: t(`notifications.setupSource.${f.key}`),
      action: t(
        f.key === "incomplete" ? "notifications.action.open" : "notifications.action.setup",
      ),
      link: f.link,
    }));
  }, [found, signature, dismissedSignature, t]);

  return {
    items,
    dismiss: () => {
      window.localStorage.setItem(dismissKey, signature);
      setDismissedSignature(signature);
    },
  };
}
