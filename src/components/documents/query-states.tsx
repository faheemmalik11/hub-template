import type { ReactNode } from "react";
import { AlertTriangle, Clock, Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

// Extract a human message from anything a query can reject with. Supabase rejects with a
// PostgrestError OBJECT (not an Error instance), so read its message/code fields too
// instead of falling back to the generic "unknown error".
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message : null;
    if (msg) {
      const code = typeof o.code === "string" ? o.code : null;
      return code ? `${msg} (${code})` : msg;
    }
  }
  return fallback;
}

// Fehlermeldung statt weißem Schirm — mit optionalem Wiederholen.
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const message = errorMessage(error, t("queryState.errorUnknown"));
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{t("queryState.errorTitle")}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {t("queryState.retry")}
        </Button>
      )}
    </div>
  );
}

// Leerzustand.
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  /** Optional way out of the state, e.g. "reset the filters" when a filtered list found nothing. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// A feature that exists but isn't ready yet: the tab/nav entry stays reachable (so it's clear the
// feature is coming, not missing), but its content is this greyed-out placeholder instead of the
// real screen. Deliberately duller than EmptyState (reduced opacity, no border) — an empty state
// says "nothing here yet, but the feature works"; this says "the feature itself isn't on yet".
export function ComingSoon({
  title,
  hint,
  className,
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[24rem] flex-col items-center justify-center rounded-xl bg-muted/40 px-6 py-16 text-center opacity-70",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Clock className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Tabellen-Skeleton.
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4", c === 0 ? "w-40" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Karten-Skeleton (KPIs etc.).
export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}
