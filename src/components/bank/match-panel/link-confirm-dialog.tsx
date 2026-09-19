import { useEffect, useState, type ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";

import { HintTooltip } from "@/kit/components/data-table";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  useMatchAllocation,
  useMatchingSettings,
  useOutgoingMatchAllocation,
} from "@/lib/data/queries";
import {
  formatDate,
  formatEUR,
  formatSignedEUR,
  isFullyCovered,
  paymentTolerance,
} from "@/lib/data/format";

export type LinkConfirmPair = {
  side: "incoming" | "outgoing";
  invoiceId: string;
  invoiceLabel: string;
  invoiceNr: string | null;
  invoiceGross: number | null;
  transactionId: string;
  transactionLabel: string;
  transactionAmount: number | null;
  transactionDate: string | null;
  /** Set on the stored-candidate path, where the amount is already fixed on the match row. */
  fixedAmount?: number | null;
};

export function LinkConfirmDialog({
  pair,
  pending,
  onCancel,
  onConfirm,
}: {
  pair: LinkConfirmPair | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (
    pair: LinkConfirmPair,
    options?: {
      differenceReason?: string;
      /** Close the invoice even though `rechnungRest` stays unallocated. */
      closeInvoice?: boolean;
      /** Close the transaction even though `transaktionRest` stays unallocated. */
      closeTransaction?: boolean;
    },
  ) => void;
}) {
  const { t } = useTranslation();
  const isOutgoing = pair?.side === "outgoing";
  const incomingAllocationQ = useMatchAllocation(
    pair && !isOutgoing ? pair.invoiceId : null,
    pair && !isOutgoing ? pair.transactionId : null,
  );
  const outgoingAllocationQ = useOutgoingMatchAllocation(
    pair && isOutgoing ? pair.invoiceId : null,
    pair && isOutgoing ? pair.transactionId : null,
  );
  const allocationQ = isOutgoing ? outgoingAllocationQ : incomingAllocationQ;

  // The same allowance the matcher scores with, so this dialog and the suggestion that led here
  // cannot disagree about whether a difference is worth mentioning.
  const matchingSettingsQ = useMatchingSettings();

  const gross = Math.abs(pair?.invoiceGross ?? 0);
  const txnTotal = Math.abs(pair?.transactionAmount ?? 0);
  const invoiceMatched = allocationQ.data?.invoiceMatched ?? 0;
  const transactionAllocated = allocationQ.data?.transactionAllocated ?? 0;
  const invoiceOpen = Math.max(gross - invoiceMatched, 0);
  const transactionFree = Math.max(txnTotal - transactionAllocated, 0);
  const derived = Math.min(invoiceOpen, transactionFree);
  const betrag = pair?.fixedAmount != null ? Math.abs(pair.fixedAmount) : derived;

  const laedt = allocationQ.isLoading;
  const ungueltig = !laedt && betrag <= 0;
  const istSkonto =
    !ungueltig &&
    betrag < invoiceOpen - 0.01 &&
    betrag >= invoiceOpen - paymentTolerance(pair?.invoiceGross ?? null);
  const wirdVollBezahlt = isFullyCovered(pair?.invoiceGross ?? null, invoiceMatched + betrag);
  const rechnungRest = Math.max(invoiceOpen - betrag, 0);
  const transaktionRest = Math.max(transactionFree - betrag, 0);

  // ONE CHECKBOX PER SIDE, each offered only when THAT side has something left over. There was a
  // single "mark invoice as fully paid", shown whenever either side had a remainder -- so linking a
  // 14 € invoice to an 85 € payment offered to close the invoice, which was already paid in full,
  // and said nothing about the 71,64 € still sitting on the transaction. The two ends of a match
  // are separate questions and only the reader knows which one they are finishing.
  const [closeInvoice, setCloseInvoice] = useState(false);
  const [closeTransaction, setCloseTransaction] = useState(false);
  const [differenceReason, setDifferenceReason] = useState("");

  // A REMAINDER INSIDE THE ALLOWED DIFFERENCE IS NOT A QUESTION. The admin already answered it by
  // setting the tolerance: a payment within it counts as this invoice, so the invoice is settled
  // and asking "shall I close it?" over two cents is a click with only one sensible answer.
  //
  // The checkbox appears once the leftover is BIGGER than the allowance -- a real partial payment,
  // where writing off the rest is a decision somebody has to take on purpose, and where a
  // pre-ticked box would let 71,64 € disappear on one careless confirm.
  const toleranz = Math.max(matchingSettingsQ.data?.amount_tolerance ?? 0.01, 0.01);
  const rechnungFrageOffen = rechnungRest > toleranz + 1e-9;
  const transaktionFrageOffen = transaktionRest > toleranz + 1e-9;
  /** Inside the allowance the invoice counts as paid whether or not anybody ticks anything. */
  const rechnungGilt = rechnungRest > 0.01 && !rechnungFrageOffen;

  useEffect(() => {
    setCloseInvoice(false);
    setCloseTransaction(false);
    setDifferenceReason("");
  }, [pair?.invoiceId, pair?.transactionId]);

  // WRITING MONEY OFF HAS TO SAY WHY. Both boxes close a side while money is still open on it, and
  // this sentence is the only record of that decision -- read months later by whoever is asked
  // where the missing 71,64 € went. So the button waits for it rather than accepting a blank.
  const grundFehlt = (closeInvoice || closeTransaction) && differenceReason.trim() === "";

  return (
    <AlertDialog open={pair != null} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            {t("manualLink.confirm.title")}
            <HintTooltip onlyWhenClipped={false} label={t("manualLink.confirm.info")}>
              <Info className="size-4 shrink-0 cursor-help text-muted-foreground" />
            </HintTooltip>
          </AlertDialogTitle>
          <AlertDialogDescription>{t("manualLink.confirm.intro")}</AlertDialogDescription>
        </AlertDialogHeader>

        {pair && (
          <div className="space-y-3 text-sm">
            <dl className="rounded-lg border border-border bg-muted/30 p-3">
              <Zeile
                label={t(
                  isOutgoing
                    ? "manualLink.confirm.ausgangsrechnung"
                    : "manualLink.confirm.rechnung",
                )}
                value={`${pair.invoiceLabel} · ${pair.invoiceNr ?? t("manualLink.confirm.ohneNr")} · ${formatEUR(pair.invoiceGross)}`}
              />
              <Zeile
                label={t("manualLink.confirm.transaktion")}
                value={`${pair.transactionLabel} · ${formatSignedEUR(pair.transactionAmount)}${
                  pair.transactionDate ? ` · ${formatDate(pair.transactionDate)}` : ""
                }`}
              />
              <Zeile
                label={t("manualLink.confirm.betrag")}
                value={laedt ? "…" : formatEUR(betrag)}
                stark
              />
              {!laedt && (rechnungRest > 0.01 || transaktionRest > 0.01) && (
                <div className="mt-1 border-t border-border/60 pt-1">
                  {rechnungRest > 0.01 && (
                    <Zeile
                      label={t("manualLink.confirm.restRechnung")}
                      value={formatEUR(rechnungRest)}
                    />
                  )}
                  {transaktionRest > 0.01 && (
                    <Zeile
                      label={t("manualLink.confirm.restZahlung")}
                      value={formatEUR(transaktionRest)}
                    />
                  )}
                </div>
              )}
            </dl>

            {!laedt && (rechnungFrageOffen || transaktionFrageOffen) && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                {rechnungFrageOffen && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={closeInvoice}
                      onChange={(e) => setCloseInvoice(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="font-medium">{t("manualLink.confirm.close.rechnung")}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("manualLink.confirm.close.rechnungHint", {
                          rest: formatEUR(rechnungRest),
                        })}
                      </span>
                    </span>
                  </label>
                )}
                {transaktionFrageOffen && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={closeTransaction}
                      onChange={(e) => setCloseTransaction(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="font-medium">
                        {t("manualLink.confirm.close.transaktion")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t("manualLink.confirm.close.transaktionHint", {
                          rest: formatEUR(transaktionRest),
                        })}
                      </span>
                    </span>
                  </label>
                )}
                {/* Free text, not a fixed list: the reason is read by a tax adviser months later,
                    and "Skonto" covers a fraction of what actually happens to a few cents. */}
                {(closeInvoice || closeTransaction) && (
                  <div className="space-y-1 pt-1">
                    <label htmlFor="difference-reason" className="text-xs text-muted-foreground">
                      {t("manualLink.confirm.close.grund")}{" "}
                      <span className="text-destructive" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <Input
                      id="difference-reason"
                      required
                      aria-required="true"
                      value={differenceReason}
                      onChange={(e) => setDifferenceReason(e.target.value)}
                      placeholder={t("manualLink.confirm.close.grundPlatzhalter")}
                    />
                  </div>
                )}
              </div>
            )}

            {laedt ? (
              <Skeleton className="h-20 w-full" />
            ) : ungueltig ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {t("manualLink.betrag.ungueltig")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                <Folge
                  text={
                    wirdVollBezahlt || rechnungGilt || closeInvoice
                      ? isOutgoing
                        ? t("manualLink.confirm.folge.bezahltOutgoing")
                        : istSkonto || rechnungGilt || closeInvoice
                          ? t("manualLink.confirm.folge.bezahltSkonto", {
                              differenz: formatEUR(invoiceOpen - betrag),
                            })
                          : t("manualLink.confirm.folge.bezahlt")
                      : isOutgoing
                        ? t("manualLink.confirm.folge.teilweiseOutgoing", {
                            rest: formatEUR(rechnungRest),
                          })
                        : t("manualLink.confirm.folge.teilweise", {
                            rest: formatEUR(rechnungRest),
                          })
                  }
                  ton={wirdVollBezahlt || rechnungGilt || closeInvoice ? "gut" : "warn"}
                />
                <Folge
                  text={
                    transaktionRest <= 0.01
                      ? t("manualLink.confirm.folge.transaktionVoll")
                      : closeTransaction
                        ? // The box is ticked: the remainder is being written off, so saying it
                          // "stays free for another invoice" would describe the opposite of what
                          // the Reconcile button is about to do.
                          t("manualLink.confirm.folge.transaktionAbgeschlossen", {
                            rest: formatEUR(transaktionRest),
                          })
                        : t("manualLink.confirm.folge.transaktionRest", {
                            rest: formatEUR(transaktionRest),
                          })
                  }
                  ton={transaktionRest <= 0.01 || closeTransaction ? "gut" : "warn"}
                />
              </ul>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("manualLink.confirm.abbrechen")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="gap-2"
            disabled={pending || laedt || ungueltig || grundFehlt}
            onClick={(e) => {
              e.preventDefault();
              if (pair) {
                const schliesst = closeInvoice || closeTransaction;
                onConfirm(pair, {
                  closeInvoice: rechnungFrageOffen && closeInvoice,
                  closeTransaction: transaktionFrageOffen && closeTransaction,
                  // Only carried when something is actually being written off. A reason on a
                  // clean full-for-full match would be a note about nothing.
                  differenceReason:
                    schliesst && differenceReason.trim() ? differenceReason.trim() : undefined,
                });
              }
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("manualLink.confirm.bestaetigen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Zeile({ label, value, stark }: { label: string; value: ReactNode; stark?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm",
          stark ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Folge({ text, ton }: { text: string; ton: "gut" | "warn" | "neutral" }) {
  const dot =
    ton === "gut" ? "bg-emerald-500" : ton === "warn" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <li className="flex items-start gap-2">
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot)} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </li>
  );
}
