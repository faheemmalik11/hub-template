import { createFileRoute, Link } from "@tanstack/react-router";
import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Search,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { QueueKpiRow } from "@/components/invoice-queue/queue-kpi-row";
import type { QueueTone } from "@/components/invoice-queue/queue-kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCompanies,
  useInvoiceSettings,
  useMarkOutgoingInvoiceAccountingChecked,
  useOutgoingInvoiceFileUrl,
  useOutgoingInvoiceMailText,
  useOutgoingInvoices,
  useSetUploadedOutgoingInvoiceStatus,
  useSoftDeleteOutgoingInvoice,
  useSyncInvoiceToLexoffice,
} from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { lexofficeSyncIsStuck } from "@/lib/lexoffice-sync";
import {
  errorText,
  formatDate,
  formatEUR,
  OUTGOING_INVOICE_EFFECTIVE_STATUS_META,
} from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { CompanyChip } from "@/components/documents/badges";
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { PdfPane } from "@/components/documents/pdf-pane";
import { cn } from "@/lib/utils";
import { SortControl } from "@/components/data-table/sort-control";
import { TablePagination } from "@/components/data-table/table-pagination";
import { useTableView } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";
import type {
  OutgoingInvoice,
  OutgoingInvoiceStatus,
  OutgoingVoucherStatus,
} from "@/lib/data/types";
import { brandVars, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/outgoing-invoices/")({
  head: () => ({ meta: [{ title: pageTitle("Ausgangsrechnungen") }] }),
  staticData: { titleKey: "outgoingInvoices" },
  component: OutgoingInvoicesPage,
});

