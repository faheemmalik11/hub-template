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

const NONE = "__none";

export interface InvoiceDetailPageProps {
  invoiceId: string;
  adapter: InvoiceDetailAdapter;
  config: InvoiceDetailConfig;
  labels?: InvoiceDetailLabels;
  formatters?: Formatters;
}

interface OverviewForm {
  issuer: string;
  invoice_number: string;
  order_number: string;
  document_date: string;
  due_date: string;
  service_date: string;
  amount_net: string;
  vat_rate: string;
  vat_amount: string;
  amount_gross: string;
  currency: string;
  company_code: string;
  property_code: string;
  category_id: string;
}

function overviewFormFrom(invoice: InvoiceDetailRecord): OverviewForm {
  const s = (v: string | null) => v ?? "";
  const n = (v: number | null) => (v == null ? "" : String(v));
  return {
    issuer: s(invoice.issuer),
    invoice_number: s(invoice.invoice_number),
    order_number: s(invoice.order_number),
    document_date: s(invoice.document_date),
    due_date: s(invoice.due_date),
    service_date: s(invoice.service_date),
    amount_net: n(invoice.amount_net),
    vat_rate: n(invoice.vat_rate),
    vat_amount: n(invoice.vat_amount),
    amount_gross: n(invoice.amount_gross),
    currency: s(invoice.currency),
    company_code: s(invoice.company_code),
    property_code: s(invoice.property_code),
    category_id: s(invoice.category_id),
  };
}

interface DetailsForm {
  recipient_name: string;
  customer_number: string;
  payment_reference: string;
  payment_method: string;
  tax_note: string;
  service_description: string;
}

