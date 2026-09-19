import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "../../ui/input";
import { Skeleton } from "../../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  CustomerCompany,
  CustomerInvoiceTotals,
  CustomersAdapter,
} from "../../adapters/customers";
import { CompanyChip } from "./company-chip";
import { NewCustomerDialog } from "./new-customer-dialog";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishCustomersLabels, type CustomersLabels } from "./labels";

const NO_TOTALS: CustomerInvoiceTotals = { invoiceCount: 0, totalAmount: 0, overdueCount: 0 };

export interface CustomerListPageProps {
  adapter: CustomersAdapter;
  labels?: CustomersLabels;
  formatters?: Formatters;
}

export function CustomerListPage({
  adapter,
  labels = englishCustomersLabels,
  formatters = englishFormatters,
}: CustomerListPageProps) {
  const [searchInput, setSearchInput] = useState("");

  const customersQuery = adapter.useCustomers();
  const totalsQuery = adapter.useInvoiceTotalsByCustomer();
  const companiesQuery = adapter.useCompanies();
  const companyById = useMemo(
    () => new Map<string, CustomerCompany>((companiesQuery.data ?? []).map((c) => [c.id, c])),
    [companiesQuery.data],
  );

  // Totals load separately from the list, so they keep their own skeletons: a fabricated 0.00 reads as fact.
  const totalsReady = totalsQuery.data !== undefined;
  const totals = totalsQuery.data ?? {};

  // Search covers every column the table shows: name, email and company code.
  const filteredCustomers = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return customersQuery.data ?? [];
    return (customersQuery.data ?? []).filter((customer) =>
      [customer.name, customer.email, companyById.get(customer.companyId)?.code]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [customersQuery.data, searchInput, companyById]);

  const view = useTableView(filteredCustomers, {
    initialSort: "name",
    initialDirection: "asc",
    resetKey: searchInput,
    sortValue: (customer, key) => {
      const customerTotals = totals[customer.id] ?? NO_TOTALS;
      switch (key) {
        case "company":
          return companyById.get(customer.companyId)?.code ?? "";
        case "totalAmount":
          return customerTotals.totalAmount;
        case "invoiceCount":
          return customerTotals.invoiceCount;
        default:
          return customer.name ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "name", label: labels.list.columns.name },
    { value: "company", label: labels.list.columns.company },
    { value: "invoiceCount", label: labels.list.columns.invoices },
    { value: "totalAmount", label: labels.list.columns.amount },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.list.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.list.subtitle}</p>
        </div>
        <NewCustomerDialog adapter={adapter} labels={labels} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={labels.list.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <SortControl
          columns={sortColumns}
          sort={view.sort}
          direction={view.direction}
          onSort={view.setSort}
          onDirection={view.setDirection}
          labels={labels.sort}
        />
      </div>

      {customersQuery.isError ? (
        <div className="mt-4">
          <ErrorState error={customersQuery.error} onRetry={customersQuery.refetch} />
        </div>
      ) : customersQuery.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[200px]">{labels.list.columns.name}</TableHead>
                  <TableHead>{labels.list.columns.company}</TableHead>
                  <TableHead>{labels.list.columns.email}</TableHead>
                  <TableHead className="text-right">{labels.list.columns.invoices}</TableHead>
                  <TableHead className="text-right">{labels.list.columns.amount}</TableHead>
                  <TableHead className="text-right">{labels.list.columns.overdue}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((customer) => {
                  const customerTotals = totals[customer.id] ?? NO_TOTALS;
                  return (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer"
                      onClick={() => adapter.openCustomer(customer.id)}
                    >
                      <TableCell className="min-w-[200px] font-medium text-foreground">
                        {customer.name}
                      </TableCell>
                      <TableCell>
                        <CompanyChip
                          code={companyById.get(customer.companyId)?.code ?? null}
                          labels={labels.companyChip}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {customer.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalsReady ? (
                          customerTotals.invoiceCount
                        ) : (
                          <Skeleton className="ml-auto h-4 w-8" />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {totalsReady ? (
                          formatters.formatMoney(customerTotals.totalAmount)
                        ) : (
                          <Skeleton className="ml-auto h-4 w-24" />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {!totalsReady ? (
                          <Skeleton className="ml-auto h-4 w-8" />
                        ) : customerTotals.overdueCount > 0 ? (
                          <span className="text-destructive">{customerTotals.overdueCount}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {labels.list.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {view.total === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {labels.list.empty}
              </p>
            ) : (
              view.pageRows.map((customer) => {
                const customerTotals = totals[customer.id] ?? NO_TOTALS;
                return (
                  <div
                    key={customer.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={() => adapter.openCustomer(customer.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{customer.name}</div>
                        <div className="mt-1.5">
                          <CompanyChip
                            code={companyById.get(customer.companyId)?.code ?? null}
                            labels={labels.companyChip}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium tabular-nums text-foreground">
                          {totalsReady ? (
                            formatters.formatMoney(customerTotals.totalAmount)
                          ) : (
                            <Skeleton className="ml-auto h-4 w-24" />
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                          {labels.list.columns.invoices}:{" "}
                          {totalsReady ? (
                            customerTotals.invoiceCount
                          ) : (
                            <Skeleton className="h-3 w-6" />
                          )}
                        </div>
                      </div>
                    </div>
                    {customer.email && (
                      <p className="mt-2 truncate text-sm text-muted-foreground">
                        {customer.email}
                      </p>
                    )}
                    {totalsReady && customerTotals.overdueCount > 0 && (
                      <p className="mt-2 text-xs text-destructive">
                        {labels.list.columns.overdue}: {customerTotals.overdueCount}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {!customersQuery.isError && !customersQuery.isLoading && view.total > 0 && (
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
