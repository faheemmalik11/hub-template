import { useEffect, useState } from "react";
import { ChevronLeft, Info, Search } from "lucide-react";

import { HintTooltip } from "@/kit/components/data-table";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { PaymentRightNotice } from "@/components/bank/payment-right-notice";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { formatDate, formatEUR, formatSignedEUR, heuteLokal } from "@/lib/data/format";
import { TransactionMatches } from "@/components/bank/match-candidates";
import { NoReceiptAction } from "@/components/bank/no-receipt-action";
import { InvoiceMatches } from "@/components/bank/match-panel/invoice-matches";
import { PossibleMatches } from "@/components/bank/match-panel/possible-matches";
import { usePossibleMatches } from "@/components/bank/match-panel/use-possible-matches";
import { PossibleInvoiceMatches } from "@/components/bank/match-panel/possible-invoice-matches";
import { usePossibleInvoiceMatches } from "@/components/bank/match-panel/use-possible-invoice-matches";
import { ManualSearch } from "@/components/bank/match-panel/manual-search";
import { SEARCH_DEBOUNCE_MS } from "@/components/bank/match-panel/constants";
import {
  useBelegMatches,
  useOutgoingInvoiceMatches,
  useOutgoingTransactionMatches,
  useTransactionMatches,
} from "@/lib/data/queries";
import type { BankTransaction } from "@/lib/data/types";

/**
 * What the panel is open for: either an open invoice (looking for its bank payment) or an open
 * bank transaction (looking for its invoice). The transaction case carries the full row, not just
 * a few fields, because NoReceiptAction needs the whole thing.
 */
export type MatchPanelTarget =
  | {
      kind: "invoice";
      id: string;
      type: "incoming" | "outgoing";
      label: string;
      nr: string | null;
      amount: number | null;
      documentDate: string | null;
      dueDate: string | null;
    }
  | { kind: "transaction"; txn: BankTransaction };

/**
 * Per-row slide-over that replaces the old "Manuell verknüpfen" tab: opened from a single table
 * row, it shows that row's precomputed candidate matches (InvoiceMatches / TransactionMatches,
 * already scored by the bank-sync matcher) plus a manual search fallback for the near-miss cases
 * the matcher's exact-amount requirement misses (see the retired ManualLinkTab's own header
 * comment on why that fallback has to exist at all).
 */
