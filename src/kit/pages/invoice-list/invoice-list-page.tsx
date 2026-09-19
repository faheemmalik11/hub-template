import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "../../ui/input";
import { Combobox } from "../../ui/combobox";
import { Skeleton } from "../../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { QueueKpiRow, type QueueCard } from "../../components/invoice-queue";
import { cn } from "../../lib/class-names";
import type {
  InvoiceListAdapter,
  InvoiceListConfig,
  InvoiceListRow,
} from "../../adapters/invoice-list";
import {
  isOutgoingInvoice,
  OutgoingInvoiceBadge,
  type OutgoingInvoiceLabels,
} from "../../components/invoice-review/OutgoingInvoiceFlag";
import { reviewReasonIds, hasNoReviewChecks } from "../../components/invoice-review/review";
import { ReviewBadge, type ReviewBadgeLabels } from "../../components/invoice-review/ReviewBadge";
import { ConfidenceBadge, VatBadge, PaymentBadge, CompanyChip, BankMatchBadge } from "./badges";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishInvoiceListLabels, type InvoiceListLabels } from "./labels";

export interface InvoiceListPageProps {
  adapter: InvoiceListAdapter;
  config: InvoiceListConfig;
  labels?: InvoiceListLabels;
  reviewLabels?: ReviewBadgeLabels;
  outgoingLabels?: OutgoingInvoiceLabels;
}

const DEFAULT_REVIEW_LABELS: ReviewBadgeLabels = {
  none: "Reviewed",
  duplicate: "Duplicate",
  excluded: "Excluded",
  alreadyPaid: "Already paid",
  needed: "Needs review",
};

const DEFAULT_OUTGOING_LABELS: OutgoingInvoiceLabels = {
  banner: (issuer, recipient) => `Outgoing invoice: from ${issuer} to ${recipient}.`,
  bannerShort: "Outgoing",
  unknownIssuer: "unknown issuer",
  unknownRecipient: "unknown recipient",
};

export function InvoiceListPage({
  adapter,
  config,
  labels = englishInvoiceListLabels,
  reviewLabels = DEFAULT_REVIEW_LABELS,
  outgoingLabels = DEFAULT_OUTGOING_LABELS,
}: InvoiceListPageProps) {
  const invoicesQuery = adapter.useInvoices();
  const queueCardsQuery = adapter.useQueueCards?.();
  const companyOptionsQuery = adapter.useCompanyOptions?.();

  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<string>("");
  const [activeQueueCard, setActiveQueueCard] = useState<string | null>(null);

  const rows = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

  const queueCards: QueueCard[] = useMemo(() => {
    if (!config.queueCards || !queueCardsQuery?.data) return [];
    const counts = new Map(queueCardsQuery.data.map((c) => [c.key, c]));
    return config.queueCards
      .filter((spec) => counts.has(spec.key))
      .map((spec) => {
        const counted = counts.get(spec.key)!;
        return {
          key: spec.key,
          label: spec.key,
          description: "",
          count: String(counted.count),
          amount: adapter.formatMoney(counted.amount),
          tone: spec.tone,
          icon: spec.icon,
          active: activeQueueCard === spec.key,
          onSelect: () => setActiveQueueCard((prev) => (prev === spec.key ? null : spec.key)),
        };
      });
  }, [config.queueCards, queueCardsQuery?.data, activeQueueCard, adapter]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const activeCardSpec = config.queueCards?.find((c) => c.key === activeQueueCard);
    return rows.filter((row) => {
      if (company && row.companyCode !== company) return false;
      if (activeCardSpec && !activeCardSpec.filter(row)) return false;
      if (!term) return true;
      return `${row.issuer ?? ""} ${row.invoiceNumber ?? ""}`.toLowerCase().includes(term);
    });
  }, [rows, search, company, activeQueueCard, config.queueCards]);

  const view = useTableView(filteredRows, {
    initialSort: "documentDate",
    initialDirection: "desc",
    resetKey: `${search}|${company}|${activeQueueCard}`,
    sortValue: (row, key) => {
      switch (key) {
        case "issuer":
          return row.issuer ?? "";
        case "amount":
          return row.amountGross ?? 0;
        case "dueDate":
          return row.dueDate ?? "";
        default:
          return row.documentDate ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "issuer", label: labels.columnIssuer },
    { value: "amount", label: labels.columnAmount },
    { value: "documentDate", label: labels.columnDate },
    { value: "dueDate", label: labels.columnDueOn("") },
  ];

  const companyOptions = companyOptionsQuery?.data ?? [];
  const heading = config.direction === "incoming" ? labels.incoming : labels.outgoing;
  const showBankMatch = config.showBankMatch ?? true;
  const showConfidence = config.showConfidence ?? true;

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {heading.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{heading.subtitle}</p>
      </div>

      {queueCards.length > 0 && (
        <QueueKpiRow cards={queueCards} loading={queueCardsQuery?.loading} className="mt-6" />
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        {companyOptions.length > 0 && (
          <Combobox
            value={company}
            onValueChange={setCompany}
            className="w-full sm:w-48"
            options={[
              { value: "", label: labels.companyAll },
              ...companyOptions.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
            ]}
          />
        )}
        <SortControl
          columns={sortColumns}
          sort={view.sort}
          direction={view.direction}
          onSort={view.setSort}
          onDirection={view.setDirection}
          labels={labels}
        />
      </div>

      {invoicesQuery.error ? (
        <div className="mt-4">
          <ErrorState error={invoicesQuery.error} onRetry={() => {}} />
        </div>
      ) : invoicesQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} columns={7} />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.columnIssuer}</TableHead>
                  <TableHead>{labels.columnCompany}</TableHead>
                  <TableHead className="text-right">{labels.columnAmount}</TableHead>
                  <TableHead>{labels.columnDate}</TableHead>
                  {showConfidence && <TableHead>{labels.columnConfidence}</TableHead>}
                  <TableHead>{labels.columnReview}</TableHead>
                  <TableHead>{labels.columnPayment}</TableHead>
                  {showBankMatch && <TableHead>{labels.columnBankMatch}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((row) => (
                  <InvoiceRow
                    key={row.id}
                    row={row}
                    adapter={adapter}
                    labels={labels}
                    reviewLabels={reviewLabels}
                    outgoingLabels={outgoingLabels}
                    showBankMatch={showBankMatch}
                    showConfidence={showConfidence}
                  />
                ))}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      {labels.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {view.total === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {labels.empty}
              </p>
            ) : (
              view.pageRows.map((row) => (
                <InvoiceCard
                  key={row.id}
                  row={row}
                  adapter={adapter}
                  labels={labels}
                  outgoingLabels={outgoingLabels}
                />
              ))
            )}
          </div>
        </>
      )}

      {!invoicesQuery.error && !invoicesQuery.loading && view.total > 0 && (
        <TablePagination
          page={view.page}
          totalPages={view.totalPages}
          pageSize={view.pageSize}
          total={view.total}
          from={view.from}
          to={view.to}
          onPage={view.setPage}
          onPageSize={view.setPageSize}
        />
      )}
    </div>
  );
}

