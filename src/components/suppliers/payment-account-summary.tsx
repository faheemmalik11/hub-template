import { Info, Link2 } from "lucide-react";
import type { ReactNode } from "react";

import { AccountChips, type AccountChip } from "@/components/suppliers/account-chips";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One account this invoice could be paid to, already worded and formatted by the host. */
export type PaymentAccountRow = {
  id: string;
  /** Space-grouped for display. */
  iban: string;
  /** Unformatted, for copying. */
  rawIban: string;
  bankName: string | null;
  bic: string | null;
  /** What is true of this account: named by the document, on file already, new, the default. */
  chips: AccountChip[];
};

export type PaymentAccountLabels = {
  account: string;
  info: string;
  emptyTitle: string;
  add: string;
  /** Heading when the supplier has since gained an account this invoice could use. */
  availableTitle: string;
  link: string;
};

/**
 * The accounts this invoice can be paid to, one row each, with where each one came from.
 *
 * Two columns and no boxes: the IBANs line up under one another, so two accounts on one document
 * can be compared by reading straight down. An account the supplier has never billed from before
 * is called out in its own source cell rather than as a badge floating beside the number, because
 * the warning IS a statement about where the account came from.
 *
 * Presentation only, so the same block drops into any Hub.
 */
export function PaymentAccounts({
  accounts,
  emptyExplanation,
  labels,
  actions,
  onAdd,
  available,
  onLink,
  linking,
  className,
}: {
  accounts: PaymentAccountRow[];
  /** Why there is nothing to show. Only read when `accounts` is empty. */
  emptyExplanation: string;
  labels: PaymentAccountLabels;
  /** Rendered under the rows, e.g. the pay control. Kept next to what it acts on. */
  actions?: ReactNode;
  onAdd?: () => void;
  /**
   * An account the SUPPLIER has that this invoice is not connected to. Only meaningful while
   * `accounts` is empty: it means the supplier was completed after this invoice was read.
   */
  available?: { iban: string; bankName: string | null } | null;
  onLink?: () => void;
  linking?: boolean;
  className?: string;
}) {
  if (accounts.length === 0) {
    // The supplier has an account, this invoice just predates it. Saying "no payment account
    // available" here would be false, and the fix is one click rather than a trip to the
    // supplier's screen and back.
    if (available && onLink) {
      return (
        <div className={cn("max-w-xl", className)}>
          <p className="flex items-center gap-1.5 text-base font-medium text-foreground">
            <Info className="size-4 shrink-0 text-muted-foreground" />
            {labels.availableTitle}
          </p>
          <p className="mt-1.5 font-mono text-base text-foreground">{available.iban}</p>
          {available.bankName && (
            <p className="text-base text-muted-foreground">{available.bankName}</p>
          )}
          <Button variant="outline" size="sm" className="mt-3" disabled={linking} onClick={onLink}>
            <Link2 className="mr-1.5 size-3.5" />
            {labels.link}
          </Button>
        </div>
      );
    }
    return (
      <div className={cn("max-w-xl", className)}>
        <p className="text-base font-medium text-foreground">{labels.emptyTitle}</p>
        <p className="mt-1 text-base text-muted-foreground">{emptyExplanation}</p>
        {onAdd && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onAdd}>
            {labels.add}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.account}</p>
      {/* Two per line: one IBAN is nowhere near the width of this panel, and a single column left
          the right half of the section empty on every invoice. */}
      <ul className="mt-2 grid gap-x-12 gap-y-3.5 sm:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.id}>
            {/* The marks sit on the IBAN's own line: they qualify that number, and a line of their
                own under the bank name read as though they belonged to the bank instead. */}
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base text-foreground">{account.iban}</span>
              <AccountChips chips={account.chips} infoLabel={labels.info} />
            </p>
            {(account.bankName || account.bic) && (
              <p className="text-base text-muted-foreground">
                {account.bankName}
                {account.bankName && account.bic && " · "}
                {account.bic && <span className="font-mono">{account.bic}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
      {actions && <div className="mt-5">{actions}</div>}
    </div>
  );
}
