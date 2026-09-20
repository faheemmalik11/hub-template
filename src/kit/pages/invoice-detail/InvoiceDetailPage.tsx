import { useMemo, useState } from "react";
import { ArrowLeft, Archive, ArchiveRestore, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Combobox } from "../../ui/combobox";
import { Switch } from "../../ui/switch";
import { Skeleton } from "../../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { ErrorState, readableErrorMessage } from "../../components/feedback/query-states";
import {
  NONE,
  detailsFormFrom,
  overviewFormFrom,
  useInvoiceActions,
  useInvoiceEdit,
  type DetailsForm,
  type OverviewForm,
} from "../../widgets/invoice-detail";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  InvoiceDetailAdapter,
  InvoiceDetailConfig,
  InvoiceDetailRecord,
} from "../../adapters/invoice-detail";
import { OutgoingInvoiceBanner } from "../../components/invoice-review/OutgoingInvoiceFlag";
import {
  buildReviewSummary,
  hasNoReviewChecks,
  reviewLines,
} from "../../components/invoice-review/review";
import { ReviewBadge } from "../../components/invoice-review/ReviewBadge";
import { ReviewCard } from "./ReviewCard";
import { WorkflowLadder } from "./WorkflowLadder";
import { WorkflowHistoryList, type WorkflowHistoryRow } from "./WorkflowHistoryList";
import { historyLines, historyQualifier, historyStateLabel } from "./history";
import { englishInvoiceDetailLabels, type InvoiceDetailLabels } from "./labels";

export interface InvoiceDetailPageProps {
  invoiceId: string;
  adapter: InvoiceDetailAdapter;
  config: InvoiceDetailConfig;
  labels?: InvoiceDetailLabels;
  formatters?: Formatters;
}

