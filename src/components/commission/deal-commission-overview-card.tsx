import { Calculator, CheckCircle2 } from "lucide-react";

import type {
  CommissionInvoiceDraft,
  CommissionResult,
  CommissionSide,
} from "@/kit/lib/commission";
import type { ReviewLine } from "@/kit/ui";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { CommissionProblemList, CommissionReviewLineList } from "./commission-problem-list";
import type { DealTab } from "./deal-tabs";

const UNKNOWN_FIGURE = "—";

function euros(cents: number): string {
  return formatEUR(cents / 100);
}

function percent(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

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
  customerName,
  onJumpToField,
  invoiced,
  reviewLines = [],
}: {
  result: CommissionResult;
  customerName: (customerId: string) => string | undefined;
  onJumpToField?: (tab: DealTab, id: string) => void;
  /** Once invoices already exist, "valid/invalid for creating invoices" no longer means
   *  anything — that already happened. Shows the figures only, no problems/valid messaging. */
  invoiced?: boolean;
  /** Nothing here blocks invoicing. The caller passes only the lines whose field it will let the
   *  reader edit, so a line never appears without a working way to act on it. */
  reviewLines?: readonly ReviewLine[];
}) {
  const { t } = useTranslation();
  const hasProblems = result.problems.length > 0;

  const invoicesOfSide = (side: CommissionSide) =>
    result.invoices.filter((invoice) => invoice.side === side);
  const buyerInvoices = invoicesOfSide("buyer");
  const sellerInvoices = invoicesOfSide("seller");
  const buyer = figuresOf(buyerInvoices, hasProblems);
  const seller = figuresOf(sellerInvoices, hasProblems);
  const total = figuresOf(result.invoices, hasProblems);

  const payerRows = (invoices: CommissionInvoiceDraft[]) =>
    invoices.length > 1 &&
    invoices.map((invoice) => (
      <tr key={`${invoice.side}-${invoice.payerKey}`}>
        <td className="py-1.5 pl-4 align-top text-xs leading-snug text-muted-foreground">
          <span>
            {customerName(invoice.payerKey) ?? t("commissionDeals.drafts.unknownCustomer")}
          </span>{" "}
          <span className="tabular-nums">
            {t("commissionDeals.overview.payerShare", { share: percent(invoice.sharePercent) })}
          </span>
          {invoice.discountGrossCents > 0 && (
            <div className="tabular-nums text-muted-foreground/70">
              {t("commissionDeals.overview.payerDiscount", {
                amount: `−${euros(invoice.discountGrossCents)}`,
              })}
            </div>
          )}
        </td>
        <td />
        <td />
        <td className="py-1.5 text-right align-top text-xs leading-snug text-muted-foreground tabular-nums">
          {euros(invoice.totalGrossCents)}
        </td>
      </tr>
    ));

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
            {payerRows(buyerInvoices)}
            <tr>
              <td className="py-1 text-muted-foreground">
                {t("commissionDeals.overview.sellerCommission")}
              </td>
              <td className="py-1 text-right text-xs text-muted-foreground">{seller.net}</td>
              <td className="py-1 text-right text-xs text-muted-foreground">{seller.vat}</td>
              <td className="py-1 text-right font-medium text-foreground">{seller.gross}</td>
            </tr>
            {payerRows(sellerInvoices)}
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

      {invoiced ? null : hasProblems ? (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs font-medium text-destructive">
            {t("commissionDeals.overview.invalid", { count: result.problems.length })}
          </p>
          <CommissionProblemList
            problems={result.problems}
            onJumpToField={onJumpToField}
            className="mt-1.5"
          />
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
          {t("commissionDeals.overview.valid")}
        </div>
      )}

      {reviewLines.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("commissionDeals.review.notBlockingTitle")}
          </p>
          <CommissionReviewLineList
            lines={reviewLines}
            onJumpToField={onJumpToField}
            className="mt-1.5"
          />
        </div>
      )}
    </section>
  );
}
