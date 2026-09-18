import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One block standing in for a section that is still loading.
 *
 * Without it a section renders its empty state first and swaps to real rows a moment later, so a
 * supplier that has bank accounts reads as "no bank accounts" for as long as the query takes. That
 * is worse than a blank: it is a wrong answer, briefly, and it is the one people remember.
 *
 * A single block rather than a stack of bars per row. Striped placeholder rows are a drawing of a
 * table, and the eye starts reading them as data before noticing there is none.
 */
export function SectionSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton className={cn("w-full rounded-lg", className)} aria-busy="true" aria-live="polite" />
  );
}
