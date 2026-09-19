export function normalizeReference(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasTransposedDigits(reference: string, target: string | null | undefined): boolean {
  if (!target) return false;
  const normRef = normalizeReference(reference);
  const normTarget = normalizeReference(target);
  if (normTarget.length < 3) return false;
  for (let i = 0; i < normTarget.length - 1; i++) {
    const swapped =
      normTarget.slice(0, i) + normTarget[i + 1] + normTarget[i] + normTarget.slice(i + 2);
    if (normRef.includes(swapped)) return true;
  }
  return false;
}

/** Taken off the amount weight when the amounts only agree WITHIN the allowed difference. */
export const TOLERANCE_PENALTY = 0.05;

/**
 * Do these two amounts count as the same, and did they need the allowance to do it?
 *
 * The amount is the heaviest signal in the score (0.45 of 1.0), so what happens at the edge of the
 * allowed difference matters. Treating a 45-cent gap exactly like an exact hit would let a rounded
 * guess reach the same confidence as a payment that matches to the cent.
 *
 * `exact` is therefore reported separately, and the scorer docks TOLERANCE_PENALTY when it is
 * false: 0.45 becomes 0.40. Enough to rank an exact hit above a tolerated one, small enough that a
 * tolerated match still clears the 0.60 suggestion gate on amount plus invoice number -- which is
 * the whole point of widening the window.
 *
 * It is also what the screen needs in order to say "this one only matches because you allow 50
 * cents", instead of presenting both kinds of agreement as the same fact.
 */
export function amountMatch(
  invoiceGross: number,
  transactionAmount: number,
  tolerance: number,
): { matched: boolean; exact: boolean; difference: number } {
  if (!(invoiceGross > 0)) return { matched: false, exact: false, difference: 0 };
  const difference = Math.abs(Math.abs(transactionAmount) - Math.abs(invoiceGross));
  // A cent floor regardless of the setting: rounding in the data itself is not a real difference.
  const window = Math.max(tolerance, 0.01);
  const exact = difference <= 1e-9;
  return { matched: difference <= window + 1e-9, exact, difference };
}
