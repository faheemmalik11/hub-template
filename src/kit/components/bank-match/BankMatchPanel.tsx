import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { Skeleton } from "../../ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Combobox } from "../../ui/combobox";
import { readableErrorMessage } from "../feedback/query-states";
import { cn } from "../../lib/class-names";
import type {
  BankReconciliationAdapter,
  BankTransactionRecord,
} from "../../adapters/bank-reconciliation";

export interface BankMatchPanelLabels {
  panelTitle: string;
  scoreLabel: (score: number) => string;
  close: string;
  candidatesTitle: string;
  candidatesEmpty: string;
  candidateConfirm: string;
  candidateReject: string;
  matchConfirmed: string;
  matchRejected: string;
  manualSearchToggle: string;
  manualSearchPlaceholder: string;
  manualSearchEmpty: string;
  noReceiptButton: string;
  noReceiptClear: string;
  noReceiptConfirm: string;
  noReceiptDialogTitle: string;
  noReceiptMarked: string;
  noReceiptReasonPlaceholder: string;
}

export const englishBankMatchPanelLabels: BankMatchPanelLabels = {
  panelTitle: "Match this transaction",
  scoreLabel: (score) => `${score}% match`,
  close: "Close",
  candidatesTitle: "Suggested matches",
  candidatesEmpty: "No suggested matches.",
  candidateConfirm: "Confirm match",
  candidateReject: "Not a match",
  matchConfirmed: "Match confirmed.",
  matchRejected: "Match rejected.",
  manualSearchToggle: "Search manually",
  manualSearchPlaceholder: "Search invoices…",
  manualSearchEmpty: "No invoices found.",
  noReceiptButton: "No receipt expected",
  noReceiptClear: "Undo",
  noReceiptConfirm: "Confirm",
  noReceiptDialogTitle: "Mark as no receipt expected",
  noReceiptMarked: "Marked: no receipt expected.",
  noReceiptReasonPlaceholder: "Reason",
};

export function BankMatchPanel({
  transaction,
  onClose,
  adapter,
  labels,
}: {
  transaction: BankTransactionRecord | null;
  onClose: () => void;
  adapter: BankReconciliationAdapter;
  labels: BankMatchPanelLabels;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Awaited<ReturnType<NonNullable<BankReconciliationAdapter["manualSearch"]>["search"]>>
  >([]);
  const [searching, setSearching] = useState(false);
  const [noReceiptOpen, setNoReceiptOpen] = useState(false);
  const [noReceiptReason, setNoReceiptReason] = useState("");

  const candidatesQuery = adapter.useCandidates(transaction?.id ?? "");
  const open = transaction != null;

  async function confirm(invoiceId: string) {
    if (!transaction) return;
    try {
      await adapter.confirmMatch(transaction.id, invoiceId);
      toast.success(labels.matchConfirmed);
      onClose();
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function reject(invoiceId: string) {
    if (!transaction) return;
    try {
      await adapter.rejectMatch(transaction.id, invoiceId);
      toast.success(labels.matchRejected);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function runSearch(value: string) {
    setQuery(value);
    if (!adapter.manualSearch || value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await adapter.manualSearch.search(value.trim()));
    } finally {
      setSearching(false);
    }
  }

  async function confirmNoReceipt() {
    if (!transaction || !adapter.noReceipt) return;
    try {
      await adapter.noReceipt.mark(transaction.id, noReceiptReason);
      toast.success(labels.noReceiptMarked);
      setNoReceiptOpen(false);
      setNoReceiptReason("");
      onClose();
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{labels.panelTitle}</SheetTitle>
            {transaction && (
              <SheetDescription>
                {adapter.formatMoney(transaction.amount)} · {transaction.counterparty_holder ?? "—"}{" "}
                · {adapter.formatDate(transaction.booking_date)}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{labels.candidatesTitle}</h3>
              {candidatesQuery.loading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              ) : candidatesQuery.data.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{labels.candidatesEmpty}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {candidatesQuery.data.map((candidate) => (
                    <li
                      key={candidate.invoiceId}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {candidate.issuer ?? "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {adapter.formatMoney(candidate.amount)} ·{" "}
                            {adapter.formatDate(candidate.documentDate)}
                            {candidate.invoiceNumber ? ` · #${candidate.invoiceNumber}` : ""}
                          </div>
                        </div>
                        {candidate.score != null && (
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {labels.scoreLabel(Math.round(candidate.score))}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-muted-foreground hover:text-destructive"
                          onClick={() => reject(candidate.invoiceId)}
                        >
                          {labels.candidateReject}
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-dark hover:underline"
                          onClick={() => confirm(candidate.invoiceId)}
                        >
                          {labels.candidateConfirm}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {adapter.manualSearch && (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setManualOpen((v) => !v)}
                >
                  <Search className="size-3.5" />
                  {labels.manualSearchToggle}
                </button>
                {manualOpen && (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={query}
                      onChange={(event) => runSearch(event.target.value)}
                      placeholder={labels.manualSearchPlaceholder}
                    />
                    {searching ? (
                      <Skeleton className="h-16 w-full rounded-lg" />
                    ) : results.length === 0 && query.trim().length >= 2 ? (
                      <p className="text-sm text-muted-foreground">{labels.manualSearchEmpty}</p>
                    ) : (
                      <ul className="space-y-2">
                        {results.map((result) => (
                          <li
                            key={result.id}
                            className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"
                          >
                            <span className="truncate">{result.issuer ?? "—"}</span>
                            <button
                              type="button"
                              className="shrink-0 text-xs font-medium text-brand-dark hover:underline"
                              onClick={() => confirm(result.id)}
                            >
                              {labels.candidateConfirm}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {adapter.noReceipt && (
              <div className={cn("border-t border-border pt-4")}>
                {transaction?.no_receipt_reason ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => transaction && adapter.noReceipt!.clear(transaction.id)}
                  >
                    {labels.noReceiptClear}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setNoReceiptOpen(true)}>
                    {labels.noReceiptButton}
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={noReceiptOpen} onOpenChange={setNoReceiptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.noReceiptDialogTitle}</DialogTitle>
          </DialogHeader>
          {adapter.noReceipt && adapter.noReceipt.reasons.length > 0 ? (
            <Combobox
              value={noReceiptReason}
              onValueChange={setNoReceiptReason}
              options={adapter.noReceipt.reasons}
            />
          ) : (
            <Textarea
              value={noReceiptReason}
              onChange={(event) => setNoReceiptReason(event.target.value)}
              placeholder={labels.noReceiptReasonPlaceholder}
              rows={2}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoReceiptOpen(false)}>
              {labels.close}
            </Button>
            <Button onClick={confirmNoReceipt} disabled={!noReceiptReason.trim()}>
              {labels.noReceiptConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
