import { cn } from "../../lib/class-names";
import type { CustomersLabels } from "./labels";

// Company code chip; a missing company renders as a warning because invoices need one.
export function CompanyChip({
  code,
  labels,
  className,
}: {
  code: string | null | undefined;
  labels: CustomersLabels["companyChip"];
  className?: string;
}) {
  if (!code) {
    return (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning",
          className,
        )}
        title={labels.missingTitle}
      >
        {labels.missing}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-brand-tint px-2 py-0.5 font-mono text-xs font-medium text-brand-dark",
        className,
      )}
    >
      {code}
    </span>
  );
}
