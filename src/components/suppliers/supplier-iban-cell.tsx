import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The IBAN cell: the supplier's DEFAULT account, and nothing else.
 *
 * The column used to carry three things at once: the IBAN, a "+2" chip counting the other
 * accounts on file, and a separate amber "IBAN geändert" badge. Three widths that changed row to
 * row, for one number you are usually just reading off. The other accounts live on the supplier
 * detail page, where there is room to say what they are.
 *
 * A change is not dropped, it moves INTO the number: the IBAN itself turns amber and the
 * explanation (previous account, new account, what to do) is the hover title. `warning` is
 * deliberately the caller's already-worded sentence. What counts as a change, and how recent
 * still counts, is the host's rule, not this component's.
 */
export function SupplierIbanCell({
  iban,
  warning,
  className,
}: {
  /** The default IBAN, already formatted. Null renders as an em dash. */
  iban: string | null;
  /** When set: render amber and show this on hover. Leave unset for a normal account. */
  warning?: string;
  className?: string;
}) {
  if (!iban) return <span className={cn("text-muted-foreground", className)}>—</span>;
  if (!warning)
    return <span className={cn("whitespace-nowrap font-mono text-xs", className)}>{iban}</span>;
  // The app's own tooltip, not the browser's `title`. A native tooltip looks different from every
  // other explanation in the Hub, waits about a second, and cannot be styled or wrapped.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            // nowrap: the warning triangle and the number are one thing to read. Left to wrap, a
            // flagged IBAN broke across two lines and made its row taller than every other row.
            "inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-medium text-amber-700",
            className,
          )}
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {iban}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{warning}</TooltipContent>
    </Tooltip>
  );
}
