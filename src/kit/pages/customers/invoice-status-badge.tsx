import { cn } from "../../lib/class-names";
import type { CustomerInvoiceStatus } from "../../adapters/customers";
import type { CustomersLabels } from "./labels";

// Drafts and voided invoices stay visible in the table but never count as revenue.
export function countsAsRevenue(status: CustomerInvoiceStatus): boolean {
  return status !== "voided" && status !== "draft";
}

// Overdue is derived, not stored: an open invoice whose due date lies in the past.
export function isInvoiceOverdue(
  status: CustomerInvoiceStatus,
  dueDate: string | null | undefined,
  today: string,
): boolean {
  return status === "open" && !!dueDate && dueDate < today;
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-success-soft text-success",
  voided: "bg-muted text-muted-foreground line-through",
  overdue: "bg-danger-soft text-danger",
  draft: "bg-warning-soft text-warning",
  open: "bg-muted text-muted-foreground",
};

export function InvoiceStatusBadge({
  status,
  dueDate,
  labels,
  className,
}: {
  status: CustomerInvoiceStatus;
  dueDate: string | null | undefined;
  labels: CustomersLabels["detail"]["invoiceStatus"];
  className?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const key = isInvoiceOverdue(status, dueDate, today) ? "overdue" : status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[key],
        className,
      )}
    >
      {labels[key]}
    </span>
  );
}
