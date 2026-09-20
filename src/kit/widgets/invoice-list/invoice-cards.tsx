import type { InvoiceListAdapter, InvoiceListRow } from "../../adapters/invoice-list";
import {
  isOutgoingInvoice,
  OutgoingInvoiceBadge,
  type OutgoingInvoiceLabels,
} from "../../components/invoice-review/OutgoingInvoiceFlag";
import { CompanyChip, PaymentBadge } from "../../pages/invoice-list/badges";
import type { InvoiceListLabels } from "../../pages/invoice-list/labels";

export interface InvoiceCardsProps {
  rows: InvoiceListRow[];
  adapter: InvoiceListAdapter;
  labels: InvoiceListLabels;
  outgoingLabels: OutgoingInvoiceLabels;
  emptyText: string;
  className?: string;
}

export function InvoiceCards({
  rows,
  adapter,
  labels,
  outgoingLabels,
  emptyText,
  className,
}: InvoiceCardsProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className={className}>
      {rows.map((row) => (
        <div
          key={row.id}
          className="cursor-pointer rounded-xl border border-border bg-card p-4"
          onClick={() => adapter.openInvoice(row.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="truncate font-medium text-foreground">{row.issuer ?? "—"}</div>
                {isOutgoingInvoice(row) && (
                  <OutgoingInvoiceBadge
                    invoice={{ extracted: row.extracted, issuer: row.issuer, recipient_name: null }}
                    labels={outgoingLabels}
                  />
                )}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {row.invoiceNumber
                  ? labels.invoiceNumber(row.invoiceNumber)
                  : labels.noInvoiceNumber}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-medium tabular-nums text-foreground">
                {adapter.formatMoney(row.amountGross)}
              </div>
              <div className="text-xs text-muted-foreground">
                {adapter.formatDate(row.documentDate)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <CompanyChip code={row.companyCode} placeholder="—" />
            <PaymentBadge paidAt={row.paidAt} paidLabel={labels.paid} openLabel={labels.open} />
          </div>
        </div>
      ))}
    </div>
  );
}
