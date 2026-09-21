import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Lock,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { PAGE_SIZES, TablePagination } from "@/components/data-table/table-pagination";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { usePurgeRecord, useRestoreRecord, useTrash, useTrashTables } from "@/data";
import { errorText, formatDateTime } from "@/lib/data/format";
import type { TrashRecord } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { useMemo, useState } from "react";

import { pageTitle } from "@/config/brand";
import { TABLE } from "@/config/tables";

export const Route = createFileRoute("/trash/")({
  head: () => ({ meta: [{ title: pageTitle("Papierkorb") }] }),
  component: TrashGuard,
});

// Admin-only (Briefing Screen 18). RLS backs every underlying table already; this is the UX
// guard so trash management isn't offered to roles it was never meant for.
//
// It used to be `<Navigate to="/" />` with no message, and `null` while the role was still
// resolving — a bookmarked link simply landed somebody on the dashboard with no explanation, and
// the page was a blank rectangle in between. Both are now visible states
// (docs/audit/papierkorb/trash/ISSUES.md #8).
function TrashGuard() {
  const { ready, can } = useAuth();
  if (!ready) return <TrashSkeleton />;
  if (!can(PERMISSIONS.pageTrash)) return <NoAccess />;
  return <TrashPage />;
}

function TrashSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6">
        <TableSkeleton rows={6} cols={6} />
      </div>
    </div>
  );
}

function NoAccess() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card px-6 py-12 text-center">
      <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        {t("trash.guard.titel")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("trash.guard.text")}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">{t("trash.guard.zurueck")}</Link>
      </Button>
    </div>
  );
}

/** Default rows per page — the same 25 every other list in the app starts on. The list is fetched
 *  whole and paged in the browser: at trash sizes the network round trip per page costs more than
 *  it saves, and search, sort and "select all N" all have to see everything anyway. */
const PAGE_SIZE: (typeof PAGE_SIZES)[number] = 25;

const ALTER_OPTIONS = [
  { value: "alle", days: 0 },
  { value: "d30", days: 30 },
  { value: "d90", days: 90 },
  { value: "d365", days: 365 },
] as const;

type SortKey = "typ" | "bezeichnung" | "geloeschtAm";

/** Whole days between a deletion and now. */
function alterInDays(deletedAt: string): number {
  return Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
}

