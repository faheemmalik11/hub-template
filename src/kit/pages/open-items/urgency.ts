import type { OpenItemRow } from "../../adapters/open-items";

export type UrgencyLevel = "normal" | "old" | "critical";

export interface Urgency {
  days: number | null;
  overdue: boolean;
  level: UrgencyLevel;
}

const OLD_AFTER_DAYS = 30;
const VERY_OLD_AFTER_DAYS = 90;

function daysSince(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const then = new Date(iso.slice(0, 10)).getTime();
  const now = new Date(today).getTime();
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((now - then) / (24 * 60 * 60 * 1000));
}

function urgencyDate(
  row: Pick<OpenItemRow, "dueDate" | "documentDate" | "receivedAt">,
): string | null {
  return row.dueDate ?? row.documentDate ?? row.receivedAt;
}

export function computeUrgency(
  row: Pick<OpenItemRow, "dueDate" | "documentDate" | "receivedAt">,
  today: string,
): Urgency {
  if (row.dueDate) {
    const days = daysSince(row.dueDate, today);
    const overdue = days != null && days > 0;
    return { days, overdue, level: overdue ? "critical" : "normal" };
  }
  const days = daysSince(urgencyDate(row), today);
  return {
    days,
    overdue: false,
    level:
      days == null || days < OLD_AFTER_DAYS
        ? "normal"
        : days < VERY_OLD_AFTER_DAYS
          ? "old"
          : "critical",
  };
}
