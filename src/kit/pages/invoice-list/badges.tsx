import { Check, Landmark } from "lucide-react";

import { cn } from "../../lib/class-names";

export function ConfidenceBadge({
  score,
  label,
}: {
  score: number | null;
  label: (score: number | null) => string;
}) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">{label(null)}</span>;
  }
  const tone = score >= 0.95 ? "bg-emerald-500" : score >= 0.8 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 shrink-0 rounded-full", tone)} />
      {label(score)}
    </span>
  );
}

export function VatBadge({
  vatRate,
  label,
}: {
  vatRate: number | null;
  label: (vatRate: number) => string;
}) {
  if (!vatRate || vatRate <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-md bg-teal-100 px-1.5 py-0.5 text-xs font-medium text-teal-800">
      {label(vatRate)}
    </span>
  );
}

export function PaymentBadge({
  paidAt,
  paidLabel,
  openLabel,
}: {
  paidAt: string | null;
  paidLabel: string;
  openLabel: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        paidAt ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
      )}
    >
      {paidAt ? paidLabel : openLabel}
    </span>
  );
}

export function CompanyChip({ code, placeholder }: { code: string | null; placeholder: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
      {code ?? placeholder}
    </span>
  );
}

export function BankMatchBadge({
  hasConfirmed,
  hasSuggested,
  confirmedLabel,
  suggestedLabel,
}: {
  hasConfirmed?: boolean;
  hasSuggested?: boolean;
  confirmedLabel: string;
  suggestedLabel: string;
}) {
  if (!hasConfirmed && !hasSuggested) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        hasConfirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
      )}
    >
      {hasConfirmed ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Landmark className="size-3 shrink-0" />
      )}
      {hasConfirmed ? confirmedLabel : suggestedLabel}
    </span>
  );
}
