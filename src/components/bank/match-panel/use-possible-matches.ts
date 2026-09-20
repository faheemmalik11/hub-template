import { useMemo } from "react";

import { useMatchingSettings, useOpenBankTransactionsInfinite } from "@/data";
import { scoreMatch, type MatchBeleg, type MatchTransaction } from "@/lib/data/matching";
// The scorer's own MatchReasons has no index signature; this app-wide one (mirroring the DB's
// jsonb column) does, and is what MatchScoreBreakdown / the link mutations both expect -- cast
// once here, at the boundary, rather than at every place a ScoredMatch gets used downstream.
import type { BankTransaction, MatchReasons } from "@/lib/data/types";

// Mirrors _shared/matching.ts's own DATE_WINDOW_DAYS: outside this window a debit isn't treated as
// a candidate for this invoice at all, no matter how well the rest of it agrees.
const DATE_WINDOW_DAYS = 60;
// How many scored candidates to surface. More than this and a shortlist stops being a shortlist --
// the point is a handful of plausible options, not a second unfiltered list.
const MAX_SHOWN = 3;
// Bounds the shortlist fetch itself. The date window already does the real narrowing; this is
// just a ceiling so a very wide-open window (no due date, only a document date) can't pull down
// an unbounded number of rows to score in the browser.
const CANDIDATE_FETCH_SIZE = 200;

export interface ScoredMatch {
  txn: BankTransaction;
  score: number;
  reasons: MatchReasons;
}

function dayGap(dayDiff: number | null | undefined): number {
  return dayDiff ?? Number.MAX_SAFE_INTEGER;
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
 * The near-miss case the bank-sync matcher's own DB-persisted suggestions structurally cannot
 * cover: `runMatching()` only writes a row to `invoice_transaction_matches` for pairs scoring >=
 * 0.60, and an exact amount match alone is worth 0.45 of that -- so a real payment whose reference
 * doesn't literally contain the invoice number (amount + name + date proximity = 0.58) never gets
 * persisted, and the invoice would otherwise show no suggestion at all even though the payment is
 * sitting right there. This runs the SAME canonical scorer (`scoreMatch`, mirrored from the
 * bank-sync Edge Function) against a date-windowed shortlist of open transactions, live in the
 * browser, and keeps only what clears the matcher's own anchor rule: amount or reference has to
 * hit, date+name proximity alone is never enough (the same rule `runMatching` itself uses), so
 * this never surfaces a same-supplier coincidence as if it were a real candidate.
 */
export function usePossibleMatches(beleg: {
  id: string;
  amount: number | null;
  documentDate: string | null;
  dueDate: string | null;
  nr: string | null;
  label: string;
  /** "incoming" = we owe money (settled by a debit); "outgoing" = we're owed money (settled by a credit). */
  invoiceType: "incoming" | "outgoing";
}): { isLoading: boolean; matches: ScoredMatch[] } {
  const { von, bis } = windowBounds(beleg.dueDate ?? beleg.documentDate);
  const q = useOpenBankTransactionsInfinite(
    {
      matchingStatus: "open",
      // Same convention ManualSearch/TransactionMatches already use: an incoming invoice is
      // settled by an outgoing (debit) bank movement, an outgoing invoice by an incoming
      // (credit) one.
      richtung: beleg.invoiceType === "outgoing" ? "eingehend" : "ausgehend",
      bookingDateVon: von,
      bookingDateBis: bis,
      sort: "booking_date",
      dir: "desc",
      pageSize: CANDIDATE_FETCH_SIZE,
    },
    // Callers pass an empty id until the real candidate count is known to be zero (see
    // match-panel.tsx) -- no point fetching a fallback shortlist before then, or at all for a
    // transaction target, which has no fallback built yet.
    { enabled: !!beleg.id },
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data]);

  // THE SAME TOLERANCE THE BACKGROUND SYNC USES. bank-sync reads matching_settings and hands it to
  // the scorer; this list ran the identical scorer with the 0.01 default, so raising the tolerance
  // changed what the nightly run matched and nothing a person could see. Two answers to one
  // question is worse than one strict answer.
  const toleranz = useMatchingSettings().data?.amount_tolerance;

  const matches = useMemo(() => {
    const matchBeleg: MatchBeleg = {
      id: beleg.id,
      amount_gross: beleg.amount,
      document_date: beleg.documentDate,
      due_date: beleg.dueDate,
      invoice_number: beleg.nr,
      // Not available on this narrowed row (v_open_items doesn't carry it) -- the amount and
      // reference signals alone are enough to anchor a real candidate; see the module comment.
      customer_number: null,
      issuer: beleg.label,
      supplier_iban: null,
    };
    return rows
      .map((txn): ScoredMatch => {
        const matchTxn: MatchTransaction = {
          id: txn.id,
          amount: txn.amount,
          booking_date: txn.booking_date,
          payment_reference: txn.payment_reference,
          counterparty_iban: txn.counterparty_iban,
          counterparty_holder: txn.counterparty_holder,
        };
        const { score, reasons } = scoreMatch(matchBeleg, matchTxn, toleranz);
        return { txn, score, reasons: reasons as MatchReasons };
      })
      .filter((r) => r.reasons.amount || r.reasons.reference)
      .sort((a, b) => b.score - a.score || dayGap(a.reasons.dayDiff) - dayGap(b.reasons.dayDiff))
      .slice(0, MAX_SHOWN);
  }, [
    rows,
    beleg.id,
    beleg.amount,
    beleg.documentDate,
    beleg.dueDate,
    beleg.nr,
    beleg.label,
    toleranz,
  ]);

  return { isLoading: q.isLoading, matches };
}
