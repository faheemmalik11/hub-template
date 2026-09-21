import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/documents/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ExtractedAccount = {
  id: string;
  /** Space-grouped for display. */
  iban: string;
  /** Unformatted, for copying. */
  rawIban: string;
  bic: string | null;
  bankName: string | null;
  /** Nobody has vouched for this account yet: the pipeline met it for the first time on this document. */
  isUnconfirmed: boolean;
  /** The one the payment will actually go to. */
  isSelected: boolean;
};

export type ExtractedAccountsLabels = {
  unconfirmed: string;
  unconfirmedHint: string;
  inUse: string;
  copyIban: string;
};

/**
 * Every account this document printed, next to the payment controls.
 *
 * It sits here rather than on the supplier tab because "which accounts did this invoice name" is a
 * question somebody asks while deciding whether to pay, not while reading who the supplier is. An
 * account the pipeline had never seen for this supplier is flagged, since a supplier's bank
 * details changing is exactly the moment an invoice deserves a second look.
 *
 * Presentation only, so the same list drops into any Hub.
 */
export function ExtractedAccountsList({
  accounts,
  labels,
  className,
}: {
  accounts: ExtractedAccount[];
  labels: ExtractedAccountsLabels;
  className?: string;
}) {
  if (accounts.length === 0) return null;

  return (
    <ul className={cn("space-y-2", className)}>
      {accounts.map((account) => (
        <li
          key={account.id}
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-2",
            account.isSelected ? "bg-brand-tint/50" : "bg-muted/30",
          )}
        >
          <span
            className={cn(
              "font-mono text-base",
              account.isUnconfirmed && "font-medium text-amber-800",
            )}
          >
            {account.iban}
          </span>
          <CopyButton value={account.rawIban} label={labels.copyIban} className="size-5" />
          {account.bankName && (
            <span className="text-sm text-muted-foreground">{account.bankName}</span>
          )}
          {account.isSelected && (
            <Badge variant="secondary" className="font-normal">
              {labels.inUse}
            </Badge>
          )}
          {account.isUnconfirmed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-300 bg-amber-100 font-normal text-amber-900"
                >
                  <TriangleAlert className="size-3" />
                  {labels.unconfirmed}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[20rem]">{labels.unconfirmedHint}</TooltipContent>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  );
}
