export interface BackwardsMove {
  /** The earlier steps this person may send the invoice back to. Empty leaves the bar forward-only. */
  targets: string[];
  /** The move has to collect a reason before it is applied, and that reason is kept in the history. */
  requiresReason: boolean;
  /** Applying it must release the invoice's confirmed bank matches first. */
  releasesPayment: boolean;
}

const NOTHING: BackwardsMove = { targets: [], requiresReason: false, releasesPayment: false };

/**
 * Where an invoice may be sent back to, and what that costs.
 *
 * The workflow bar moves forward by design. Until the 09.09.2026 client meeting the only ways back
 * were a query (which lands on "Rückfrage" and demands a comment) or a rejection, and neither says
 * "this went too far, put it back". There are two different moves behind that one sentence, and
 * they are not the same decision:
 *
 * - **Taking an approval back**, before the invoice is paid. Anyone who may approve may do it, and
 *   it costs nothing beyond the audit entry: no money has moved.
 * - **Undoing a payment**, from the paid step. Only somebody who may move money may do it, it has
 *   to say why, and it releases the bank transactions linked to the invoice -- otherwise the
 *   invoice reads as unpaid while the transaction still reads as reconciled against it, and the
 *   next bank import has nothing left to match.
 *
 * Past the paid step (handed to DATEV, closed) nothing is offered here. Those records have left the
 * building: pulling documents back out of DATEV is effectively impossible, so walking the status
 * back is a deliberate correction for a super admin, not a step on the bar.
 *
 * `chain` is the host repo's own WORKFLOW_REIHENFOLGE, because the hubs do not share a chain
 * length: Immonetz has a second approval step the others do not.
 */
export function backwardsTargets(
  status: string,
  chain: readonly string[],
  permissions: { mayApprove: boolean; mayPay: boolean },
  options: { paidStatus?: string; excluded?: readonly string[] } = {},
): BackwardsMove {
  const { paidStatus = "bezahlt", excluded = ["rueckfrage"] } = options;
  const here = chain.indexOf(status);
  if (here <= 0) return NOTHING; // unknown status, or already on the first step
  const paid = chain.indexOf(paidStatus);

  // `excluded` is for steps that already have an action of their own. "Rückfrage" is the case: it
  // exists precisely to be a query and requires a comment, so a silent move to it here would be a
  // way around that requirement.
  const earlier = chain.slice(0, here).filter((step) => !excluded.includes(step));

  if (paid >= 0 && here > paid) return NOTHING; // handed on: not a step on the bar any more
  if (paid >= 0 && here === paid) {
    return permissions.mayPay
      ? { targets: earlier, requiresReason: true, releasesPayment: true }
      : NOTHING;
  }
  return permissions.mayApprove
    ? { targets: earlier, requiresReason: false, releasesPayment: false }
    : NOTHING;
}
