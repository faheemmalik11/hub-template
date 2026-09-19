import { Send } from "lucide-react";

import { cn } from "../../lib/class-names";
import { Extracted } from "./pipeline-types";

export function isOutgoingInvoice(invoice: { extracted: Extracted | null }): boolean {
  return (invoice.extracted?.richtung as string | undefined)?.trim().toLowerCase() === "ausgang";
}

export interface OutgoingInvoiceLabels {
  banner: (issuer: string, recipient: string) => string;
  bannerShort: string;
  unknownIssuer: string;
  unknownRecipient: string;
}

interface OutgoingInvoiceFields {
  extracted: Extracted | null;
  issuer: string | null;
  recipient_name: string | null;
}

export function OutgoingInvoiceBanner({
  invoice,
  labels,
  className,
}: {
  invoice: OutgoingInvoiceFields;
  labels: OutgoingInvoiceLabels;
  className?: string;
}) {
  if (!isOutgoingInvoice(invoice)) return null;
  return (
    <div
      className={cn(
        "rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Send className="size-4 shrink-0" />
        {labels.banner(
          invoice.issuer ?? labels.unknownIssuer,
          invoice.recipient_name ?? labels.unknownRecipient,
        )}
      </div>
    </div>
  );
}

export function OutgoingInvoiceBadge({
  invoice,
  labels,
  className,
}: {
  invoice: OutgoingInvoiceFields;
  labels: OutgoingInvoiceLabels;
  className?: string;
}) {
  if (!isOutgoingInvoice(invoice)) return null;
  return (
    <span
      title={labels.banner(
        invoice.issuer ?? labels.unknownIssuer,
        invoice.recipient_name ?? labels.unknownRecipient,
      )}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-900",
        className,
      )}
    >
      {labels.bannerShort}
    </span>
  );
}
