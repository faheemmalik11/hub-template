import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Pencil, Plus, TriangleAlert } from "lucide-react";
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
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  PropertiesAdapter,
  Property,
  PropertyChanges,
  PropertyCompany,
  PropertyVatStatus,
} from "../../adapters/properties";
import { CompanyChip, InvoiceStatusBadge, VatBadge } from "./badges";
import { CompanyAssignmentField } from "./company-assignment-field";
import { NameVariantsCard } from "./name-variants-card";
import { useInfiniteRows } from "./use-infinite-rows";
import { englishPropertiesLabels, type PropertiesLabels } from "./labels";

const NONE = "__none";
const VAT_STATUS_OPTIONS: PropertyVatStatus[] = ["taxable", "taxExempt", "mixed"];

interface EditForm {
  name: string;
  address: string;
  vatStatus: string;
  companyIds: string[];
}

function editFormFrom(property: Property, companyIds: string[]): EditForm {
  return {
    name: property.name ?? "",
    address: property.address ?? "",
    vatStatus: property.vatStatus ?? NONE,
    companyIds,
  };
}

export interface PropertyDetailPageProps {
  propertyCode: string;
  adapter: PropertiesAdapter;
  labels?: PropertiesLabels;
  formatters?: Formatters;
}

export function PropertyDetailPage({
  propertyCode,
  adapter,
  labels = englishPropertiesLabels,
  formatters = englishFormatters,
}: PropertyDetailPageProps) {
  const detailLabels = labels.detail;
  const propertyQuery = adapter.useProperty(propertyCode);
  const companiesQuery = adapter.useCompanies();
  const companyIdsQuery = adapter.useCompanyIdsByPropertyId();
  const invoicesQuery = adapter.usePropertyInvoices(propertyCode);

  const property = propertyQuery.data ?? null;

  const invoices = useMemo(
    () =>
      (invoicesQuery.data ?? [])
        .slice()
        .sort((left, right) => (right.documentDate ?? "").localeCompare(left.documentDate ?? "")),
    [invoicesQuery.data],
  );
  // Rendered a page at a time; the aggregates below still see every row.
  const invoicePage = useInfiniteRows(invoices, 25);

  const bookedTotal = invoices.reduce((sum, invoice) => sum + (invoice.amountGross ?? 0), 0);

  const [editOpen, setEditOpen] = useState(false);
  const [formState, setFormState] = useState<EditForm | null>(null);
  const [companyError, setCompanyError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (invoicesQuery.isError) {
    return <ErrorState error={invoicesQuery.error} onRetry={() => invoicesQuery.refetch()} />;
  }

  // The property's companies come from the direct, possibly multi-valued assignment.
  const companyById = new Map((companiesQuery.data ?? []).map((company) => [company.id, company]));
  const companies: PropertyCompany[] = [];
  if (property) {
    for (const companyId of companyIdsQuery.data?.[property.id] ?? []) {
      const company = companyById.get(companyId);
      if (company && !companies.some((entry) => entry.code === company.code))
        companies.push(company);
    }
    companies.sort((left, right) => left.code.localeCompare(right.code));
  }
  const currentCompanyIds = companies.map((company) => company.id);

  // Warn only where an explicit assignment exists and the invoice disagrees with it.
  const assignedCodes = new Set(companies.map((company) => company.code));
  const companyMismatch = (invoiceCompanyCode: string | null) =>
    !!invoiceCompanyCode && assignedCodes.size > 0 && !assignedCodes.has(invoiceCompanyCode);
  const mismatchCount = invoices.filter((invoice) => companyMismatch(invoice.companyCode)).length;

  const form = formState ?? (property ? editFormFrom(property, currentCompanyIds) : null);
  const setFormValue = (key: "name" | "address" | "vatStatus", value: string) =>
    setFormState((previous) => ({
      ...(previous ?? (property ? editFormFrom(property, currentCompanyIds) : ({} as EditForm))),
      [key]: value,
    }));
  const setCompanyIds = (ids: string[]) => {
    setCompanyError(false);
    setFormState((previous) => ({
      ...(previous ?? (property ? editFormFrom(property, currentCompanyIds) : ({} as EditForm))),
      companyIds: ids,
    }));
  };

  function startEditing() {
    if (property) setFormState(editFormFrom(property, currentCompanyIds));
    setCompanyError(false);
    setEditOpen(true);
  }
  function cancelEditing() {
    setFormState(null);
    setCompanyError(false);
    setEditOpen(false);
  }
  async function save() {
    if (!property || !form) return;
    if (form.companyIds.length === 0) {
      setCompanyError(true);
      return;
    }
    const changes: PropertyChanges = {};
    const name = form.name.trim() || null;
    const address = form.address.trim() || null;
    const vatStatus = form.vatStatus === NONE ? null : (form.vatStatus as PropertyVatStatus);
    if (name !== (property.name ?? null)) changes.name = name;
    if (address !== (property.address ?? null)) changes.address = address;
    if (vatStatus !== (property.vatStatus ?? null)) changes.vatStatus = vatStatus;
    const companiesChanged =
      form.companyIds.slice().sort().join(",") !== currentCompanyIds.slice().sort().join(",");
    if (Object.keys(changes).length === 0 && !companiesChanged) {
      toast.info(detailLabels.noChanges);
      setEditOpen(false);
      return;
    }
    // Sequential, not parallel: on a partial failure the user needs to know which half went through.
    let fieldsSaved = false;
    setIsSaving(true);
    try {
      if (Object.keys(changes).length > 0) {
        await adapter.updateProperty({ propertyId: property.id, changes });
      }
      fieldsSaved = true;
      if (companiesChanged) {
        await adapter.setPropertyCompanies({
          propertyId: property.id,
          companyIds: form.companyIds,
        });
      }
      toast.success(detailLabels.saved);
      setFormState(null);
      setEditOpen(false);
    } catch (error) {
      const message = readableErrorMessage(error, "");
      toast.error(
        fieldsSaved ? detailLabels.partiallySaved(message) : detailLabels.saveFailed(message),
      );
      // The dialog stays open either way so the user can retry the part that failed.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => adapter.openPropertyList()}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {detailLabels.back}
      </button>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-brand-wash text-brand-dark">
            <Building2 className="size-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <span className="font-mono">{propertyCode}</span>
            {property?.name ? <span className="ml-2 font-sans">{property.name}</span> : null}
          </h1>
          {companies.map((company) => (
            <CompanyChip key={company.code} code={company.code} labels={labels.companyChip} />
          ))}
        </div>
        {property ? (
          <Button onClick={startEditing} className="gap-2">
            <Pencil className="size-4" /> {detailLabels.edit}
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {propertyQuery.isLoading ? (
            <TableSkeleton rows={3} columns={2} />
          ) : !property ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-foreground">
              <p>
                {detailLabels.notInMasterDataBefore}
                <span className="font-mono">{propertyCode}</span>
                {detailLabels.notInMasterDataAfter}
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => adapter.openPropertyCreate(propertyCode)}
              >
                <Plus className="size-4" /> {detailLabels.createNow}
              </Button>
            </div>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {detailLabels.masterDataSection}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{detailLabels.fields.code}</dt>
                  <dd className="font-mono text-sm text-foreground">{property.code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{detailLabels.fields.name}</dt>
                  <dd className="text-sm text-foreground">{property.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{detailLabels.fields.address}</dt>
                  <dd className="text-sm text-foreground">{property.address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{detailLabels.fields.company}</dt>
                  <dd className="text-sm text-foreground">
                    {companies.length
                      ? companies.map((company) => `${company.code} · ${company.name}`).join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{detailLabels.fields.vatStatus}</dt>
                  <dd className="text-sm text-foreground">
                    {property.vatStatus ? labels.vatStatus[property.vatStatus] : "—"}
                  </dd>
                </div>
              </dl>
            </section>
          )}
          <NameVariantsCard
            propertyCode={propertyCode}
            adapter={adapter}
            labels={labels.nameVariants}
          />
        </div>
        <div className="space-y-6">
          {invoicesQuery.isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : invoices.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {detailLabels.noInvoices}
            </div>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {detailLabels.bookedSection}
                </h2>
                <div className="rounded-lg bg-muted/40 px-3 py-1.5 text-right">
                  <span className="text-xs text-muted-foreground">
                    {detailLabels.invoiceCount(invoices.length)} ·{" "}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatters.formatMoney(bookedTotal)}
                  </span>
                </div>
              </div>

              {mismatchCount > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    {detailLabels.companyMismatchWarning(
                      mismatchCount,
                      companies.map((company) => company.code).join(", "),
                    )}
                  </span>
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-border">
                {/* Capped and scrolled so an unbounded table does not drag the page height with it. */}
                <div className="max-h-[26rem] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                        <TableHead>{detailLabels.columns.supplier}</TableHead>
                        <TableHead>{detailLabels.columns.company}</TableHead>
                        <TableHead>{detailLabels.columns.date}</TableHead>
                        <TableHead>{detailLabels.columns.vat}</TableHead>
                        <TableHead className="text-right">{detailLabels.columns.amount}</TableHead>
                        <TableHead>{detailLabels.columns.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoicePage.visible.map((invoice) => (
                        <TableRow
                          key={invoice.id}
                          className="cursor-pointer"
                          onClick={() => adapter.openInvoice(invoice.id)}
                        >
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {invoice.supplierName ?? "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {invoice.invoiceNumber ?? detailLabels.withoutNumber}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <CompanyChip code={invoice.companyCode} labels={labels.companyChip} />
                              {companyMismatch(invoice.companyCode) && (
                                <span title={detailLabels.companyMismatchRow}>
                                  <TriangleAlert
                                    className="size-3.5 shrink-0 text-warning"
                                    aria-label={detailLabels.companyMismatchRow}
                                  />
                                </span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {formatters.formatDate(invoice.documentDate)}
                          </TableCell>
                          <TableCell>
                            <VatBadge
                              vatRate={invoice.vatRate}
                              vatLines={invoice.vatLines}
                              labels={labels.vatBadge}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatters.formatMoney(invoice.amountGross)}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge
                              status={invoice.status}
                              tone={
                                invoice.status
                                  ? adapter.invoiceStatusTone[invoice.status]
                                  : undefined
                              }
                              statusLabel={labels.invoiceStatusLabel}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      {invoicePage.hasMore && (
                        <TableRow ref={invoicePage.sentinelRef}>
                          <TableCell
                            colSpan={99}
                            className="py-3 text-center text-xs text-muted-foreground"
                          >
                            {labels.moreRows(invoicePage.total - invoicePage.visible.length)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => (open ? undefined : cancelEditing())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailLabels.editTitle}</DialogTitle>
            <DialogDescription>{detailLabels.editDescription}</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{detailLabels.fields.name}</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setFormValue("name", event.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {detailLabels.fields.address}
                </Label>
                <Input
                  value={form.address}
                  onChange={(event) => setFormValue("address", event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <CompanyAssignmentField
                  values={form.companyIds}
                  onValuesChange={setCompanyIds}
                  companies={companiesQuery.data ?? []}
                  labels={labels.companyAssignment}
                  requiredFieldTitle={labels.requiredFieldTitle}
                  error={companyError}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {detailLabels.fields.vatStatus}
                </Label>
                <Combobox
                  value={form.vatStatus}
                  onValueChange={(value) => setFormValue("vatStatus", value)}
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelEditing}>
              {detailLabels.cancel}
            </Button>
            <Button onClick={() => void save()} disabled={isSaving}>
              {isSaving ? detailLabels.saving : detailLabels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
