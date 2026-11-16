import { CheckCircle2 } from "lucide-react";

import type { CommissionResult } from "@/kit/lib/commission";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export function DealCommissionOverviewCard({ result }: { result: CommissionResult }) {
  const { t } = useTranslation();

  if (!result.ok) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          {t("commissionDeals.overview.title")}
        </h2>
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t("commissionDeals.overview.invalid", { count: result.problems.length })}
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
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.overview.title")}
      </h2>
      <dl className="mt-3 space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {t("commissionDeals.overview.buyerCommission")}
          </dt>
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
