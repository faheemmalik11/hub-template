import { Check, Copy, TriangleAlert, X } from "lucide-react";

import { cn } from "../../lib/class-names";

export interface ReviewBadgeLabels {
  none: string;
  duplicate: string;
  excluded: string;
  alreadyPaid: string;
  needed: string;
}

export function ReviewBadge({
  reasonCount = 0,
  status,
  alreadyPaid = false,
  unchecked = false,
  labels,
  className,
}: {
  reasonCount?: number;
  unchecked?: boolean;
  status?: string | null;
  alreadyPaid?: boolean;
  labels: ReviewBadgeLabels;
  className?: string;
}) {
  const state =
    status === "duplikat"
      ? "duplicate"
      : status === "ausgeschlossen"
        ? "excluded"
        : alreadyPaid
          ? "alreadyPaid"
          : reasonCount > 0 || (unchecked && status === "zu_pruefen")
            ? "needed"
            : "none";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        state === "needed"
          ? "bg-red-100 text-red-800"
          : state === "duplicate"
            ? "bg-orange-100 text-orange-800"
            : state === "excluded"
              ? "bg-muted text-muted-foreground"
              : state === "alreadyPaid"
                ? "bg-slate-100 text-slate-700"
                : "bg-emerald-100 text-emerald-800",
        className,
      )}
    >
      {state === "none" ? (
        <Check className="size-3.5 shrink-0" />
      ) : state === "duplicate" ? (
        <Copy className="size-3.5 shrink-0" />
      ) : state === "excluded" ? (
        <X className="size-3.5 shrink-0" />
      ) : (
        <TriangleAlert className="size-3.5 shrink-0" />
      )}
      {labels[state]}
      {state === "needed" && reasonCount > 0 && (
        <span className="tabular-nums opacity-70">· {reasonCount}</span>
      )}
    </span>
  );
}
