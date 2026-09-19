/**
 * Does moving an invoice from `from` to `to` release its confirmed bank payment?
 *
 * The workflow bar only moves forward by design (see WORKFLOW_BAR_NAVIGATION.md in the hubs), and
 * the manual correction is the one way back. Coming back past "paid" is the case that matters: the
 * invoice is being declared not paid after all, and the bank transaction that was linked to it is
 * no longer its payment. Leaving that link in place is what the client hit in the 09.09.2026
 * meeting -- the invoice reads as unpaid while the transaction still reads as reconciled against
 * it, and the next bank import has nothing to match.
 *
 * `chain` is the host repo's own ordered workflow chain (WORKFLOW_REIHENFOLGE), because the hubs do
 * not all have the same number of approval steps. A status that is not in the chain ranks below
 * everything in it, which is what makes a move to a terminal state like "abgelehnt" release the
 * payment too: that invoice never should have progressed.
 */
export function releasesPaymentLink(
  from: string,
  to: string,
  chain: readonly string[],
  paidStatus = "bezahlt",
): boolean {
  const paidRank = chain.indexOf(paidStatus);
  if (paidRank < 0) return false; // a chain with no paid step has nothing to release
  return chain.indexOf(from) >= paidRank && chain.indexOf(to) < paidRank;
}