function TrashPage() {
  const { t } = useTranslation();
  const [tableFilter, setTableFilter] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [alter, setAlter] = useState<string>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("geloeschtAm");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [pagesSize, setPagesSize] = useState<number>(PAGE_SIZE);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const q = useTrash(tableFilter === "alle" ? undefined : tableFilter);
  const allRecords = useMemo(() => q.data ?? [], [q.data]);

  // The filter's options come from the database that enforces them, not from a constant in this
  // file that has to be remembered (ISSUES.md #7). Until that request lands — and if it ever
  // fails — fall back to the types actually present, so the filter is never empty.
  const tablesQ = useTrashTables();
  const eligible = useMemo(() => {
    const fromDb = tablesQ.data?.eligible ?? [];
    if (fromDb.length > 0) return fromDb;
    return [...new Set(allRecords.map((r) => r.table_name))].sort();
  }, [tablesQ.data, allRecords]);
  const purgeable = useMemo(
    () => new Set(tablesQ.data?.purgeable ?? eligible),
    [tablesQ.data, eligible],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const minimumDays = ALTER_OPTIONS.find((o) => o.value === alter)?.days ?? 0;
    const match = allRecords.filter((r) => {
      if (minimumDays > 0 && alterInDays(r.deleted_at) < minimumDays) return false;
      if (!needle) return true;
      return [r.label, r.delete_reason, r.deleted_by, r.table_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    const direction = sortAsc ? 1 : -1;
    return [...match].sort((a, b) => {
      if (sortKey === "geloeschtAm") {
        return (new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime()) * direction;
      }
      const links = sortKey === "typ" ? a.table_name : (a.label ?? "");
      const right = sortKey === "typ" ? b.table_name : (b.label ?? "");
      return links.localeCompare(right, "de") * direction;
    });
  }, [allRecords, search, alter, sortKey, sortAsc]);

  const pages = Math.max(1, Math.ceil(filtered.length / pagesSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pagesSize, (currentPage + 1) * pagesSize);

  const key = (r: TrashRecord) => `${r.table_name}-${r.id}`;
  const selected = filtered.filter((r) => selection.has(key(r)));

  /**
   * The header checkbox is scoped to THIS PAGE, not to everything the filter matches.
   *
   * A tick box sitting at the top of twenty-five visible rows reads as "these twenty-five", and
   * having it silently arm a purge of a hundred and forty-four records — irreversibly, for the
   * tables that allow it — is the kind of surprise this screen can least afford. Selecting the
   * whole result set is still one click away, but it is a click that says the number out loud
   * (`alleGefiltertWaehlen` below).
   */
  const pagesKey = visible.map(key);
  const pageAllSelected = visible.length > 0 && pagesKey.every((k) => selection.has(k));
  // Indeterminate while only some of the page is ticked — same three-state box the Lieferanten
  // list uses, so the two read identically.
  const pagePartialSelected = !pageAllSelected && pagesKey.some((k) => selection.has(k));
  const allFilteredSelected = filtered.length > 0 && selected.length === filtered.length;
  // Only worth offering when there is in fact more beyond this page.
  const moreAlsOnePage = filtered.length > visible.length;

  function choosePage() {
    setSelection((before) => {
      const next = new Set(before);
      if (pageAllSelected) pagesKey.forEach((k) => next.delete(k));
      else pagesKey.forEach((k) => next.add(k));
      return next;
    });
  }

  function allFilteredChoose() {
    setSelection(new Set(filtered.map(key)));
  }

  function toggleOne(r: TrashRecord) {
    setSelection((before) => {
      const next = new Set(before);
      const k = key(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key !== "geloeschtAm");
    }
    setPage(0);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <div
          data-tour="trash-header"
          className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {t("trash.list.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("trash.list.subtitle")}
            </p>
          </div>
        </div>

        <div
          data-tour="trash-filters"
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="pl-9"
              aria-label={t("trash.search.label")}
              placeholder={t("trash.search.placeholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            value={tableFilter}
            onValueChange={(v) => {
              setTableFilter(v);
              setPage(0);
              setSelection(new Set());
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label={t("trash.col.typ")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t("trash.filter.alle")}</SelectItem>
              {eligible.map((tbl) => (
                <SelectItem key={tbl} value={tbl}>
                  {t(`trash.table.${tbl}`, { defaultValue: tbl })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={alter}
            onValueChange={(v) => {
              setAlter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-[190px]" aria-label={t("trash.alter.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(`trash.alter.${o.value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {q.isError ? (
          <div className="mt-6">
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : q.isLoading ? (
          <div className="mt-6">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : (
          <div data-tour="trash-list">
            <BulkBar
              selected={selected}
              purgeable={purgeable}
              filteredTotal={filtered.length}
              allFilteredSelected={allFilteredSelected}
              canAllChoose={pageAllSelected && moreAlsOnePage && !allFilteredSelected}
              moreAlsOnePage={moreAlsOnePage}
              onAllChoose={allFilteredChoose}
              onDone={() => setSelection(new Set())}
            />

            {/* No separate "61 Einträge" line above the table: the pagination bar below already
                says "Zeige 1–25 von 61", and two counts in two places — one of them the filtered
                total, the other the page — read as a discrepancy rather than as information. */}

            <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={
                          pageAllSelected ? true : pagePartialSelected ? "indeterminate" : false
                        }
                        onCheckedChange={choosePage}
                        aria-label={t("trash.auswahl.seite")}
                        disabled={visible.length === 0}
                      />
                    </TableHead>
                    <SortHead
                      label={t("trash.col.typ")}
                      active={sortKey === "typ"}
                      asc={sortAsc}
                      onClick={() => sortBy("typ")}
                    />
                    <SortHead
                      label={t("trash.col.bezeichnung")}
                      active={sortKey === "bezeichnung"}
                      asc={sortAsc}
                      onClick={() => sortBy("bezeichnung")}
                    />
                    <SortHead
                      label={t("trash.col.gelöschtAm")}
                      active={sortKey === "geloeschtAm"}
                      asc={sortAsc}
                      onClick={() => sortBy("geloeschtAm")}
                    />
                    <TableHead>{t("trash.col.gelöschtVon")}</TableHead>
                    <TableHead>{t("trash.col.grund")}</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((record) => (
                    <TrashRow
                      key={key(record)}
                      record={record}
                      purgeable={purgeable.has(record.table_name)}
                      selected={selection.has(key(record))}
                      onToggle={() => toggleOne(record)}
                    />
                  ))}
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {t("trash.list.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: a card per trashed record instead of a 7-column table forcing horizontal scroll. */}
            <div className="mt-3 space-y-3 sm:hidden">
              {visible.map((record) => (
                <TrashCard
                  key={key(record)}
                  record={record}
                  purgeable={purgeable.has(record.table_name)}
                  selected={selection.has(key(record))}
                  onToggle={() => toggleOne(record)}
                />
              ))}
              {visible.length === 0 && (
                <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("trash.list.empty")}
                </p>
              )}
            </div>

            {/* The same bar every other list in the app uses — page-size picker, "showing x–y of
                z", prev/next — rather than a bespoke one that paginates almost but not quite like
                its neighbours. It is 1-based; `seite` here is 0-based. */}
            {filtered.length > 0 && (
              <TablePagination
                page={currentPage + 1}
                totalPages={pages}
                pageSize={pagesSize}
                total={filtered.length}
                from={currentPage * pagesSize + 1}
                to={Math.min((currentPage + 1) * pagesSize, filtered.length)}
                onPage={(p) => setPage(p - 1)}
                onPageSize={(n) => {
                  setPagesSize(n);
                  setPage(0);
                }}
              />
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function SortHead({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = !active ? ChevronsUpDown : asc ? ChevronUp : ChevronDown;
  return (
    <TableHead aria-sort={active ? (asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`${label}: ${active && asc ? t("trash.sort.desc") : t("trash.sort.asc")}`}
      >
        {label}
        <Icon className="size-3.5 opacity-60" aria-hidden />
      </button>
    </TableHead>
  );
}

/** "vor 12 Tagen" — issue #3: a formatted date says when, not how long it has been sitting here. */
function Alter({ deletedAt }: { deletedAt: string }) {
  const { t } = useTranslation();
  const days = alterInDays(deletedAt);
  const text =
    days < 1
      ? t("trash.age.heute")
      : days < 30
        ? t("trash.age.tage", { count: days })
        : days < 365
          ? t("trash.age.monate", { count: Math.floor(days / 30) })
          : t("trash.age.jahre", { count: Math.floor(days / 365) });
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

/**
 * The deletion reason.
 *
 * `max-w-xs truncate` with a `title` used to be the whole of it: a reason long enough to be worth
 * reading was the one you could not read, and on a touch screen the tooltip cannot be opened at
 * all. The text now wraps to two lines, and anything longer gets an explicit control that opens it
 * in full (ISSUES.md #10).
 */
function ReasonCell({ reason }: { reason: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const text = (reason ?? "").trim();
  if (!text) return <span className="text-muted-foreground">—</span>;
  const lang = text.length > 80;
  return (
    <div className="max-w-xs">
      <p
        className={`whitespace-pre-wrap break-words text-sm text-muted-foreground ${lang ? "line-clamp-2" : ""}`}
      >
        {text}
      </p>
      {lang && (
        <>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setOpen(true)}
          >
            {t("trash.grundVoll.mehr")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("trash.grundVoll.titel")}</DialogTitle>
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

function useTrashRowActions(record: TrashRecord) {
  const { t } = useTranslation();
  const restore = useRestoreRecord();
  const purge = usePurgeRecord();

  function confirmRestore(reason: string) {
    restore.mutate(
      { table: record.table_name, id: record.id, reason: reason },
      {
        onSuccess: () => toast.success(t("trash.restore.toast.ok", { label: record.label })),
        onError: (e) =>
          toast.error(
            t("trash.restore.toast.fehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  function finalDelete() {
    purge.mutate(
      { table: record.table_name, id: record.id },
      {
        onSuccess: () => toast.success(t("trash.purge.toast.ok", { label: record.label })),
        onError: (e) =>
          toast.error(
            t("trash.purge.toast.fehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return { restore, purge, confirmRestore, finalDelete };
}

/**
 * The padlock for a record that may be restored but never purged.
 *
 * A `<span>` carrying only a `title` was invisible on touch, unreachable by keyboard, and had no
 * accessible name — for the two cases where a deliberate, documented policy decision is being
 * enforced (ISSUES.md #9). It is a real button now: the reason is its accessible name, hovering or
 * focusing opens the tooltip, and tapping it opens the same tooltip on a device with no hover.
 */
function LockedHint({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={reason}
          className="text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          <Lock className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap text-left">{reason}</TooltipContent>
    </Tooltip>
  );
}

function TrashActions({ record, purgeable }: { record: TrashRecord; purgeable: boolean }) {
  const { t } = useTranslation();
  const { restore, confirmRestore, finalDelete } = useTrashRowActions(record);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex justify-end gap-1">
      {/* Restore asks first now. It is the action with the WIDER blast radius of the two: an
          un-deleted invoice re-enters the workflow and the P&L, an un-deleted rule starts matching
          again, an un-deleted approver reappears in every picker. Purge is irreversible but rare;
          restore was immediate and consequential, and the confirmation was on the wrong one
          (ISSUES.md #5). */}
      <Button
        variant="ghost"
        size="icon"
        className="text-brand hover:bg-brand/10 hover:text-brand"
        aria-label={t("trash.action.wiederherstellen")}
        disabled={restore.isPending}
        onClick={() => setRestoreOpen(true)}
      >
        <ArchiveRestore className="size-4" />
      </Button>
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("trash.restore.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("trash.restore.desc", { label: record.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor={`restore-grund-${record.id}`}>
              {t("trash.restore.grundLabel")}
            </label>
            <Textarea
              id={`restore-grund-${record.id}`}
              rows={2}
              value={reason}
              placeholder={t("trash.restore.grundPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("trash.restore.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRestore(reason)}>
              {t("trash.restore.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Which tables can be purged is the database's answer, not a constant in this file
          (ISSUES.md #7). `invoices` is GoBD-blocked and `approvers` is the target of four foreign
          keys; both are rejected server-side, so a button here could only ever fail. */}
      {!purgeable ? (
        <LockedHint
          reason={t(
            record.table_name === TABLE.documents
              ? "trash.purge.gobdGesperrt"
              : "trash.purge.referenzGesperrt",
          )}
        />
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("trash.action.endgueltigLoeschen")}
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
          <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("trash.purge.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("trash.purge.desc", { label: record.label })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("trash.purge.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={finalDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("trash.purge.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

/**
 * Restore or purge everything that is ticked, in one action.
 *
 * Cleaning up eight obvious test artefacts used to be sixteen clicks through eight confirm dialogs
 * (ISSUES.md #6). Purge still confirms — once, naming the count — and quietly skips anything the
 * database refuses to purge rather than firing requests that can only fail.
 */
function BulkBar({
  selected,
  purgeable,
  filteredTotal,
  allFilteredSelected,
  canAllChoose,
  moreAlsOnePage,
  onAllChoose,
  onDone,
}: {
  selected: TrashRecord[];
  purgeable: Set<string>;
  filteredTotal: number;
  allFilteredSelected: boolean;
  canAllChoose: boolean;
  moreAlsOnePage: boolean;
  onAllChoose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const restore = useRestoreRecord();
  const purge = usePurgeRecord();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  if (selected.length === 0) return null;
  const selectedPurgeable = selected.filter((r) => purgeable.has(r.table_name));
  const locked = selected.length - selectedPurgeable.length;

  async function allRestore() {
    setRunning(true);
    let ok = 0;
    for (const r of selected) {
      try {
        await restore.mutateAsync({ table: r.table_name, id: r.id, reason: null });
        ok++;
      } catch (e) {
        toast.error(t("trash.restore.toast.fehlgeschlagen", { error: errorText(e) }));
      }
    }
    setRunning(false);
    if (ok > 0) toast.success(t("trash.restore.toast.mehrere", { count: ok }));
    onDone();
  }

  async function allDelete() {
    setRunning(true);
    let ok = 0;
    for (const r of selectedPurgeable) {
      try {
        await purge.mutateAsync({ table: r.table_name, id: r.id });
        ok++;
      } catch (e) {
        toast.error(t("trash.purge.toast.fehlgeschlagen", { error: errorText(e) }));
      }
    }
    setRunning(false);
    setOpen(false);
    if (ok > 0) toast.success(t("trash.purge.toast.mehrere", { count: ok }));
    onDone();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <span className="text-sm font-medium text-foreground">
        {t("trash.auswahl.anzahl", { count: selected.length })}
      </span>
      <Button size="sm" variant="outline" disabled={running} onClick={allRestore}>
        {t("trash.auswahl.wiederherstellen", { count: selected.length })}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={running || selectedPurgeable.length === 0}
        onClick={() => setOpen(true)}
      >
        {t("trash.auswahl.loeschen", { count: selectedPurgeable.length })}
      </Button>
      <Button size="sm" variant="ghost" disabled={running} onClick={onDone}>
        {t("trash.auswahl.aufheben")}
      </Button>
      {/* The escape hatch out of page scope. It only appears once the page IS fully ticked, and it
          names the number it is about to arm — the whole point of not letting the header checkbox
          do this quietly. */}
      {canAllChoose && (
        <Button
          size="sm"
          variant="link"
          className="h-auto p-0"
          disabled={running}
          onClick={onAllChoose}
        >
          {t("trash.auswahl.alleGefiltert", { count: filteredTotal })}
        </Button>
      )}
      {allFilteredSelected && moreAlsOnePage && (
        <span className="text-xs text-muted-foreground">
          {t("trash.auswahl.alleGewaehlt", { count: filteredTotal })}
        </span>
      )}
      {locked > 0 && (
        <span className="text-xs text-muted-foreground">
          {t("trash.auswahl.nichtsPurgebar", { count: locked })}
        </span>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trash.purge.titelMehrere", { count: selectedPurgeable.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trash.purge.descMehrere", { count: selectedPurgeable.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("trash.purge.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={allDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("trash.purge.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrashRow({
  record,
  purgeable,
  selected,
  onToggle,
}: {
  record: TrashRecord;
  purgeable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={t("trash.auswahl.zeile", { label: record.label })}
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {t(`trash.table.${record.table_name}`, { defaultValue: record.table_name })}
        </Badge>
      </TableCell>
      <TableCell className="font-medium text-foreground">{record.label}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div>{formatDateTime(record.deleted_at)}</div>
        <Alter deletedAt={record.deleted_at} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{record.deleted_by ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <ReasonCell reason={record.delete_reason} />
      </TableCell>
      <TableCell>
        <TrashActions record={record} purgeable={purgeable} />
      </TableCell>
    </TableRow>
  );
}

function TrashCard({
  record,
  purgeable,
  selected,
  onToggle,
}: {
  record: TrashRecord;
  purgeable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={t("trash.auswahl.zeile", { label: record.label })}
            className="mt-1"
          />
          <div className="min-w-0">
            <Badge variant="secondary">
              {t(`trash.table.${record.table_name}`, { defaultValue: record.table_name })}
            </Badge>
            <div className="mt-1 truncate font-medium text-foreground">{record.label}</div>
          </div>
        </div>
        <TrashActions record={record} purgeable={purgeable} />
      </div>
      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          {t("trash.col.gelöschtAm")}: {formatDateTime(record.deleted_at)} ·{" "}
          <Alter deletedAt={record.deleted_at} />
        </div>
        <div>
          {t("trash.col.gelöschtVon")}: {record.deleted_by ?? "—"}
        </div>
        {record.delete_reason && (
          <div>
            <span className="mr-1">{t("trash.col.grund")}:</span>
            <ReasonCell reason={record.delete_reason} />
          </div>
        )}
      </div>
    </div>
  );
}
