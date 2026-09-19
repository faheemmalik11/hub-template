import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
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
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  PropertiesAdapter,
  Property,
  PropertyCompany,
  PropertyVatStatus,
} from "../../adapters/properties";
import { CompanyChip } from "./badges";
import { CompanyAssignmentField } from "./company-assignment-field";
import { FieldErrorText, RequiredMark } from "./form-field";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishPropertiesLabels, type PropertiesLabels } from "./labels";

const NONE = "__none";
const VAT_STATUS_OPTIONS: PropertyVatStatus[] = ["taxable", "taxExempt", "mixed"];

export interface PropertyListPageProps {
  adapter: PropertiesAdapter;
  labels?: PropertiesLabels;
  formatters?: Formatters;
  /** Opens the create dialog pre-filled with this code (deep link from other screens). */
  initialCreateCode?: string;
  /** Called once the pre-filled code was applied, so the host can clear its URL parameter. */
  onInitialCreateCodeConsumed?: () => void;
}

export function PropertyListPage({
  adapter,
  labels = englishPropertiesLabels,
  formatters = englishFormatters,
  initialCreateCode,
  onInitialCreateCodeConsumed,
}: PropertyListPageProps) {
  const propertiesQuery = adapter.useProperties();
  const totalsQuery = adapter.useInvoiceTotalsByPropertyId();
  const companiesQuery = adapter.useCompanies();
  const companyIdsQuery = adapter.useCompanyIdsByPropertyId();
  const [searchInput, setSearchInput] = useState("");

  const companyById = useMemo(
    () => new Map((companiesQuery.data ?? []).map((company) => [company.id, company])),
    [companiesQuery.data],
  );

  const companiesByPropertyId = useMemo(() => {
    const result = new Map<string, PropertyCompany[]>();
    for (const [propertyId, companyIds] of Object.entries(companyIdsQuery.data ?? {})) {
      const list: PropertyCompany[] = [];
      for (const companyId of companyIds) {
        const company = companyById.get(companyId);
        if (company && !list.some((entry) => entry.code === company.code)) list.push(company);
      }
      list.sort((left, right) => left.code.localeCompare(right.code));
      result.set(propertyId, list);
    }
    return result;
  }, [companyIdsQuery.data, companyById]);

  const totals = totalsQuery.data ?? {};

  // Wait for every query that feeds a visible cell, so real rows never paint with zero totals.
  const isLoading =
    propertiesQuery.isLoading ||
    totalsQuery.isLoading ||
    companiesQuery.isLoading ||
    companyIdsQuery.isLoading;

  const filtered = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    return (propertiesQuery.data ?? []).filter(
      (property) =>
        !term ||
        `${property.code} ${property.name ?? ""} ${property.address ?? ""}`
          .toLowerCase()
          .includes(term),
    );
  }, [propertiesQuery.data, searchInput]);

  const view = useTableView(filtered, {
    initialSort: "updatedAt",
    initialDirection: "desc",
    resetKey: searchInput,
    sortValue: (property, key) => {
      const propertyTotals = totals[property.id] ?? { bookedAmount: 0, invoiceCount: 0 };
      switch (key) {
        case "company":
          return (companiesByPropertyId.get(property.id) ?? [])
            .map((company) => company.code)
            .join(",");
        case "booked":
          return propertyTotals.bookedAmount;
        case "createdAt":
          return property.createdAt ?? "";
        case "updatedAt":
          return property.updatedAt ?? property.createdAt ?? "";
        default:
          return property.code ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "code", label: labels.list.columns.property },
    { value: "company", label: labels.list.columns.company },
    { value: "booked", label: labels.list.columns.booked },
    { value: "createdAt", label: labels.list.columns.createdAt },
    { value: "updatedAt", label: labels.list.columns.updatedAt },
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
        <NewPropertyDialog
          adapter={adapter}
          labels={labels}
          initialCode={initialCreateCode}
          onInitialCodeConsumed={onInitialCreateCodeConsumed}
        />
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

      {propertiesQuery.isError ? (
        <div className="mt-4">
          <ErrorState error={propertiesQuery.error} onRetry={() => propertiesQuery.refetch()} />
        </div>
      ) : isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} columns={3} />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.list.columns.property}</TableHead>
                  <TableHead>{labels.list.columns.company}</TableHead>
                  <TableHead className="text-right">{labels.list.columns.booked}</TableHead>
                  <TableHead>{labels.list.columns.createdAt}</TableHead>
                  <TableHead>{labels.list.columns.updatedAt}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((property) => {
                  const companies = companiesByPropertyId.get(property.id) ?? [];
                  const propertyTotals = totals[property.id] ?? {
                    bookedAmount: 0,
                    invoiceCount: 0,
                  };
                  return (
                    <TableRow
                      key={property.id}
                      className="cursor-pointer"
                      onClick={() => adapter.openProperty(property.code)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          <span className="font-mono">{property.code}</span>
                          {property.name ? (
                            <span className="ml-2 font-sans">{property.name}</span>
                          ) : null}
                        </div>
                        {property.address ? (
                          <div className="text-xs text-muted-foreground">{property.address}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {companies.length ? (
                          <div className="flex flex-wrap gap-1">
                            {companies.map((company) => (
                              <CompanyChip
                                key={company.code}
                                code={company.code}
                                labels={labels.companyChip}
                              />
                            ))}
                          </div>
                        ) : (
                          <CompanyChip code={null} labels={labels.companyChip} />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="font-medium text-foreground">
                          {formatters.formatMoney(propertyTotals.bookedAmount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {labels.list.invoiceCount(propertyTotals.invoiceCount)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatters.formatDate(property.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatters.formatDate(property.updatedAt ?? property.createdAt)}
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

          <div className="mt-6 space-y-3 sm:hidden">
            {view.pageRows.map((property) => {
              const companies = companiesByPropertyId.get(property.id) ?? [];
              const propertyTotals = totals[property.id] ?? { bookedAmount: 0, invoiceCount: 0 };
              return (
                <div
                  key={property.id}
                  className="cursor-pointer rounded-xl border border-border bg-card p-4"
                  onClick={() => adapter.openProperty(property.code)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        <span className="font-mono">{property.code}</span>
                        {property.name ? (
                          <span className="ml-2 font-sans">{property.name}</span>
                        ) : null}
                      </div>
                      {property.address ? (
                        <div className="text-xs text-muted-foreground">{property.address}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="font-medium text-foreground">
                        {formatters.formatMoney(propertyTotals.bookedAmount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {labels.list.invoiceCount(propertyTotals.invoiceCount)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {companies.length ? (
                      companies.map((company) => (
                        <CompanyChip
                          key={company.code}
                          code={company.code}
                          labels={labels.companyChip}
                        />
                      ))
                    ) : (
                      <CompanyChip code={null} labels={labels.companyChip} />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <span>
                      {labels.list.columns.createdAt}: {formatters.formatDate(property.createdAt)}
                    </span>
                    <span>
                      {labels.list.columns.updatedAt}:{" "}
                      {formatters.formatDate(property.updatedAt ?? property.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
            {view.total === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {labels.list.empty}
              </p>
            )}
          </div>
        </>
      )}

      {!propertiesQuery.isError && !isLoading && view.total > 0 && (
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

function NewPropertyDialog({
  adapter,
  labels,
  initialCode,
  onInitialCodeConsumed,
}: {
  adapter: PropertiesAdapter;
  labels: PropertiesLabels;
  initialCode?: string;
  onInitialCodeConsumed?: () => void;
}) {
  const createLabels = labels.list.create;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [vatStatus, setVatStatus] = useState(NONE);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [companyError, setCompanyError] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const companiesQuery = adapter.useCompanies();

  // The list behind this dialog is already loaded, so the duplicate check costs no extra request.
  const propertiesQuery = adapter.useProperties();
  const takenCodes = useMemo(
    () => new Set((propertiesQuery.data ?? []).map((property) => property.code.toLowerCase())),
    [propertiesQuery.data],
  );

  // Deep link: open pre-filled with the code, then tell the host so it does not reopen.
  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setOpen(true);
      onInitialCodeConsumed?.();
    }
  }, [initialCode, onInitialCodeConsumed]);

  function reset() {
    setCode("");
    setName("");
    setAddress("");
    setVatStatus(NONE);
    setCompanyIds([]);
    setCompanyError(false);
    setCodeError("");
  }

  function validateCode(value: string): string {
    if (!value) return createLabels.codeRequired;
    if (value.length > 32) return createLabels.codeTooLong;
    if (takenCodes.has(value.toLowerCase())) return createLabels.codeTaken;
    return "";
  }

  async function create() {
    // Point at the offending fields instead of a vanishing toast; report both problems at once.
    const trimmedCode = code.trim();
    const codeProblem = validateCode(trimmedCode);
    const missingCompany = companyIds.length === 0;
    if (codeProblem || missingCompany) {
      setCodeError(codeProblem);
      setCompanyError(missingCompany);
      return;
    }
    setCodeError("");
    // Sequential and reported separately: if creation succeeds but linking companies fails,
    // the property already exists, so that reads as "created, but needs a company".
    let created: Property | null = null;
    setIsSaving(true);
    try {
      created = await adapter.createProperty({
        code: trimmedCode,
        name: name.trim() || null,
        address: address.trim() || null,
        vatStatus: vatStatus === NONE ? null : (vatStatus as PropertyVatStatus),
      });
      await adapter.setPropertyCompanies({ propertyId: created.id, companyIds });
      toast.success(createLabels.created);
      reset();
      setOpen(false);
    } catch (error) {
      const message = readableErrorMessage(error, "");
      if (created) {
        toast.error(createLabels.createdWithoutCompany(created.code, message));
        reset();
        setOpen(false);
      } else {
        toast.error(createLabels.createFailed(message));
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        // A dialog reopened after a failed attempt should not still show the old message.
        if (nextOpen) {
          setCodeError("");
          setCompanyError(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {createLabels.button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createLabels.title}</DialogTitle>
          <DialogDescription>{createLabels.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {createLabels.codeLabel} <RequiredMark title={labels.requiredFieldTitle} />
            </Label>
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setCodeError("");
              }}
              placeholder={createLabels.codePlaceholder}
              aria-invalid={!!codeError}
            />
            <FieldErrorText text={codeError} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{createLabels.nameLabel}</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={createLabels.namePlaceholder}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{createLabels.addressLabel}</Label>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={createLabels.addressPlaceholder}
            />
          </div>
          <CompanyAssignmentField
            values={companyIds}
            onValuesChange={(ids) => {
              setCompanyError(false);
              setCompanyIds(ids);
            }}
            companies={companiesQuery.data ?? []}
            labels={labels.companyAssignment}
            requiredFieldTitle={labels.requiredFieldTitle}
            error={companyError}
          />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{createLabels.vatStatusLabel}</Label>
            <Combobox
              value={vatStatus}
              onValueChange={setVatStatus}
              placeholder="—"
              options={[
                { value: NONE, label: labels.noneOption },
                ...VAT_STATUS_OPTIONS.map((status) => ({
                  value: status,
                  label: labels.vatStatus[status],
                })),
              ]}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {createLabels.cancel}
          </Button>
          <Button onClick={() => void create()} disabled={isSaving}>
            {isSaving ? createLabels.submitting : createLabels.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
