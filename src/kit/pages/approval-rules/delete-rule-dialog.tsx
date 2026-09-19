import { useState } from "react";

import type { ApprovalRulesLabels } from "./labels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

export function DeleteRuleDialog({
  open,
  onOpenChange,
  labels,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ApprovalRulesLabels;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.remove.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.remove.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="approval-delete-reason">{labels.remove.reason}</Label>
          <Input
            id="approval-delete-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.remove.reasonPlaceholder}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.remove.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(reason.trim())}
          >
            {labels.remove.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
