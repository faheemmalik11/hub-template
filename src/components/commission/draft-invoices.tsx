import type { CommissionResult, CommissionSide } from "@/kit/lib/commission";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function euros(cents: number): string {
  return formatEUR(cents / 100);
}

function percent(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

export function DraftInvoices({
  result,
  customerName,
}: {
  result: CommissionResult;
  customerName: (customerId: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const sideName = (side: CommissionSide | null) => (side ? t(`commissionDeals.side.${side}`) : "");

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4">
        <h3 className="text-sm font-medium text-foreground">
          {t("commissionDeals.problems.title")}
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {result.problems.map((problem, index) => (
            <li key={index}>
              {t(`commissionDeals.problems.${problem.problem}`, { side: sideName(problem.side) })}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const sum = result.invoices.reduce((total, invoice) => total + invoice.totalGrossCents, 0);
  return (
    <div className="space-y-3">
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