function InvoiceRow({
  row,
  adapter,
  labels,
  reviewLabels,
  outgoingLabels,
  showBankMatch,
  showConfidence,
}: {
  row: InvoiceListRow;
  adapter: InvoiceListAdapter;
  labels: InvoiceListLabels;
  reviewLabels: ReviewBadgeLabels;
  outgoingLabels: OutgoingInvoiceLabels;
  showBankMatch: boolean;
  showConfidence: boolean;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={() => adapter.openInvoice(row.id)}>
      <TableCell className="max-w-[280px]">
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
      </TableCell>
      <TableCell>
        <CompanyChip code={row.companyCode} placeholder="—" />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="block font-medium">{adapter.formatMoney(row.amountGross)}</span>
        <span className="mt-0.5 block">
          <VatBadge vatRate={row.vatRate} label={labels.vat} />
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
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
      </TableCell>
      {showConfidence && (
        <TableCell>
          <ConfidenceBadge
            score={row.confidenceScore}
            label={(score) =>
              score == null
                ? labels.confidenceUnknown
                : labels.confidenceScore(Math.round(score * 100))
            }
          />
        </TableCell>
      )}
      <TableCell>
        <ReviewBadge
          reasonCount={reviewReasonIds(row).length}
          unchecked={hasNoReviewChecks(row)}
          status={row.status}
          alreadyPaid={!!row.paidAt}
          labels={reviewLabels}
        />
      </TableCell>
      <TableCell>
        <PaymentBadge paidAt={row.paidAt} paidLabel={labels.paid} openLabel={labels.open} />
      </TableCell>
      {showBankMatch && (
        <TableCell>
          <BankMatchBadge
            hasConfirmed={row.hasConfirmedBankMatch}
            hasSuggested={row.hasSuggestedBankMatch}
            confirmedLabel={labels.bankMatchConfirmed}
            suggestedLabel={labels.bankMatchSuggested}
          />
        </TableCell>
      )}
    </TableRow>
  );
}

function InvoiceCard({
  row,
  adapter,
  labels,
  outgoingLabels,
}: {
  row: InvoiceListRow;
  adapter: InvoiceListAdapter;
  labels: InvoiceListLabels;
  outgoingLabels: OutgoingInvoiceLabels;
}) {
  return (
    <div
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
            {row.invoiceNumber ? labels.invoiceNumber(row.invoiceNumber) : labels.noInvoiceNumber}
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
  );
}

export function InvoiceListLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
