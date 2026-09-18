// Closing the remainder of a match that is already made.
//
// The manual-match dialog can close either side at the moment of linking. Any link made another way
// leaves no route back to that decision: an invoice uploaded from a transaction is linked by a
// trigger once extraction reads the amount, and if the two differ the remainder simply sits there.
//
// Deliberately the same shape on both sides, because it is the same judgement: somebody is saying
// this difference will never be settled. The reason is required and recorded, and closing removes
// the record from the open lists, which is the whole point of doing it.
import { useState } from "react";
import { CircleSlash } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fehlerText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export function CloseRemainderButton({
  title,
  description,
  remainderLabel,
  onClose,
  disabledReason,
  actionLabel,
}: {
  title: string;
  description: string;
  /**
   * What the button says. The two sides do different things to the leftover -- a payment is used
   * up, an invoice is written off -- and one generic "Rest abschließen" for both said neither.
   */
  actionLabel?: string;
  /** The amount being written off, already formatted. Shown so nobody closes a figure blind. */
  remainderLabel: string;
  onClose: (reason: string) => Promise<void>;
  /** When set, the button is inert and this says why. */
  disabledReason?: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onClose(reason.trim());
      toast.success(t("bank.detail.restschliessen.erledigt"));
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={Boolean(disabledReason)}
      onClick={() => setOpen(true)}
    >
      <CircleSlash className="size-3.5" />
      {actionLabel ?? t("bank.detail.restschliessen.aktion")}
    </Button>
  );

  return (
    <>
      {disabledReason ? (
        <Tooltip>
          {/* A disabled button swallows pointer events, so the trigger needs its own element. */}
          <TooltipTrigger asChild>
            <span className="inline-flex">{button}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {t("bank.detail.restschliessen.betrag", { betrag: remainderLabel })}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="close-remainder-reason">
              {t("bank.detail.restschliessen.grund")}{" "}
              <span className="text-destructive" title={t("common.form.pflichtfeld")}>
                *
              </span>
            </Label>
            <Textarea
              id="close-remainder-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("bank.detail.restschliessen.grundPlaceholder")}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("bank.detail.restschliessen.abbrechen")}
            </AlertDialogCancel>
            {/* Required, because this is a write-off and the history is the only record of why. */}
            <Button onClick={run} disabled={busy || reason.trim() === ""}>
              {busy
                ? t("bank.detail.restschliessen.laeuft")
                : t("bank.detail.restschliessen.bestaetigen")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
