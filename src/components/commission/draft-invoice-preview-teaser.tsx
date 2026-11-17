import type { CommissionResult } from "@/kit/lib/commission";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { ExternalLink, FileText } from "lucide-react";

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

  const invoices = result.ok ? result.invoices : [];
  const first = invoices[0] ?? null;
  const totalGrossCents = invoices.reduce((sum, invoice) => sum + invoice.totalGrossCents, 0);
  const totalNetCents = invoices.reduce((sum, invoice) => sum + invoice.totalNetCents, 0);
  const totalVatCents = invoices.reduce((sum, invoice) => sum + invoice.totalVatCents, 0);
  const moreCount = invoices.length - 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <FileText aria-hidden className="size-4" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            {t("commissionDeals.draftsSummary.title")}
          </h3>
        </div>
        <Button variant="outline" size="sm" onClick={onViewPreview}>
          <ExternalLink className="size-3.5" />
          {t("commissionDeals.drafts.viewPreview")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("commissionDeals.drafts.hint")}</p>
      {first ? (
        <div className="mt-3 space-y-1 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-foreground">
              {customerName(first.payerKey) ?? t("commissionDeals.drafts.unknownCustomer")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`commissionDeals.side.${first.side}`)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-foreground">
            <span>{t("commissionDeals.drafts.total")}</span>
            <span>{euros(totalGrossCents)}</span>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {t("commissionDeals.drafts.vatLine", {
              net: euros(totalNetCents),
              vat: euros(totalVatCents),
            })}
          </div>
          {moreCount > 0 && (
            <div className="text-right text-xs text-muted-foreground">
              {t("commissionDeals.draftsSummary.moreCount", { count: moreCount })}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t("commissionDeals.drafts.notReady")}</p>
      )}
    </section>
  );
}
