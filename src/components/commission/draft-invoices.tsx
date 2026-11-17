import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { CommissionProblem, CommissionResult, CommissionSide } from "@/kit/lib/commission";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function euros(cents: number): string {
  return formatEUR(cents / 100);
}

function percent(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

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

export function DraftInvoices({
  result,
  customerName,
  onJumpToField,
}: {
  result: CommissionResult;
  customerName: (customerId: string) => string | undefined;
  onJumpToField?: (tab: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const sideName = (side: CommissionSide | null) => (side ? t(`commissionDeals.side.${side}`) : "");

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
        <div className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {t("commissionDeals.problems.title")}
            </p>
            <ul className="mt-2 space-y-1">
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
        </div>
      </div>
    );
  }

  const sum = result.invoices.reduce((total, invoice) => total + invoice.totalGrossCents, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 aria-hidden className="size-4 shrink-0" />
        {t("commissionDeals.drafts.valid")}
      </div>
      {result.invoices.map((invoice) => (
        <article
          key={`${invoice.side}-${invoice.payerKey}`}
          className="rounded-lg border border-border p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-foreground">
              {customerName(invoice.payerKey) ?? t("commissionDeals.drafts.unknownCustomer")}
            </span>
            <span className="text-xs text-muted-foreground">{sideName(invoice.side)}</span>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {t("commissionDeals.drafts.line")} ·{" "}
            {invoice.grossRatePercent === null
              ? t("commissionDeals.drafts.fixed")
              : t("commissionDeals.drafts.rate", { rate: percent(invoice.grossRatePercent) })}
            {invoice.sharePercent < 100 && (
              <div>
                {t("commissionDeals.drafts.share", {
                  share: percent(invoice.sharePercent),
                  total: euros(invoice.sideNetCents),
                })}
              </div>
            )}
          </div>
          <dl className="mt-3 space-y-1 text-sm tabular-nums">
            {invoice.discountGrossCents > 0 && (
              <>
                <div className="flex justify-between">
                  <dt>{t("commissionDeals.drafts.subtotal")}</dt>
                  <dd>{euros(invoice.lineGrossCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>
                    {t("commissionDeals.drafts.discount")}
                    {invoice.discountReason && ` (${invoice.discountReason})`}
                  </dt>
                  <dd>−{euros(invoice.discountGrossCents)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between font-semibold text-foreground">
              <dt>{t("commissionDeals.drafts.total")}</dt>
              <dd>{euros(invoice.totalGrossCents)}</dd>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {t("commissionDeals.drafts.vatLine", {
                net: euros(invoice.totalNetCents),
                vat: euros(invoice.totalVatCents),
              })}
            </div>
          </dl>
        </article>
      ))}
      <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold text-foreground">
        <span>{t("commissionDeals.drafts.sum")}</span>
        <span className="tabular-nums">{euros(sum)}</span>
      </div>
    </div>
  );
}
