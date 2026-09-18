import type { ComponentType } from "react";

export type NotificationTone = "default" | "warn" | "danger";

export type NotificationCategory = "alert" | "task" | "info";

/** One row of the bell dropdown. The label arrives already translated and already carries the
 *  count in words; `count` exists separately so the host can filter zero rows and sum badges. */
export interface NotificationItem {
  key: string;
  /** Short name of the thing ("Overdue invoices"). Used where a count pill sits beside it. */
  label: string;
  /**
   * The same news as a full sentence with the number inside ("25 invoices are overdue and still
   * unpaid"). The alert surfaces show this instead of label + pill, because an alert has to say
   * what is happening on its own. Optional: falls back to `label` when a host does not supply it.
   */
  message?: string;
  count: number;
  tone?: NotificationTone;
  category?: NotificationCategory;
  ack?: { key: string; value: number };
  passive?: boolean;
  highlight?: string;
  at?: string;
  atLabel?: string;
  dateLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  source?: string;
  action?: string;
  link: { to: string; search?: Record<string, unknown>; hash?: string };
}
