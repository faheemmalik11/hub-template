import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { QueueKpiRow } from "@/components/invoice-queue/queue-kpi-row";
import type { QueueTone } from "@/components/invoice-queue/queue-kpi-card";
import { Button } from "@/components/ui/button";
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
  useOutgoingInvoiceFileUrl,
  useOutgoingInvoices,
  useSetUploadedOutgoingInvoiceStatus,
  useSoftDeleteOutgoingInvoice,
} from "@/data";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { CompanyChip } from "@/components/documents/badges";
import { SortControl } from "@/components/data-table/sort-control";
import { TablePagination } from "@/components/data-table/table-pagination";
import { useTableView } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";
import type { OutgoingInvoice, OutgoingVoucherStatus } from "@/lib/data/types";
import { brandVars, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/outgoing-invoices/")({
  head: () => ({ meta: [{ title: pageTitle("Ausgangsrechnungen") }] }),
  component: OutgoingInvoicesPage,
});

const ALL = "__alle";
const STATUS_VALUES = ["draft", "open", "overdue", "paid", "voided"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function effectiveStatus(status: OutgoingVoucherStatus, dueDate: string | null): StatusFilter {
  if (status === "paidoff") return "paid";
  if (status === "voided") return "voided";
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
  const [companyId, setCompanyId] = useState(ALL);
  const [status, setStatus] = useState<StatusFilter | typeof ALL>(ALL);
  const [search, setSearch] = useState("");

  const companiesQ = useCompanies();
  const companies = companiesQ.data ?? [];
  const invoicesQ = useOutgoingInvoices({
    companyId: companyId === ALL ? undefined : companyId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoicesQ.data ?? []).filter((inv) => {
      if (status !== ALL && effectiveStatus(inv.status, inv.due_date) !== status) return false;
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
      const stand = effectiveStatus(inv.status, inv.due_date);
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
    initialSort: "datum",
    initialDir: "desc",
    resetKey: `${companyId}:${status}:${search}`,
    sortValue: (inv, key) => {
      switch (key) {
        case "kunde":
          return inv.customers?.name ?? "";
        case "betrag":
          return inv.amount_gross ?? 0;
        case "faellig":
          return inv.due_date ?? "";
        default:
          return inv.invoice_date ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "datum", label: t("outgoingInvoices.list.col.datum") },
    { value: "kunde", label: t("outgoingInvoices.list.col.kunde") },
    { value: "betrag", label: t("outgoingInvoices.list.col.betrag") },
    { value: "faellig", label: t("outgoingInvoices.list.col.faellig") },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("outgoingInvoices.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("outgoingInvoices.subtitle", brandVars())}
          </p>
        </div>
        <Button asChild className="gap-2" data-tour="outgoing-actions">
          <Link to="/outgoing-invoices/upload">
            <UploadCloud className="size-4" /> {t("outgoingInvoices.hochladen.button")}
          </Link>
        </Button>
      </div>

      <div data-tour="outgoing-queue">
        <QueueKpiRow className="mt-6" cards={queueCards} loading={invoicesQ.isLoading} />
      </div>

      {/* The total is not a filter, so it is a line rather than a card: a fourth card would be
          active on every fresh page and read as a filter nobody applied. */}
      <p className="mt-2 text-xs text-muted-foreground">
        {t("outgoingInvoices.list.kpi.volumenZeile", {
          count: metrics.total,
          total: formatEUR(metrics.volume),
        })}
      </p>

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
            {t("outgoingInvoices.list.filter.gesellschaft")}
          </Label>
          <Combobox
            value={companyId}
            onValueChange={setCompanyId}
            options={[
              { value: ALL, label: t("outgoingInvoices.list.filter.alleGesellschaften") },
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
              { value: ALL, label: t("outgoingInvoices.list.filter.alleStatus") },
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
                <TableHead>{t("outgoingInvoices.list.col.nr")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.kunde")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.gesellschaft")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.datum")}</TableHead>
                <TableHead>{t("outgoingInvoices.list.col.faellig")}</TableHead>
                <TableHead className="text-right">
                  {t("outgoingInvoices.list.col.betrag")}
                </TableHead>
                <TableHead>{t("outgoingInvoices.list.col.status")}</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.pageRows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium text-foreground">
                    {inv.invoice_number ?? t("outgoingInvoices.list.entwurf")}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {inv.customers?.name ?? "—"}
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
                    {formatDate(inv.due_date)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEUR(inv.amount_gross)}
                  </TableCell>
                  <TableCell>
                    <OutgoingStatusCell invoice={inv} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <OutgoingInvoiceFileButton invoiceId={inv.id} />
                      <DeleteInvoiceButton invoice={inv} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {view.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
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

// Every outgoing invoice is editable here directly — there's no external system with its own
// opinion on status (LexOffice removed entirely, migration 0086).
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

  return (
    <Select
      value={invoice.status}
      onValueChange={(v) =>
        setStatus.mutate(
          { id: invoice.id, status: v as OutgoingVoucherStatus },
          {
            onError: (e) =>
              toast.error(
                t("outgoingInvoices.list.statusFehlgeschlagen", {
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

// Signed URL is minted lazily on click (enabled: false) rather than for every rendered row — a
// list page can show many upload-sourced invoices at once, and each mint is its own RLS-checked
// server round trip.
function OutgoingInvoiceFileButton({ invoiceId }: { invoiceId: string }) {
  const { t } = useTranslation();
  const fileUrlQ = useOutgoingInvoiceFileUrl(invoiceId, { enabled: false });
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fileUrlQ.refetch();
      if (res.data?.previewUrl) {
        window.open(res.data.previewUrl, "_blank", "noreferrer");
      } else {
        toast.error(t("outgoingInvoices.list.dateiFehlgeschlagen"));
      }
    } catch (e) {
      toast.error(
        t("outgoingInvoices.list.dateiFehlgeschlagenMitFehler", {
          error: errorText(e),
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      title={t("outgoingInvoices.list.dateiAnsehen")}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
    </button>
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
          t("outgoingInvoices.list.delete.toastFehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("outgoingInvoices.list.delete.button")}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("outgoingInvoices.list.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("outgoingInvoices.list.delete.desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("outgoingInvoices.list.delete.grundPlaceholder")}
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
