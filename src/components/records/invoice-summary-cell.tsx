import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The "Invoices" cell: how many, and for how much.
 *
 * Both numbers in one cell, count under total. The column header no longer has to carry the
 * bookkeeping word ("Verbuchte Belege") for the figures to be readable.
 *
 * `loading` is a separate state on purpose, and not "render 0": the totals come from a different
 * query than the rows, and a confident "0,00 € · 0 Belege" while it is still in flight is a
 * fabricated zero, not a placeholder.
 */
export function InvoiceSummaryCell({
  count,
  amount,
  formatAmount,
  formatCount,
  loading = false,
  align = "right",
  className,
}: {
  count: number;
  amount: number;
  formatAmount: (amount: number) => string;
  formatCount: (count: number) => string;
  loading?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn(align === "right" && "text-right", className)}>
        <Skeleton className={cn("h-4 w-24", align === "right" && "ml-auto")} />
        <Skeleton className={cn("mt-1.5 h-3 w-16", align === "right" && "ml-auto")} />
      </div>
    );
  }
  return (
    <div className={cn("tabular-nums", align === "right" && "text-right", className)}>
      <div className="font-medium text-foreground">{formatAmount(amount)}</div>
      <div className="text-xs text-muted-foreground">{formatCount(count)}</div>
    </div>
  );
}
