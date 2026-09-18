/**
 * The outgoing-invoice flag: this document was issued BY one of our own companies, not to us.
 *
 * It still lands in the incoming queue rather than being dropped, so nothing the pipeline read is
 * ever lost, but it is the opposite of what that queue is for: auto-assigning a company here would
 * have the company paying itself. So it has to be visible at a glance, in the list and on the
 * detail screen both, not something a reader discovers by expanding the raw extracted JSON.
 *
 * Portable: this file is meant to be byte-identical across the hub repos. The only thing it needs
 * from the host is the `belege.detail.banner.outgoing*` keys and the shared `Beleg` type.
 */
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { Beleg } from "@/lib/data/types";

import { istAusgangsrechnung } from "./ausgang";

/** The full-width strip on the detail screen: who sent it, and to whom. */
export function AusgangBanner({ beleg, className }: { beleg: Beleg; className?: string }) {
  const { t } = useTranslation();
  if (!istAusgangsrechnung(beleg)) return null;
  return (
    <div
      className={cn(
        "rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Send className="size-4 shrink-0" />
        {t("belege.detail.banner.outgoing", {
          issuer: beleg.issuer ?? t("belege.detail.unknownSteller"),
          recipient: beleg.recipient_name ?? t("belege.detail.banner.outgoingUnknownRecipient"),
        })}
      </div>
    </div>
  );
}

/**
 * The list-row version: one short chip, because a table row has no space for the sentence.
 *
 * Same colour as the strip on purpose. A reader who has seen one recognises the other, and the
 * chip's tooltip carries the full sentence for the case where the row alone is not enough.
 */
export function AusgangBadge({
  beleg,
  className,
}: {
  beleg: Pick<Beleg, "extracted" | "issuer" | "recipient_name">;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!istAusgangsrechnung(beleg)) return null;
  // No icon on the chip, unlike the banner. In a table row the word is the whole message and the
  // paper-plane beside it only competed with the supplier name it sits next to.
  return (
    <span
      title={t("belege.detail.banner.outgoing", {
        issuer: beleg.issuer ?? t("belege.detail.unknownSteller"),
        recipient: beleg.recipient_name ?? t("belege.detail.banner.outgoingUnknownRecipient"),
      })}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-900",
        className,
      )}
    >
      {t("belege.detail.banner.outgoingKurz")}
    </span>
  );
}
