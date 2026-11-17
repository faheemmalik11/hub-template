import { Calculator, CheckCircle2 } from "lucide-react";

import type {
  CommissionInvoiceDraft,
  CommissionProblem,
  CommissionResult,
  CommissionSide,
} from "@/kit/lib/commission";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function anchorForProblem(
  side: CommissionSide | null,
  problem: CommissionProblem,
): { tab: string; id: string } {
  if (problem === "purchase_price_missing")
    return { tab: "dealDetails", id: "field-purchase-price" };
  if (problem === "vat_rate_invalid") return { tab: "dealDetails", id: "field-vat" };
  if (problem === "fee_missing" || problem === "fee_not_positive") {
    return { tab: "dealDetails", id: `side-${side}-fee` };
  }
  return { tab: "dealDetails", id: `side-${side}-payers` };
}

const UNKNOWN_FIGURE = "—";

function figuresOf(invoices: CommissionInvoiceDraft[], hasProblems: boolean) {
  if (invoices.length === 0) {
    return hasProblems
      ? { net: UNKNOWN_FIGURE, vat: UNKNOWN_FIGURE, gross: UNKNOWN_FIGURE }
      : { net: formatEUR(0), vat: formatEUR(0), gross: formatEUR(0) };
  }
  const cents = invoices.reduce(
    (sum, invoice) => ({
      net: sum.net + invoice.totalNetCents,
      vat: sum.vat + invoice.totalVatCents,
      gross: sum.gross + invoice.totalGrossCents,
    }),
    { net: 0, vat: 0, gross: 0 },
  );
  return {
    net: formatEUR(cents.net / 100),
    vat: formatEUR(cents.vat / 100),
    gross: formatEUR(cents.gross / 100),
  };
}

export function DealCommissionOverviewCard({
  result,
  onJumpToField,
}: {
  result: CommissionResult;
  onJumpToField?: (tab: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const sideName = (side: CommissionSide | null) => (side ? t(`commissionDeals.side.${side}`) : "");
  const hasProblems = result.problems.length > 0;

  const invoicesOfSide = (side: CommissionSide) =>
    result.invoices.filter((invoice) => invoice.side === side);
  const buyer = figuresOf(invoicesOfSide("buyer"), hasProblems);
  const seller = figuresOf(invoicesOfSide("seller"), hasProblems);
  const total = figuresOf(result.invoices, hasProblems);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Calculator aria-hidden className="size-4" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {t("commissionDeals.overview.title")}
        </h2>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr>
              <th />
              <th className="pb-1 text-right text-xs font-normal text-muted-foreground">
                {t("commissionDeals.overview.net")}
              </th>
              <th className="pb-1 text-right text-xs font-normal text-muted-foreground">
                {t("commissionDeals.overview.vat")}
              </th>
              <th className="pb-1 text-right text-xs font-normal text-muted-foreground">
                {t("commissionDeals.overview.gross")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-muted-foreground">
                {t("commissionDeals.overview.buyerCommission")}
              </td>
              <td className="py-1 text-right text-xs text-muted-foreground">{buyer.net}</td>
              <td className="py-1 text-right text-xs text-muted-foreground">{buyer.vat}</td>
              <td className="py-1 text-right font-medium text-foreground">{buyer.gross}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">
                {t("commissionDeals.overview.sellerCommission")}
              </td>
              <td className="py-1 text-right text-xs text-muted-foreground">{seller.net}</td>
              <td className="py-1 text-right text-xs text-muted-foreground">{seller.vat}</td>
              <td className="py-1 text-right font-medium text-foreground">{seller.gross}</td>
            </tr>
            <tr className="border-t border-border">
              <td className="pt-2 font-semibold text-brand-dark">
                {t("commissionDeals.overview.total")}
              </td>
              <td className="pt-2 text-right text-xs text-muted-foreground">{total.net}</td>
              <td className="pt-2 text-right text-xs text-muted-foreground">{total.vat}</td>
              <td className="pt-2 text-right text-lg font-semibold text-brand-dark">
                {total.gross}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {hasProblems ? (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs font-medium text-destructive">
            {t("commissionDeals.overview.invalid", { count: result.problems.length })}
          </p>
          <ul className="mt-1.5 space-y-1">
            {result.problems.map((problem, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
              >
                <span>
                  •{" "}
                  {t(`commissionDeals.problems.${problem.problem}`, {
                    side: sideName(problem.side),
                  })}
                </span>
                {(problem.side !== null || problem.problem === "purchase_price_missing") &&
                  onJumpToField && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = anchorForProblem(problem.side, problem.problem);
                        onJumpToField(target.tab, target.id);
                      }}
                      className="text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
                    >
                      {t("commissionDeals.review.fix")}
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
          {t("commissionDeals.overview.valid")}
        </div>
      )}
    </section>
  );
}
