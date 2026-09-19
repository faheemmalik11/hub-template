import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { readableErrorMessage } from "../feedback/query-states";
import type { ReminderRecipient } from "../../adapters/notifications";

export interface ReminderDialogLabels {
  title: string;
  description: string;
  recipient: string;
  recipientPlaceholder: string;
  note: string;
  notePlaceholder: string;
  send: string;
  sending: string;
  sent: (recipientName: string) => string;
  failed: string;
}

export const englishReminderDialogLabels: ReminderDialogLabels = {
  title: "Remind a person",
  description: "Sends the person a direct reminder into their notifications.",
  recipient: "Recipient",
  recipientPlaceholder: "Choose a person",
  note: "Note (optional)",
  notePlaceholder: "e.g. Please approve today.",
  send: "Send reminder",
  sending: "Sending …",
  sent: (recipientName) => `Reminder sent to ${recipientName}.`,
  failed: "The reminder could not be sent.",
};

export function ReminderDialog({
  recipients,
  sendReminder,
  open,
  onOpenChange,
  labels = englishReminderDialogLabels,
}: {
  recipients: ReminderRecipient[];
  sendReminder: (input: { recipientUserId: string; note?: string }) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels?: ReminderDialogLabels;
}) {
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const recipientName = recipients.find((r) => r.value === recipientId)?.label ?? "";

  function reset() {
    setRecipientId("");
    setNote("");
  }

  async function send() {
    setIsSending(true);
    try {
      await sendReminder({ recipientUserId: recipientId, note: note.trim() || undefined });
      toast.success(labels.sent(recipientName));
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(labels.failed, { description: readableErrorMessage(error, "") });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSending) return;
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{labels.recipient}</Label>
            <Combobox
              value={recipientId}
              onValueChange={setRecipientId}
              options={recipients}
              placeholder={labels.recipientPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reminder-note">{labels.note}</Label>
            <Textarea
              id="reminder-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.notePlaceholder}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!recipientId || isSending} onClick={send}>
            {isSending && <Loader2 className="size-4 animate-spin" />}
            {isSending ? labels.sending : labels.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
