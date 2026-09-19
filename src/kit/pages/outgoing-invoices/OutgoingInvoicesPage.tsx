import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Combobox } from "../../ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { QueueKpiRow, type QueueCard } from "../../components/invoice-queue";
import type {
  OutgoingInvoiceAdapter,
  OutgoingInvoiceRecord,
  OutgoingInvoiceStatus,
} from "../../adapters/outgoing-invoices";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishOutgoingInvoicesLabels, type OutgoingInvoicesLabels } from "./labels";

const ALL = "__all";
type EffectiveStatus = "draft" | "open" | "overdue" | "paid" | "voided";

function effectiveStatus(status: OutgoingInvoiceStatus, dueDate: string | null): EffectiveStatus {
  if (status === "paidoff") return "paid";
  if (status === "voided") return "voided";
  if (status === "draft") return "draft";
  const today = new Date().toISOString().slice(0, 10);
  return dueDate && dueDate < today ? "overdue" : "open";
}

export interface OutgoingInvoicesPageProps {
  adapter: OutgoingInvoiceAdapter;
  labels?: OutgoingInvoicesLabels;
}

export function OutgoingInvoicesPage({
  adapter,
  labels = englishOutgoingInvoicesLabels,
}: OutgoingInvoicesPageProps) {
  const [companyId, setCompanyId] = useState(ALL);
  const [status, setStatus] = useState<EffectiveStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState("");

  const invoicesQuery = adapter.useInvoices(companyId === ALL ? undefined : companyId);
  const companyOptionsQuery = adapter.useCompanyOptions();

  const matchesSearch = (invoice: OutgoingInvoiceRecord, term: string) => {
    if (!term) return true;
    return [invoice.customer_name ?? "", invoice.voucher_number ?? ""].some((f) =>
      f.toLowerCase().includes(term),
    );
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoicesQuery.data.filter((invoice) => {
      if (status !== ALL && effectiveStatus(invoice.voucher_status, invoice.due_date) !== status)
        return false;
      return matchesSearch(invoice, term);
    });
  }, [invoicesQuery.data, status, search]);

  const totals = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = invoicesQuery.data.filter((invoice) => matchesSearch(invoice, term));
    let openCount = 0;
    let openAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;
    let volume = 0;
    for (const invoice of base) {
      const state = effectiveStatus(invoice.voucher_status, invoice.due_date);
      const amount = invoice.amount_gross ?? 0;
      if (state !== "voided") volume += amount;
      if (state === "open") {
        openCount += 1;
        openAmount += amount;
      } else if (state === "overdue") {
        overdueCount += 1;
        overdueAmount += amount;
      } else if (state === "paid") {
        paidCount += 1;
        paidAmount += amount;
      }
    }
    return {
      count: base.length,
      volume,
      openCount,
      openAmount,
      overdueCount,
      overdueAmount,
      paidCount,
      paidAmount,
    };
  }, [invoicesQuery.data, search]);

  const queueCards: QueueCard[] = [
    {
      key: "open",
      label: labels.queueOpenLabel,
      description: labels.queueOpenDescription,
      count: String(totals.openCount),
      amount: adapter.formatMoney(totals.openAmount),
      tone: "warning",
      icon: Clock,
      active: status === "open",
      onSelect: () => setStatus(status === "open" ? ALL : "open"),
    },
    {
      key: "overdue",
      label: labels.queueOverdueLabel,
      description: labels.queueOverdueDescription,
      count: String(totals.overdueCount),
      amount: adapter.formatMoney(totals.overdueAmount),
      tone: "danger",
      icon: AlertTriangle,
      active: status === "overdue",
      onSelect: () => setStatus(status === "overdue" ? ALL : "overdue"),
    },
    {
      key: "paid",
      label: labels.queuePaidLabel,
      description: labels.queuePaidDescription,
      count: String(totals.paidCount),
      amount: adapter.formatMoney(totals.paidAmount),
      tone: "success",
      icon: CheckCircle2,
      active: status === "paid",
      onSelect: () => setStatus(status === "paid" ? ALL : "paid"),
    },
  ];

  const view = useTableView(filtered, {
    initialSort: "date",
    initialDirection: "desc",
    resetKey: `${companyId}|${status}|${search}`,
    sortValue: (invoice, key) => {
      switch (key) {
        case "customer":
          return invoice.customer_name ?? "";
        case "amount":
          return invoice.amount_gross ?? 0;
        case "due":
          return invoice.due_date ?? "";
        default:
          return invoice.voucher_date ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "date", label: labels.columnDate },
    { value: "customer", label: labels.columnCustomer },
    { value: "amount", label: labels.columnAmount },
    { value: "due", label: labels.columnDue },
  ];

  const companyOptions = companyOptionsQuery.data;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Button className="gap-2" onClick={adapter.openUpload}>
          <UploadCloud className="size-4" /> {labels.uploadButton}
        </Button>
      </div>

      <QueueKpiRow className="mt-6" cards={queueCards} loading={invoicesQuery.loading} />
      <p className="mt-2 text-xs text-muted-foreground">
        {labels.volumeLine(totals.count, adapter.formatMoney(totals.volume))}
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[220px]">
          <Label className="text-xs text-muted-foreground">{labels.companyLabel}</Label>
          <Combobox
            value={companyId}
            onValueChange={setCompanyId}
            options={[
              { value: ALL, label: labels.companyAll },
              ...companyOptions.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[180px]">
          <Label className="text-xs text-muted-foreground">{labels.statusLabel}</Label>
          <Combobox
            value={status}
            onValueChange={(v) => setStatus(v as EffectiveStatus | typeof ALL)}
            options={[
              { value: ALL, label: labels.statusAll },
              { value: "draft", label: labels.statusDraft },
              { value: "open", label: labels.statusOpen },
              { value: "overdue", label: labels.statusOverdue },
              { value: "paid", label: labels.statusPaid },
              { value: "voided", label: labels.statusVoided },
            ]}
          />
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <SortControl
            columns={sortColumns}
            sort={view.sort}
            direction={view.direction}
            onSort={view.setSort}
            onDirection={view.setDirection}
            labels={labels}
          />
        </div>
      </div>

      {invoicesQuery.error ? (
        <div className="mt-4">
          <ErrorState error={invoicesQuery.error} onRetry={() => {}} />
        </div>
      ) : invoicesQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{labels.columnNumber}</TableHead>
                <TableHead>{labels.columnCustomer}</TableHead>
                <TableHead>{labels.columnCompany}</TableHead>
                <TableHead>{labels.columnDate}</TableHead>
                <TableHead>{labels.columnDue}</TableHead>
                <TableHead className="text-right">{labels.columnAmount}</TableHead>
                <TableHead>{labels.columnStatus}</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.pageRows.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  adapter={adapter}
                  labels={labels}
                  companies={companyOptions}
                />
              ))}
              {view.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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

function InvoiceRow({
  invoice,
  adapter,
  labels,
  companies,
}: {
  invoice: OutgoingInvoiceRecord;
  adapter: OutgoingInvoiceAdapter;
  labels: OutgoingInvoicesLabels;
  companies: { id: string; code: string; name: string }[];
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const company = companies.find((c) => c.id === invoice.company_id);

  async function changeStatus(next: OutgoingInvoiceStatus) {
    try {
      await adapter.setStatus(invoice.id, next);
      toast.success(labels.statusUpdated);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function confirmDelete() {
    try {
      await adapter.softDelete(invoice.id);
      toast.success(labels.deletedToast);
      setDeleteOpen(false);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        {invoice.voucher_number ?? labels.draftPlaceholder}
      </TableCell>
      <TableCell className="text-sm text-foreground">{invoice.customer_name ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{company?.code ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {adapter.formatDate(invoice.voucher_date)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {adapter.formatDate(invoice.due_date)}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {adapter.formatMoney(invoice.amount_gross)}
      </TableCell>
      <TableCell>
        <Select
          value={invoice.voucher_status}
          onValueChange={(v) => changeStatus(v as OutgoingInvoiceStatus)}
        >
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{labels.statusDraft}</SelectItem>
            <SelectItem value="open">{labels.statusOpen}</SelectItem>
            <SelectItem value="paidoff">{labels.statusPaid}</SelectItem>
            <SelectItem value="voided">{labels.statusVoided}</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {adapter.openFile && (
            <button
              type="button"
              title={labels.viewFile}
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => adapter.openFile!(invoice.id)}
            >
              <Eye className="size-3.5" />
            </button>
          )}
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                title={labels.deleteButton}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.deleteDialogTitle}</AlertDialogTitle>
                <AlertDialogDescription>{labels.deleteDialogDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.deleteCancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {labels.deleteConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
