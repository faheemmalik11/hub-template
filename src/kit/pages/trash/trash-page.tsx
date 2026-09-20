import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Lock,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { TrashAdapter, TrashedRecord } from "../../adapters/trash";
import { englishTrashPageLabels, type TrashPageLabels } from "./labels";
import { recordKey, useTrashView } from "../../widgets/trash";

const ALL = "__all";

const DEFAULT_PAGE_SIZE = 25;

const AGE_OPTIONS = [
  { value: "any", minimumDays: 0 },
  { value: "olderThanThirtyDays", minimumDays: 30 },
  { value: "olderThanNinetyDays", minimumDays: 90 },
  { value: "olderThanOneYear", minimumDays: 365 },
] as const;

type AgeOptionValue = (typeof AGE_OPTIONS)[number]["value"];

type SortKey = "type" | "label" | "deletedAt";

function ageInDays(deletedAt: string): number {
  return Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
}

function ageOptionLabel(value: AgeOptionValue, labels: TrashPageLabels): string {
  if (value === "olderThanThirtyDays") return labels.olderThanThirtyDays;
  if (value === "olderThanNinetyDays") return labels.olderThanNinetyDays;
  if (value === "olderThanOneYear") return labels.olderThanOneYear;
  return labels.anyAge;
}

export interface TrashPageProps {
  adapter: TrashAdapter;
  labels?: TrashPageLabels;
  formatters?: Formatters;
}