function detailsFormFrom(invoice: InvoiceDetailRecord): DetailsForm {
  const s = (v: string | null) => v ?? "";
  return {
    recipient_name: s(invoice.recipient_name),
    customer_number: s(invoice.customer_number),
    payment_reference: s(invoice.payment_reference),
    payment_method: s(invoice.payment_method),
    tax_note: s(invoice.tax_note),
    service_description: s(invoice.service_description),
  };
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function diff(
  form: Record<string, string>,
  base: Record<string, unknown>,
  numericKeys: string[],
  labelFor: (key: string) => string,
): { changes: Record<string, unknown>; labels: string[]; invalid: string[] } {
  const changes: Record<string, unknown> = {};
  const labels: string[] = [];
  const invalid: string[] = [];
  for (const key of Object.keys(form)) {
    const isNumeric = numericKeys.includes(key);
    const raw = form[key];
    const next = isNumeric ? parseNumber(raw) : raw.trim() === "" ? null : raw.trim();
    if (isNumeric && Number.isNaN(next)) {
      invalid.push(labelFor(key));
      continue;
    }
    const prev = (base[key] as string | number | null) ?? null;
    if (next !== prev) {
      changes[key] = next;
      labels.push(labelFor(key));
    }
  }
  return { changes, labels, invalid };
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
  const [overviewEditOpen, setOverviewEditOpen] = useState(false);
  const [detailsEditOpen, setDetailsEditOpen] = useState(false);
  const [overviewForm, setOverviewForm] = useState<OverviewForm | null>(null);
  const [detailsForm, setDetailsForm] = useState<DetailsForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewFlash, setReviewFlash] = useState(false);

  const invoice = invoiceQuery.data;

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

  function openOverviewEdit() {
    setOverviewForm(overviewFormFrom(invoice!));
    setOverviewEditOpen(true);
  }
  function openDetailsEdit() {
    setDetailsForm(detailsFormFrom(invoice!));
    setDetailsEditOpen(true);
  }

  async function saveOverview() {
    if (!overviewForm) return;
    const {
      changes,
      labels: changed,
      invalid,
    } = diff(
      overviewForm as unknown as Record<string, string>,
      invoice as unknown as Record<string, unknown>,
      ["amount_net", "vat_rate", "vat_amount", "amount_gross"],
      fieldLabel,
    );
    if (invalid.length > 0) {
      toast.error(page.saveFailed(invalid.join(", ")));
      return;
    }
    if (Object.keys(changes).length === 0) {
      setOverviewEditOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.updateInvoice(invoice!.id, changes, changed);
      toast.success(page.saved);
      setOverviewEditOpen(false);
    } catch (error) {
      toast.error(page.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDetails() {
    if (!detailsForm) return;
    const { changes, labels: changed } = diff(
      detailsForm as unknown as Record<string, string>,
      invoice as unknown as Record<string, unknown>,
      [],
      fieldLabel,
    );
    if (Object.keys(changes).length === 0) {
      setDetailsEditOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.updateInvoice(invoice!.id, changes, changed);
      toast.success(page.saved);
      setDetailsEditOpen(false);
    } catch (error) {
      toast.error(page.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

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

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    try {
      await adapter.addNote(invoice!.id, text);
      setNoteText("");
      toast.success(page.noteAdded);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function confirmDelete() {
    try {
      await adapter.softDelete(invoice!.id, deleteReason.trim());
      toast.success(page.deletedToast);
      setDeleteOpen(false);
      adapter.openInvoiceList();
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function togglePaid() {
    if (!adapter.payment) return;
    try {
      await adapter.payment.setPaid(invoice!.id, !invoice!.paid_at);
      toast.success(page.paidToast);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function runApprovalAction(actionId: string, requiresComment: boolean) {
    if (!adapter.approval) return;
    if (requiresComment && !approvalComment.trim()) return;
    try {
      await adapter.approval.runAction(invoice!.id, actionId, approvalComment.trim() || undefined);
      setApprovalComment("");
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

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
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
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
              if (action) void runApprovalAction(action.id, action.requiresComment);
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
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  placeholder={page.approvalCommentPlaceholder}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  {Array.from(legalActionsQuery?.data?.entries() ?? []).map(([step, action]) => (
                    <Button
                      key={step}
                      size="sm"
                      onClick={() => runApprovalAction(action.id, action.requiresComment)}
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
              <Switch checked={!!invoice.paid_at} onCheckedChange={togglePaid} />
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
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder={page.addNotePlaceholder}
              rows={2}
              className="flex-1"
            />
            <Button onClick={addNote} disabled={!noteText.trim()}>
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

      <Dialog open={overviewEditOpen} onOpenChange={setOverviewEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{page.tabOverview}</DialogTitle>
          </DialogHeader>
          {overviewForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={page.fieldIssuer}
                value={overviewForm.issuer}
                onChange={(v) => setOverviewForm({ ...overviewForm, issuer: v })}
              />
              <TextField
                label={page.fieldInvoiceNumber}
                value={overviewForm.invoice_number}
                onChange={(v) => setOverviewForm({ ...overviewForm, invoice_number: v })}
              />
              <TextField
                label={page.fieldOrderNumber}
                value={overviewForm.order_number}
                onChange={(v) => setOverviewForm({ ...overviewForm, order_number: v })}
              />
              <TextField
                label={page.fieldDocumentDate}
                value={overviewForm.document_date}
                onChange={(v) => setOverviewForm({ ...overviewForm, document_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldDueDate}
                value={overviewForm.due_date}
                onChange={(v) => setOverviewForm({ ...overviewForm, due_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldServiceDate}
                value={overviewForm.service_date}
                onChange={(v) => setOverviewForm({ ...overviewForm, service_date: v })}
                type="date"
              />
              <TextField
                label={page.fieldAmountNet}
                value={overviewForm.amount_net}
                onChange={(v) => setOverviewForm({ ...overviewForm, amount_net: v })}
              />
              <TextField
                label={page.fieldVatRate}
                value={overviewForm.vat_rate}
                onChange={(v) => setOverviewForm({ ...overviewForm, vat_rate: v })}
              />
              <TextField
                label={page.fieldVatAmount}
                value={overviewForm.vat_amount}
                onChange={(v) => setOverviewForm({ ...overviewForm, vat_amount: v })}
              />
              <TextField
                label={page.fieldAmountGross}
                value={overviewForm.amount_gross}
                onChange={(v) => setOverviewForm({ ...overviewForm, amount_gross: v })}
              />
              <TextField
                label={page.fieldCurrency}
                value={overviewForm.currency}
                onChange={(v) => setOverviewForm({ ...overviewForm, currency: v })}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{page.fieldCompany}</Label>
                <Combobox
                  value={overviewForm.company_code || NONE}
                  onValueChange={(v) =>
                    setOverviewForm({ ...overviewForm, company_code: v === NONE ? "" : v })
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
                  value={overviewForm.property_code || NONE}
                  onValueChange={(v) =>
                    setOverviewForm({ ...overviewForm, property_code: v === NONE ? "" : v })
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
                  value={overviewForm.category_id || NONE}
                  onValueChange={(v) =>
                    setOverviewForm({ ...overviewForm, category_id: v === NONE ? "" : v })
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
            <Button variant="outline" onClick={() => setOverviewEditOpen(false)}>
              {page.cancel}
            </Button>
            <Button onClick={saveOverview} disabled={isSaving}>
              {isSaving ? page.saving : page.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsEditOpen} onOpenChange={setDetailsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{page.tabDetails}</DialogTitle>
          </DialogHeader>
          {detailsForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={page.fieldRecipientName}
                value={detailsForm.recipient_name}
                onChange={(v) => setDetailsForm({ ...detailsForm, recipient_name: v })}
              />
              <TextField
                label={page.fieldCustomerNumber}
                value={detailsForm.customer_number}
                onChange={(v) => setDetailsForm({ ...detailsForm, customer_number: v })}
              />
              <TextField
                label={page.fieldPaymentReference}
                value={detailsForm.payment_reference}
                onChange={(v) => setDetailsForm({ ...detailsForm, payment_reference: v })}
              />
              <TextField
                label={page.fieldPaymentMethod}
                value={detailsForm.payment_method}
                onChange={(v) => setDetailsForm({ ...detailsForm, payment_method: v })}
              />
              <TextField
                label={page.fieldTaxNote}
                value={detailsForm.tax_note}
                onChange={(v) => setDetailsForm({ ...detailsForm, tax_note: v })}
              />
              <TextField
                label={page.fieldServiceDescription}
                value={detailsForm.service_description}
                onChange={(v) => setDetailsForm({ ...detailsForm, service_description: v })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsEditOpen(false)}>
              {page.cancel}
            </Button>
            <Button onClick={saveDetails} disabled={isSaving}>
              {isSaving ? page.saving : page.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{page.deleteDialogTitle}</DialogTitle>
            <DialogDescription>{page.deleteDialogDescription}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder={page.deleteReasonPlaceholder}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {page.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
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
