import { Badge } from "../../ui/badge";
import { cn } from "../../lib/class-names";
import type { PropertyInvoiceVatLine } from "../../adapters/properties";
import type { StatusTone } from "../../adapters/processing-log";
import type { PropertiesLabels } from "./labels";

const TONE_STYLE: Record<StatusTone, string> = {
  brand: "bg-brand-tint text-brand-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
};

// A missing company is a gap to close, so it renders as a warning rather than a neutral value.
export function CompanyChip({
  code,
  labels,
  className,
}: {
  code: string | null | undefined;
  labels: PropertiesLabels["companyChip"];
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

export function InvoiceStatusBadge({
  status,
  tone,
  statusLabel,
  className,
}: {
  status: string | null | undefined;
  tone: StatusTone | undefined;
  statusLabel: (status: string) => string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", TONE_STYLE[tone ?? "neutral"], className)}
    >
      {status ? statusLabel(status) : "—"}
    </Badge>
  );
}

// Three cases: a stated positive rate, a stated zero (exempt) and no recognized rate at all.
export function VatBadge({
  vatRate,
  vatLines,
  labels,
  className,
}: {
  vatRate: number | null | undefined;
  vatLines?: PropertyInvoiceVatLine[] | null;
  labels: PropertiesLabels["vatBadge"];
  className?: string;
}) {
  const rate = vatRate ?? null;
  const relevant = (rate ?? 0) > 0;

  // Only rates that carry net amounts count; a 0 % line beside a 19 % one is not a mixed case.
  const appliedRates = [
    ...new Set(
      (vatLines ?? [])
        .filter((line) => (line?.netAmount ?? 0) !== 0 && (line?.rate ?? 0) > 0)
        .map((line) => line.rate as number),
    ),
  ].sort((left, right) => left - right);
  const mixed = appliedRates.length > 1;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        relevant || mixed ? "bg-brand-tint text-brand-dark" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        mixed
          ? labels.mixedTitle(appliedRates.join(" %, "))
          : relevant
            ? labels.relevantTitle
            : rate === 0
              ? labels.exemptTitle
              : labels.unclearTitle
      }
    >
      {mixed
        ? labels.mixed
        : relevant
          ? `${labels.abbreviation} ${rate} %`
          : rate === 0
            ? labels.exempt
            : labels.unclear}
    </span>
  );
}
