import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Info, Search } from "lucide-react";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Skeleton } from "../../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import { downloadTextFile, toCsv } from "../../lib/download";
import type {
  ChangeHistoryEntry,
  ProcessingLogAdapter,
  ProcessingLogEntry,
  StatusTone,
} from "../../adapters/processing-log";
import { parseReason, parseSender, type ParsedReason, type ParsedSender } from "./mail-parsing";
import { englishProcessingLogLabels, type ProcessingLogLabels } from "./labels";

const ALL = "__all";

const PERIODS = {
  all: "all",
  today: "today",
  sevenDays: "sevenDays",
  thirtyDays: "thirtyDays",
} as const;
type Period = (typeof PERIODS)[keyof typeof PERIODS];

const TONE_STYLE: Record<StatusTone, string> = {
  brand: "bg-brand-tint text-brand-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
};

function isoDaysAgo(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function periodBounds(period: Period): { fromDate: string | null; toDate: string | null } {
  if (period === PERIODS.today) return { fromDate: isoDaysAgo(0), toDate: isoDaysAgo(0) };
  if (period === PERIODS.sevenDays) return { fromDate: isoDaysAgo(6), toDate: isoDaysAgo(0) };
  if (period === PERIODS.thirtyDays) return { fromDate: isoDaysAgo(29), toDate: isoDaysAgo(0) };
  return { fromDate: null, toDate: null };
}

// Waits 300ms after the last keystroke before the term reaches the server.
function useDebouncedTerm(input: string): string {
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  return term;
}

export interface ProcessingLogPageProps {
  adapter: ProcessingLogAdapter;
  labels?: ProcessingLogLabels;
  formatters?: Formatters;
}

export function ProcessingLogPage({
  adapter,
  labels = englishProcessingLogLabels,
  formatters = englishFormatters,
}: ProcessingLogPageProps) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
      </div>

      <Tabs defaultValue="processing" className="mt-6">
        <TabsList>
          <TabsTrigger value="processing">{labels.processingTab}</TabsTrigger>
          <TabsTrigger value="changes">{labels.changesTab}</TabsTrigger>
        </TabsList>
        <TabsContent value="processing" className="mt-4">
          <ProcessingTab adapter={adapter} labels={labels} formatters={formatters} />
        </TabsContent>
        <TabsContent value="changes" className="mt-4">
          <ChangesTab adapter={adapter} labels={labels} formatters={formatters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProcessingTab({
  adapter,
  labels,
  formatters,
}: {
  adapter: ProcessingLogAdapter;
  labels: ProcessingLogLabels;
  formatters: Formatters;
}) {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedTerm(searchInput);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [period, setPeriod] = useState<Period>(PERIODS.all);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openEntry, setOpenEntry] = useState<ProcessingLogEntry | null>(null);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, period, pageSize]);

  const bounds = useMemo(() => periodBounds(period), [period]);

  const logQuery = adapter.useLogPage({
    search: searchTerm,
    status: statusFilter === ALL ? undefined : statusFilter,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
    page,
    pageSize,
  });
  const countsQuery = adapter.useStatusCounts({
    search: searchTerm,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
  });

  const rows = logQuery.data?.rows ?? [];
  const total = logQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);
  const searchIgnored = adapter.searchTermWasIgnored(searchTerm);

  const counts = useMemo(() => countsQuery.data ?? {}, [countsQuery.data]);
  const statusValues = useMemo(
    () => Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)),
    [counts],
  );

  function exportCsv() {
    const header = [
      labels.columns.time,
      labels.columns.subject,
      labels.columns.sender,
      labels.columns.status,
      labels.columns.reason,
    ];
    const lines = [
      header,
      ...rows.map((entry) => [
        entry.processedAt ?? "",
        entry.subject ?? "",
        entry.sender ?? "",
        entry.status ?? "",
        entry.reason ?? "",
      ]),
    ];
    downloadTextFile(`processing-log-${isoDaysAgo(0)}.csv`, toCsv(lines));
  }

  function statusBadgeStyle(status: string | null): string {
    const tone = status ? adapter.statusTone[status] : undefined;
    return TONE_STYLE[tone ?? "neutral"];
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{labels.processingSubtitle}</p>

      <div className="mt-4 flex min-h-[34px] flex-wrap items-center gap-2">
        {countsQuery.isLoading ? (
          <>
            <Skeleton className="h-[26px] w-28 rounded-full" />
            <Skeleton className="h-[26px] w-24 rounded-full" />
            <Skeleton className="h-[26px] w-20 rounded-full" />
          </>
        ) : (
          <>
            {statusValues.map((status) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  title={active ? labels.clearFilter : labels.filterByStatus}
                  onClick={() => setStatusFilter(active ? ALL : status)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    statusBadgeStyle(status),
                    active
                      ? "ring-2 ring-brand ring-offset-1 ring-offset-background"
                      : statusFilter !== ALL && "opacity-40 hover:opacity-100",
                  )}
                >
                  {labels.statusLabel(status)} · {counts[status]}
                </button>
              );
            })}
            {statusFilter !== ALL && (
              <button
                type="button"
                onClick={() => setStatusFilter(ALL)}
                className="inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium text-muted-foreground underline hover:text-foreground"
              >
                {labels.clearFilter}
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:w-auto sm:min-w-[240px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Combobox
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full sm:w-[180px]"
          placeholder={labels.statusFilterPlaceholder}
          options={[
            { value: ALL, label: labels.allStatuses },
            ...statusValues.map((status) => ({ value: status, label: labels.statusLabel(status) })),
          ]}
        />
        <Combobox
          value={period}
          onValueChange={(value) => setPeriod(value as Period)}
          className="w-full sm:w-[170px]"
          placeholder={labels.periodPlaceholder}
          options={[
            { value: PERIODS.all, label: labels.wholePeriod },
            { value: PERIODS.today, label: labels.today },
            { value: PERIODS.sevenDays, label: labels.lastSevenDays },
            { value: PERIODS.thirtyDays, label: labels.lastThirtyDays },
          ]}
        />
        <Button
          type="button"
          variant={period === PERIODS.today ? "default" : "outline"}
          size="sm"
          onClick={() => setPeriod(period === PERIODS.today ? PERIODS.all : PERIODS.today)}
        >
          {labels.today}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="size-4" />
          {labels.exportCsv}
        </Button>
      </div>

      {searchIgnored && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {labels.searchIgnoredNote}
        </p>
      )}

      {logQuery.isError ? (
        <div className="mt-4">
          <ErrorState error={logQuery.error} onRetry={logQuery.refetch} />
        </div>
      ) : logQuery.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={10} columns={4} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {labels.matchCount(total)}
            {logQuery.isRefreshing && ` · ${labels.refreshing}`}
          </p>
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.columns.time}</TableHead>
                  <TableHead>{labels.columns.subject}</TableHead>
                  <TableHead>{labels.columns.sender}</TableHead>
                  <TableHead>{labels.columns.status}</TableHead>
                  <TableHead>{labels.columns.reason}</TableHead>
                  <TableHead className="w-[92px] text-right">{labels.columns.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <LogTableRow
                    key={entry.id}
                    entry={entry}
                    labels={labels}
                    formatters={formatters}
                    badgeStyle={statusBadgeStyle(entry.status)}
                    onShowDetails={() => setOpenEntry(entry)}
                    onOpenInvoice={() => entry.invoiceId && adapter.openInvoice(entry.invoiceId)}
                  />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {labels.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 space-y-3 sm:hidden">
            {rows.map((entry) => (
              <LogCard
                key={entry.id}
                entry={entry}
                labels={labels}
                formatters={formatters}
                badgeStyle={statusBadgeStyle(entry.status)}
                onShowDetails={() => setOpenEntry(entry)}
                onOpenInvoice={() => entry.invoiceId && adapter.openInvoice(entry.invoiceId)}
              />
            ))}
            {rows.length === 0 && (
              <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                {labels.empty}
              </p>
            )}
          </div>

          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              from={firstShown}
              to={lastShown}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          )}
        </>
      )}

      <EntryDialog
        entry={openEntry}
        labels={labels}
        formatters={formatters}
        onOpenInvoice={(invoiceId) => {
          setOpenEntry(null);
          adapter.openInvoice(invoiceId);
        }}
        onClose={() => setOpenEntry(null)}
      />
    </div>
  );
}

