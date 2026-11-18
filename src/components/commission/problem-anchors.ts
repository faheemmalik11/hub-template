import type { CommissionProblem, CommissionSide, SideProblem } from "@/kit/lib/commission";
import type { DealAnchor } from "./deal-tabs";

export function anchorForProblem(
  side: CommissionSide | null,
  problem: CommissionProblem,
): DealAnchor {
  if (problem === "purchase_price_missing")
    return { tab: "dealDetails", id: "field-purchase-price" };
  if (problem === "notarised_on_missing") return { tab: "dealDetails", id: "field-notarised-on" };
  if (problem === "vat_rate_invalid") return { tab: "dealDetails", id: "field-vat" };
  if (problem === "fee_missing" || problem === "fee_not_positive") {
    return { tab: "dealDetails", id: `side-${side}-fee` };
  }
  return { tab: "dealDetails", id: `side-${side}-payers` };
}

export function problemHasAnchor(problem: SideProblem): boolean {
  return (
    problem.side !== null ||
    problem.problem === "purchase_price_missing" ||
    problem.problem === "notarised_on_missing"
  );
}
