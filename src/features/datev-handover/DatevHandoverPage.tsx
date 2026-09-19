import { useMemo, useState } from "react";
import { useFokus } from "@/lib/use-fokus";
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
  useGesellschaften,
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

/**
 * DATEV-Übergabe — one page, one workflow.
 *
 * It used to be three tabs: Übersicht, Verlauf, Konfiguration. Each was a coherent screen on its
 * own and together they broke the only job anybody comes here to do. Setting a company up meant
 * leaving the list that told you it needed setting up; checking what a send did meant leaving the
 * screen that had just done it; and the tab you happened to be on decided which of the four
 * questions the page could answer.
 *
 * Now the table is the page, and everything else opens over it:
 *
 *   WHAT NEEDS SETUP?  — the setup column, and the companies that need it sort to the top.
 *   WHAT IS READY?     — the ready column, and the one summary line above the table.
 *   WHAT HAS BEEN SENT? — the sent and last-sent columns; the detail is one menu item away.
 *   WHAT CAN I DO NOW? — one button per row, chosen by that row's state, plus the page action.
 *
 * TWO SENDS, DELIBERATELY DISTINCT. The header's "An DATEV senden" hands over every eligible file
 * across every company; a row's "Senden" hands over that company's. Both go through the same
 * drawer, which lists what is about to leave — neither is a shortcut past the review, because the
 * email cannot be recalled and DATEV has no return channel to tell anybody it went wrong.
 */
export function DatevHandoverPage({ config }: { config: DatevHandoverConfig }) {
  useFokus();
  const { t } = useTranslation();
  const companiesQ = useGesellschaften();
  const routesQ = useDatevRoutes();
  const statusQ = useDatevHandoverStatus();
  const batchesQ = useDatevHandoverBatches();

  const [suche, setSuche] = useState("");
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

  // Only while the drawer is open. The outgoing block is informational today (nothing sends that
  // direction yet), and it has no business costing every visitor to this page a query.
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
  const sichtbar = useMemo(() => filterRows(rows, suche, status), [rows, suche, status]);

  /**
   * The same pagination every master-data list on this app uses, so the controls and the page-size
   * choices are the ones people already know from Lieferanten and Gesellschaften.
   *
   * `sortValue` returns a constant on purpose. This table is NOT user-sortable: `buildRows` orders
   * it by what needs doing, which is a product decision and not a column somebody should be able
   * to undo. Array.prototype.sort is stable, so a constant key leaves that order exactly as built
   * and `useTableView` contributes only its paging.
   *
   * `resetKey` carries the filters, so narrowing the list returns to page one instead of leaving
   * the reader on a page that no longer exists.
   */
  const view = useTableView(sichtbar, {
    sortValue: () => 0,
    initialSort: "rang",
    resetKey: `${suche}:${status}`,
  });

  // Batches are part of the load, not an afterthought: a row's rank and its last-sent date both
  // depend on them, so letting them land after the table is drawn would re-sort the list under the
  // reader's cursor.
  const laedt = companiesQ.isLoading || statusQ.isLoading || batchesQ.isLoading;

  // Any of the three failing leaves the table lying rather than empty: a failed company query would
  // render "Keine Gesellschaften vorhanden", and a failed routes query would show every company as
  // "Nicht eingerichtet" — an invitation to overwrite addresses that are actually on file.
  const fehler = statusQ.error ?? companiesQ.error ?? routesQ.error ?? batchesQ.error;
  const neuLaden = () => {
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

  const statusOptionen = STATUS_FILTERS.map((s) => ({
    value: s,
    label: t(`datevUebergabe.filter.${s}`),
  }));

  return (
    <div>
      <div data-tour="export-header" className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("datevUebergabe.title")}
        </h1>
        {/* No greyed-out primary. A page-level action that cannot run is not a button somebody
            should have to test by clicking — when nothing is eligible the summary line below says
            so in words, which is the same information without the dead control. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Its own action, not a variant of Send: this downloads a month to the operator's
              machine and records nothing, where the handover emails the tax advisor and records
              itself. Secondary, because sending is what this page is for. */}
          <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
            <Download className="size-4" />
            {t("datevUebergabe.aktion.monatsexport")}
          </Button>
          {!fehler && summary.sendable.length > 0 && (
            <Button
              className="gap-2"
              onClick={() => setSendIds(summary.sendable.map((r) => r.company.id))}
            >
              <Send className="size-4" />
              {t("datevUebergabe.aktion.sammelversand")}
            </Button>
          )}
        </div>
      </div>

      {/* Above everything else: a delivery that failed after the fact outranks any queue. Those
          receipts are back on the ready list and will go out again to the address that just
          rejected them unless somebody looks at it first. */}
      <BounceBanner />

      {/* The counts on the left, the controls that narrow them on the right. One line rather than
          four cards: these are numbers somebody reads once on the way to the table, and as tiles
          they took a third of the first screen and pushed the actual content below the fold. */}
      {!fehler && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {laedt ? (
            <span />
          ) : (
            <p className="text-base text-muted-foreground">
              <span className="text-foreground">
                {t("datevUebergabe.summary.gesellschaften", { count: summary.companies })}
              </span>
              {" · "}
              <span className={summary.filesReady > 0 ? "font-medium text-foreground" : undefined}>
                {t("datevUebergabe.summary.bereit", { count: summary.filesReady })}
                {summary.filesReady > 0 && ` (${formatEUR(summary.readySumme)})`}
              </span>
              {" · "}
              {t("datevUebergabe.summary.gesendet", { count: summary.alreadySent })}
              {summary.needSetup > 0 && (
                <>
                  {" · "}
                  {/* The one number on this line that names work rather than reporting a total, so it
                    is the one that filters. Clicking it narrows the table to exactly those companies
                    instead of leaving the reader to find them by eye or reach for the status
                    dropdown, which is not even rendered on a short register. */}
                  <button
                    type="button"
                    onClick={() => setStatus(status === "open" ? "alle" : "open")}
                    aria-pressed={status === "open"}
                    className="text-warning underline underline-offset-2 hover:no-underline focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {t("datevUebergabe.summary.offen", { count: summary.needSetup })}
                  </button>
                </>
              )}
            </p>
          )}

          {/* ALWAYS SHOWN, whatever the register holds. It used to appear only past six companies,
              which meant the controls were there on Eiffler's 29 and missing on this client's 6, and the
              summary line could set a filter this Hub then gave you no visible way to clear. The
              same screen should not offer different controls per Hub. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Sized, not `w-full max-w-xs`. Inside a flex row `w-full` makes the input demand
                  the whole line, which pushed the status filter onto a second one and left the
                  header two rows tall with a gap down its middle. */}
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder={t("datevUebergabe.suche")}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger
                className="w-[150px] shrink-0 sm:w-[170px]"
                aria-label={t("datevUebergabe.spalte.einrichtung")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptionen.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div data-tour="export-list" data-fokus="liste" className="mt-5">
        {fehler ? (
          <ErrorState error={fehler} onRetry={neuLaden} />
        ) : laedt ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("datevUebergabe.leerGesellschaften")}
          </p>
        ) : sichtbar.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("datevUebergabe.leerFilter")}
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
