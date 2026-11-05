import { useMemo, useState } from "react";
import { useFocus } from "@/lib/use-focus";
import { Download, Search, Send } from "lucide-react";

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ErrorState,
  Input,
  TablePagination,
  TableSkeleton,
  formatEUR,
  useTableView,
  useDatevHandoverBatches,
  useDatevHandoverStatus,
  useDatevOutgoingCandidates,
  useDatevRoutes,
  useCompanies,
  useTranslation,
} from "./adapter";
import type { DatevHandoverConfig } from "./config";
import { BounceBanner } from "./BounceBanner";
import { CompanyTable, type RowHandlers } from "./CompanyTable";
import { ExportDrawer } from "./ExportDrawer";
import { HistoryDrawer } from "./HistoryDrawer";
import { SendDrawer } from "./SendDrawer";
import { SetupDrawer } from "./SetupDrawer";
import {
  buildRows,
  filterRows,
  fleetSummary,
  STATUS_FILTERS,
  toSendTarget,
  type CompanyRow,
  type SendTarget,
  type StatusFilter,
} from "./model";

// One page, one table. Both the header's and a row's send go through the same review drawer -- DATEV has no recall.
export function DatevHandoverPage({ config }: { config: DatevHandoverConfig }) {
  useFocus();
  const { t } = useTranslation();
  const companiesQ = useCompanies();
  const routesQ = useDatevRoutes();
  const statusQ = useDatevHandoverStatus();
  const batchesQ = useDatevHandoverBatches();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("alle");
  const [setupRow, setSetupRow] = useState<CompanyRow | null>(null);
  const [historyRow, setHistoryRow] = useState<CompanyRow | null>(null);
  /** Which companies the open drawer is about. Null when it is closed. */
  const [sendIds, setSendIds] = useState<string[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const rows = useMemo(
    () =>
      buildRows({
        companies: companiesQ.data ?? [],
        routes: routesQ.data ?? [],
        status: statusQ.data,
        batches: batchesQ.data ?? [],
      }),
    [companiesQ.data, routesQ.data, statusQ.data, batchesQ.data],
  );

  const outgoingQ = useDatevOutgoingCandidates({
    enabled: !!sendIds && config.outgoingFiles !== false,
  });

  const sendTargets = useMemo<SendTarget[] | null>(() => {
    if (!sendIds) return null;
    const wanted = new Set(sendIds);
    return rows
      .filter((r) => wanted.has(r.company.id))
      .map((r) => toSendTarget(r, outgoingQ.data?.[r.company.id] ?? []));
  }, [sendIds, rows, outgoingQ.data]);

  const summary = useMemo(() => fleetSummary(rows), [rows]);
  const visible = useMemo(() => filterRows(rows, search, status), [rows, search, status]);

  // sortValue returns a constant: this table is deliberately not user-sortable, buildRows already orders it by what needs doing.
  const view = useTableView(visible, {
    sortValue: () => 0,
    initialSort: "rang",
    resetKey: `${search}:${status}`,
  });

  const loading = companiesQ.isLoading || statusQ.isLoading || batchesQ.isLoading;

  // A failed query must not render as an empty/wrong-looking table -- that invites overwriting addresses already on file.
  const error = statusQ.error ?? companiesQ.error ?? routesQ.error ?? batchesQ.error;
  const reload = () => {
    if (companiesQ.isError) void companiesQ.refetch();
    if (routesQ.isError) void routesQ.refetch();
    if (statusQ.isError) void statusQ.refetch();
    if (batchesQ.isError) void batchesQ.refetch();
  };

  const handlers: RowHandlers = {
    onConfigure: setSetupRow,
    onSend: (row) => setSendIds([row.company.id]),
    onHistory: setHistoryRow,
  };

  const statusOptions = STATUS_FILTERS.map((s) => ({
    value: s,
    label: t(`handover.filter.${s}`),
  }));

  return (
    <div>
      <div data-tour="export-header" className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("handover.title")}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
            <Download className="size-4" />
            {t("handover.action.monthlyExport")}
          </Button>
          {!error && summary.sendable.length > 0 && (
            <Button
              className="gap-2"
              onClick={() => setSendIds(summary.sendable.map((r) => r.company.id))}
            >
              <Send className="size-4" />
              {t("handover.action.bulkSend")}
            </Button>
          )}
        </div>
      </div>

      {/* A failed delivery's receipts go back on the ready list and would resend to the same rejecting address unseen. */}
      <BounceBanner />

      {!error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {loading ? (
            <span />
          ) : (
            <p className="text-base text-muted-foreground">
              <span className="text-foreground">
                {t("handover.summary.companies", { count: summary.companies })}
              </span>
              {" · "}
              <span className={summary.filesReady > 0 ? "font-medium text-foreground" : undefined}>
                {t("handover.summary.ready", { count: summary.filesReady })}
                {summary.filesReady > 0 && ` (${formatEUR(summary.readyTotal)})`}
              </span>
              {" · "}
              {t("handover.summary.sent", { count: summary.alreadySent })}
              {summary.needSetup > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setStatus(status === "open" ? "alle" : "open")}
                    aria-pressed={status === "open"}
                    className="text-warning underline underline-offset-2 hover:no-underline focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {t("handover.summary.pending", { count: summary.needSetup })}
                  </button>
                </>
              )}
            </p>
          )}

          {/* Always shown regardless of register size, so the same screen doesn't offer different controls per Hub. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("handover.search")}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger
                className="w-[150px] shrink-0 sm:w-[170px]"
                aria-label={t("handover.col.setup")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div data-tour="export-list" data-focus="list" className="mt-5">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("handover.noCompanies")}
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("handover.noFilterMatch")}
          </p>
        ) : (
          <>
            <CompanyTable rows={view.pageRows} handlers={handlers} />
            {view.total > view.pageSize && (
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
          </>
        )}
      </div>

      <SetupDrawer row={setupRow} open={!!setupRow} onOpenChange={(o) => !o && setSetupRow(null)} />
      <HistoryDrawer
        row={historyRow}
        open={!!historyRow}
        onOpenChange={(o) => !o && setHistoryRow(null)}
      />
      <ExportDrawer open={exportOpen} onOpenChange={setExportOpen} />
      <SendDrawer
        targets={sendTargets ?? []}
        open={!!sendIds}
        onOpenChange={(o) => !o && setSendIds(null)}
      />
    </div>
  );
}