export function InvoiceDetailPage({
  invoiceId,
  adapter,
  config,
  labels = englishInvoiceDetailLabels,
  formatters = englishFormatters,
}: InvoiceDetailPageProps) {
  const page = labels.page;
  const invoiceQuery = adapter.useInvoice(invoiceId);
  const historyQuery = adapter.useHistory(invoiceId);
  const companyOptionsQuery = adapter.useCompanyOptions();
  const propertyOptionsQuery = adapter.usePropertyOptions();
  const categoryOptionsQuery = adapter.useCategoryOptions();

  const [activeTab, setActiveTab] = useState("overview");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewFlash, setReviewFlash] = useState(false);

  const invoice = invoiceQuery.data;

  function fieldLabel(key: string): string {
    const map: Record<string, string> = {
      issuer: page.fieldIssuer,
      invoice_number: page.fieldInvoiceNumber,
      order_number: page.fieldOrderNumber,
      document_date: page.fieldDocumentDate,
      due_date: page.fieldDueDate,
      service_date: page.fieldServiceDate,
      amount_net: page.fieldAmountNet,
      vat_rate: page.fieldVatRate,
      vat_amount: page.fieldVatAmount,
      amount_gross: page.fieldAmountGross,
      currency: page.fieldCurrency,
      company_code: page.fieldCompany,
      property_code: page.fieldProperty,
      category_id: page.fieldCategory,
      recipient_name: page.fieldRecipientName,
      customer_number: page.fieldCustomerNumber,
      payment_reference: page.fieldPaymentReference,
      payment_method: page.fieldPaymentMethod,
      tax_note: page.fieldTaxNote,
      service_description: page.fieldServiceDescription,
    };
    return map[key] ?? key;
  }

  const edit = useInvoiceEdit(invoice, adapter, fieldLabel, {
    saved: page.saved,
    saveFailed: page.saveFailed,
  });
  const actions = useInvoiceActions(invoice, adapter, {
    noteAdded: page.noteAdded,
    deletedToast: page.deletedToast,
    paidToast: page.paidToast,
  });

  const legalActionsQuery = adapter.approval?.useLegalActions(
    invoice ?? ({} as InvoiceDetailRecord),
  );
  const payableAccountQuery = adapter.payment?.usePayableAccount(
    invoice ?? ({} as InvoiceDetailRecord),
  );

  const reviewSummary = useMemo(() => (invoice ? buildReviewSummary(invoice) : null), [invoice]);
  const lines = useMemo(
    () =>
      reviewSummary
        ? reviewLines(reviewSummary.reasons, labels.review, config.fieldJumpTargets)
        : [],
    [reviewSummary, labels.review, config.fieldJumpTargets],
  );

  const historyRows: WorkflowHistoryRow[] = useMemo(() => {
    const rows = historyQuery.data;
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const historyFormat = {
      approvalActionLabelDe: () => "",
      workflowLabelDe: () => "",
      workflowOrder: config.workflowSteps,
    };
    let lastTime = invoice ? new Date(invoice.created_at).getTime() : 0;
    return sorted.map((entry) => {
      const createdTime = new Date(entry.createdAt).getTime();
      const durationMs = Math.max(0, createdTime - lastTime);
      lastTime = createdTime;
      const allLines = historyLines(entry, config, historyFormat);
      return {
        entry,
        from: "",
        to: historyStateLabel(entry, config, historyFormat, labels.history),
        qualifier: historyQualifier(entry, labels.history),
        comment: allLines[0] ?? null,
        durationMs,
      };
    });
  }, [historyQuery.data, config, labels.history, invoice]);

  if (invoiceQuery.error) {
    return <ErrorState error={invoiceQuery.error} onRetry={() => invoiceQuery.refetch()} />;
  }

  if (invoiceQuery.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {page.notFoundTitle}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{page.notFoundBody(invoiceId)}</p>
        <Button className="mt-6" onClick={adapter.openInvoiceList}>
          {page.backToList}
        </Button>
      </div>
    );
  }

  const openOverviewEdit = () => edit.openOverview(invoice!);
  const openDetailsEdit = () => edit.openDetails(invoice!);

  const reasonCount = reviewSummary?.reasons.length ?? 0;
  const unchecked = hasNoReviewChecks(invoice);
  const currentStepIndex = config.workflowSteps.indexOf(
    invoice.workflow_status ?? config.workflowSteps[0],
  );
  const legalActionsMap = new Map<string, unknown>(
    legalActionsQuery?.data
      ? Array.from(legalActionsQuery.data.entries()).map(([step, action]) => [step, action])
      : [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground"
            onClick={adapter.openInvoiceList}
          >
            <ArrowLeft className="size-4" />
            {page.backToList}
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {invoice.issuer ?? "—"}
            </h1>
            <ReviewBadge
              reasonCount={reasonCount}
              unchecked={unchecked}
              status={invoice.status}
              alreadyPaid={!!invoice.paid_at}
              labels={labels.review}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.invoice_number ? `#${invoice.invoice_number}` : page.noInvoiceNumber}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {adapter.archive && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                invoice.archived_at
                  ? adapter.archive!.unarchive(invoice.id)
                  : adapter.archive!.archive(invoice.id, "")
              }
            >
              {invoice.archived_at ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
              {invoice.archived_at ? page.unarchiveButton : page.archiveButton}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => actions.setDeleteOpen(true)}
                className="text-destructive"
              >
                <Trash2 className="size-4" />
                {page.deleteButton}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {invoice.archived_at && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {page.archivedBanner(formatters.formatDate(invoice.archived_at))}
        </div>
      )}

      <OutgoingInvoiceBanner invoice={invoice} labels={labels.outgoing} />

      {lines.length > 0 && (
        <ReviewCard
          lines={lines}
          anchorId="review-box"
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          flash={reviewFlash}
          onJump={(tab) => {
            setActiveTab(tab);
            setReviewFlash(true);
            window.setTimeout(() => setReviewFlash(false), 1800);
          }}
          labels={labels.review}
        />
      )}

      {adapter.approval && (
        <div className="rounded-xl border border-border bg-card p-4">
          <WorkflowLadder
            steps={config.workflowSteps}
            currentStep={currentStepIndex}
            actions={legalActionsMap}
            onAction={(step) => {
              const action = legalActionsQuery?.data.get(step);
              if (action) void actions.runApprovalAction(action.id, action.requiresComment);
            }}
            labels={labels.workflowLadder}
            ladderColors={config.ladderColors}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{page.tabOverview}</TabsTrigger>
          {adapter.approval && <TabsTrigger value="approval">{page.tabApproval}</TabsTrigger>}
          {adapter.payment && <TabsTrigger value="payment">{page.tabPayment}</TabsTrigger>}
          <TabsTrigger value="details">{page.tabDetails}</TabsTrigger>
          <TabsTrigger value="history">{page.tabHistory}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{page.tabOverview}</h2>
            {adapter.canEdit && (
              <Button variant="outline" size="sm" onClick={openOverviewEdit}>
                {page.edit}
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={page.fieldAmountNet} value={formatters.formatMoney(invoice.amount_net)} />
            <Field label={page.fieldVatAmount} value={formatters.formatMoney(invoice.vat_amount)} />
            <Field
              label={page.fieldAmountGross}
              value={formatters.formatMoney(invoice.amount_gross)}
            />
            <Field label={page.fieldInvoiceNumber} value={invoice.invoice_number ?? "—"} />
            <Field
              label={page.fieldDocumentDate}
              value={formatters.formatDate(invoice.document_date)}
            />
            <Field label={page.fieldDueDate} value={formatters.formatDate(invoice.due_date)} />
            <Field label={page.fieldCompany} value={invoice.company_code ?? "—"} />
            <Field label={page.fieldProperty} value={invoice.property_code ?? "—"} />
            <Field label={page.fieldCategory} value={invoice.cost_category ?? "—"} />
          </div>
        </TabsContent>

        {adapter.approval && (
          <TabsContent value="approval" className="mt-4 space-y-4">
            {legalActionsMap.size > 0 ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <Label className="text-xs text-muted-foreground">{page.approvalComment}</Label>
                <Textarea
                  value={actions.approvalComment}
                  onChange={(event) => actions.setApprovalComment(event.target.value)}
                  placeholder={page.approvalCommentPlaceholder}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  {Array.from(legalActionsQuery?.data?.entries() ?? []).map(([step, action]) => (
                    <Button
                      key={step}
                      size="sm"
                      onClick={() => actions.runApprovalAction(action.id, action.requiresComment)}
                    >
                      {page.runAction} — {step}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{page.noActionsAvailable}</p>
            )}
          </TabsContent>
        )}

        {adapter.payment && (
          <TabsContent value="payment" className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <span className="text-sm text-foreground">
                {invoice.paid_at ? page.markUnpaid : page.markPaid}
              </span>
              <Switch checked={!!invoice.paid_at} onCheckedChange={actions.togglePaid} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <Label className="text-xs text-muted-foreground">{page.payableAccount}</Label>
              {payableAccountQuery?.loading ? (
                <Skeleton className="mt-2 h-4 w-48" />
              ) : payableAccountQuery?.data ? (
                <p className="mt-1 text-sm text-foreground">
                  {payableAccountQuery.data.iban}
                  {payableAccountQuery.data.bankName
                    ? ` · ${payableAccountQuery.data.bankName}`
                    : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{page.noPayableAccount}</p>
              )}
            </div>
          </TabsContent>
        )}

        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{page.tabDetails}</h2>
            {adapter.canEdit && (
              <Button variant="outline" size="sm" onClick={openDetailsEdit}>
                {page.edit}
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={page.fieldRecipientName} value={invoice.recipient_name ?? "—"} />
            <Field label={page.fieldCustomerNumber} value={invoice.customer_number ?? "—"} />
            <Field label={page.fieldPaymentReference} value={invoice.payment_reference ?? "—"} />
            <Field label={page.fieldPaymentMethod} value={invoice.payment_method ?? "—"} />
            <Field label={page.fieldTaxNote} value={invoice.tax_note ?? "—"} />
            <Field
              label={page.fieldServiceDescription}
              value={invoice.service_description ?? "—"}
            />
          </div>
          {adapter.supplier && invoice.supplier_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => adapter.supplier!.openSupplier(invoice.supplier_id!)}
            >
              {page.openSupplier}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Textarea
              value={actions.noteText}
              onChange={(event) => actions.setNoteText(event.target.value)}
              placeholder={page.addNotePlaceholder}
              rows={2}
              className="flex-1"
            />
            <Button onClick={actions.addNote} disabled={!actions.noteText.trim()}>
              {page.addNoteButton}
            </Button>
          </div>
          {historyQuery.loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <WorkflowHistoryList
              rows={historyRows}
              arrivedAt={invoice.created_at}
              labels={labels.workflowHistory}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={edit.overviewOpen} onOpenChange={edit.setOverviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{page.tabOverview}</DialogTitle>
          </DialogHeader>
          {edit.overviewForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={page.fieldIssuer}
                value={edit.overviewForm.issuer}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, issuer: v })}
              />
              <TextField
                label={page.fieldInvoiceNumber}
                value={edit.overviewForm.invoice_number}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, invoice_number: v })}
              />
              <TextField
                label={page.fieldOrderNumber}
                value={edit.overviewForm.order_number}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, order_number: v })}
              />
              <TextField
                label={page.fieldDocumentDate}
                value={edit.overviewForm.document_date}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, document_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldDueDate}
                value={edit.overviewForm.due_date}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, due_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldServiceDate}
                value={edit.overviewForm.service_date}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, service_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldAmountNet}
                value={edit.overviewForm.amount_net}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, amount_net: v })}
              />
              <TextField
                label={page.fieldVatRate}
                value={edit.overviewForm.vat_rate}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, vat_rate: v })}
              />
              <TextField
                label={page.fieldVatAmount}
                value={edit.overviewForm.vat_amount}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, vat_amount: v })}
              />
              <TextField
                label={page.fieldAmountGross}
                value={edit.overviewForm.amount_gross}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, amount_gross: v })}
              />
              <TextField
                label={page.fieldCurrency}
                value={edit.overviewForm.currency}
                onChange={(v) => edit.setOverviewForm({ ...edit.overviewForm!, currency: v })}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{page.fieldCompany}</Label>
                <Combobox
                  value={edit.overviewForm.company_code || NONE}
                  onValueChange={(v) =>
                    edit.setOverviewForm({
                      ...edit.overviewForm!,
                      company_code: v === NONE ? "" : v,
                    })
                  }
                  options={[
                    { value: NONE, label: "—" },
                    ...(companyOptionsQuery.data ?? []).map((c) => ({
                      value: c.code,
                      label: `${c.code} — ${c.name}`,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{page.fieldProperty}</Label>
                <Combobox
                  value={edit.overviewForm.property_code || NONE}
                  onValueChange={(v) =>
                    edit.setOverviewForm({
                      ...edit.overviewForm!,
                      property_code: v === NONE ? "" : v,
                    })
                  }
                  options={[
                    { value: NONE, label: "—" },
                    ...(propertyOptionsQuery.data ?? []).map((p) => ({
                      value: p.code,
                      label: `${p.code} — ${p.name}`,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{page.fieldCategory}</Label>
                <Combobox
                  value={edit.overviewForm.category_id || NONE}
                  onValueChange={(v) =>
                    edit.setOverviewForm({
                      ...edit.overviewForm!,
                      category_id: v === NONE ? "" : v,
                    })
                  }
                  options={[
                    { value: NONE, label: "—" },
                    ...(categoryOptionsQuery.data ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => edit.closeOverview()}>
              {page.cancel}
            </Button>
            <Button onClick={edit.saveOverview} disabled={edit.saving}>
              {edit.saving ? page.saving : page.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={edit.detailsOpen} onOpenChange={edit.setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{page.tabDetails}</DialogTitle>
          </DialogHeader>
          {edit.detailsForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={page.fieldRecipientName}
                value={edit.detailsForm.recipient_name}
                onChange={(v) => edit.setDetailsForm({ ...edit.detailsForm!, recipient_name: v })}
              />
              <TextField
                label={page.fieldCustomerNumber}
                value={edit.detailsForm.customer_number}
                onChange={(v) => edit.setDetailsForm({ ...edit.detailsForm!, customer_number: v })}
              />
              <TextField
                label={page.fieldPaymentReference}
                value={edit.detailsForm.payment_reference}
                onChange={(v) =>
                  edit.setDetailsForm({ ...edit.detailsForm!, payment_reference: v })
                }
              />
              <TextField
                label={page.fieldPaymentMethod}
                value={edit.detailsForm.payment_method}
                onChange={(v) => edit.setDetailsForm({ ...edit.detailsForm!, payment_method: v })}
              />
              <TextField
                label={page.fieldTaxNote}
                value={edit.detailsForm.tax_note}
                onChange={(v) => edit.setDetailsForm({ ...edit.detailsForm!, tax_note: v })}
              />
              <TextField
                label={page.fieldServiceDescription}
                value={edit.detailsForm.service_description}
                onChange={(v) =>
                  edit.setDetailsForm({ ...edit.detailsForm!, service_description: v })
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => edit.closeDetails()}>
              {page.cancel}
            </Button>
            <Button onClick={edit.saveDetails} disabled={edit.saving}>
              {edit.saving ? page.saving : page.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actions.deleteOpen} onOpenChange={actions.setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{page.deleteDialogTitle}</DialogTitle>
            <DialogDescription>{page.deleteDialogDescription}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={actions.deleteReason}
            onChange={(event) => actions.setDeleteReason(event.target.value)}
            placeholder={page.deleteReasonPlaceholder}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => actions.setDeleteOpen(false)}>
              {page.cancel}
            </Button>
            <Button variant="destructive" onClick={actions.confirmDelete}>
              {page.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn("mt-0.5 text-sm text-foreground", value === "—" && "text-muted-foreground")}
      >
        {value}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
