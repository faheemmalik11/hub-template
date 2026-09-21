// The bank sync log, as an operational panel: filter by event / level / connection, page through the
// history, refresh on demand, and let it poll itself with a visible countdown to the next refresh.
//
// It used to be a bare "newest 50 rows" table, which is fine on day one and useless once a few hundred
// rows accumulate — you could neither find the failure you were looking for nor see anything past the
// first page. The sync now also runs hourly on its own (pipeline migration 0022), so this is the screen
// where you find out whether that worked.
//
// The countdown is derived from react-query's dataUpdatedAt rather than a timer we own, so it always
// agrees with when the query will actually refetch — including after a manual refresh, which resets it.
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/data-table/table-pagination";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { FilterPills } from "@/components/data-table/filter-pills";
import {
  usePeriodOptions,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { cn } from "@/lib/utils";
import { useBankConnections, useBankSyncLogFacets, useBankSyncLogsPage } from "@/data";
import { dateLocale, formatDate, formatDateTime, syncEventLabel } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const ALL = "__alle";
const OFF = "0";
// Auto-refresh choices in milliseconds. 60s matches the pipeline-health widget's existing cadence.
const REFRESH_OPTIONS = [OFF, "60000", "300000", "900000"] as const;

/**
 * The `counts` jsonb, rendered as "<n> <label>" pairs.
 *
 * Only NUMERIC entries are counts. Allowing strings through -- which the previous defensive filter
 * did explicitly -- is how the BANKSapi access handle ended up printed on this screen: bank-callback
 * writes rows whose counts are not counts at all. Live here:
 *
 *   event  = callback_received
 *   counts = { "accessId": "12f0a6e7-9fb5-4cc6-b284-b1e53ba39078",
 *              "baReentry": "ACCOUNT_CREATED" }
 *
 * which rendered verbatim as "12f0a6e7-... accessId · ACCOUNT_CREATED baReentry" in the Details
 * column. Non-numeric entries are dropped rather than relabelled: they are not counts, and the ones
 * seen so far are identifiers nobody needs here. The row still has its `message` to fall back on.
 */
function countsSummary(
  counts: Record<string, unknown>,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const parts = Object.entries(counts)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k, v]) => `${v} ${t(`bankConnections.counts.${k}`, { defaultValue: k })}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * True when `counts` holds at least one real (numeric) count.
 *
 * A type predicate rather than a plain boolean so the call sites narrow away the null without
 * needing a non-null assertion.
 */
/**
 * Mask access handles in a log message before it is rendered.
 *
 * Dropping non-numeric `counts` entries stopped the access id being printed as a fake count, but
 * the row then falls back to its `message` -- and bank-callback writes the whole query string into
 * it verbatim:
 *
 *   "bank-callback query: ?accessId=12f0a6e7-9fb5-4cc6-b284-b1e53ba39078&baReentry=ACCOUNT_CREATED"
 *
 * so the handle came straight back through the other path. The last four characters are kept
 * because that is what makes two callbacks distinguishable when reading the log, which is the only
 * reason anyone needs the value here; the rest is never useful on screen.
 */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function maskHandles(message: string): string {
  return message.replace(UUID_RE, (id) => `…${id.slice(-4)}`);
}

function hasNumericCounts(
  counts: Record<string, unknown> | null,
): counts is Record<string, unknown> {
  return !!counts && Object.values(counts).some((v) => typeof v === "number" && Number.isFinite(v));
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SyncLogPanel() {
  const { t } = useTranslation();

  const [fEvent, setFEvent] = useState(ALL);
  const [fLevel, setFLevel] = useState(ALL);
  const [fConnection, setFConnection] = useState(ALL);
  const [fPeriod, setFPeriod] = useState(PERIOD_ALL);
  const [fFromDate, setFFromDate] = useState("");
  const [fToDate, setFToDate] = useState("");
  const periodOptions = usePeriodOptions(PERIOD_ALL);
  // A preset resolves to real bounds here; only the custom option carries its own.
  const area = periodArea(fPeriod, fFromDate, fToDate);
  const [refresh, setRefresh] = useState<string>("60000");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // A narrower filter reshuffles the result set, so page 4 of the old one is meaningless.
  useEffect(() => {
    setPage(1);
  }, [fEvent, fLevel, fConnection, fPeriod, fFromDate, fToDate, pageSize]);

  const refreshMs = Number(refresh) || 0;
  const facetsQ = useBankSyncLogFacets();
  const connectionsQ = useBankConnections();
  const logsQ = useBankSyncLogsPage({
    event: fEvent === ALL ? undefined : fEvent,
    level: fLevel === ALL ? undefined : fLevel,
    connectionId: fConnection === ALL ? undefined : fConnection,
    fromDate: area.fromDate ?? undefined,
    toDate: area.toDate ?? undefined,
    page,
    pageSize,
    refreshMs,
  });

  const logs = logsQ.data?.rows ?? [];
  const total = logsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromDate = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toDate = Math.min(page * pageSize, total);

  // 1s tick, only while auto-refresh is on — no point re-rendering every second otherwise.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  const nextIn =
    refreshMs && logsQ.dataUpdatedAt ? Math.max(0, refreshMs - (now - logsQ.dataUpdatedAt)) : null;

  const connectionLabel = useMemo(
    () =>
      new Map(
        (connectionsQ.data ?? []).map((c) => [
          c.id,
          c.provider_name ?? c.bank_name ?? c.id.slice(0, 8),
        ]),
      ),
    [connectionsQ.data],
  );

  const fields: FilterField[] = [
    {
      kind: "select",
      key: "event",
      label: t("syncLog.filter.ereignis"),
      value: fEvent,
      defaultValue: ALL,
      onChange: setFEvent,
      options: [
        { value: ALL, label: t("syncLog.filter.allEvents") },
        ...(facetsQ.data?.events ?? []).map((e) => ({
          value: e,
          label: t(`bankConnections.syncEvent.${e}`, { defaultValue: syncEventLabel(e) }),
        })),
      ],
    },
    {
      kind: "select",
      key: "level",
      label: t("syncLog.filter.stufe"),
      value: fLevel,
      defaultValue: ALL,
      onChange: setFLevel,
      options: [
        { value: ALL, label: t("syncLog.filter.allLevels") },
        ...(facetsQ.data?.levels ?? []).map((l) => ({ value: l, label: l })),
      ],
    },
    {
      kind: "select",
      key: "connection",
      label: t("syncLog.filter.verbindung"),
      value: fConnection,
      defaultValue: ALL,
      onChange: setFConnection,
      options: [
        { value: ALL, label: t("syncLog.filter.allConnections") },
        ...(connectionsQ.data ?? []).map((c) => ({
          value: c.id,
          label: c.provider_name ?? c.bank_name ?? c.id.slice(0, 8),
        })),
      ],
    },
    // A period. Without one the older entries are unreachable in practice: the hourly cron writes
    // its four events whether or not anything happened, so a run that actually did something sits
    // pages deep behind no-ops. Nothing prunes this table, so reaching a date is the only way back.
    {
      kind: "zeitraum",
      key: "zeitraum",
      label: t("syncLog.filter.zeitraum"),
      value: fPeriod,
      defaultValue: PERIOD_ALL,
      onChange: setFPeriod,
      options: periodOptions,
      customValue: PERIOD_CUSTOM,
      fromDate: fFromDate,
      toDate: fToDate,
      onRangeApply: (v, b) => {
        setFFromDate(v);
        setFToDate(b);
      },
      locale: dateLocale(),
      formatDay: (iso) => formatDate(iso),
      backLabel: t("home.zeitraumAktion.zurueck"),
      placeholder: t("documents.list.filter.zeitraum"),
      rangeLabels: {
        placeholder: t("documents.list.filter.zeitraumWaehlen"),
        reset: t("documents.list.filter.zeitraumZuruecksetzen"),
        apply: t("documents.list.filter.zeitraumAnwenden"),
        previousMonth: t("documents.list.filter.monatZurueck"),
        nextMonth: t("documents.list.filter.monatVor"),
        pickSecond: t("documents.list.filter.zweitesDatum"),
      },
    },
  ];

  const refreshOptions = REFRESH_OPTIONS.map((v) => ({
    value: v,
    label:
      v === OFF ? t("syncLog.refresh.off") : t("syncLog.refresh.everyN", { n: Number(v) / 60000 }),
  }));

  return (
    // A fixed head, a fixed foot, and a table that scrolls between them. The dialog around this
    // gives it a bounded height; without `min-h-0` the flex child refuses to shrink below its
    // content and the whole dialog scrolls instead, taking the controls and the paging with it.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One row, not two. The refresh controls and every filter used to sit on separate lines,
          which cost two control heights before the first log row. The filters are now behind the
          same Filter button the rest of the app uses, with the active ones named as chips below. */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {nextIn !== null && (
          <span className="mr-auto text-xs text-muted-foreground tabular-nums">
            {logsQ.isFetching
              ? t("syncLog.refresh.refreshing")
              : t("syncLog.refresh.nextIn", { time: formatCountdown(nextIn) })}
          </span>
        )}
        <Combobox
          value={refresh}
          onValueChange={setRefresh}
          options={refreshOptions}
          className="h-9 w-full sm:w-[170px]"
        />
        <Button
          variant="outline"
          className="h-9 gap-2"
          disabled={logsQ.isFetching}
          onClick={() => logsQ.refetch()}
        >
          <RefreshCw className={cn("size-4", logsQ.isFetching && "animate-spin")} />
          {t("syncLog.refreshNow")}
        </Button>
        <FilterPopover
          fields={fields}
          labels={{
            button: t("syncLog.filter.button"),
            title: t("syncLog.filter.title"),
            reset: t("syncLog.filter.reset"),
          }}
        />
      </div>
      <FilterPills className="mt-3 shrink-0" fields={fields} />

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {logsQ.isError ? (
          <ErrorState error={logsQ.error} onRetry={() => logsQ.refetch()} />
        ) : logsQ.isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : logs.length === 0 ? (
          <EmptyState title={t("syncLog.emptyTitle")} hint={t("syncLog.emptyHint")} />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                {/* Sticky, so the column names are still there after a few pages of
                    scrolling. `bg-muted` rather than a translucent tint: rows sliding
                    under a half-transparent header show through it. */}
                <TableRow className="sticky top-0 z-10 bg-muted">
                  <TableHead>{t("bankConnections.logCol.zeitpunkt")}</TableHead>
                  <TableHead>{t("bankConnections.logCol.ereignis")}</TableHead>
                  <TableHead>{t("syncLog.col.connection")}</TableHead>
                  <TableHead>{t("bankConnections.logCol.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-sm",
                          l.level === "error" ? "text-red-600" : "text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block size-2 shrink-0 rounded-full",
                            l.level === "error"
                              ? "bg-red-500"
                              : l.level === "warn"
                                ? "bg-amber-400"
                                : "bg-brand",
                          )}
                        />
                        {l.event
                          ? t(`bankConnections.syncEvent.${l.event}`, {
                              defaultValue: syncEventLabel(l.event),
                            })
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {l.connection_id ? (connectionLabel.get(l.connection_id) ?? "—") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {/* An empty counts object ({}) is truthy in JS, so a plain `l.counts ?`
                          check took this branch even when there was nothing to summarize —
                          hiding the actual message behind a bare "—". That is exactly the shape
                          the cron job's own "Vault secret missing" error writes
                          (counts: '{}'::jsonb), so the one row a person most needs to read was
                          the one this always blanked out. Checking for an actual entry first. */}
                      {hasNumericCounts(l.counts)
                        ? countsSummary(l.counts, t)
                        : l.message
                          ? maskHandles(l.message)
                          : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Outside the scroll region: the paging is how you move through the history, so it has to
          stay reachable without scrolling back down to it. Hidden while there is nothing to page
          through, which is when it would only be a row of disabled controls. */}
      {!logsQ.isError && !logsQ.isLoading && logs.length > 0 && (
        <div className="shrink-0">
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            from={fromDate}
            to={toDate}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