// Every row is a real button: with an invoice it opens the invoice, without one it opens details.
function LogTableRow({
  entry,
  labels,
  formatters,
  badgeStyle,
  onShowDetails,
  onOpenInvoice,
}: {
  entry: ProcessingLogEntry;
  labels: ProcessingLogLabels;
  formatters: Formatters;
  badgeStyle: string;
  onShowDetails: () => void;
  onOpenInvoice: () => void;
}) {
  const hasInvoice = !!entry.invoiceId;
  const sender = parseSender(entry.sender);
  const reason = parseReason(entry.reason);
  const activate = hasInvoice ? onOpenInvoice : onShowDetails;
  const actionName = hasInvoice ? labels.openInvoice : labels.showDetails;

  return (
    <TableRow
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`${actionName}: ${entry.subject ?? ""}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {formatters.formatDateTime(entry.processedAt)}
      </TableCell>
      <TableCell
        className="max-w-[260px] truncate text-sm text-foreground"
        title={entry.subject ?? ""}
      >
        {entry.subject ?? "—"}
      </TableCell>
      <TableCell className="max-w-[220px] text-sm text-muted-foreground" title={sender.raw}>
        <SenderCell sender={sender} />
      </TableCell>
      <TableCell>
        <Badge className={cn("border-transparent font-medium", badgeStyle)}>
          {entry.status ? labels.statusLabel(entry.status) : "—"}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[300px] text-xs text-muted-foreground" title={reason.raw}>
        <ReasonCell reason={reason} labels={labels} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={labels.showDetails}
            title={labels.showDetails}
            onClick={(event) => {
              event.stopPropagation();
              onShowDetails();
            }}
          >
            <Info className="size-4" />
          </Button>
          {hasInvoice && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        </div>
      </TableCell>
    </TableRow>
  );
}

function LogCard({
  entry,
  labels,
  formatters,
  badgeStyle,
  onShowDetails,
  onOpenInvoice,
}: {
  entry: ProcessingLogEntry;
  labels: ProcessingLogLabels;
  formatters: Formatters;
  badgeStyle: string;
  onShowDetails: () => void;
  onOpenInvoice: () => void;
}) {
  const hasInvoice = !!entry.invoiceId;
  const sender = parseSender(entry.sender);
  const reason = parseReason(entry.reason);
  const activate = hasInvoice ? onOpenInvoice : onShowDetails;
  const actionName = hasInvoice ? labels.openInvoice : labels.showDetails;

  return (
    <div
      className="cursor-pointer rounded-xl border border-border bg-card p-4"
      role="button"
      tabIndex={0}
      aria-label={`${actionName}: ${entry.subject ?? ""}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="min-w-0 flex-1 text-sm font-medium text-foreground"
          title={entry.subject ?? ""}
        >
          {entry.subject ?? "—"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge className={cn("border-transparent font-medium", badgeStyle)}>
            {entry.status ? labels.statusLabel(entry.status) : "—"}
          </Badge>
          {hasInvoice && <ChevronRight className="size-4 text-muted-foreground" />}
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        <SenderCell sender={sender} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {formatters.formatDateTime(entry.processedAt)}
      </p>
      {reason.causes.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          <ReasonCell reason={reason} labels={labels} />
        </div>
      )}
      {hasInvoice && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={(event) => {
            event.stopPropagation();
            onShowDetails();
          }}
        >
          {labels.showDetails}
        </Button>
      )}
    </div>
  );
}

