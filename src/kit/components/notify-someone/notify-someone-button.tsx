import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { readableErrorMessage } from "../feedback/query-states";
import type { NotifySomeoneLabels } from "./labels";

export interface NotifyRecipient {
  value: string;
  label: string;
}

/**
 * "Notify someone": ask one named colleague to look at the record you are on.
 *
 * Asked for by a client whose bookkeeper chased whoever probably had a missing document, keeping
 * the list by hand. The list is the thing to remove, so this is a message and not an assignment.
 * Nobody holds the record afterwards and there is no second state to clear later.
 *
 * DELIBERATELY RECORD-AGNOSTIC. The kit never learns what an invoice or a transaction is: the host
 * passes `onSend` already bound to whatever the button sits on. That is what lets the same dialog
 * serve an invoice detail, a bank transaction and whatever comes next, in four hubs whose data
 * layers have nothing in common.
 *
 * The caller is responsible for keeping the signed-in user out of `recipients`. Sent to your own
 * account this produces a bell entry from you, to you, about the thing already on your screen.
 */
export function NotifySomeoneButton({
  labels,
  recipients,
  onSend,
  disabled,
  variant = "outline",
  size = "sm",
  className,
}: {
  labels: NotifySomeoneLabels;
  recipients: NotifyRecipient[];
  onSend: (input: { recipientId: string; note: string | null }) => Promise<void>;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="mr-1.5 size-4" />
        {labels.action}
      </Button>
      <NotifySomeoneDialog
        labels={labels}
        recipients={recipients}
        onSend={onSend}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * The dialog on its own, for the callers that already have a trigger.
 *
 * A dropdown item cannot own it: the menu closes on select and takes the dialog down with it, so
 * the open state has to live outside the menu. That is why this is exported separately rather than
 * only bundled with the button above.
 */
export function NotifySomeoneDialog({
  labels,
  recipients,
  onSend,
  open,
  onOpenChange,
}: {
  labels: NotifySomeoneLabels;
  recipients: NotifyRecipient[];
  onSend: (input: { recipientId: string; note: string | null }) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      setRecipientId("");
      setNote("");
    }
  }

  async function run() {
    setBusy(true);
    try {
      await onSend({ recipientId, note: note.trim() || null });
      toast.success(labels.sent);
      onOpenChange(false);
      setRecipientId("");
      setNote("");
    } catch (error) {
      toast.error(labels.failed(readableErrorMessage(error, labels.unknownError)));
    } finally {
      setBusy(false);
    }
  }

  const empty = recipients.length === 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{labels.recipientLabel}</Label>
            {empty ? (
              <p className="text-sm text-muted-foreground">{labels.noRecipients}</p>
            ) : (
              <Combobox
                value={recipientId}
                onValueChange={setRecipientId}
                options={recipients}
                placeholder={labels.recipientPlaceholder}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notify-someone-note">{labels.noteLabel}</Label>
            <Textarea
              id="notify-someone-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.notePlaceholder}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            {labels.cancel}
          </Button>
          <Button onClick={run} disabled={!recipientId || busy || empty}>
            {busy ? labels.sending : labels.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
