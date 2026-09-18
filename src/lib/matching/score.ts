// The transposed-digit rule lives in hub-kit (@hub-kit/core/bank-matching) so this scorer, the
// hubs' other three copies of this screen and anything else that has to agree about "8759 is
// probably 8795" all answer identically. The Deno edge function keeps its own copy -- it cannot
// import from node_modules -- and that one is the exception, not the pattern.
import { amountMatch, hasTransposedDigits, TOLERANCE_PENALTY } from "@hub-kit/core/bank-matching";

export interface MatchBeleg {
  id: string;
  amount_gross: number | null;
  document_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  customer_number: string | null;
  issuer: string | null;
  supplier_iban: string | null;
}

export interface MatchTransaction {
  id: string;
  amount: number;
  booking_date: string | null;
  payment_reference: string | null;
  counterparty_iban: string | null;
  counterparty_holder: string | null;
}

export interface MatchReasons {
  amount: boolean;
  /** The amounts agree only because of the allowed difference, not to the cent. */
  amountTolerated: boolean;
  /** How far apart they were, in euros. Null when they do not agree at all. */
  amountDifference: number | null;
  reference: boolean;
  customerNumber: boolean;
  iban: boolean;
  name: boolean;
  dayDiff: number | null;
}

export type MatchDirection = "incoming" | "outgoing";
export type MatchStatus = "auto" | "kandidat";

export interface MatchCandidate {
  document_id: string;
  transaction_id: string;
  score: number;
  status: MatchStatus;
  match_reasons: MatchReasons;
  amount_matched: number;
}

export const WEIGHT = { amount: 0.45, reference: 0.25, customerNumber: 0.05, iban: 0.2, name: 0.1 };
export const DATE_WINDOW_DAYS = 60;
export const DATE_PROXIMITY_DAYS = 7;
export const DATE_PROXIMITY_BONUS = 0.03;
export const AUTO_THRESHOLD = 0.9;
export const CANDIDATE_THRESHOLD = 0.6;

const AMOUNT_EPSILON = 0.01;
const NAME_PREFIX_LENGTH = 6;
const MS_PER_DAY = 86_400_000;

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toTime(value: string): number {
  return new Date(value.length <= 10 ? `${value}T00:00:00` : value).getTime();
}

export function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = toTime(a);
  const db = toTime(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round(Math.abs(da - db) / MS_PER_DAY);
}

function relevantDate(beleg: MatchBeleg): string | null {
  return beleg.due_date ?? beleg.document_date;
}

function pairAmount(beleg: MatchBeleg, txn: MatchTransaction): number {
  const txnAmount = Math.abs(txn.amount);
  const gross = Math.abs(beleg.amount_gross ?? 0);
  const capped = gross > 0 ? Math.min(txnAmount, gross) : txnAmount;
  return Math.max(Number(capped.toFixed(2)), 0.01);
}

export function scoreMatch(
  beleg: MatchBeleg,
  txn: MatchTransaction,
  amountTolerance: number = 0.01,
): { score: number; reasons: MatchReasons } {
  const gross = beleg.amount_gross ?? 0;
  const txnAmount = Math.abs(txn.amount);
  const reference = normalize(txn.payment_reference);

  // The amount is the heaviest signal (0.45 of 1.0), so an agreement that needed the allowance is
  // scored below one that did not: see TOLERANCE_PENALTY in hub-kit.
  const betrag = amountMatch(gross, txnAmount, amountTolerance);
  const exactRef = !!beleg.invoice_number && reference.includes(normalize(beleg.invoice_number));
  const transposedRef = !exactRef && hasTransposedDigits(reference, beleg.invoice_number);

  const reasons: MatchReasons = {
    amount: betrag.matched,
    amountTolerated: betrag.matched && !betrag.exact,
    amountDifference: betrag.matched ? betrag.difference : null,
    reference: exactRef || transposedRef,
    customerNumber:
      !!beleg.customer_number &&
      (reference.includes(normalize(beleg.customer_number)) ||
        hasTransposedDigits(reference, beleg.customer_number)),
    iban:
      !!beleg.supplier_iban && normalize(beleg.supplier_iban) === normalize(txn.counterparty_iban),
    name:
      !!beleg.issuer &&
      !!txn.counterparty_holder &&
      normalize(txn.counterparty_holder).includes(
        normalize(beleg.issuer).slice(0, NAME_PREFIX_LENGTH),
      ),
    dayDiff: dayDiff(txn.booking_date, relevantDate(beleg)),
  };

  let score = 0;
  if (betrag.matched) {
    score += WEIGHT.amount - (betrag.exact ? 0 : TOLERANCE_PENALTY);
  }
  if (exactRef) score += WEIGHT.reference;
  else if (transposedRef) score += WEIGHT.reference * 0.8;
  else if (reasons.customerNumber) score += WEIGHT.customerNumber;

  if (reasons.iban) score += WEIGHT.iban;
  if (reasons.name) score += WEIGHT.name;
  if (reasons.dayDiff !== null && reasons.dayDiff <= DATE_PROXIMITY_DAYS) {
    score += DATE_PROXIMITY_BONUS;
  }

  return { score: Math.min(score, 1), reasons };
}

export function runMatching(
  belege: MatchBeleg[],
  transactions: MatchTransaction[],
  direction: MatchDirection = "incoming",
  amountTolerance: number = 0.01,
  candidateThreshold: number = CANDIDATE_THRESHOLD,
  autoThreshold: number = AUTO_THRESHOLD,
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const txn of transactions) {
    if (direction === "incoming" && txn.amount >= 0) continue;
    if (direction === "outgoing" && txn.amount <= 0) continue;

    for (const beleg of belege) {
      const diff = dayDiff(txn.booking_date, relevantDate(beleg));
      if (diff !== null && diff > DATE_WINDOW_DAYS) continue;

      const { score, reasons } = scoreMatch(beleg, txn, amountTolerance);
      if (!reasons.amount && !reasons.reference) continue;
      if (score < candidateThreshold) continue;

      candidates.push({
        document_id: beleg.id,
        transaction_id: txn.id,
        score: Number(score.toFixed(2)),
        status: score >= autoThreshold ? "auto" : "kandidat",
        match_reasons: reasons,
        amount_matched: pairAmount(beleg, txn),
      });
    }
  }

  return candidates;
}
