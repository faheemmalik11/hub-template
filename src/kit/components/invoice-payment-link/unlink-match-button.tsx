import { useState } from "react";
import { Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { readableErrorMessage } from "../feedback/query-states";

export interface UnlinkMatchLabels {
  /** The button on the confirmed row. */
  action: string;
  title: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  running: string;
  done: string;
  failed: (message: string) => string;
  /** Shown when the error carries no message of its own. */
  unknownError: string;
  /** Marks the reason field as required, for a screen reader and on hover. */
  requiredHint?: string;
}

export const englishUnlinkMatchLabels: UnlinkMatchLabels = {
  action: "Unlink",
  title: "Unlink this bank transaction?",
  description:
    "The transaction goes back to being a suggestion, so it can be linked again. The invoice keeps its history.",
  reasonLabel: "Reason",
  reasonPlaceholder: "Why is the link wrong?",
  cancel: "Cancel",
  confirm: "Unlink",
  running: "Working...",
  done: "Link released",
  failed: (message) => "Nothing was changed. " + message,
  unknownError: "Unknown error.",
  requiredHint: "Required",
};

/**
 * Release a CONFIRMED bank match from the invoice side.
 *
 * The hubs could already unlink from the bank screens, but the invoice detail is where somebody
 * realises the link is wrong -- they are looking at the invoice, not at a bank statement. Saskia
 * confirmed a match in the 09.09.2026 meeting and then asked how to undo it; the answer was that
 * she had to go and find the transaction again.
 *
 * Presentational on purpose: the caller owns the mutation, because each hub reaches its own
 * `invoice_transaction_matches` (incoming) or `outgoing_invoice_transaction_matches` (outgoing)
 * through its own hook. `onUnlink` is handed the reason, which the hubs persist into the invoice
 * history entry.
 */
export function UnlinkMatchButton({
  labels,
  onUnlink,
  disabled,
  withReason = true,
}: {
  labels: UnlinkMatchLabels;
  onUnlink: (reason: string | null) => Promise<void>;
  disabled?: boolean;
  /** Set false where the host has no place to keep the reason. */
  withReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onUnlink(reason.trim() || null);
      toast.success(labels.done);
      setOpen(false);
      setReason("");
    } catch (error) {
      toast.error(labels.failed(readableErrorMessage(error, labels.unknownError)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-sm text-muted-foreground hover:text-destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Unlink className="size-3.5" />
        {labels.action}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>{labels.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {withReason && (
            <div className="space-y-1.5">
              <Label htmlFor="unlink-match-reason">
                {labels.reasonLabel}{" "}
                {/* REQUIRED whenever the field is shown. Unlinking undoes a payment: the invoice
                    goes back through the chain and the transaction reopens, and this text is the
                    only record of why. A host that genuinely wants no reason passes
                    withReason={false} rather than leaving an optional box people skip. */}
                <span className="text-destructive" title={labels.requiredHint}>
                  *
                </span>
              </Label>
              <Textarea
                id="unlink-match-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={labels.reasonPlaceholder}
                rows={3}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{labels.cancel}</AlertDialogCancel>
            <Button onClick={run} disabled={busy || (withReason && reason.trim() === "")}>
              {busy ? labels.running : labels.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