export function MatchPanel({
  target,
  onClose,
}: {
  target: MatchPanelTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  // Keeps rendering the previous target's content while the sheet slides shut, instead of
  // flashing empty the instant `target` is nulled out to close it.
  const [lastTarget, setLastTarget] = useState<MatchPanelTarget | null>(null);

  useEffect(() => {
    if (target) setLastTarget(target);
  }, [target]);

  const targetKey = target
    ? target.kind === "invoice"
      ? `${target.type}:${target.id}`
      : `txn:${target.txn.id}`
    : null;
  useEffect(() => {
    if (!targetKey) return;
    setShowSearch(false);
    setSearch("");
  }, [targetKey]);

  const display = target ?? lastTarget;
  const open = target != null;

  // Same four hooks InvoiceMatches/TransactionMatches already call for this id -- react-query
  // dedupes by query key, so this costs no extra request, just lets the panel know the candidate
  // COUNT (those two components only render the list, they don't report a count upward).
  const invoiceId = display?.kind === "invoice" ? display.id : "";
  const isOutgoingInvoice = display?.kind === "invoice" && display.type === "outgoing";
  const incomingInvoiceMatchesQ = useBelegMatches(!isOutgoingInvoice ? invoiceId : "");
  const outgoingInvoiceMatchesQ = useOutgoingInvoiceMatches(isOutgoingInvoice ? invoiceId : "");
  const transactionId = display?.kind === "transaction" ? display.txn.id : "";
  const isCreditTxn = display?.kind === "transaction" && display.txn.amount >= 0;
  const incomingTxnMatchesQ = useTransactionMatches(!isCreditTxn ? transactionId : "");
  const outgoingTxnMatchesQ = useOutgoingTransactionMatches(isCreditTxn ? transactionId : "");
  const candidateCount =
    display?.kind === "invoice"
      ? (isOutgoingInvoice ? outgoingInvoiceMatchesQ.data : incomingInvoiceMatchesQ.data)?.length
      : display?.kind === "transaction"
        ? (isCreditTxn ? outgoingTxnMatchesQ.data : incomingTxnMatchesQ.data)?.length
        : undefined;

  // Fallback shortlist for whichever side is missing a real precomputed candidate (see
  // usePossibleMatches' own comment for why the DB's own suggestions structurally miss this case):
  // only actually runs once the real candidate count is known to be zero, via `enabled` inside
  // each hook -- an empty id means it's a no-op query.
  const possible = usePossibleMatches({
    id: display?.kind === "invoice" && candidateCount === 0 ? display.id : "",
    amount: display?.kind === "invoice" ? display.amount : null,
    documentDate: display?.kind === "invoice" ? display.documentDate : null,
    dueDate: display?.kind === "invoice" ? display.dueDate : null,
    nr: display?.kind === "invoice" ? display.nr : null,
    label: display?.kind === "invoice" ? display.label : "",
    invoiceType: display?.kind === "invoice" ? display.type : "incoming",
  });
  const possibleInvoices = usePossibleInvoiceMatches({
    id: display?.kind === "transaction" && candidateCount === 0 ? display.txn.id : "",
    amount: display?.kind === "transaction" ? display.txn.amount : 0,
    bookingDate: display?.kind === "transaction" ? display.txn.booking_date : null,
    paymentReference: display?.kind === "transaction" ? display.txn.payment_reference : null,
    counterpartyIban: display?.kind === "transaction" ? display.txn.counterparty_iban : null,
    counterpartyHolder: display?.kind === "transaction" ? display.txn.counterparty_holder : null,
  });

  // Whether the "Suggested matches" section has anything worth a heading at all: real precomputed
  // candidates, still loading, or a possible-match shortlist for whichever side applies. Otherwise
  // the section disappears entirely rather than showing an empty "no likely payment found" -- the
  // "Find payment/invoice" section right below already covers that ground.
  const showSuggestedSection =
    candidateCount === undefined ||
    candidateCount > 0 ||
    (display?.kind === "invoice" && (possible.isLoading || possible.matches.length > 0)) ||
    (display?.kind === "transaction" &&
      (possibleInvoices.isLoading || possibleInvoices.matches.length > 0));

  const searchOffen = showSearch || !showSuggestedSection;

  // Partial payment, mirrored from the list row: the sum of CONFIRMED links against this
  // invoice. Without it the panel showed the full gross next to an "already reconciled" payment
  // and left the reader to work out that the invoice is only partly settled and how much is
  // still missing.
  const invoiceMatchRows =
    display?.kind === "invoice"
      ? ((isOutgoingInvoice ? outgoingInvoiceMatchesQ.data : incomingInvoiceMatchesQ.data) ?? [])
      : [];
  const bezahltSumme = invoiceMatchRows
    .filter((m) => m.status === "confirmed")
    .reduce((sum, m) => sum + Math.abs(m.amount_matched ?? 0), 0);
  const teilzahlung =
    display?.kind === "invoice" &&
    display.amount != null &&
    bezahltSumme > 0.005 &&
    bezahltSumme < Math.abs(display.amount) - 0.005;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {display && (
          <>
            {/* Header + identity card are fixed; only the sections below scroll. Without a
                bounded, independently-scrolling body, long candidate/search lists pushed the
                whole panel taller than the viewport instead of scrolling inside it, so its
                background stopped short of the bottom edge instead of reaching it. */}
            <div className="shrink-0 border-b border-border px-4 pb-4 pt-6">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-1.5">
                  {display.kind === "invoice"
                    ? t("matchPanel.invoiceTitle")
                    : t("matchPanel.transactionTitle")}
                  <HintTooltip
                    onlyWhenClipped={false}
                    label={
                      display.kind === "invoice"
                        ? t("matchPanel.infoInvoice")
                        : t("matchPanel.infoTransaction")
                    }
                  >
                    <Info className="size-4 shrink-0 cursor-help text-muted-foreground" />
                  </HintTooltip>
                </SheetTitle>
              </SheetHeader>

              {/* Identity card: what this panel is trying to settle, pulled out of the plain
                  header text into its own surface so it reads as the fixed "subject" the rest of
                  the panel is about, not just another line of description copy. Invoice/due dates
                  help verify a candidate at a glance without opening the invoice itself. */}
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-sm font-semibold text-foreground">
                  {display.kind === "invoice"
                    ? display.label
                    : (display.txn.counterparty_holder ?? "—")}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {display.kind === "invoice" && display.nr && (
                    <span>{t("matchPanel.nr", { nr: display.nr })}</span>
                  )}
                  <span className="font-medium tabular-nums text-foreground">
                    {display.kind === "invoice"
                      ? formatEUR(display.amount)
                      : formatSignedEUR(display.txn.amount)}
                  </span>
                </div>
                {teilzahlung && display.kind === "invoice" && (
                  <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-700">
                    {t("offenePosten.belege.restOffen", {
                      rest: formatEUR(Math.abs(display.amount ?? 0) - bezahltSumme),
                      bezahlt: formatEUR(bezahltSumme),
                    })}
                  </div>
                )}
                {display.kind === "invoice" && (display.documentDate || display.dueDate) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
                    {display.documentDate && (
                      <span>
                        {t("matchPanel.documentDate", { datum: formatDate(display.documentDate) })}
                      </span>
                    )}
                    {display.dueDate && (
                      <span>
                        {t("matchPanel.dueDate", { datum: formatDate(display.dueDate) })}
                        {display.dueDate < heuteLokal() && (
                          <span className="ml-1 font-medium text-red-600">
                            · {t("offenePosten.belege.ueberfaellig")}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* WHAT TO DO NEXT: a partial payment leaves the reader with a number and no
                  instruction. This says the invoice stays open until the rest is matched, and
                  hands them the search directly. */}
              {teilzahlung && display.kind === "invoice" && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="min-w-0 flex-1 text-xs text-amber-900">
                    {t("matchPanel.teilzahlungHinweis", {
                      rest: formatEUR(Math.abs(display.amount ?? 0) - bezahltSumme),
                    })}
                  </span>
                  {!searchOffen && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 gap-1.5 border-amber-300 bg-transparent px-2 text-xs text-amber-900 shadow-none hover:bg-amber-100 hover:text-amber-950"
                      onClick={() => setShowSearch(true)}
                    >
                      <Search className="size-3.5" aria-hidden />
                      {t("matchPanel.teilzahlungSuchen")}
                    </Button>
                  )}
                </div>
              )}
              <SheetDescription className="sr-only">
                {display.kind === "invoice"
                  ? t("matchPanel.invoiceTitle")
                  : t("matchPanel.transactionTitle")}
              </SheetDescription>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
              <PaymentRightNotice />
              {searchOffen ? (
                <section className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {display.kind === "invoice"
                        ? t("matchPanel.findPaymentHeading")
                        : t("matchPanel.findInvoiceHeading")}
                    </h3>
                    {showSuggestedSection && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto shrink-0 gap-1 px-0 py-0 font-medium"
                        onClick={() => setShowSearch(false)}
                      >
                        <ChevronLeft />
                        {t("matchPanel.zurueckZuVorschlaegen")}
                      </Button>
                    )}
                  </div>
                  <ManualSearch
                    target={display}
                    search={search}
                    onSearchChange={setSearch}
                    debouncedSearch={debouncedSearch}
                    onLinked={onClose}
                  />
                </section>
              ) : (
                showSuggestedSection && (
                  <section>
                    {candidateCount === 0 && (
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("matchPanel.suggestedHeading")}
                      </h3>
                    )}
                    {display.kind === "invoice" ? (
                      candidateCount === 0 ? (
                        possible.isLoading ? (
                          <Skeleton className="h-24 w-full" />
                        ) : (
                          <PossibleMatches
                            matches={possible.matches}
                            invoiceId={display.id}
                            invoiceType={display.type}
                            invoiceLabel={display.label}
                            invoiceNr={display.nr}
                            invoiceGross={display.amount}
                            onLinked={onClose}
                          />
                        )
                      ) : (
                        <InvoiceMatches
                          invoiceId={display.id}
                          invoiceType={display.type}
                          invoiceLabel={display.label}
                          invoiceNr={display.nr}
                          invoiceGross={display.amount}
                        />
                      )
                    ) : candidateCount === 0 ? (
                      possibleInvoices.isLoading ? (
                        <Skeleton className="h-24 w-full" />
                      ) : (
                        <PossibleInvoiceMatches
                          matches={possibleInvoices.matches}
                          transactionId={display.txn.id}
                          transactionLabel={display.txn.counterparty_holder ?? "—"}
                          transactionAmount={display.txn.amount}
                          transactionDate={display.txn.booking_date}
                          onLinked={onClose}
                        />
                      )
                    ) : (
                      <TransactionMatches
                        transactionId={display.txn.id}
                        transactionAmount={display.txn.amount}
                      />
                    )}
                  </section>
                )
              )}
            </div>

            {!searchOffen && (
              <div className="shrink-0 border-t border-border px-4 pb-2 pt-3">
                <p className="mb-2 text-center text-sm text-muted-foreground">
                  {display.kind === "invoice"
                    ? t("matchPanel.noMatchQuestionTransactions")
                    : t("matchPanel.noMatchQuestionInvoices")}
                </p>
                <Button className="w-full gap-2 shadow-none" onClick={() => setShowSearch(true)}>
                  <Search />
                  {display.kind === "invoice"
                    ? t("matchPanel.searchAllTransactions")
                    : t("matchPanel.searchAllInvoices")}
                </Button>
              </div>
            )}

            {/* Escape hatch when NOTHING here works out, so it stays reachable without scrolling
                past the whole candidate/search list first. No RequestReceiptAction here -- this Hub
                has no "request the receipt" action (see NoReceiptAction's own header comment). */}
            {display.kind === "transaction" && (
              <div
                className={cn(
                  "shrink-0 px-4 pb-4",
                  searchOffen ? "border-t border-border pt-4" : "pt-0",
                )}
              >
                <NoReceiptAction txn={display.txn} variant="button" className="w-full" />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
