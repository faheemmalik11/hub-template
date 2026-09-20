import { useMemo } from "react";

import { Skeleton } from "../../ui/skeleton";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import type { InvoiceListAdapter, InvoiceListConfig } from "../../adapters/invoice-list";
import type { OutgoingInvoiceLabels } from "../../components/invoice-review/OutgoingInvoiceFlag";
import type { ReviewBadgeLabels } from "../../components/invoice-review/ReviewBadge";
import {
  InvoiceCards,
  InvoiceFilterBar,
  InvoiceTable,
  QueueCardsWidget,
  defaultInvoiceColumns,
  useInvoiceListView,
  type InvoiceColumn,
} from "../../widgets/invoice-list";
import { englishInvoiceListLabels, type InvoiceListLabels } from "./labels";

export interface InvoiceListPageProps {
  adapter: InvoiceListAdapter;
  config: InvoiceListConfig;
  labels?: InvoiceListLabels;
  reviewLabels?: ReviewBadgeLabels;
  outgoingLabels?: OutgoingInvoiceLabels;
  /** Replace the table's columns entirely. Defaults to the standard set. */
  columns?: (context: {
    adapter: InvoiceListAdapter;
    labels: InvoiceListLabels;
    reviewLabels: ReviewBadgeLabels;
    outgoingLabels: OutgoingInvoiceLabels;
  }) => InvoiceColumn[];
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
  columns,
}: InvoiceListPageProps) {
  const invoicesQuery = adapter.useInvoices();
  const companyOptionsQuery = adapter.useCompanyOptions?.();

  const allRows = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  const view = useInvoiceListView(allRows, config.queueCards);

  const context = { adapter, labels, reviewLabels, outgoingLabels };
  const tableColumns = columns
    ? columns(context)
    : defaultInvoiceColumns(context, {
        showConfidence: config.showConfidence ?? true,
        showBankMatch: config.showBankMatch ?? true,
      });

  const sortColumns = [
    { value: "issuer", label: labels.columnIssuer },
    { value: "amount", label: labels.columnAmount },
    { value: "documentDate", label: labels.columnDate },
    { value: "dueDate", label: labels.columnDueOn("") },
  ];

  const heading = config.direction === "incoming" ? labels.incoming : labels.outgoing;

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {heading.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{heading.subtitle}</p>
      </div>

      <QueueCardsWidget
        adapter={adapter}
        specs={config.queueCards}
        activeKey={view.activeQueueCard}
        onToggle={view.toggleQueueCard}
        className="mt-6"
      />

      <InvoiceFilterBar
        search={view.search}
        onSearch={view.setSearch}
        company={view.company}
        onCompany={view.setCompany}
        companyOptions={companyOptionsQuery?.data ?? []}
        sortColumns={sortColumns}
        sort={view.sort}
        onSort={view.setSort}
        direction={view.direction}
        onDirection={view.setDirection}
        labels={labels}
        className="mt-6 flex flex-wrap items-center justify-between gap-3"
      />

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
          <InvoiceTable
            rows={view.pageRows}
            columns={tableColumns}
            emptyText={labels.empty}
            onOpen={adapter.openInvoice}
            className="mt-4 hidden sm:block"
          />
          <InvoiceCards
            rows={view.pageRows}
            adapter={adapter}
            labels={labels}
            outgoingLabels={outgoingLabels}
            emptyText={labels.empty}
            className="mt-4 space-y-3 sm:hidden"
          />
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

export function InvoiceListLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
