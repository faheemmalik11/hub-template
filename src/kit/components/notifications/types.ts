import type { ComponentType } from "react";

export type NotificationTone = "default" | "warn" | "danger";

export interface NotificationItem {
  key: string;
  /** Short name of the thing ("Overdue invoices"). Used where a count pill sits beside it. */
  label: string;

  message?: string;
  count: number;
  tone?: NotificationTone;
  ack?: { key: string; value: number };
  passive?: boolean;
  highlight?: string;
  at?: string;
  atLabel?: string;
  dateLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  link: { to: string; search?: Record<string, unknown>; hash?: string };
}
