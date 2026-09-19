import { useMemo, useState } from "react";
import { Archive, ArrowLeft, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Skeleton } from "../../ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, readableErrorMessage } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { CompaniesAdapter, Company, CompanyChanges } from "../../adapters/companies";
import type { StatusTone } from "../../adapters/processing-log";
import { FieldErrorText, RequiredMark, validateCompanyForm } from "./company-form";
import { KnownSpellingsCard } from "./known-spellings-card";
import { useInfiniteRows } from "./use-infinite-rows";
import { englishCompaniesLabels, type CompaniesLabels } from "./labels";

const NO_AREA = "__none";

const STATUS_TONE_STYLE: Record<StatusTone, string> = {
  brand: "bg-brand-tint text-brand-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
};

type CompanyEditForm = { code: string; name: string; area: string };

function editFormFrom(company: Company): CompanyEditForm {
  return {
    code: company.code ?? "",
    name: company.name ?? "",
    area: company.area ?? NO_AREA,
  };
}

export interface CompanyDetailPageProps {
  companyId: string;
  adapter: CompaniesAdapter;
  labels?: CompaniesLabels;
  formatters?: Formatters;
}

export function CompanyDetailPage({
  companyId,
  adapter,
  labels = englishCompaniesLabels,
  formatters = englishFormatters,
}: CompanyDetailPageProps) {
  const companyQuery = adapter.useCompany(companyId);
  const invoicesQuery = adapter.useInvoicesForCompany(companyId, companyQuery.data?.code);
  const propertiesQuery = adapter.useProperties();
  const propertyLinksQuery = adapter.usePropertyCompanyLinks();
  const allCompaniesQuery = adapter.useCompanies({ includeArchived: false });

  const [archiveReason, setArchiveReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<CompanyEditForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const company = companyQuery.data ?? null;

  // The adapter already applies the matching rule; only the presentational sort happens here.
  const invoices = useMemo(
    () =>
      [...(invoicesQuery.data ?? [])].sort((first, second) =>
        (second.documentDate ?? "").localeCompare(first.documentDate ?? ""),
      ),
    [invoicesQuery.data],
  );
  const totalAmount = invoices.reduce((sum, invoice) => sum + (invoice.amountGross ?? 0), 0);
  // Tracked separately so the empty state is only shown once it is actually known to be true.
  const invoicesReady = invoicesQuery.data !== undefined;

  // Properties belonging to this company; a property may belong to several companies at once.
  const ownProperties = useMemo(() => {
    const ownPropertyIds = new Set(
      (propertyLinksQuery.data ?? [])
        .filter((link) => link.companyId === companyId)
        .map((link) => link.propertyId),
    );
    return (propertiesQuery.data ?? []).filter((property) => ownPropertyIds.has(property.id));
  }, [propertiesQuery.data, propertyLinksQuery.data, companyId]);

  const visibleInvoices = useInfiniteRows(invoices, 25);

  // id -> code, so the mismatch hint can name the owning company instead of a bare id.
  const companyCodeById = useMemo(
    () => new Map((allCompaniesQuery.data ?? []).map((entry) => [entry.id, entry.code])),
    [allCompaniesQuery.data],
  );

  // Property codes booked against THIS company that belong to a different one.
  // A property with no ownership row at all is deliberately not flagged: that is "owner not
  // recorded yet", not a mismatch.
  const foreignProperties = useMemo(() => {
    const ownersByPropertyId = new Map<string, Set<string>>();
    for (const link of propertyLinksQuery.data ?? []) {
      const owners = ownersByPropertyId.get(link.propertyId) ?? new Set<string>();
      owners.add(link.companyId);
      ownersByPropertyId.set(link.propertyId, owners);
    }
    const ownersByPropertyCode = new Map<string, string[]>();
    for (const property of propertiesQuery.data ?? []) {
      const owners = ownersByPropertyId.get(property.id);
      if (!owners || owners.size === 0 || owners.has(companyId)) continue;
      ownersByPropertyCode.set(property.code, [...owners]);
    }
    return ownersByPropertyCode;
  }, [propertyLinksQuery.data, propertiesQuery.data, companyId]);

  const foreignInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) => invoice.propertyCode && foreignProperties.has(invoice.propertyCode),
      ),
    [invoices, foreignProperties],
  );
  const foreignTotal = foreignInvoices.reduce(
    (sum, invoice) => sum + (invoice.amountGross ?? 0),
    0,
  );

  if (companyQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (companyQuery.isError) {
    return <ErrorState error={companyQuery.error} onRetry={() => companyQuery.refetch()} />;
  }
  if (!company) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {labels.detail.notFoundTitle}
        </h1>
        <Button className="mt-6" onClick={() => adapter.openCompanyList()}>
          {labels.detail.goToList}
        </Button>
      </div>
    );
  }

  const editForm = form ?? editFormFrom(company);
  const setField = (field: keyof CompanyEditForm, value: string) => {
    setForm((previous) => ({ ...(previous ?? editFormFrom(company)), [field]: value }));
    // Clear a field's error as soon as it is touched, not only on the next submit.
    setErrors((previous) => (previous[field] ? { ...previous, [field]: "" } : previous));
  };

  function startEditing() {
    setForm(editFormFrom(company!));
    setErrors({});
    setIsEditing(true);
  }
  function cancelEditing() {
    setForm(null);
    setIsEditing(false);
  }
  async function save() {
    const current = company!;
    const changes: CompanyChanges = {};
    if (editForm.code.trim() && editForm.code.trim() !== current.code) {
      changes.code = editForm.code.trim();
    }
    if (editForm.name.trim() && editForm.name.trim() !== current.name) {
      changes.name = editForm.name.trim();
    }
    const areaValue = editForm.area === NO_AREA ? null : editForm.area;
    if (areaValue !== current.area) changes.area = areaValue;
    const validated = validateCompanyForm(
      { code: editForm.code, name: editForm.name },
      labels.validation,
    );
    if (Object.keys(validated.errors).length > 0) {
      setErrors(validated.errors);
      return;
    }
    setErrors({});
    if (Object.keys(changes).length === 0) {
      toast.info(labels.detail.noChangesToast);
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.updateCompany({ companyId, changes });
      toast.success(labels.detail.savedToast);
      setForm(null);
      setIsEditing(false);
    } catch (error) {
      toast.error(labels.detail.saveFailedToast(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }
  async function archive() {
    setIsArchiving(true);
    try {
      await adapter.archiveCompany({ companyId, reason: archiveReason.trim() });
      toast.success(labels.detail.archivedToast);
      setArchiveReason("");
    } catch (error) {
      toast.error(labels.detail.archiveFailedToast(readableErrorMessage(error, "")));
    } finally {
      setIsArchiving(false);
    }
  }
  async function restore() {
    setIsRestoring(true);
    try {
      await adapter.restoreCompany({ companyId });
      toast.success(labels.detail.restoredToast);
    } catch (error) {
      toast.error(labels.detail.restoreFailedToast(readableErrorMessage(error, "")));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => adapter.openCompanyList()}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {labels.detail.backToList}
      </button>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          <span className="font-mono">{company.code}</span> · {company.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startEditing} className="gap-2">
            <Pencil className="size-4" /> {labels.detail.edit}
          </Button>
          {company.archivedAt ? (
            <Button variant="outline" className="gap-2" disabled={isRestoring} onClick={restore}>
              <RotateCcw className="size-4" /> {labels.detail.restore}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Archive className="size-4" /> {labels.detail.archive}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{labels.detail.archiveDialogTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {labels.detail.archiveDialogDescription}
                    {invoicesReady && invoices.length > 0
                      ? " " + labels.detail.archiveDialogInvoiceNote(invoices.length)
                      : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  placeholder={labels.detail.archiveReasonPlaceholder}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>{labels.detail.archiveCancel}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!archiveReason.trim() || isArchiving}
                    onClick={archive}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {labels.detail.archiveConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {company.archivedAt && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {labels.detail.archivedBanner(
            formatters.formatDate(company.archivedAt),
            company.archiveReason?.trim() || labels.detail.archivedWithoutReason,
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Explicit columns so uneven card heights do not leave grid gaps. */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.detail.masterDataSection}
            </h2>
            <dl className="space-y-3">
              <div className="border-b border-border/60 pb-3">
                <dt className="text-xs text-muted-foreground">{labels.detail.codeField}</dt>
                <dd className="font-mono text-sm text-foreground">{company.code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{labels.detail.nameField}</dt>
                <dd className="text-sm text-foreground">{company.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{labels.detail.areaField}</dt>
                <dd className="text-sm text-foreground">
                  {company.area ? labels.detail.areaLabel(company.area) : "—"}
                </dd>
              </div>
            </dl>

            {ownProperties.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.detail.propertiesHeading}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {ownProperties.map((property) => (
                    <button
                      key={property.id}
                      type="button"
                      onClick={() => adapter.openProperty(property.code)}
                      className="inline-flex cursor-pointer items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      <span className="font-mono">{property.code}</span>
                      {property.name ? (
                        <span className="ml-1 text-muted-foreground">· {property.name}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <KnownSpellingsCard
            adapter={adapter}
            companyCode={company.code ?? ""}
            labels={labels.aliases}
          />
        </div>
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.detail.bookedSection}
            </h2>
            <div className="mb-4 rounded-lg bg-muted/40 px-3 py-2">
              {invoicesReady ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    {labels.detail.invoiceTotalCaption(invoices.length)}
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-foreground">
                    {formatters.formatMoney(totalAmount)}
                  </div>
                </>
              ) : (
                <>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-1.5 h-6 w-32" />
                </>
              )}
            </div>
            {invoicesReady && foreignInvoices.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-xs">
                  {labels.detail.foreignPropertiesWarning(
                    foreignInvoices.length,
                    formatters.formatMoney(foreignTotal),
                  )}
                </p>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-border">
              {/* Capped and scrolled so the card never drags the whole page height with it. */}
              <div className="max-h-[26rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                      <TableHead>{labels.detail.columnInvoice}</TableHead>
                      <TableHead>{labels.detail.columnProperty}</TableHead>
                      <TableHead>{labels.detail.columnDate}</TableHead>
                      <TableHead className="text-right">{labels.detail.columnAmount}</TableHead>
                      <TableHead>{labels.detail.columnStatus}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleInvoices.visible.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer"
                        onClick={() => adapter.openInvoice(invoice.id)}
                      >
                        <TableCell className="font-medium text-foreground">
                          {invoice.invoiceNumber ?? labels.detail.withoutInvoiceNumber}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {invoice.propertyCode ? (
                            foreignProperties.has(invoice.propertyCode) ? (
                              <span
                                className="inline-flex items-center gap-1 font-medium text-warning"
                                title={labels.detail.foreignPropertyHint(
                                  invoice.propertyCode,
                                  (foreignProperties.get(invoice.propertyCode) ?? [])
                                    .map((ownerId) => companyCodeById.get(ownerId) ?? ownerId)
                                    .join(", "),
                                )}
                              >
                                <TriangleAlert className="size-3.5 shrink-0" />
                                {invoice.propertyCode}
                              </span>
                            ) : (
                              invoice.propertyCode
                            )
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {formatters.formatDate(invoice.documentDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatters.formatMoney(invoice.amountGross)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge
                            status={invoice.status}
                            adapter={adapter}
                            labels={labels}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!invoicesReady &&
                      [0, 1, 2].map((index) => (
                        <TableRow key={`invoice-skeleton-${index}`}>
                          <TableCell colSpan={5} className="py-3">
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {invoicesReady && invoices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          {labels.detail.invoicesEmpty}
                        </TableCell>
                      </TableRow>
                    )}
                    {visibleInvoices.hasMore && (
                      <TableRow ref={visibleInvoices.sentinelRef}>
                        <TableCell
                          colSpan={99}
                          className="py-3 text-center text-xs text-muted-foreground"
                        >
                          {labels.detail.loadMoreRemaining(
                            visibleInvoices.total - visibleInvoices.visible.length,
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={isEditing} onOpenChange={(open) => (open ? undefined : cancelEditing())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.detail.editDialogTitle}</DialogTitle>
            <DialogDescription>{labels.detail.editDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {labels.detail.codeField} <RequiredMark title={labels.requiredFieldTitle} />
              </Label>
              <Input
                value={editForm.code}
                onChange={(event) => setField("code", event.target.value)}
                aria-invalid={!!errors.code}
              />
              <FieldErrorText text={errors.code} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {labels.detail.nameField} <RequiredMark title={labels.requiredFieldTitle} />
              </Label>
              <Input
                value={editForm.name}
                onChange={(event) => setField("name", event.target.value)}
                aria-invalid={!!errors.name}
              />
              <FieldErrorText text={errors.name} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.detail.areaField}</Label>
              <Select value={editForm.area} onValueChange={(value) => setField("area", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>{labels.detail.areaNone}</SelectItem>
                  {adapter.areaOptions.map((area) => (
                    <SelectItem key={area} value={area}>
                      {labels.detail.areaLabel(area)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelEditing}>
              {labels.detail.cancel}
            </Button>
            <Button onClick={save} disabled={isSaving}>
              {isSaving ? labels.detail.saving : labels.detail.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceStatusBadge({
  status,
  adapter,
  labels,
}: {
  status: string | null;
  adapter: CompaniesAdapter;
  labels: CompaniesLabels;
}) {
  const tone = status ? adapter.invoiceStatusTone[status] : undefined;
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", STATUS_TONE_STYLE[tone ?? "neutral"])}
    >
      {status ? labels.detail.invoiceStatusLabel(status) : "—"}
    </Badge>
  );
}
