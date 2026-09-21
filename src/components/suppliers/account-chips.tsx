import { FileText, Star, TriangleAlert } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** What a chip can say about an account. The host decides which apply. */
export type AccountChipKind = "invoice" | "new" | "default" | "manual";

export type AccountChip = {
  kind: AccountChipKind;
  label: string;
  /** The sentence behind it. A chip is a word; this is what the word means. */
  hint: string;
};

/**
 * What is true of one account: two marks and an explanation.
 *
 * Only two facts change what somebody DOES. An account the supplier has never billed from is worth
 * stopping for, and the account they are normally paid on is worth recognising at a glance. Those
 * are the two that stay on screen. Where the account came from is worth knowing but not worth
 * space on every row, so it lives behind the information icon with everything else.
 *
 * The star carries no word. A row of chips reading "Default" next to every default account is a
 * label repeated down the column; the star says the same thing without being read.
 *
 * Presentation only, so the same marks drop into any Hub.
 */
export function AccountChips({
  chips,
  infoLabel,
  className,
}: {
  chips: AccountChip[];
  /** Accessible name for the information icon. */
  infoLabel: string;
  className?: string;
}) {
  if (chips.length === 0) return null;
  const standard = chips.find((chip) => chip.kind === "default");
  // The star explains itself, so the list behind the receipt does not repeat it.
  const remaining = chips.filter((chip) => chip.kind !== "default");
  const newChip = chips.find((chip) => chip.kind === "new");

  // gap-2.5: two hover targets this small need daylight between them, or aiming at one keeps
  // opening the other.
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2.5", className)}>
      {standard && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span aria-label={standard.label} className="inline-flex items-center text-brand-dark">
              <Star className="size-3.5 fill-current" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[20rem]">{standard.hint}</TooltipContent>
        </Tooltip>
      )}

      {newChip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
              <TriangleAlert className="size-3" />
              {newChip.label}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[20rem]">{newChip.hint}</TooltipContent>
        </Tooltip>
      )}

      {/* What is left to say about this account, once the star has spoken for itself. */}
      {remaining.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={infoLabel}
              className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileText className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[22rem]">
            <ul className="space-y-1.5">
              {remaining.map((chip) => (
                <li key={chip.kind}>{chip.hint}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
