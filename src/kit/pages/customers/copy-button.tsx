import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { IconAction } from "../../ui/icon-action";
import type { CustomersLabels } from "./labels";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function CopyButton({
  value,
  fieldLabel,
  labels,
}: {
  value: string;
  fieldLabel: string;
  labels: CustomersLabels["copy"];
}) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    if (await writeClipboard(value)) {
      setCopied(true);
      toast.success(labels.copied(fieldLabel));
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(labels.failed);
    }
  }

  return (
    <IconAction label={labels.action(fieldLabel)} className="size-7 shrink-0" onClick={copyValue}>
      {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
    </IconAction>
  );
}
