import { Calculator, CheckCircle2 } from "lucide-react";

import type { CommissionProblem, CommissionResult, CommissionSide } from "@/kit/lib/commission";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function anchorForProblem(
  side: CommissionSide,
  problem: CommissionProblem,
): { tab: string; id: string } {
  if (problem === "purchase_price_missing")
    return { tab: "dealDetails", id: "field-purchase-price" };
  if (problem === "fee_missing" || problem === "fee_not_positive") {
    return { tab: "dealDetails", id: `side-${side}-fee` };
  }
  return { tab: "dealDetails", id: `side-${side}-payers` };
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

  if (!result.ok) {
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
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">
            {t("commissionDeals.overview.invalid", { count: result.problems.length })}
          </p>
          <ul className="mt-2 space-y-1">
            {result.problems.map((problem, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-x-1.5 text-xs text-destructive"
              >
                <span>
                  •{" "}
                  {t(`commissionDeals.problems.${problem.problem}`, {
                    side: sideName(problem.side),
                  })}
                </span>
                {problem.side && onJumpToField && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = anchorForProblem(problem.side!, problem.problem);
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
      </section>
    );
  }

  const buyerNetCents = result.invoices
    .filter((invoice) => invoice.side === "buyer")
    .reduce((sum, invoice) => sum + invoice.totalNetCents, 0);
  const sellerNetCents = result.invoices
    .filter((invoice) => invoice.side === "seller")
    .reduce((sum, invoice) => sum + invoice.totalNetCents, 0);
  const totalNetCents = buyerNetCents + sellerNetCents;

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
      <dl className="mt-3 space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("commissionDeals.overview.buyerCommission")}</dt>
          <dd>{formatEUR(buyerNetCents / 100)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {t("commissionDeals.overview.sellerCommission")}
          </dt>
          <dd>{formatEUR(sellerNetCents / 100)}</dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-semibold text-brand-dark">
          <dt>{t("commissionDeals.overview.total")}</dt>
          <dd>{formatEUR(totalNetCents / 100)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 aria-hidden className="size-4 shrink-0" />
        {t("commissionDeals.overview.valid")}
      </div>
    </section>
  );
}
