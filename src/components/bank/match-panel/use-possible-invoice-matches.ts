import { useMemo } from "react";

import {
  useMatchingSettings,
  useOpenBelegeInfinite,
  useOpenOutgoingInvoicesInfinite,
} from "@/lib/data/queries";
import { scoreMatch, type MatchBeleg, type MatchTransaction } from "@/lib/data/matching";
import type { MatchReasons } from "@/lib/data/types";

// Mirrors _shared/matching.ts's own DATE_WINDOW_DAYS: outside this window an invoice isn't treated
// as a candidate for this transaction at all, no matter how well the rest of it agrees.
const DATE_WINDOW_DAYS = 60;
// How many scored candidates to surface. More than this and a shortlist stops being a shortlist --
// the point is a handful of plausible options, not a second unfiltered list.
const MAX_SHOWN = 3;
// Bounds the shortlist fetch itself. The date window already does the real narrowing; this is
// just a ceiling so a very wide-open window can't pull down an unbounded number of rows to score
// in the browser.
const CANDIDATE_FETCH_SIZE = 200;

export interface ScoredInvoiceMatch {
  id: string;
  type: "incoming" | "outgoing";
  label: string;
  nr: string | null;
  amount: number | null;
  score: number;
  reasons: MatchReasons;
}

function windowBounds(anchor: string | null): { von?: string; bis?: string } {
  if (!anchor) return {};
  const center = new Date(`${anchor}T00:00:00`);
  const von = new Date(center);
  von.setDate(von.getDate() - DATE_WINDOW_DAYS);
  const bis = new Date(center);
  bis.setDate(bis.getDate() + DATE_WINDOW_DAYS);
  return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
}

/**
 * The invoice-side mirror of `usePossibleMatches`: the same near-miss case (amount + name + date
 * proximity agree, but the bank reference doesn't literally contain the invoice number, so the
 * pair scores 0.58 and the bank-sync matcher never persists it), just run the other direction --
 * fixed transaction, scored against a date-windowed shortlist of open invoices instead of the
 * other way around. Direction is read off the transaction's own sign, the same convention
 * `TransactionMatches`/`ManualSearch` already use: a credit is settled by an outgoing invoice, a
 * debit by an incoming one.
 */
export function usePossibleInvoiceMatches(txn: {
  id: string;
  amount: number;
  bookingDate: string | null;
  paymentReference: string | null;
  counterpartyIban: string | null;
  counterpartyHolder: string | null;
}): { isLoading: boolean; matches: ScoredInvoiceMatch[] } {
  const isCredit = txn.amount >= 0;
  const { von, bis } = windowBounds(txn.bookingDate);

  const incomingQ = useOpenBelegeInfinite(
    { von, bis, sort: "eingegangen_am", dir: "desc", pageSize: CANDIDATE_FETCH_SIZE },
    { enabled: !!txn.id && !isCredit },
  );
  const outgoingQ = useOpenOutgoingInvoicesInfinite(
    { von, bis, sort: "created_at", dir: "desc", pageSize: CANDIDATE_FETCH_SIZE },
    { enabled: !!txn.id && isCredit },
  );

  // THE SAME TOLERANCE THE BACKGROUND SYNC USES -- see use-possible-matches.ts for why running
  // this scorer on the default while bank-sync runs it on the setting is the one outcome to avoid.
  const toleranz = useMatchingSettings().data?.amount_tolerance;

  const matches = useMemo(() => {
    const matchTxn: MatchTransaction = {
      id: txn.id,
      amount: txn.amount,
      booking_date: txn.bookingDate,
      payment_reference: txn.paymentReference,
      counterparty_iban: txn.counterpartyIban,
      counterparty_holder: txn.counterpartyHolder,
    };

    const scored: ScoredInvoiceMatch[] = isCredit
      ? (outgoingQ.data?.pages.flatMap((p) => p.rows) ?? []).map((oi) => {
          const beleg: MatchBeleg = {
            id: oi.id,
            amount_gross: oi.amount_gross,
            document_date: oi.invoice_date,
            due_date: oi.due_date,
            invoice_number: oi.invoice_number,
            customer_number: oi.customers?.customer_number ?? null,
            issuer: oi.customers?.name ?? null,
            // Not available on this row -- see the module comment on use-possible-matches.ts for
            // why amount + reference alone are enough to anchor a real candidate.
            supplier_iban: null,
          };
          const { score, reasons } = scoreMatch(beleg, matchTxn, toleranz);
          return {
            id: oi.id,
            type: "outgoing",
            label: oi.customers?.name ?? "—",
            nr: oi.invoice_number,
            amount: oi.amount_gross,
            score,
            reasons: reasons as MatchReasons,
          };
        })
      : (incomingQ.data?.pages.flatMap((p) => p.rows) ?? []).map((b) => {
          const beleg: MatchBeleg = {
            id: b.id,
            amount_gross: b.amount_gross,
            document_date: b.document_date,
            due_date: b.due_date,
            invoice_number: b.invoice_number,
            customer_number: b.customer_number,
            issuer: b.issuer,
            supplier_iban: null,
          };
          const { score, reasons } = scoreMatch(beleg, matchTxn, toleranz);
          return {
            id: b.id,
            type: "incoming",
            label: b.issuer_sort ?? b.issuer ?? "—",
            nr: b.invoice_number,
            amount: b.amount_gross,
            score,
            reasons: reasons as MatchReasons,
          };
        });

    return scored
      .filter((r) => r.reasons.amount || r.reasons.reference)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SHOWN);
  }, [
    isCredit,
    incomingQ.data,
    outgoingQ.data,
    txn.id,
    txn.amount,
    txn.bookingDate,
    txn.paymentReference,
    txn.counterpartyIban,
    txn.counterpartyHolder,
    toleranz,
  ]);

  return { isLoading: isCredit ? outgoingQ.isLoading : incomingQ.isLoading, matches };
}
