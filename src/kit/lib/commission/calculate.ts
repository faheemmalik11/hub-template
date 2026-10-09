import type {
  CommissionInvoiceDraft,
  CommissionPayer,
  CommissionResult,
  DealCommissionInput,
  SideCommissionInput,
  SideProblem,
} from "./types";

const SHARE_TOLERANCE = 1e-6;

export function grossRateFromNet(netRatePercent: number, vatRatePercent: number): number {
  return Math.round(netRatePercent * (100 + vatRatePercent) * 100) / 10_000;
}

export function grossFromNetCents(netCents: number, vatRatePercent: number): number {
  return Math.round((netCents * (100 + vatRatePercent)) / 100);
}

export function netFromGrossCents(grossCents: number, vatRatePercent: number): number {
  return Math.round((grossCents * 100) / (100 + vatRatePercent));
}

export function splitByShares(totalCents: number, sharesPercent: readonly number[]): number[] {
  const exact = sharesPercent.map((share) => (totalCents * share) / 100);
  const parts = exact.map(Math.floor);
  let unallocated = totalCents - parts.reduce((sum, part) => sum + part, 0);
  const byLargestRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byLargestRemainder) {
    if (unallocated <= 0) break;
    parts[index] += 1;
    unallocated -= 1;
  }
  return parts;
}

function resolveShares(
  payers: readonly CommissionPayer[],
): number[] | "shares_incomplete" | "shares_do_not_add_up" {
  const explicitShares = payers.filter((payer) => payer.sharePercent !== undefined);
  if (explicitShares.length === 0) return payers.map(() => 100 / payers.length);
  if (explicitShares.length !== payers.length) return "shares_incomplete";
  const shares = payers.map((payer) => payer.sharePercent as number);
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (shares.some((share) => share <= 0) || Math.abs(total - 100) > SHARE_TOLERANCE) {
    return "shares_do_not_add_up";
  }
  return shares;
}

function sideNetCents(input: SideCommissionInput): number | null {
  if (!input.fee) return null;
  if (input.fee.kind === "fixed") return input.fee.netAmountCents;
  if (input.purchasePriceCents === null) return null;
  return Math.round((input.purchasePriceCents * input.fee.netRatePercent) / 100);
}

export function calculateSideCommission(input: SideCommissionInput): CommissionResult {
  const problems: SideProblem[] = [];
  const report = (problem: SideProblem["problem"]) => problems.push({ side: input.side, problem });

  if (!input.fee) report("fee_missing");
  if (input.fee?.kind === "percent" && input.purchasePriceCents === null) {
    report("purchase_price_missing");
  }
  if (input.payers.length === 0) report("no_payers");
  if (new Set(input.payers.map((payer) => payer.key)).size !== input.payers.length) {
    report("duplicate_payer");
  }

  const shares = input.payers.length > 0 ? resolveShares(input.payers) : null;
  if (typeof shares === "string") report(shares);

  if (input.payers.some((payer) => (payer.discountGrossCents ?? 0) < 0)) {
    report("discount_negative");
  }

  const netCents = sideNetCents(input);
  if (netCents !== null && netCents <= 0) report("fee_not_positive");

  if (problems.length > 0 || netCents === null || !Array.isArray(shares)) {
    return { ok: false, problems };
  }

  const netRatePercent = input.fee?.kind === "percent" ? input.fee.netRatePercent : null;
  const grossRatePercent =
    netRatePercent === null ? null : grossRateFromNet(netRatePercent, input.vatRatePercent);
  const payerNetCents = splitByShares(netCents, shares);

  const invoices: CommissionInvoiceDraft[] = input.payers.map((payer, index) => {
    const lineGrossCents = grossFromNetCents(payerNetCents[index], input.vatRatePercent);
    const discountGrossCents = payer.discountGrossCents ?? 0;
    const totalGrossCents = lineGrossCents - discountGrossCents;
    const totalNetCents = netFromGrossCents(totalGrossCents, input.vatRatePercent);
    return {
      side: input.side,
      payerKey: payer.key,
      sharePercent: shares[index],
      sideNetCents: netCents,
      netRatePercent,
      grossRatePercent,
      lineGrossCents,
      discountGrossCents,
      discountReason: payer.discountReason ?? null,
      totalGrossCents,
      totalNetCents,
      totalVatCents: totalGrossCents - totalNetCents,
    };
  });

  if (invoices.some((invoice) => invoice.totalGrossCents <= 0)) {
    return { ok: false, problems: [{ side: input.side, problem: "discount_exceeds_fee" }] };
  }
  return { ok: true, invoices };
}

export function calculateDealCommission(deal: DealCommissionInput): CommissionResult {
  const sides = (["buyer", "seller"] as const).flatMap((side) => {
    const sideInput = deal[side];
    if (!sideInput) return [];
    return [
      calculateSideCommission({
        ...sideInput,
        side,
        purchasePriceCents: deal.purchasePriceCents,
        vatRatePercent: deal.vatRatePercent,
      }),
    ];
  });

  if (sides.length === 0) return { ok: false, problems: [{ side: null, problem: "no_side_pays" }] };

  const problems = sides.flatMap((result) => (result.ok ? [] : result.problems));
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, invoices: sides.flatMap((result) => (result.ok ? result.invoices : [])) };
}
