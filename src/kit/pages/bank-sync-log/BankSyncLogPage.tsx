import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Combobox } from "../../ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { cn } from "../../lib/class-names";
import type { SyncLogAdapter } from "../../adapters/bank-sync-log";
import { englishBankSyncLogLabels, type BankSyncLogLabels } from "./labels";

const ALL = "__all";
const REFRESH_OPTIONS = ["0", "60000", "300000", "900000"] as const;

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function countsSummary(
  counts: Record<string, unknown> | null,
  countLabel: (key: string) => string,
): string {
  if (!counts) return "—";
  const parts = Object.entries(counts)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k, v]) => `${v} ${countLabel(k)}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export interface BankSyncLogPageProps {
  adapter: SyncLogAdapter;
  labels?: BankSyncLogLabels;
}

export function BankSyncLogPage({
  adapter,
  labels = englishBankSyncLogLabels,
}: BankSyncLogPageProps) {
  const [event, setEvent] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [connectionId, setConnectionId] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refresh, setRefresh] = useState<string>("60000");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [event, level, connectionId, from, to]);

  const refreshMs = Number(refresh) || 0;
  const facetsQuery = adapter.useFacets();
  const connectionsQuery = adapter.useConnections();
  const logsQuery = adapter.useLogsPage({
    event: event === ALL ? undefined : event,
    level: level === ALL ? undefined : level,
    connectionId: connectionId === ALL ? undefined : connectionId,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize,
    refreshMs,
  });

  const rows = logsQuery.data?.rows ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rowFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rowTo = Math.min(page * pageSize, total);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  const nextIn =
    refreshMs && logsQuery.dataUpdatedAt
      ? Math.max(0, refreshMs - (now - logsQuery.dataUpdatedAt))
      : null;

  const connectionLabel = useMemo(
    () => new Map(connectionsQuery.data.map((c) => [c.id, c.label])),
    [connectionsQuery.data],
  );

  const eventOptions = [
    { value: ALL, label: labels.allEvents },
    ...(facetsQuery.data?.events ?? []).map((e) => ({ value: e, label: adapter.eventLabel(e) })),
  ];
  const levelOptions = [
    { value: ALL, label: labels.allLevels },
    ...(facetsQuery.data?.levels ?? []).map((l) => ({ value: l, label: l })),
  ];
  const connectionOptions = [
    { value: ALL, label: labels.allConnections },
    ...connectionsQuery.data.map((c) => ({ value: c.id, label: c.label })),
  ];
  const refreshOptions = REFRESH_OPTIONS.map((v) => ({
    value: v,
    label: v === "0" ? labels.refreshOff : labels.refreshEvery(Number(v) / 60000),
  }));
  const hasActiveFilter = event !== ALL || level !== ALL || connectionId !== ALL || !!from || !!to;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {nextIn !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {logsQuery.isFetching
                ? labels.refreshing
                : labels.nextRefreshIn(formatCountdown(nextIn))}
            </span>
          )}
          <Combobox
            value={refresh}
            onValueChange={setRefresh}
            options={[...refreshOptions]}
            className="h-8 w-full sm:w-[150px]"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={logsQuery.isFetching}
            onClick={() => logsQuery.refetch()}
          >
            <RefreshCw className={cn("size-4", logsQuery.isFetching && "animate-spin")} />
            {labels.refreshNow}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Combobox
          value={event}
          onValueChange={setEvent}
          options={eventOptions}
          className="h-9 w-full sm:w-[210px]"
        />
        <Combobox
          value={level}
          onValueChange={setLevel}
          options={levelOptions}
          className="h-9 w-full sm:w-[150px]"
        />
        <Combobox
          value={connectionId}
          onValueChange={setConnectionId}
          options={connectionOptions}
          className="h-9 w-full sm:w-[220px]"
        />
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          aria-label={labels.fromLabel}
          className="h-9 w-full sm:w-[150px]"
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          aria-label={labels.toLabel}
          className="h-9 w-full sm:w-[150px]"
        />
        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEvent(ALL);
              setLevel(ALL);
              setConnectionId(ALL);
              setFrom("");
              setTo("");
            }}
          >
            {labels.resetFilters}
          </Button>
        )}
      </div>

      {logsQuery.error ? (
        <div className="mt-3">
          <ErrorState error={logsQuery.error} onRetry={() => logsQuery.refetch()} />
        </div>
      ) : !logsQuery.data ? (
        <div className="mt-3">
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : (
        <div className="mt-3 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{labels.columnTime}</TableHead>
                <TableHead>{labels.columnEvent}</TableHead>
                <TableHead>{labels.columnLevel}</TableHead>
                <TableHead>{labels.columnConnection}</TableHead>
                <TableHead>{labels.columnDetails}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {adapter.formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {adapter.eventLabel(row.event)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                        row.level === "error"
                          ? "bg-red-100 text-red-800"
                          : row.level === "warn"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {row.level}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.connectionId
                      ? (connectionLabel.get(row.connectionId) ?? row.connectionId.slice(0, 8))
                      : "—"}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate text-sm text-muted-foreground">
                    {row.counts
                      ? countsSummary(row.counts, adapter.countLabel)
                      : (row.message ?? "—")}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {logsQuery.data && total > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          from={rowFrom}
          to={rowTo}
          onPage={setPage}
          onPageSize={() => {}}
        />
      )}
    </div>
  );
}
