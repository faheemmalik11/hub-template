import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Skeleton } from "../../ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { CompaniesAdapter } from "../../adapters/companies";
import { FieldErrorText, RequiredMark, validateCompanyForm } from "./company-form";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishCompaniesLabels, type CompaniesLabels } from "./labels";

const EMPTY_TOTALS = { totalAmount: 0, invoiceCount: 0 };

export interface CompanyListPageProps {
  adapter: CompaniesAdapter;
  labels?: CompaniesLabels;
  formatters?: Formatters;
}

export function CompanyListPage({
  adapter,
  labels = englishCompaniesLabels,
  formatters = englishFormatters,
}: CompanyListPageProps) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const companiesQuery = adapter.useCompanies({ includeArchived: showArchived });
  const totalsQuery = adapter.useCompanyInvoiceTotals();
  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data]);

  // Totals load separately from the list, so a row can render before its numbers are known.
  const totalsReady = totalsQuery.data !== undefined;
  const totals = totalsQuery.data ?? new Map<string, typeof EMPTY_TOTALS>();

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter(
      (company) => !term || `${company.code} ${company.name}`.toLowerCase().includes(term),
    );
  }, [companies, search]);

  const view = useTableView(filteredCompanies, {
    initialSort: "updatedAt",
    initialDirection: "desc",
    resetKey: `${search}|${showArchived}`,
    sortValue: (company, key) => {
      const companyTotals = totals.get(company.id) ?? EMPTY_TOTALS;
      switch (key) {
        case "name":
          return company.name ?? "";
        case "bookedTotal":
          return companyTotals.totalAmount;
        case "createdAt":
          return company.createdAt ?? "";
        case "updatedAt":
          return company.updatedAt ?? company.createdAt ?? "";
        default:
          return company.code ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "code", label: labels.list.columnCode },
    { value: "name", label: labels.list.columnName },
    { value: "bookedTotal", label: labels.list.columnBookedTotal },
    { value: "createdAt", label: labels.list.columnCreatedAt },
    { value: "updatedAt", label: labels.list.columnUpdatedAt },
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
        <NewCompanyDialog adapter={adapter} labels={labels} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.list.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="size-4"
          />
          {labels.list.showArchived}
        </label>
        <SortControl
          columns={sortColumns}
          sort={view.sort}
          direction={view.direction}
          onSort={view.setSort}
          onDirection={view.setDirection}
          labels={labels}
        />
      </div>

      {companiesQuery.isError ? (
        <div className="mt-4">
          <ErrorState error={companiesQuery.error} onRetry={() => companiesQuery.refetch()} />
        </div>
      ) : companiesQuery.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} columns={3} />
        </div>
      ) : (
        <>
          {/* Desktop/tablet: real table. Below sm, one card per company with the same fields. */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.list.columnCode}</TableHead>
                  <TableHead>{labels.list.columnName}</TableHead>
                  <TableHead className="text-right">{labels.list.columnBookedTotal}</TableHead>
                  <TableHead>{labels.list.columnCreatedAt}</TableHead>
                  <TableHead>{labels.list.columnUpdatedAt}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((company) => {
                  const companyTotals = totals.get(company.id) ?? EMPTY_TOTALS;
                  return (
                    <TableRow
                      key={company.id}
                      className={cn("cursor-pointer", company.archivedAt && "opacity-60")}
                      onClick={() => adapter.openCompany(company.id)}
                    >
                      <TableCell className="font-mono font-medium text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {company.code}
                          {company.archivedAt && (
                            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground">
                              {labels.list.archivedBadge}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-foreground">{company.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalsReady ? (
                          <>
                            <div className="font-medium text-foreground">
                              {formatters.formatMoney(companyTotals.totalAmount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {labels.list.invoiceCount(companyTotals.invoiceCount)}
                            </div>
                          </>
                        ) : (
                          <>
                            <Skeleton className="ml-auto h-4 w-24" />
                            <Skeleton className="ml-auto mt-1.5 h-3 w-16" />
                          </>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatters.formatDate(company.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatters.formatDate(company.updatedAt ?? company.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
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
              view.pageRows.map((company) => {
                const companyTotals = totals.get(company.id) ?? EMPTY_TOTALS;
                return (
                  <div
                    key={company.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={() => adapter.openCompany(company.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono font-medium text-foreground">{company.code}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{company.name}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {totalsReady ? (
                          <>
                            <div className="font-medium tabular-nums text-foreground">
                              {formatters.formatMoney(companyTotals.totalAmount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {labels.list.invoiceCount(companyTotals.invoiceCount)}
                            </div>
                          </>
                        ) : (
                          <>
                            <Skeleton className="ml-auto h-4 w-24" />
                            <Skeleton className="ml-auto mt-1.5 h-3 w-16" />
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                      <span>
                        {labels.list.columnCreatedAt}: {formatters.formatDate(company.createdAt)}
                      </span>
                      <span>
                        {labels.list.columnUpdatedAt}:{" "}
                        {formatters.formatDate(company.updatedAt ?? company.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {!companiesQuery.isError && !companiesQuery.isLoading && view.total > 0 && (
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

function NewCompanyDialog({
  adapter,
  labels,
}: {
  adapter: CompaniesAdapter;
  labels: CompaniesLabels;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);

  // Clear a field's error as soon as it is touched, not only on the next submit.
  const clearError = (field: string) =>
    setErrors((previous) => (previous[field] ? { ...previous, [field]: "" } : previous));

  async function create() {
    const validated = validateCompanyForm({ code, name }, labels.validation);
    if (Object.keys(validated.errors).length > 0) {
      setErrors(validated.errors);
      return;
    }
    setErrors({});
    setIsCreating(true);
    try {
      await adapter.createCompany({ code: validated.code, name: validated.name });
      toast.success(labels.list.createdToast);
      setCode("");
      setName("");
      setOpen(false);
    } catch (error) {
      toast.error(labels.list.createFailedToast(readableErrorMessage(error, "")));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {labels.list.newCompanyButton}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.list.newCompanyTitle}</DialogTitle>
          <DialogDescription>{labels.list.newCompanyDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {labels.list.codeFieldLabel} <RequiredMark title={labels.requiredFieldTitle} />
            </Label>
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                clearError("code");
              }}
              placeholder={labels.list.codeFieldPlaceholder}
              aria-invalid={!!errors.code}
            />
            <FieldErrorText text={errors.code} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {labels.list.nameFieldLabel} <RequiredMark title={labels.requiredFieldTitle} />
            </Label>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
              placeholder={labels.list.nameFieldPlaceholder}
              aria-invalid={!!errors.name}
            />
            <FieldErrorText text={errors.name} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {labels.list.cancel}
          </Button>
          <Button onClick={create} disabled={isCreating}>
            {isCreating ? labels.list.creating : labels.list.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