const ALL = "__alle";
const STATUS_VALUES = ["draft", "open", "overdue", "paid", "voided"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function paymentDueOn(invoice: OutgoingInvoice) {
  return invoice.due_date ?? invoice.expected_payment_on ?? null;
}

function needsAccountingCheck(invoice: OutgoingInvoice, requireAccountingCheck: boolean) {
  return (
    requireAccountingCheck &&
    !invoice.accounting_checked_at &&
    invoice.status === "draft" &&
    invoice.source === "app" &&
    invoice.kind !== "referral_credit" &&
    !invoice.accounting_external_id
  );
}

function effectiveStatus(status: OutgoingInvoiceStatus, dueDate: string | null): StatusFilter {
  if (status === "paidoff" || status === "paid") return "paid";
  if (status === "voided" || status === "cancelled") return "voided";
  if (status === "draft") return "draft";
  const today = new Date().toISOString().slice(0, 10);
  return !!dueDate && dueDate < today ? "overdue" : "open";
}

// WHAT THE SEARCH BOX ACTUALLY SEARCHES. It was the customer name and nothing else, so looking an
// invoice up by its number, which is how anyone holding a paper copy or an e-mail would look, found
// nothing at all. Customer name and invoice number both, matched case-insensitively.
function matchesToSearch(inv: OutgoingInvoice, q: string): boolean {
  if (!q) return true;
  const fields = [inv.customers?.name ?? "", inv.invoice_number ?? ""];
  return fields.some((field) => field.toLowerCase().includes(q));
}

function OutgoingInvoicesPage() {
  const { t } = useTranslation();
  const canUpload = useFeature(PERMISSIONS.outgoingInvoicesUpload);
  const [companyId, setCompanyId] = useState(ALL);
  const [status, setStatus] = useState<StatusFilter | typeof ALL>(ALL);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const companiesQ = useCompanies();
  const companies = companiesQ.data ?? [];
  const invoicesQ = useOutgoingInvoices({
    companyId: companyId === ALL ? undefined : companyId,
  });
  const bulkSync = useSyncInvoiceToLexoffice();
  const invoiceSettingsQ = useInvoiceSettings();
  const requireAccountingCheck = invoiceSettingsQ.data?.require_accounting_check ?? false;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [companyId, status, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoicesQ.data ?? []).filter((inv) => {
      if (status !== ALL && effectiveStatus(inv.status, paymentDueOn(inv)) !== status) return false;
      if (!matchesToSearch(inv, q)) return false;
      return true;
    });
  }, [invoicesQ.data, status, search]);

  // KPI TILES, the same four-plus-one this screen's sibling has. Incoming invoices carried a row
  // of tiles and this one went straight from the filters into the table, so the two screens under
  // the same nav entry answered "how is this queue doing?" in completely different ways. Counted
  // over everything the search matches, EXCEPT the status filter, so the tiles keep working as
  // status toggles the way they do on the incoming screen.
  const metrics = useMemo(() => {
    const q = search.trim().toLowerCase();
    const basis = (invoicesQ.data ?? []).filter((inv) => matchesToSearch(inv, q));
    let open = 0;
    let overdue = 0;
    let volume = 0;
    let unpaidAmount = 0;
    let openAmount = 0;
    let overdueAmount = 0;
    let paid = 0;
    let paidAmount = 0;
    for (const inv of basis) {
      const stand = effectiveStatus(inv.status, paymentDueOn(inv));
      const gross = inv.amount_gross ?? 0;
      // A voided invoice is not money anybody expects, so it counts in neither total.
      if (stand !== "voided") volume += gross;
      if (stand === "open" || stand === "overdue") {
        unpaidAmount += gross;
        if (stand === "overdue") {
          overdue += 1;
          overdueAmount += gross;
        } else {
          open += 1;
          openAmount += gross;
        }
      }
      if (stand === "paid") {
        paid += 1;
        paidAmount += gross;
      }
    }
    return {
      total: basis.length,
      open,
      overdue,
      volume,
      unpaidAmount,
      openAmount,
      overdueAmount,
      paid,
      paidAmount,
    };
  }, [invoicesQ.data, search]);

  const queueCards = useMemo(() => {
    const specs: {
      key: string;
      tone: QueueTone;
      icon: ComponentType<{ className?: string }>;
      target: StatusFilter | typeof ALL;
      count: number;
      amount: number;
    }[] = [
      {
        key: "open",
        tone: "warning",
        icon: Clock,
        target: "open",
        count: metrics.open,
        amount: metrics.openAmount,
      },
      {
        key: "overdue",
        tone: "danger",
        icon: AlertTriangle,
        target: "overdue",
        count: metrics.overdue,
        amount: metrics.overdueAmount,
      },
      {
        key: "paid",
        tone: "success",
        icon: CheckCircle2,
        target: "paid",
        count: metrics.paid,
        amount: metrics.paidAmount,
      },
    ];
    return specs.map((spec) => ({
      key: spec.key,
      label: t(`outgoingInvoices.list.queue.${spec.key}.label`),
      description: t(`outgoingInvoices.list.queue.${spec.key}.desc`),
      count: String(spec.count),
      amount: formatEUR(spec.amount),
      tone: spec.tone,
      icon: spec.icon,
      active: status === spec.target,
      onSelect: () => setStatus(status === spec.target ? ALL : spec.target),
    }));
  }, [metrics, status, setStatus, t]);

  const view = useTableView(filtered, {
    initialSort: "date",
    initialDir: "desc",
    resetKey: `${companyId}:${status}:${search}`,
    sortValue: (inv, key) => {
      switch (key) {
        case "customer":
          return inv.customers?.name ?? "";
        case "amount":
          return inv.amount_gross ?? 0;
        case "due":
          return paymentDueOn(inv) ?? "";
        default:
          return inv.invoice_date ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "date", label: t("outgoingInvoices.list.col.date") },
    { value: "customer", label: t("outgoingInvoices.list.col.customer") },
    { value: "amount", label: t("outgoingInvoices.list.col.amount") },
    { value: "due", label: t("outgoingInvoices.list.col.due") },
  ];

  const pageRowIds = view.pageRows
    .filter((inv) => !needsAccountingCheck(inv, requireAccountingCheck))
    .map((inv) => inv.id);
  const allOnPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageRowIds.some((id) => selectedIds.has(id));

  function toggleAllOnPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageRowIds.forEach((id) => next.delete(id));
      else pageRowIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendSelectedToLexoffice() {
    const byId = new Map((invoicesQ.data ?? []).map((inv) => [inv.id, inv]));
    const ids = [...selectedIds].filter((id) => {
      const inv = byId.get(id);
      return !inv || !needsAccountingCheck(inv, requireAccountingCheck);
    });
    setBulkSending(true);
    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await bulkSync.mutateAsync(id);
        succeeded++;
      } catch {
        failed++;
      }
    }
    setBulkSending(false);
    setSelectedIds(new Set());
    if (failed === 0) {
      toast.success(t("outgoingInvoices.list.bulk.sendSuccess", { count: succeeded }));
    } else {
      toast.error(t("outgoingInvoices.list.bulk.sendPartial", { succeeded, failed }));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("outgoingInvoices.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              canUpload ? "outgoingInvoices.subtitle" : "outgoingInvoices.subtitleGeneratedOnly",
              brandVars(),
            )}
          </p>
        </div>
        {canUpload && (
          <Button asChild className="gap-2" data-tour="outgoing-actions">
            <Link to="/outgoing-invoices/upload">
              <UploadCloud className="size-4" /> {t("outgoingInvoices.upload.button")}
            </Link>
          </Button>
        )}
      </div>

      <div data-tour="outgoing-queue">
        <QueueKpiRow className="mt-6" cards={queueCards} loading={invoicesQ.isLoading} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3" data-tour="outgoing-filters">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("outgoingInvoices.list.search")}
            className="pl-9"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[220px]">
          <Label className="text-xs text-muted-foreground">
            {t("outgoingInvoices.list.filter.company")}
          </Label>
          <Combobox
            value={companyId}
            onValueChange={setCompanyId}
            options={[
              { value: ALL, label: t("outgoingInvoices.list.filter.allCompanies") },
              ...companies.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            ]}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[180px]">
          <Label className="text-xs text-muted-foreground">
            {t("outgoingInvoices.list.filter.status")}
          </Label>
          <Combobox
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter | typeof ALL)}
            options={[
              { value: ALL, label: t("outgoingInvoices.list.filter.allStatuses") },
              ...STATUS_VALUES.map((s) => ({
                value: s,
                label: t(`outgoingInvoices.status.${s}`),
              })),
            ]}
          />
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <SortControl
            columns={sortColumns}
            sort={view.sort}
            dir={view.dir}
            onSort={view.setSort}
            onDir={view.setDir}
          />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {t("outgoingInvoices.list.bulk.selectedCount", { count: selectedIds.size })}
          </span>
          <Button size="sm" disabled={bulkSending} onClick={sendSelectedToLexoffice}>
            {bulkSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {t("outgoingInvoices.list.bulk.sendSelected")}
          </Button>
        </div>
      )}

      {invoicesQ.isError ? (
        <div className="mt-4">
          <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />
        </div>
      ) : invoicesQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={6} />
        </div>
      ) : (
        <div
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card"
          data-tour="outgoing-table"
        >
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      someOnPageSelected ? (allOnPageSelected ? true : "indeterminate") : false
                    }
                    onCheckedChange={toggleAllOnPage}
                    aria-label={t("outgoingInvoices.list.bulk.selectAll")}
                  />
                </TableHead>
                <TableHead>{t("outgoingInvoices.list.col.nr")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.customer")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.property")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.company")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.date")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.due")}</TableHead>
                <TableHead className="text-right">
                  {t("outgoingInvoices.list.col.amount")}
                </TableHead>
                <TableHead>{t("outgoingInvoices.list.col.status")}</TableHead>
                <TableHead className="w-[132px] text-right">
                  {t("outgoingInvoices.list.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.pageRows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(inv.id)}
                      onCheckedChange={() => toggleRow(inv.id)}
                      disabled={needsAccountingCheck(inv, requireAccountingCheck)}
                      aria-label={t("outgoingInvoices.list.bulk.selectRow")}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {inv.invoice_number ?? t("outgoingInvoices.list.draft")}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {inv.customers?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <PropertyCell deal={inv.deal ?? null} />
                  </TableCell>
                  <TableCell>
                    <CompanyChip
                      code={companies.find((g) => g.id === inv.company_id)?.code ?? null}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {formatDate(inv.invoice_date)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {formatDate(paymentDueOn(inv))}
                    {!inv.due_date && inv.expected_payment_on && (
                      <span className="ml-1 text-xs">{t("outgoingInvoices.list.expected")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEUR(inv.amount_gross)}
                  </TableCell>
                  <TableCell>
                    <OutgoingStatusCell invoice={inv} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <LexofficeSyncButton
                        invoice={inv}
                        requireAccountingCheck={requireAccountingCheck}
                      />
                      <OutgoingInvoiceFileButton
                        invoiceId={inv.id}
                        invoiceNumber={inv.invoice_number}
                      />
                      {inv.kind === "commission" && (
                        <InvoiceMailTextButton
                          invoiceId={inv.id}
                          invoiceNumber={inv.invoice_number}
                        />
                      )}
                      <DeleteInvoiceButton invoice={inv} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {view.total === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    {t("outgoingInvoices.list.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!invoicesQ.isError && !invoicesQ.isLoading && view.total > 0 && (
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

const UPLOAD_STATUS_VALUES: OutgoingVoucherStatus[] = ["draft", "open", "paidoff", "voided"];
const STATUS_LABEL_KEY: Record<OutgoingVoucherStatus, string> = {
  draft: "draft",
  open: "open",
  paidoff: "paid",
  voided: "voided",
};

function OutgoingStatusCell({ invoice }: { invoice: OutgoingInvoice }) {
  const { t } = useTranslation();
  const setStatus = useSetUploadedOutgoingInvoiceStatus();

  if (invoice.source !== "upload") {
    const effective = effectiveStatus(invoice.status, paymentDueOn(invoice));
    return (
      <Badge
        variant="outline"
        className={cn(
          "whitespace-nowrap font-medium",
          OUTGOING_INVOICE_EFFECTIVE_STATUS_META[effective]?.cls,
        )}
      >
        {t(`outgoingInvoices.status.${effective}`)}
      </Badge>
    );
  }

  return (
    <Select
      value={invoice.status}
      onValueChange={(v) =>
        setStatus.mutate(
          { id: invoice.id, status: v as OutgoingVoucherStatus },
          {
            onError: (e) =>
              toast.error(
                t("outgoingInvoices.list.statusFailed", {
                  error: errorText(e),
                }),
              ),
          },
        )
      }
      disabled={setStatus.isPending}
    >
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {UPLOAD_STATUS_VALUES.map((s) => (
          <SelectItem key={s} value={s}>
            {t(`outgoingInvoices.status.${STATUS_LABEL_KEY[s]}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ROW_ICON_BOX = "inline-flex size-9 shrink-0 items-center justify-center";

const RowIconAction = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { label: string }
>(function RowIconAction({ label, className, children, ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(ROW_ICON_BOX, className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{label}</TooltipContent>
    </Tooltip>
  );
});

function RowIconStatus({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className={cn(ROW_ICON_BOX, className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowIconLink({
  label,
  href,
  className,
  children,
}: {
  label: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className={cn(ROW_ICON_BOX, "rounded-md transition hover:bg-muted", className)}
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{label}</TooltipContent>
    </Tooltip>
  );
}

// Lexware's own web app, not the REST API: confirmed live by opening a real sales invoice there
// and reading the address bar.
function lexwareInvoiceUrl(id: string): string {
  return `https://app.lexware.de/vouchers#!/VoucherList//Invoice/${id}`;
}

function PropertyCell({
  deal,
}: {
  deal: {
    id: string;
    property_label: string | null;
    property: { external_id: string | null } | null;
  } | null;
}) {
  const { t } = useTranslation();

  if (!deal) return <span className="text-muted-foreground">-</span>;

  return (
    <div className="flex items-center gap-1">
      <Link
        to="/commission-deals/$id"
        params={{ id: deal.id }}
        className="truncate text-foreground underline-offset-2 hover:underline"
      >
        {deal.property_label ?? t("outgoingInvoices.list.property.untitled")}
      </Link>
      {deal.property?.external_id ? (
        <RowIconLink
          label={t("outgoingInvoices.list.property.openInPropstack")}
          href={propstackUnitUrl(deal.property.external_id)}
          className="size-7 text-muted-foreground"
        >
          <ExternalLink className="size-3.5" />
        </RowIconLink>
      ) : null}
    </div>
  );
}

function LexofficeSyncButton({
  invoice,
  requireAccountingCheck,
}: {
  invoice: OutgoingInvoice;
  requireAccountingCheck: boolean;
}) {
  const { t } = useTranslation();
  const canSync = useFeature(PERMISSIONS.lexofficeSync);
  const canMarkChecked = useFeature(PERMISSIONS.outgoingInvoicesAccountingCheck);
  const fetchesFile = useFeature(PERMISSIONS.lexofficeInvoiceFileFetch);
  const sync = useSyncInvoiceToLexoffice();
  const markChecked = useMarkOutgoingInvoiceAccountingChecked();

  if (!canSync || invoice.source !== "app" || invoice.kind === "referral_credit") return null;

  function requestAccountingCheck() {
    markChecked.mutate(invoice.id, {
      onSuccess: () => toast.success(t("outgoingInvoices.list.accountingCheck.success")),
      onError: (e: Error) =>
        toast.error(t("outgoingInvoices.list.accountingCheck.failed", { error: errorText(e) })),
    });
  }

  const fileDone = !fetchesFile || !!invoice.lexoffice_file_fetched_at;
  const stuck = lexofficeSyncIsStuck(invoice.lexoffice_sync_requested_at);

  function requestSync() {
    sync.mutate(invoice.id, {
      onSuccess: () => toast.success(t("outgoingInvoices.list.lexoffice.success")),
      onError: (e: Error) =>
        toast.error(t("outgoingInvoices.list.lexoffice.failed", { error: errorText(e) })),
    });
  }

  if (invoice.accounting_external_id && fileDone && !invoice.lexoffice_sync_error) {
    return (
      <RowIconLink
        label={t("outgoingInvoices.list.lexoffice.openInLexware")}
        href={lexwareInvoiceUrl(invoice.accounting_external_id)}
        className="text-muted-foreground"
      >
        <ExternalLink className="size-4" />
      </RowIconLink>
    );
  }

  if (invoice.lexoffice_sync_requested_at && !invoice.lexoffice_sync_error && !stuck) {
    return (
      <RowIconStatus
        label={t("outgoingInvoices.list.lexoffice.pending")}
        className="text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
      </RowIconStatus>
    );
  }

  if (invoice.accounting_external_id || invoice.lexoffice_sync_error || stuck) {
    return (
      <RowIconAction
        onClick={requestSync}
        disabled={sync.isPending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        label={
          invoice.lexoffice_sync_error ??
          (stuck
            ? t("outgoingInvoices.list.lexoffice.timedOut")
            : t("outgoingInvoices.list.lexoffice.retry"))
        }
      >
        {sync.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <AlertTriangle className="size-4" />
        )}
      </RowIconAction>
    );
  }

  if (invoice.status !== "draft") return null;

  if (needsAccountingCheck(invoice, requireAccountingCheck)) {
    if (!canMarkChecked) {
      return (
        <RowIconStatus
          label={t("outgoingInvoices.list.accountingCheck.needsCheck")}
          className="text-muted-foreground"
        >
          <Clock className="size-4" />
        </RowIconStatus>
      );
    }
    return (
      <RowIconAction
        onClick={requestAccountingCheck}
        disabled={markChecked.isPending}
        className="text-muted-foreground"
        label={t("outgoingInvoices.list.accountingCheck.markChecked")}
      >
        {markChecked.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
      </RowIconAction>
    );
  }

  return (
    <RowIconAction
      onClick={requestSync}
      disabled={sync.isPending}
      className="text-muted-foreground"
      label={t("outgoingInvoices.list.lexoffice.send")}
    >
      {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
    </RowIconAction>
  );
}

// Signed URL is minted lazily on click (enabled: false) rather than for every rendered row — a
// list page can show many upload-sourced invoices at once, and each mint is its own RLS-checked
// server round trip.
function OutgoingInvoiceFileButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
}) {
  const { t } = useTranslation();
  const fileUrlQ = useOutgoingInvoiceFileUrl(invoiceId, { enabled: false });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ previewUrl: string; mime: string | null } | null>(null);
  const [pageRendered, setPageRendered] = useState(false);

  const title = invoiceNumber
    ? t("outgoingInvoices.list.fileDialog.title", { number: invoiceNumber })
    : t("outgoingInvoices.list.fileDialog.titleDraft");

  async function showFile() {
    setPageRendered(false);
    setOpen(true);
    try {
      const res = await fileUrlQ.refetch();
      if (res.data?.previewUrl) {
        setFile({ previewUrl: res.data.previewUrl, mime: res.data.mime });
      } else {
        setOpen(false);
        toast.error(t("outgoingInvoices.list.fileFailed"));
      }
    } catch (e) {
      setOpen(false);
      toast.error(
        t("outgoingInvoices.list.fileFailedWithError", {
          error: errorText(e),
        }),
      );
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setFile(null);
  }

  return (
    <>
      <RowIconAction
        onClick={showFile}
        className="text-muted-foreground"
        label={t("outgoingInvoices.list.viewFile")}
      >
        <FileText className="size-4" />
      </RowIconAction>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-semibold tracking-tight">{title}</DialogTitle>
          </DialogHeader>
          {!file ? (
            <Skeleton className="h-[80vh] w-full" />
          ) : file.mime === "application/pdf" ? (
            <div className="relative h-[80vh] w-full overflow-hidden rounded-lg border border-border bg-muted/40">
              {!pageRendered && (
                <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" />
              )}
              <PdfPane
                url={file.previewUrl}
                onReady={() => setPageRendered(true)}
                className="h-full w-full"
              />
            </div>
          ) : file.mime?.startsWith("image/") ? (
            <div className="max-h-[80vh] overflow-auto rounded-lg border border-border bg-muted/40 p-4">
              <img src={file.previewUrl} alt={title} className="mx-auto w-full" />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              {t("outgoingInvoices.list.fileDialog.cannotDisplay")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Shows which of the three invoice mail texts belongs to this commission invoice, resolved
// server-side from its side and the deal's realised price (see invoice-settings for the texts
// themselves). Sending stays manual, outside the Hub -- this is only a reference to copy from.
function InvoiceMailTextButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mailTextQ = useOutgoingInvoiceMailText(invoiceId, open);

  const title = invoiceNumber
    ? t("outgoingInvoices.list.mailText.title", { number: invoiceNumber })
    : t("outgoingInvoices.list.mailText.titleDraft");

  return (
    <>
      <RowIconAction
        onClick={() => setOpen(true)}
        className="text-muted-foreground"
        label={t("outgoingInvoices.list.mailText.button")}
      >
        <Mail className="size-4" />
      </RowIconAction>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-semibold tracking-tight">{title}</DialogTitle>
          </DialogHeader>
          {mailTextQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !mailTextQ.data ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              {t("outgoingInvoices.list.mailText.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>{t("outgoingInvoices.list.mailText.subject")}</Label>
                <p className="mt-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  {mailTextQ.data.subject}
                </p>
              </div>
              <div>
                <Label>{t("outgoingInvoices.list.mailText.body")}</Label>
                <pre className="mt-1 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 font-sans text-sm">
                  {mailTextQ.data.body}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Trash (Briefing Screen 18, §3.4): the only place a duplicate/wrongly-created outgoing invoice
// could be soft-deleted before was directly via SQL -- the columns and the /papierkorb view
// already existed (migration 0046), just no button to reach them.
function DeleteInvoiceButton({ invoice }: { invoice: OutgoingInvoice }) {
  const { t } = useTranslation();
  const softDelete = useSoftDeleteOutgoingInvoice(invoice.id);
  const [reason, setReason] = useState("");

  function confirmDelete() {
    softDelete.mutate(reason.trim(), {
      onSuccess: () => {
        toast.success(t("outgoingInvoices.list.delete.toastOk"));
        setReason("");
      },
      onError: (e) =>
        toast.error(
          t("outgoingInvoices.list.delete.toastFailed", {
            error: errorText(e),
          }),
        ),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <RowIconAction
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          label={t("outgoingInvoices.list.delete.button")}
        >
          <Trash2 className="size-4" />
        </RowIconAction>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("outgoingInvoices.list.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("outgoingInvoices.list.delete.desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("outgoingInvoices.list.delete.reasonPlaceholder")}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("outgoingInvoices.list.delete.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={confirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("outgoingInvoices.list.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
