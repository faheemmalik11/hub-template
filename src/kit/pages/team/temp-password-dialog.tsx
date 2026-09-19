import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import type { TeamPageLabels } from "./labels";

// Shown exactly once after creating or resetting an account; the password is never stored.
export function TempPasswordDialog({
  credentials,
  onClose,
  labels,
  title,
  description,
}: {
  credentials: { email: string; tempPassword: string };
  onClose: () => void;
  labels: TeamPageLabels;
  title?: string;
  description?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title ?? labels.tempPassword.title}</DialogTitle>
          <DialogDescription>
            {description ?? labels.tempPassword.description(credentials.email)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <code className="flex-1 font-mono text-sm break-all text-foreground">
            {credentials.tempPassword}
          </code>
          <Button
            variant="outline"
            size="icon"
            onClick={copyPassword}
            aria-label={labels.tempPassword.copy}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        {copyFailed && <p className="text-xs text-warning">{labels.tempPassword.copyFailed}</p>}
        <DialogFooter>
          <Button onClick={onClose}>{labels.tempPassword.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