export function TrashPage({
  adapter,
  labels = englishTrashPageLabels,
  formatters = englishFormatters,
}: TrashPageProps) {
  const view = useTrashView(adapter, AGE_OPTIONS);
  const {
    tableFilter,
    setTableFilter,
    searchInput,
    setSearchInput,
    ageFilter,
    setAgeFilter,
    sortKey,
    sortAscending,
    sortBy,
    visibleRecords,
    selectedKeys,
    selectedRecords,
    wholePageSelected,
    pagePartlySelected,
    togglePageSelection,
    selectAllFiltered,
    toggleOne,
    pageSize,
    setPageSize,
    totalPages,
    allFilteredSelected,
    moreThanOnePage,
  } = view;
  const filteredRecords = view.records;
  const allRecords = view.allRecords;
  const currentPageIndex = view.pageIndex;
  const setPageIndex = view.setPageIndex;
  const recordsQuery = {
    isLoading: view.loading,
    isError: !!view.error,
    error: view.error,
    refetch: view.refetch,
  };

  const tablesQuery = adapter.useTrashTableNames();
  const eligibleTables = useMemo(() => {
    const fromBackend = tablesQuery.data?.eligible ?? [];
    if (fromBackend.length > 0) return fromBackend;
    return [...new Set(allRecords.map((record) => record.tableName))].sort();
  }, [tablesQuery.data, allRecords]);
  const purgeableTables = useMemo(
    () => new Set(tablesQuery.data?.purgeable ?? eligibleTables),
    [tablesQuery.data, eligibleTables],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {labels.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="pl-9"
              aria-label={labels.searchLabel}
              placeholder={labels.searchPlaceholder}
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPageIndex(0);
              }}
            />
          </div>
          <Select
            value={tableFilter}
            onValueChange={(value) => {
              setTableFilter(value);
              setPageIndex(0);
              view.clearSelection();
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label={labels.columns.type}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{labels.allTypes}</SelectItem>
              {eligibleTables.map((tableName) => (
                <SelectItem key={tableName} value={tableName}>
                  {labels.tableLabel(tableName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={ageFilter}
            onValueChange={(value) => {
              setAgeFilter(value as AgeOptionValue);
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-[190px]" aria-label={labels.ageFilterLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {ageOptionLabel(option.value, labels)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recordsQuery.isError ? (
          <div className="mt-6">
            <ErrorState error={recordsQuery.error} onRetry={() => recordsQuery.refetch()} />
          </div>
        ) : recordsQuery.isLoading ? (
          <div className="mt-6">
            <TableSkeleton rows={6} columns={6} />
          </div>
        ) : (
          <>
            <BulkActionBar
              adapter={adapter}
              labels={labels}
              selectedRecords={selectedRecords}
              purgeableTables={purgeableTables}
              filteredTotal={filteredRecords.length}
              allFilteredSelected={allFilteredSelected}
              canSelectAllFiltered={wholePageSelected && moreThanOnePage && !allFilteredSelected}
              moreThanOnePage={moreThanOnePage}
              onSelectAllFiltered={selectAllFiltered}
              onDone={view.clearSelection}
            />

            <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={
                          wholePageSelected ? true : pagePartlySelected ? "indeterminate" : false
                        }
                        onCheckedChange={togglePageSelection}
                        aria-label={labels.selection.selectPage}
                        disabled={visibleRecords.length === 0}
                      />
                    </TableHead>
                    <SortableHead
                      label={labels.columns.type}
                      labels={labels}
                      active={sortKey === "type"}
                      ascending={sortAscending}
                      onClick={() => sortBy("type")}
                    />
                    <SortableHead
                      label={labels.columns.label}
                      labels={labels}
                      active={sortKey === "label"}
                      ascending={sortAscending}
                      onClick={() => sortBy("label")}
                    />
                    <SortableHead
                      label={labels.columns.deletedAt}
                      labels={labels}
                      active={sortKey === "deletedAt"}
                      ascending={sortAscending}
                      onClick={() => sortBy("deletedAt")}
                    />
                    <TableHead>{labels.columns.deletedBy}</TableHead>
                    <TableHead>{labels.columns.reason}</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRecords.map((record) => (
                    <TrashTableRow
                      key={recordKey(record)}
                      adapter={adapter}
                      labels={labels}
                      formatters={formatters}
                      record={record}
                      purgeable={purgeableTables.has(record.tableName)}
                      selected={selectedKeys.has(recordKey(record))}
                      onToggle={() => toggleOne(record)}
                    />
                  ))}
                  {visibleRecords.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {labels.empty}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 space-y-3 sm:hidden">
              {visibleRecords.map((record) => (
                <TrashCard
                  key={recordKey(record)}
                  adapter={adapter}
                  labels={labels}
                  formatters={formatters}
                  record={record}
                  purgeable={purgeableTables.has(record.tableName)}
                  selected={selectedKeys.has(recordKey(record))}
                  onToggle={() => toggleOne(record)}
                />
              ))}
              {visibleRecords.length === 0 && (
                <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                  {labels.empty}
                </p>
              )}
            </div>

            {filteredRecords.length > 0 && (
              <TablePagination
                page={currentPageIndex + 1}
                totalPages={totalPages}
                pageSize={pageSize}
                total={filteredRecords.length}
                from={currentPageIndex * pageSize + 1}
                to={Math.min((currentPageIndex + 1) * pageSize, filteredRecords.length)}
                onPage={(page) => setPageIndex(page - 1)}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPageIndex(0);
                }}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function SortableHead({
  label,
  labels,
  active,
  ascending,
  onClick,
}: {
  label: string;
  labels: TrashPageLabels;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
}) {
  const Icon = !active ? ChevronsUpDown : ascending ? ChevronUp : ChevronDown;
  return (
    <TableHead aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`${label}: ${active && ascending ? labels.sortDescending : labels.sortAscending}`}
      >
        {label}
        <Icon className="size-3.5 opacity-60" aria-hidden />
      </button>
    </TableHead>
  );
}

// Says how long the record has been sitting in the trash, next to the formatted date.
function DeletionAge({ deletedAt, labels }: { deletedAt: string; labels: TrashPageLabels }) {
  const days = ageInDays(deletedAt);
  const text =
    days < 1
      ? labels.deletedToday
      : days < 30
        ? labels.deletedDaysAgo(days)
        : days < 365
          ? labels.deletedMonthsAgo(Math.floor(days / 30))
          : labels.deletedYearsAgo(Math.floor(days / 365));
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

// Short reasons wrap in place; long ones clamp to two lines with a dialog showing the full text.
function ReasonCell({ reason, labels }: { reason: string | null; labels: TrashPageLabels }) {
  const [isOpen, setIsOpen] = useState(false);
  const text = (reason ?? "").trim();
  if (!text) return <span className="text-muted-foreground">—</span>;
  const isLong = text.length > 80;
  return (
    <div className="max-w-xs">
      <p
        className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${isLong ? "line-clamp-2" : ""}`}
      >
        {text}
      </p>
      {isLong && (
        <>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setIsOpen(true)}
          >
            {labels.fullReason.showMore}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{labels.fullReason.title}</DialogTitle>
                <DialogDescription className="whitespace-pre-wrap break-words text-left text-foreground">
                  {text}
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// A real button so the lock reason is reachable by keyboard and on touch screens.
function PurgeLockedHint({ reason }: { reason: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={reason}
          className="text-muted-foreground"
          onClick={() => setIsOpen((value) => !value)}
        >
          <Lock className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap text-left">{reason}</TooltipContent>
    </Tooltip>
  );
}

function RecordActions({
  adapter,
  labels,
  record,
  purgeable,
}: {
  adapter: TrashAdapter;
  labels: TrashPageLabels;
  record: TrashedRecord;
  purgeable: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");

  async function restore() {
    setIsSaving(true);
    try {
      await adapter.restoreRecord({
        tableName: record.tableName,
        id: record.id,
        reason: restoreReason.trim() || null,
      });
      toast.success(labels.restore.succeeded(record.label));
    } catch (error) {
      toast.error(labels.restore.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  async function purge() {
    setIsSaving(true);
    try {
      await adapter.purgeRecord({ tableName: record.tableName, id: record.id });
      toast.success(labels.purge.succeeded(record.label));
    } catch (error) {
      toast.error(labels.purge.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {/* Restore confirms first: it is the action with the wider blast radius of the two. */}
      <Button
        variant="ghost"
        size="icon"
        className="text-brand hover:bg-brand/10 hover:text-brand"
        aria-label={labels.restore.action}
        disabled={isSaving}
        onClick={() => setRestoreOpen(true)}
      >
        <ArchiveRestore className="size-4" />
      </Button>
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.restore.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.restore.description(record.label)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label
              className="text-sm text-muted-foreground"
              htmlFor={`restore-reason-${record.id}`}
            >
              {labels.restore.reasonLabel}
            </label>
            <Textarea
              id={`restore-reason-${record.id}`}
              rows={2}
              value={restoreReason}
              placeholder={labels.restore.reasonPlaceholder}
              onChange={(event) => setRestoreReason(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.restore.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>{labels.restore.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Which tables can be purged is the backend's answer; a locked record shows why instead of a button that can only fail. */}
      {!purgeable ? (
        <PurgeLockedHint reason={labels.purge.lockedReason(record.tableName)} />
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={labels.purge.action}
            disabled={isSaving}
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
          <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.purge.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {labels.purge.description(record.label)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.purge.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={purge}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {labels.purge.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

// Restores or purges everything ticked in one pass; purge confirms once, naming the count.
function BulkActionBar({
  adapter,
  labels,
  selectedRecords,
  purgeableTables,
  filteredTotal,
  allFilteredSelected,
  canSelectAllFiltered,
  moreThanOnePage,
  onSelectAllFiltered,
  onDone,
}: {
  adapter: TrashAdapter;
  labels: TrashPageLabels;
  selectedRecords: TrashedRecord[];
  purgeableTables: Set<string>;
  filteredTotal: number;
  allFilteredSelected: boolean;
  canSelectAllFiltered: boolean;
  moreThanOnePage: boolean;
  onSelectAllFiltered: () => void;
  onDone: () => void;
}) {
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (selectedRecords.length === 0) return null;
  const purgeableRecords = selectedRecords.filter((record) =>
    purgeableTables.has(record.tableName),
  );
  const lockedCount = selectedRecords.length - purgeableRecords.length;

  async function restoreAll() {
    setIsSaving(true);
    let succeeded = 0;
    for (const record of selectedRecords) {
      try {
        await adapter.restoreRecord({ tableName: record.tableName, id: record.id, reason: null });
        succeeded++;
      } catch (error) {
        toast.error(labels.restore.failed(readableErrorMessage(error, "")));
      }
    }
    setIsSaving(false);
    if (succeeded > 0) toast.success(labels.restore.manySucceeded(succeeded));
    onDone();
  }

  async function purgeAll() {
    setIsSaving(true);
    let succeeded = 0;
    for (const record of purgeableRecords) {
      try {
        await adapter.purgeRecord({ tableName: record.tableName, id: record.id });
        succeeded++;
      } catch (error) {
        toast.error(labels.purge.failed(readableErrorMessage(error, "")));
      }
    }
    setIsSaving(false);
    setPurgeOpen(false);
    if (succeeded > 0) toast.success(labels.purge.manySucceeded(succeeded));
    onDone();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <span className="text-sm font-medium text-foreground">
        {labels.selection.selectedCount(selectedRecords.length)}
      </span>
      <Button size="sm" variant="outline" disabled={isSaving} onClick={restoreAll}>
        {labels.selection.restoreSelected(selectedRecords.length)}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={isSaving || purgeableRecords.length === 0}
        onClick={() => setPurgeOpen(true)}
      >
        {labels.selection.purgeSelected(purgeableRecords.length)}
      </Button>
      <Button size="sm" variant="ghost" disabled={isSaving} onClick={onDone}>
        {labels.selection.clearSelection}
      </Button>
      {/* Escaping page scope is an explicit click that names the number it arms. */}
      {canSelectAllFiltered && (
        <Button
          size="sm"
          variant="link"
          className="h-auto p-0"
          disabled={isSaving}
          onClick={onSelectAllFiltered}
        >
          {labels.selection.selectAllFiltered(filteredTotal)}
        </Button>
      )}
      {allFilteredSelected && moreThanOnePage && (
        <span className="text-xs text-muted-foreground">
          {labels.selection.allFilteredSelected(filteredTotal)}
        </span>
      )}
      {lockedCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {labels.selection.notPurgeableCount(lockedCount)}
        </span>
      )}
      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.purge.manyTitle(purgeableRecords.length)}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.purge.manyDescription(purgeableRecords.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.purge.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={purgeAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {labels.purge.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrashTableRow({
  adapter,
  labels,
  formatters,
  record,
  purgeable,
  selected,
  onToggle,
}: {
  adapter: TrashAdapter;
  labels: TrashPageLabels;
  formatters: Formatters;
  record: TrashedRecord;
  purgeable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={labels.selection.selectRow(record.label)}
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{labels.tableLabel(record.tableName)}</Badge>
      </TableCell>
      <TableCell className="font-medium text-foreground">{record.label}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div>{formatters.formatDateTime(record.deletedAt)}</div>
        <DeletionAge deletedAt={record.deletedAt} labels={labels} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{record.deletedBy ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <ReasonCell reason={record.deleteReason} labels={labels} />
      </TableCell>
      <TableCell>
        <RecordActions adapter={adapter} labels={labels} record={record} purgeable={purgeable} />
      </TableCell>
    </TableRow>
  );
}

function TrashCard({
  adapter,
  labels,
  formatters,
  record,
  purgeable,
  selected,
  onToggle,
}: {
  adapter: TrashAdapter;
  labels: TrashPageLabels;
  formatters: Formatters;
  record: TrashedRecord;
  purgeable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={labels.selection.selectRow(record.label)}
            className="mt-1"
          />
          <div className="min-w-0">
            <Badge variant="secondary">{labels.tableLabel(record.tableName)}</Badge>
            <div className="mt-1 truncate font-medium text-foreground">{record.label}</div>
          </div>
        </div>
        <RecordActions adapter={adapter} labels={labels} record={record} purgeable={purgeable} />
      </div>
      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          {labels.columns.deletedAt}: {formatters.formatDateTime(record.deletedAt)} ·{" "}
          <DeletionAge deletedAt={record.deletedAt} labels={labels} />
        </div>
        <div>
          {labels.columns.deletedBy}: {record.deletedBy ?? "—"}
        </div>
        {record.deleteReason && (
          <div>
            <span className="mr-1">{labels.columns.reason}:</span>
            <ReasonCell reason={record.deleteReason} labels={labels} />
          </div>
        )}
      </div>
    </div>
  );
}
