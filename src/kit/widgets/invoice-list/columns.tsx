import type { ReactNode } from "react";

import { cn } from "../../lib/class-names";
import type { InvoiceListAdapter, InvoiceListRow } from "../../adapters/invoice-list";
import {
  OutgoingInvoiceBadge,
  type OutgoingInvoiceLabels,
} from "../../components/invoice-review/OutgoingInvoiceFlag";
import { reviewReasonIds, hasNoReviewChecks } from "../../components/invoice-review/review";
import { ReviewBadge, type ReviewBadgeLabels } from "../../components/invoice-review/ReviewBadge";
import {
  BankMatchBadge,
  CompanyChip,
  ConfidenceBadge,
  PaymentBadge,
  VatBadge,
} from "../../pages/invoice-list/badges";
import type { InvoiceListLabels } from "../../pages/invoice-list/labels";

export interface InvoiceColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: InvoiceListRow) => ReactNode;
}

export interface ColumnContext {
  adapter: InvoiceListAdapter;
  labels: InvoiceListLabels;
  reviewLabels: ReviewBadgeLabels;
  outgoingLabels: OutgoingInvoiceLabels;
}

export function issuerColumn({ labels, outgoingLabels }: ColumnContext): InvoiceColumn {
  return {
    key: "issuer",
    header: labels.columnIssuer,
    cellClassName: "max-w-[280px]",
    cell: (row) => (
      <>
        <div className="flex items-center gap-1.5">
          <div className="truncate font-medium text-foreground" title={row.issuer ?? ""}>
            {row.issuer ?? "—"}
          </div>
          <OutgoingInvoiceBadge
            invoice={{ extracted: row.extracted, issuer: row.issuer, recipient_name: null }}
            labels={outgoingLabels}
          />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.invoiceNumber ? labels.invoiceNumber(row.invoiceNumber) : labels.noInvoiceNumber}
          {row.costCategory ? ` · ${row.costCategory}` : ""}
        </div>
      </>
    ),
  };
}

export function companyColumn({ labels }: ColumnContext): InvoiceColumn {
  return {
    key: "company",
    header: labels.columnCompany,
    cell: (row) => <CompanyChip code={row.companyCode} placeholder="—" />,
  };
}

export function amountColumn({ adapter, labels }: ColumnContext): InvoiceColumn {
  return {
    key: "amount",
    header: labels.columnAmount,
    align: "right",
    cellClassName: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => (
      <>
        <span className="block font-medium">{adapter.formatMoney(row.amountGross)}</span>
        <span className="mt-0.5 block">
          <VatBadge vatRate={row.vatRate} label={labels.vat} />
        </span>
      </>
    ),
  };
}

export function dateColumn({ adapter, labels }: ColumnContext): InvoiceColumn {
  return {
    key: "documentDate",
    header: labels.columnDate,
    cellClassName: "whitespace-nowrap text-sm text-muted-foreground tabular-nums",
    cell: (row) => (
      <>
        <span className="block">{adapter.formatDate(row.documentDate)}</span>
        {row.dueDate && !row.paidAt && (
          <span
            className={cn(
              "block text-xs",
              new Date(row.dueDate) < new Date() && "text-destructive",
            )}
          >
            {labels.columnDueOn(adapter.formatDate(row.dueDate))}
          </span>
        )}
      </>
    ),
  };
}

export function confidenceColumn({ labels }: ColumnContext): InvoiceColumn {
  return {
    key: "confidence",
    header: labels.columnConfidence,
    cell: (row) => (
      <ConfidenceBadge
        score={row.confidenceScore}
        label={(score) =>
          score == null ? labels.confidenceUnknown : labels.confidenceScore(Math.round(score * 100))
        }
      />
    ),
  };
}

export function reviewColumn({ labels, reviewLabels }: ColumnContext): InvoiceColumn {
  return {
    key: "review",
    header: labels.columnReview,
    cell: (row) => (
      <ReviewBadge
        reasonCount={reviewReasonIds(row).length}
        unchecked={hasNoReviewChecks(row)}
        status={row.status}
        alreadyPaid={!!row.paidAt}
        labels={reviewLabels}
      />
    ),
  };
}

export function paymentColumn({ labels }: ColumnContext): InvoiceColumn {
  return {
    key: "payment",
    header: labels.columnPayment,
    cell: (row) => (
      <PaymentBadge paidAt={row.paidAt} paidLabel={labels.paid} openLabel={labels.open} />
    ),
  };
}

export function bankMatchColumn({ labels }: ColumnContext): InvoiceColumn {
  return {
    key: "bankMatch",
    header: labels.columnBankMatch,
    cell: (row) => (
      <BankMatchBadge
        hasConfirmed={row.hasConfirmedBankMatch}
        hasSuggested={row.hasSuggestedBankMatch}
        confirmedLabel={labels.bankMatchConfirmed}
        suggestedLabel={labels.bankMatchSuggested}
      />
    ),
  };
}

export function defaultInvoiceColumns(
  context: ColumnContext,
  options: { showConfidence?: boolean; showBankMatch?: boolean } = {},
): InvoiceColumn[] {
  const { showConfidence = true, showBankMatch = true } = options;
  return [
    issuerColumn(context),
    companyColumn(context),
    amountColumn(context),
    dateColumn(context),
    ...(showConfidence ? [confidenceColumn(context)] : []),
    reviewColumn(context),
    paymentColumn(context),
    ...(showBankMatch ? [bankMatchColumn(context)] : []),
  ];
}
