export interface BackwardsMove {
  targets: string[];
  requiresReason: boolean;
  releasesPayment: boolean;
}

const NOTHING: BackwardsMove = { targets: [], requiresReason: false, releasesPayment: false };

// Undoing the paid step releases the invoice's confirmed bank matches first, so a bank import never
// finds a transaction reconciled against an invoice that now reads as unpaid.
export function backwardsTargets(
  status: string,
  chain: readonly string[],
  permissions: { mayApprove: boolean; mayPay: boolean },
  options: { paidStatus?: string; excluded?: readonly string[] } = {},
): BackwardsMove {
  const { paidStatus = "paid", excluded = ["query"] } = options;
  const here = chain.indexOf(status);
  if (here <= 0) return NOTHING; // unknown status, or already on the first step
  const paid = chain.indexOf(paidStatus);

  // excluded steps already have their own action (query already requires a comment).
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