function SenderCell({ sender }: { sender: ParsedSender }) {
  if (!sender.raw) return <>—</>;
  if (sender.name && sender.address) {
    return (
      <div className="min-w-0">
        <div className="truncate text-foreground">{sender.name}</div>
        <div className="truncate text-xs text-muted-foreground">{sender.address}</div>
      </div>
    );
  }
  return <div className="truncate">{sender.address ?? sender.name}</div>;
}

function ReasonCell({ reason, labels }: { reason: ParsedReason; labels: ProcessingLogLabels }) {
  if (!reason.raw) return <>—</>;
  return (
    <div className="min-w-0 space-y-1">
      {reason.verdict && (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            reason.verdict === "needs_review"
              ? "bg-warning-soft text-warning"
              : "bg-brand-tint text-brand-dark",
          )}
        >
          {reason.verdict === "needs_review" ? labels.verdictNeedsReview : labels.verdictAccepted}
        </span>
      )}
      {reason.causes.length > 0 && (
        <ul className="space-y-0.5">
          {reason.causes.map((cause, index) => (
            <li key={index} className="truncate" title={cause}>
              · {cause}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryDialog({
  entry,
  labels,
  formatters,
  onOpenInvoice,
  onClose,
}: {
  entry: ProcessingLogEntry | null;
  labels: ProcessingLogLabels;
  formatters: Formatters;
  onOpenInvoice: (invoiceId: string) => void;
  onClose: () => void;
}) {
  if (!entry) return null;
  const sender = parseSender(entry.sender);
  const reason = parseReason(entry.reason);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.detail.title}</DialogTitle>
          <DialogDescription>{formatters.formatDateTime(entry.processedAt)}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-4 text-sm">
          <DetailField label={labels.detail.subject}>{entry.subject ?? "—"}</DetailField>
          <DetailField label={labels.detail.sender}>
            {sender.name && <div>{sender.name}</div>}
            {sender.address && <div className="text-muted-foreground">{sender.address}</div>}
            {!sender.name && !sender.address && "—"}
            {sender.name && sender.address && (
              <div className="mt-1 text-xs break-all text-muted-foreground/70">{sender.raw}</div>
            )}
          </DetailField>
          <DetailField label={labels.detail.status}>
            {entry.status ? labels.statusLabel(entry.status) : "—"}
          </DetailField>
          <DetailField label={labels.detail.reason}>
            {reason.causes.length === 0 && !reason.verdict ? (
              labels.detail.noReason
            ) : (
              <div className="space-y-2">
                {reason.verdict && (
                  <div className="font-medium">
                    {reason.verdict === "needs_review"
                      ? labels.verdictNeedsReview
                      : labels.verdictAccepted}
                  </div>
                )}
                <ul className="list-disc space-y-1 pl-5">
                  {reason.causes.map((cause, index) => (
                    <li key={index} className="break-words">
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DetailField>
          <DetailField label={labels.detail.invoice}>
            {entry.invoiceId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenInvoice(entry.invoiceId!)}
              >
                {labels.detail.openInvoice}
              </Button>
            ) : (
              <span className="text-muted-foreground">{labels.detail.noInvoice}</span>
            )}
          </DetailField>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

function ChangesTab({
  adapter,
  labels,
  formatters,
}: {
  adapter: ProcessingLogAdapter;
  labels: ProcessingLogLabels;
  formatters: Formatters;
}) {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedTerm(searchInput);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, pageSize]);

  const query = adapter.useChangeHistoryPage({ search: searchTerm, page, pageSize });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  return (
    <div>
      <p className="text-sm text-muted-foreground">{labels.changesSubtitle}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:w-auto sm:min-w-[240px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={labels.changesSearchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>

      {adapter.searchTermWasIgnored(searchTerm) && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {labels.searchIgnoredNote}
        </p>
      )}

      {query.isError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={query.refetch} />
        </div>
      ) : query.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={10} columns={5} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {labels.changesCount(total)}
            {query.isRefreshing && ` · ${labels.refreshing}`}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.columns.time}</TableHead>
                  <TableHead>{labels.columns.actor}</TableHead>
                  <TableHead>{labels.columns.changeType}</TableHead>
                  <TableHead>{labels.columns.tableName}</TableHead>
                  <TableHead>{labels.columns.changeText}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((change: ChangeHistoryEntry) => (
                  <TableRow key={change.id}>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatters.formatDateTime(change.at)}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-sm"
                      title={change.actor ?? ""}
                    >
                      {change.actor ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge className="border-transparent bg-muted font-medium text-muted-foreground">
                        {change.type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {change.tableName ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[360px] truncate text-sm text-muted-foreground"
                      title={change.text ?? ""}
                    >
                      {change.text ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      {labels.changesEmpty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 space-y-3 sm:hidden">
            {rows.map((change: ChangeHistoryEntry) => (
              <div key={change.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {change.text ?? "—"}
                  </p>
                  <Badge className="shrink-0 border-transparent bg-muted font-medium text-muted-foreground">
                    {change.type ?? "—"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{change.actor ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{change.tableName ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatters.formatDateTime(change.at)}
                </p>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                {labels.changesEmpty}
              </p>
            )}
          </div>

          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              from={firstShown}
              to={lastShown}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
