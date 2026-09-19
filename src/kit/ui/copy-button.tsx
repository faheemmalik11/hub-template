import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "../lib/class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface CopyButtonLabels {
  /** What the button does, e.g. "Copy IBAN". Also the accessible name. */
  action: string;
  /** Confirmation after a successful copy. */
  copied: string;
  /** Shown when the clipboard refused. */
  failed: string;
}

export const englishCopyButtonLabels: CopyButtonLabels = {
  action: "Copy",
  copied: "Copied",
  failed: "Could not copy",
};

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied permission or an insecure origin. Fall through to the failure path.
  }
  return false;
}

/**
 * Copies one value to the clipboard and says so.
 *
 * The icon becomes a tick for a moment after a successful copy, because a toast alone leaves the
 * button looking exactly as it did before the click.
 */
export function CopyButton({
  value,
  labels = englishCopyButtonLabels,
  className,
}: {
  value: string;
  labels?: CopyButtonLabels;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const written = await writeClipboard(value);
    if (!written) {
      toast.error(labels.failed);
      return;
    }
    setCopied(true);
    toast.success(labels.copied);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          aria-label={labels.action}
          className={cn(
            "inline-grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{labels.action}</TooltipContent>
    </Tooltip>
  );
}
