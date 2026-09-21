// Deterministic transaction ↔ beleg matching. Pure functions (testable, no I/O).
// Weights and thresholds mirror docs/BANKSAPI_IMPLEMENTATION_SPEC.md §5.
// Guard: matching only CONFIRMS collection — it never triggers a payment.

export interface MatchDocument {
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
  amountTolerated: boolean;
  amountDifference: number | null;
  reference: boolean;
  customerNumber: boolean;
  iban: boolean;
  name: boolean;
  dayDiff: number | null;
}

export interface MatchCandidate {
  document_id: string;
  transaction_id: string;
  score: number;
  status: "auto" | "kandidat";
  match_reasons: MatchReasons;
  /**
   * Suggested amount for THIS pair, capped by what the invoice is worth. A proposal never consumes
   * allocation (only 'bestaetigt' links do), so this is a starting point the UI pre-fills and the
   * link RPC re-derives against what is actually still open on both sides at confirm time.
   */
  amount_matched: number;
}

// A collective payment is larger than any single invoice on it, so the pair is worth at most the
// invoice. The floor keeps the amount_matched > 0 check satisfied on a zero-amount transaction.
function pairAmount(beleg: MatchDocument, txn: MatchTransaction): number {
  const txnAmount = Math.abs(txn.amount);
  const brutto = Math.abs(beleg.amount_gross ?? 0);
  const capped = brutto > 0 ? Math.min(txnAmount, brutto) : txnAmount;
  return Math.max(Number(capped.toFixed(2)), 0.01);
}

const WEIGHT = { amount: 0.45, reference: 0.25, customerNumber: 0.05, iban: 0.2, name: 0.1 };
const DATE_WINDOW_DAYS = 60; // outside this window we don't treat a debit as a candidate
const AUTO_THRESHOLD = 0.9;
const CANDIDATE_THRESHOLD = 0.6;

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a.length <= 10 ? a + "T00:00:00" : a).getTime();
  const db = new Date(b.length <= 10 ? b + "T00:00:00" : b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round(Math.abs(da - db) / 86_400_000);
}

function hasTransposedNumber(reference: string, target: string | null | undefined): boolean {
  if (!target) return false;
  const normTarget = normalize(target);
  if (normTarget.length < 3) return false;
  for (let i = 0; i < normTarget.length - 1; i++) {
    const swapped =
      normTarget.slice(0, i) + normTarget[i + 1] + normTarget[i] + normTarget.slice(i + 2);
    if (reference.includes(swapped)) return true;
  }
  return false;
}

/**
 * Mirror of amountMatch in src/kit/lib/bank-matching. KEEP THE TWO IDENTICAL: this file runs in
 * Deno and cannot import from node_modules, so the shared rule has to exist twice. If you change
 * one, change the other, or the nightly sync and the screen will disagree about the same pair.
 */
const TOLERANCE_PENALTY = 0.05;

function amountMatch(
  invoiceGross: number,
  transactionAmount: number,
  tolerance: number,
): { matched: boolean; exact: boolean; difference: number } {
  if (!(invoiceGross > 0)) return { matched: false, exact: false, difference: 0 };
  const difference = Math.abs(Math.abs(transactionAmount) - Math.abs(invoiceGross));
  const window = Math.max(tolerance, 0.01);
  return { matched: difference <= window + 1e-9, exact: difference <= 1e-9, difference };
}

export function scoreMatch(
  beleg: MatchDocument,
  txn: MatchTransaction,
  amountTolerance: number = 0.01,
): { score: number; reasons: MatchReasons } {
  const brutto = beleg.amount_gross ?? 0;
  const txnAmount = Math.abs(txn.amount);
  const zweck = normalize(txn.payment_reference);

  const betrag = amountMatch(brutto, txnAmount, amountTolerance);
  const exactRef = !!beleg.invoice_number && zweck.includes(normalize(beleg.invoice_number));
  const transposedRef = !exactRef && hasTransposedNumber(zweck, beleg.invoice_number);

  const reasons: MatchReasons = {
    amount: betrag.matched,
    // Stored on the match row, so the screen can say a suggestion only holds because of the
    // allowance rather than presenting it as an exact agreement.
    amountTolerated: betrag.matched && !betrag.exact,
    amountDifference: betrag.matched ? betrag.difference : null,
    reference: exactRef || transposedRef,
    customerNumber:
      !!beleg.customer_number &&
      (zweck.includes(normalize(beleg.customer_number)) ||
        hasTransposedNumber(zweck, beleg.customer_number)),
    iban:
      !!beleg.supplier_iban && normalize(beleg.supplier_iban) === normalize(txn.counterparty_iban),
    name:
      !!beleg.issuer &&
      !!txn.counterparty_holder &&
      normalize(txn.counterparty_holder).includes(normalize(beleg.issuer).slice(0, 6)),
    dayDiff: dayDiff(txn.booking_date, beleg.due_date ?? beleg.document_date),
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
  // Date proximity is a small tie-breaker, never a match on its own.
  if (reasons.dayDiff !== null && reasons.dayDiff <= 7) score += 0.03;

  return { score: Math.min(score, 1), reasons };
}

export function runMatching(
  belege: MatchDocument[],
  transactions: MatchTransaction[],
  direction: "incoming" | "outgoing" = "incoming",
  amountTolerance: number = 0.01,
  candidateThreshold: number = CANDIDATE_THRESHOLD,
  autoThreshold: number = AUTO_THRESHOLD,
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const txn of transactions) {
    if (direction === "incoming" && txn.amount >= 0) continue; // debits only
    if (direction === "outgoing" && txn.amount <= 0) continue; // credits only
    for (const beleg of belege) {
      const diff = dayDiff(txn.booking_date, beleg.due_date ?? beleg.document_date);
      if (diff !== null && diff > DATE_WINDOW_DAYS) continue;
      const { score, reasons } = scoreMatch(beleg, txn, amountTolerance);
      // Never auto/candidate on date+name alone: require amount or reference to anchor.
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
