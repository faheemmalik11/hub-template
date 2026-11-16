import type { CommissionResult } from "@/kit/lib/commission";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { ExternalLink } from "lucide-react";

function euros(cents: number): string {
  return formatEUR(cents / 100);
}

export function DraftInvoicePreviewTeaser({
  result,
  customerName,
  onViewPreview,
}: {
  result: CommissionResult;
  customerName: (customerId: string) => string | undefined;
  onViewPreview: () => void;
}) {
  const { t } = useTranslation();

  const invoice = result.ok && result.invoices.length > 0 ? result.invoices[0] : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{t("commissionDeals.drafts.title")}</h3>
        <Button variant="outline" size="sm" onClick={onViewPreview}>
          <ExternalLink className="size-3.5" />
          {t("commissionDeals.drafts.viewPreview")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("commissionDeals.drafts.hint")}</p>
      {invoice ? (
        <div className="mt-3 space-y-1 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-foreground">
              {customerName(invoice.payerKey) ?? t("commissionDeals.drafts.unknownCustomer")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`commissionDeals.side.${invoice.side}`)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-foreground">
            <span>{t("commissionDeals.drafts.total")}</span>
            <span>{euros(invoice.totalGrossCents)}</span>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {t("commissionDeals.drafts.vatLine", {
              net: euros(invoice.totalNetCents),
              vat: euros(invoice.totalVatCents),
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t("commissionDeals.drafts.notReady")}</p>
      )}
    </section>
  );
}
