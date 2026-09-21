/**
 * The review chip, shared by the invoice list and the detail header.
 *
 * Portable: byte-identical across the hub repos. It used to live in each repo's own
 * `components/belege/badges`, where the versions had already drifted apart.
 *
 * Two axes, and the order between them is the whole design:
 *
 * 1. Is there anything to review? Green with no failed checks, red with them. Read off
 *    `reasonCount` and nothing else. It used to carry a third, amber "Bestätigen" tier and take
 *    its label from `status`, which stays `zu_pruefen` until a person signs the receipt off and
 *    says nothing about whether a check failed -- so a clean receipt wore a green chip reading
 *    "Zu prüfen" that opened an empty panel. And amber answered the same question as green in
 *    different words, so the chip had two ways of saying yes.
 *
 * 2. Things that OUTRANK that question, because nobody is being asked for a review decision at
 *    all: the document is a duplicate, it was excluded, or it was settled privately. A repo that
 *    tracks these passes `status` and `alreadyPaid`; one that does not passes neither and gets
 *    the two states above.
 *
 * `ungeprueft` is the third case, and it is the difference between "we checked and found nothing"
 * and "we never checked". A receipt the pipeline reported NO checks for has a failed-check count
 * of zero for the same reason an unopened envelope has no complaints in it. Reading that as green
 * put "Keine Prüfung nötig" on documents sitting at `zu_pruefen` with every field empty. So when
 * nothing was reported and the status still says a person has to look, the chip says so.
 *
 * `duplikat` and `ausgeschlossen` come first, ahead of `alreadyPaid`, deliberately. Both say "do
 * not book this at all", which survives the money having been settled: a duplicate paid out of
 * somebody's own pocket is still a duplicate and still must not reach the tax advisor twice.
 */
import { Check, Copy, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function ReviewBadge({
  reasonCount = 0,
  status,
  alreadyPaid = false,
  unchecked = false,
  className,
}: {
  /** How many checks failed. See pruefGruende()/pruefKarte() in ./pruefung. */
  reasonCount?: number;
  /**
   * The pipeline reported no checks at all for this receipt, passed or failed. Compute it as
   * `karte.gruende.length === 0 && karte.bestanden.length === 0` from pruefKarte().
   */
  unchecked?: boolean;
  /** `invoices.status`, only for the two values that outrank the review question. Optional. */
  status?: string | null;
  /** Settled privately, so there is nothing to review, approve or pay. Optional. */
  alreadyPaid?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const state =
    status === "duplikat"
      ? "duplikat"
      : status === "ausgeschlossen"
        ? "ausgeschlossen"
        : alreadyPaid
          ? "bereitsBezahlt"
          : reasonCount > 0 || (unchecked && status === "needs_review")
            ? "needed"
            : "none";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        state === "needed"
          ? "bg-red-100 text-red-800"
          : state === "duplikat"
            ? // Orange, neither the red of "needs review" nor the green of "nothing to do": a
              // duplicate is not a data error, it is a keep-or-discard decision of its own kind.
              "bg-orange-100 text-orange-800"
            : state === "ausgeschlossen"
              ? "bg-muted text-muted-foreground"
              : state === "bereitsBezahlt"
                ? // Slate, not green: green means "nothing needs doing", and this document may
                  // still be unread. It is settled, which is a different kind of calm.
                  "bg-slate-100 text-slate-700"
                : "bg-emerald-100 text-emerald-800",
        className,
      )}
    >
      {state === "none" ? (
        <Check className="size-3.5 shrink-0" />
      ) : state === "duplikat" ? (
        <Copy className="size-3.5 shrink-0" />
      ) : state === "ausgeschlossen" ? (
        <X className="size-3.5 shrink-0" />
      ) : state === "bereitsBezahlt" ? (
        // Info, not the warning triangle. "Bereits bezahlt" is a settled document, and the
        // triangle put it next to the amber "Braucht deine Eingabe" card wearing the same icon,
        // so a finished receipt read as one somebody had abandoned half way (Saskia, 09.09.2026:
        // "this document looks as though I haven't finished processing it").
        <Info className="size-3.5 shrink-0" />
      ) : (
        // Only 'needed' keeps it, which is the one state that does ask for something.
        <TriangleAlert className="size-3.5 shrink-0" />
      )}
      {t(`documents.detail.review.${state}`)}
      {/* Only when there IS a count. A receipt the pipeline never checked reaches "needed" through
          `ungeprueft`, where the failed-check count is zero, and printing it read as "Zu prüfen · 0"
          -- a tally of nothing, which looks like a bug rather than a state. */}
      {state === "needed" && reasonCount > 0 && (
        <span className="tabular-nums opacity-70">· {reasonCount}</span>
      )}
    </span>
  );
}
