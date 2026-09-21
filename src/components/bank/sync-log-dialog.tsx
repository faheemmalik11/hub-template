import { ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SyncLogPanel } from "@/components/bank/sync-log-panel";
import { SyncStatus } from "@/components/bank/sync-status";
import { useTranslation } from "@/lib/i18n";

/**
 * The sync log behind a button rather than sat on the page.
 *
 * It is a history you consult when something looks wrong ("did the 20:00 run import anything?"),
 * not a thing to scroll past on every visit. At twenty-five rows with its own filters, date range
 * and paging it dominated the page it used to live on, whose subject is the accounts. Kept
 * reachable in one press, in a dialog wide enough that the Details column is still readable, which
 * is the column you came for.
 */
export function SyncLogDialog() {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Named, and the same shape as the controls beside it in the toolbar. An icon on its own
            was one guess too many for a button that is not a common action. */}
        <Button variant="outline" className="gap-2">
          <ScrollText className="size-4" />
          {t("bankAccounts.syncLog.button")}
        </Button>
      </DialogTrigger>
      {/* A column with a bounded height, not a scrolling block. The title, the last-run line
          and the controls stay put, the paging stays at the foot, and only the table between
          them moves. */}
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("bankAccounts.syncLog.titel")}</DialogTitle>
          {/* The last run, where the page used to state it. Taking it off the accounts screen was
              the point, but deleting it would have thrown away the one line that answers "is the
              feed alive" -- so it moved to the top of the history it summarises. DialogDescription
              rather than a loose element: Radix wires it to aria-describedby. */}
          <DialogDescription asChild>
            {/* Wrapped in a real element rather than passed straight to `asChild`: SyncStatus
                renders null while its first read is in flight, and Radix needs a description
                element to point aria-describedby at. */}
            <div>
              <SyncStatus />
            </div>
          </DialogDescription>
        </DialogHeader>
        <SyncLogPanel />
      </DialogContent>
    </Dialog>
  );
}
