import { useState } from "react";
import type { LucideIcon } from "lucide-react";

import { EntriesTable, type CategoryPath } from "./breakdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  formatEUR,
  useTranslation,
} from "../adapter";
import type { CostAnalysisScopeItem } from "../adapter";
import { cn } from "../adapter";

/**
 * A receipt problem, stated as an amber card that opens the receipts behind it.
 *
 * Both of this screen's disclosures are the same shape: real money is sitting outside the figures
 * for a reason somebody has to resolve, and the resolution happens on the receipt itself. They used
 * to be a grey footnote sentence and a bordered section at the bottom of the page, which read as
 * trivia and as a table nobody asked for. One component so they cannot drift into looking like two
 * different kinds of problem.
 *
 * Amber, not red: no figure is wrong and nothing is broken. Something is unanswered.
 */
export function HintCard({
  icon: Icon,
  cardText,
  title,
  hint,
  amount,
  items,
  categoryFor,
  onOpenDocument,
  onOpenManualBooking,
}: {
  icon: LucideIcon;
  /** The one line on the card itself. */
  cardText: string;
  /** Dialog heading. */
  title: string;
  /** What to do about it, above the list. */
  hint: string;
  amount: number;
  items: CostAnalysisScopeItem[];
  /**
   * Omit where the receipts have no category to show. The column then does not render at all,
   * rather than printing a dash on every row for a fact the card's own text already gave.
   */
  categoryFor?: (item: CostAnalysisScopeItem) => CategoryPath | null;
  onOpenDocument: (id: string) => void;
  onOpenManualBooking: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (items.length === 0 && amount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center gap-2.5 rounded-lg",
          "border border-amber-300 bg-amber-50 px-4 py-2.5 text-left transition-colors",
          "hover:bg-amber-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon className="size-4 shrink-0 text-amber-600" />
        <span className="text-sm text-amber-900">{cardText}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl gap-0 p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-8 text-left">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100">
                <Icon className="size-4 text-amber-700" />
              </span>
              <span className="text-base font-semibold text-foreground">{title}</span>
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {formatEUR(amount)}
              </span>
            </DialogTitle>
          </DialogHeader>

          <p className="pb-3 text-sm text-muted-foreground">{hint}</p>

          {items.length > 0 ? (
            <EntriesTable
              items={items}
              categoryFor={categoryFor}
              onOpenDocument={onOpenDocument}
              onOpenManualBooking={onOpenManualBooking}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("reports.aufschluesselung.keineEintraege")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
