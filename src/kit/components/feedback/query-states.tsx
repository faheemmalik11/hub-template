import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { Skeleton } from "../../ui/skeleton";
import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";

export interface ErrorStateLabels {
  title: string;
  unknownError: string;
  retry: string;
}

export const englishErrorStateLabels: ErrorStateLabels = {
  title: "Something went wrong.",
  unknownError: "Unknown error.",
  retry: "Try again",
};

// Supabase rejects with a plain object, not an Error, so read its message field too.
export function readableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const errorObject = error as Record<string, unknown>;
    const message = typeof errorObject.message === "string" ? errorObject.message : null;
    if (message) {
      const code = typeof errorObject.code === "string" ? errorObject.code : null;
      return code ? `${message} (${code})` : message;
    }
  }
  return fallback;
}

export function ErrorState({
  error,
  onRetry,
  labels = englishErrorStateLabels,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  labels?: ErrorStateLabels;
  className?: string;
}) {
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
      <h2 className="mt-4 text-base font-semibold text-foreground">{labels.title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {readableErrorMessage(error, labels.unknownError)}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {labels.retry}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
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

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn("h-4", columnIndex === 0 ? "w-40" : "flex-1")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}
