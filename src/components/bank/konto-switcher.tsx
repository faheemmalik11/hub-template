// Switch the transactions screen to one bank account.
//
// Saskia asked for this at the 09.09.2026 meeting (09:28), naming sevDesk's switcher: "normally
// you sit down and work through one bank account at a time", and she splits the accounts between
// employees -- one person on Pleo, another on a different account. The account was already a
// filter, but sitting inside the filter popover among six others it read as a way to narrow a
// list rather than the thing you choose before you start.
//
// So it is a row of tabs, not a select: every account is visible without opening anything, which
// is the whole point of the sevDesk control she pointed at.
import { Landmark } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BankAccount } from "@/lib/data/types";

export function AccountSwitcher({
  accounts,
  value,
  onChange,
  allValue,
  allLabel,
  labelFor,
  titleFor,
  className,
}: {
  accounts: BankAccount[];
  value: string;
  onChange: (next: string) => void;
  allValue: string;
  allLabel: string;
  /** The disambiguated account name; BANKSapi names most of them "Sichteinlagen". */
  labelFor: (id: string) => string;
  titleFor: (id: string) => string;
  className?: string;
}) {
  // One account is not a choice, and a single tab next to "Alle Konten" is just noise.
  if (accounts.length < 2) return null;

  const tab = (key: string, label: string, title: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      title={title}
      aria-current={value === key ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center rounded-lg border px-3 py-2 text-left transition-colors",
        value === key
          ? "border-brand bg-brand-wash text-brand-dark"
          : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground",
      )}
    >
      {/* labelFor is eindeutigeKontoLabels(), which already appends the company and the last four
          digits wherever the bare product name would be ambiguous. Repeating the tail underneath
          printed it twice, and on the Pleo card, whose "IBAN" is the word Pleo, it read "…Pleo". */}
      <span className="max-w-[16rem] truncate text-sm font-medium">{label}</span>
    </button>
  );

  return (
    // Horizontal scroll rather than wrap: the row stays one line, so the eye reads it as a set of
    // tabs at any width instead of a block of buttons that reflows as accounts are added.
    <div
      className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)}
      role="group"
      aria-label={allLabel}
    >
      <button
        type="button"
        onClick={() => onChange(allValue)}
        aria-current={value === allValue ? "true" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
          value === allValue
            ? "border-brand bg-brand-wash text-brand-dark"
            : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground",
        )}
      >
        <Landmark className="size-4 shrink-0" />
        {allLabel}
      </button>
      {accounts.map((a) => tab(a.id, labelFor(a.id), titleFor(a.id)))}
    </div>
  );
}
