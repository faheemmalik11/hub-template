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
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { PAGE_SIZES, TablePagination } from "@/components/data-table/table-pagination";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { usePurgeRecord, useRestoreRecord, useTrash, useTrashTables } from "@/lib/data/queries";
import { fehlerText, formatDateTime } from "@/lib/data/format";
import type { TrashRecord } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { useMemo, useState } from "react";

import { pageTitle } from "@/lib/brand";
import { TABLE } from "@/lib/data/tables";

export const Route = createFileRoute("/papierkorb/")({
  head: () => ({ meta: [{ title: pageTitle("Papierkorb") }] }),
  component: PapierkorbGuard,
});

// Admin-only (Briefing Screen 18). RLS backs every underlying table already; this is the UX
// guard so trash management isn't offered to roles it was never meant for.
//
// It used to be `<Navigate to="/" />` with no message, and `null` while the role was still
// resolving — a bookmarked link simply landed somebody on the dashboard with no explanation, and
// the page was a blank rectangle in between. Both are now visible states
// (docs/audit/papierkorb/trash/ISSUES.md #8).
function PapierkorbGuard() {
  const { ready, can } = useAuth();
  if (!ready) return <PapierkorbSkeleton />;
  if (!can(PERMISSIONS.pagePapierkorb)) return <KeinZugriff />;
  return <PapierkorbPage />;
}

function PapierkorbSkeleton() {
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

function KeinZugriff() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card px-6 py-12 text-center">
      <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        {t("papierkorb.guard.titel")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("papierkorb.guard.text")}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">{t("papierkorb.guard.zurueck")}</Link>
      </Button>
    </div>
  );
}

/** Default rows per page — the same 25 every other list in the app starts on. The list is fetched
 *  whole and paged in the browser: at trash sizes the network round trip per page costs more than
 *  it saves, and search, sort and "select all N" all have to see everything anyway. */
const PAGE_SIZE: (typeof PAGE_SIZES)[number] = 25;

const ALTER_OPTIONEN = [
  { value: "alle", tage: 0 },
  { value: "d30", tage: 30 },
  { value: "d90", tage: 90 },
  { value: "d365", tage: 365 },
] as const;

type SortKey = "typ" | "bezeichnung" | "geloeschtAm";

/** Whole days between a deletion and now. */
function alterInTagen(deletedAt: string): number {
  return Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
}

function PapierkorbPage() {
  const { t } = useTranslation();
  const [tableFilter, setTableFilter] = useState<string>("alle");
  const [suche, setSuche] = useState("");
  const [alter, setAlter] = useState<string>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("geloeschtAm");
  const [sortAsc, setSortAsc] = useState(false);
  const [seite, setSeite] = useState(0);
  const [seitenGroesse, setSeitenGroesse] = useState<number>(PAGE_SIZE);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  const q = useTrash(tableFilter === "alle" ? undefined : tableFilter);
  const alleRecords = useMemo(() => q.data ?? [], [q.data]);

  // The filter's options come from the database that enforces them, not from a constant in this
  // file that has to be remembered (ISSUES.md #7). Until that request lands — and if it ever
  // fails — fall back to the types actually present, so the filter is never empty.
  const tablesQ = useTrashTables();
  const eligible = useMemo(() => {
    const fromDb = tablesQ.data?.eligible ?? [];
    if (fromDb.length > 0) return fromDb;
    return [...new Set(alleRecords.map((r) => r.table_name))].sort();
  }, [tablesQ.data, alleRecords]);
  const purgeable = useMemo(
    () => new Set(tablesQ.data?.purgeable ?? eligible),
    [tablesQ.data, eligible],
  );

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    const mindestTage = ALTER_OPTIONEN.find((o) => o.value === alter)?.tage ?? 0;
    const treffer = alleRecords.filter((r) => {
      if (mindestTage > 0 && alterInTagen(r.deleted_at) < mindestTage) return false;
      if (!needle) return true;
      return [r.label, r.delete_reason, r.deleted_by, r.table_name]
        .filter(Boolean)
        .some((feld) => String(feld).toLowerCase().includes(needle));
    });

    const richtung = sortAsc ? 1 : -1;
    return [...treffer].sort((a, b) => {
      if (sortKey === "geloeschtAm") {
        return (new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime()) * richtung;
      }
      const links = sortKey === "typ" ? a.table_name : (a.label ?? "");
      const rechts = sortKey === "typ" ? b.table_name : (b.label ?? "");
      return links.localeCompare(rechts, "de") * richtung;
    });
  }, [alleRecords, suche, alter, sortKey, sortAsc]);

  const seiten = Math.max(1, Math.ceil(gefiltert.length / seitenGroesse));
  const aktuelleSeite = Math.min(seite, seiten - 1);
  const sichtbar = gefiltert.slice(
    aktuelleSeite * seitenGroesse,
    (aktuelleSeite + 1) * seitenGroesse,
  );

  const schluessel = (r: TrashRecord) => `${r.table_name}-${r.id}`;
  const ausgewaehlt = gefiltert.filter((r) => auswahl.has(schluessel(r)));

  /**
   * The header checkbox is scoped to THIS PAGE, not to everything the filter matches.
   *
   * A tick box sitting at the top of twenty-five visible rows reads as "these twenty-five", and
   * having it silently arm a purge of a hundred and forty-four records — irreversibly, for the
   * tables that allow it — is the kind of surprise this screen can least afford. Selecting the
   * whole result set is still one click away, but it is a click that says the number out loud
   * (`alleGefiltertWaehlen` below).
   */
  const seitenSchluessel = sichtbar.map(schluessel);
  const seiteAlleGewaehlt = sichtbar.length > 0 && seitenSchluessel.every((k) => auswahl.has(k));
  // Indeterminate while only some of the page is ticked — same three-state box the Lieferanten
  // list uses, so the two read identically.
  const seiteTeilweiseGewaehlt = !seiteAlleGewaehlt && seitenSchluessel.some((k) => auswahl.has(k));
  const alleGefiltertAusgewaehlt = gefiltert.length > 0 && ausgewaehlt.length === gefiltert.length;
  // Only worth offering when there is in fact more beyond this page.
  const mehrAlsEineSeite = gefiltert.length > sichtbar.length;

  function waehleSeite() {
    setAuswahl((vorher) => {
      const naechste = new Set(vorher);
      if (seiteAlleGewaehlt) seitenSchluessel.forEach((k) => naechste.delete(k));
      else seitenSchluessel.forEach((k) => naechste.add(k));
      return naechste;
    });
  }

  function alleGefiltertWaehlen() {
    setAuswahl(new Set(gefiltert.map(schluessel)));
  }

  function toggleEine(r: TrashRecord) {
    setAuswahl((vorher) => {
      const naechste = new Set(vorher);
      const k = schluessel(r);
      if (naechste.has(k)) naechste.delete(k);
      else naechste.add(k);
      return naechste;
    });
  }

  function sortiereNach(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key !== "geloeschtAm");
    }
    setSeite(0);
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
              {t("papierkorb.list.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("papierkorb.list.subtitle")}
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
              aria-label={t("papierkorb.search.label")}
              placeholder={t("papierkorb.search.placeholder")}
              value={suche}
              onChange={(e) => {
                setSuche(e.target.value);
                setSeite(0);
              }}
            />
          </div>
          <Select
            value={tableFilter}
            onValueChange={(v) => {
              setTableFilter(v);
              setSeite(0);
              setAuswahl(new Set());
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label={t("papierkorb.col.typ")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t("papierkorb.filter.alle")}</SelectItem>
              {eligible.map((tbl) => (
                <SelectItem key={tbl} value={tbl}>
                  {t(`papierkorb.table.${tbl}`, { defaultValue: tbl })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={alter}
            onValueChange={(v) => {
              setAlter(v);
              setSeite(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-[190px]" aria-label={t("papierkorb.alter.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALTER_OPTIONEN.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(`papierkorb.alter.${o.value}`)}
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
            <BulkLeiste
              ausgewaehlt={ausgewaehlt}
              purgeable={purgeable}
              gefiltertGesamt={gefiltert.length}
              alleGefiltertAusgewaehlt={alleGefiltertAusgewaehlt}
              kannAlleWaehlen={seiteAlleGewaehlt && mehrAlsEineSeite && !alleGefiltertAusgewaehlt}
              mehrAlsEineSeite={mehrAlsEineSeite}
              onAlleWaehlen={alleGefiltertWaehlen}
              onFertig={() => setAuswahl(new Set())}
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
                          seiteAlleGewaehlt
                            ? true
                            : seiteTeilweiseGewaehlt
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={waehleSeite}
                        aria-label={t("papierkorb.auswahl.seite")}
                        disabled={sichtbar.length === 0}
                      />
                    </TableHead>
                    <SortHead
                      label={t("papierkorb.col.typ")}
                      aktiv={sortKey === "typ"}
                      asc={sortAsc}
                      onClick={() => sortiereNach("typ")}
                    />
                    <SortHead
                      label={t("papierkorb.col.bezeichnung")}
                      aktiv={sortKey === "bezeichnung"}
                      asc={sortAsc}
                      onClick={() => sortiereNach("bezeichnung")}
                    />
                    <SortHead
                      label={t("papierkorb.col.gelöschtAm")}
                      aktiv={sortKey === "geloeschtAm"}
                      asc={sortAsc}
                      onClick={() => sortiereNach("geloeschtAm")}
                    />
                    <TableHead>{t("papierkorb.col.gelöschtVon")}</TableHead>
                    <TableHead>{t("papierkorb.col.grund")}</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sichtbar.map((record) => (
                    <TrashRow
                      key={schluessel(record)}
                      record={record}
                      purgeable={purgeable.has(record.table_name)}
                      selected={auswahl.has(schluessel(record))}
                      onToggle={() => toggleEine(record)}
                    />
                  ))}
                  {sichtbar.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {t("papierkorb.list.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: a card per trashed record instead of a 7-column table forcing horizontal scroll. */}
            <div className="mt-3 space-y-3 sm:hidden">
              {sichtbar.map((record) => (
                <TrashCard
                  key={schluessel(record)}
                  record={record}
                  purgeable={purgeable.has(record.table_name)}
                  selected={auswahl.has(schluessel(record))}
                  onToggle={() => toggleEine(record)}
                />
              ))}
              {sichtbar.length === 0 && (
                <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("papierkorb.list.empty")}
                </p>
              )}
            </div>

            {/* The same bar every other list in the app uses — page-size picker, "showing x–y of
                z", prev/next — rather than a bespoke one that paginates almost but not quite like
                its neighbours. It is 1-based; `seite` here is 0-based. */}
            {gefiltert.length > 0 && (
              <TablePagination
                page={aktuelleSeite + 1}
                totalPages={seiten}
                pageSize={seitenGroesse}
                total={gefiltert.length}
                from={aktuelleSeite * seitenGroesse + 1}
                to={Math.min((aktuelleSeite + 1) * seitenGroesse, gefiltert.length)}
                onPage={(p) => setSeite(p - 1)}
                onPageSize={(n) => {
                  setSeitenGroesse(n);
                  setSeite(0);
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
  aktiv,
  asc,
  onClick,
}: {
  label: string;
  aktiv: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = !aktiv ? ChevronsUpDown : asc ? ChevronUp : ChevronDown;
  return (
    <TableHead aria-sort={aktiv ? (asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`${label}: ${aktiv && asc ? t("papierkorb.sort.desc") : t("papierkorb.sort.asc")}`}
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
  const tage = alterInTagen(deletedAt);
  const text =
    tage < 1
      ? t("papierkorb.age.heute")
      : tage < 30
        ? t("papierkorb.age.tage", { count: tage })
        : tage < 365
          ? t("papierkorb.age.monate", { count: Math.floor(tage / 30) })
          : t("papierkorb.age.jahre", { count: Math.floor(tage / 365) });
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
function GrundZelle({ grund }: { grund: string | null }) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const text = (grund ?? "").trim();
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
            onClick={() => setOffen(true)}
          >
            {t("papierkorb.grundVoll.mehr")}
          </Button>
          <Dialog open={offen} onOpenChange={setOffen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("papierkorb.grundVoll.titel")}</DialogTitle>
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

  function wiederherstellen(grund: string) {
    restore.mutate(
      { table: record.table_name, id: record.id, reason: grund },
      {
        onSuccess: () => toast.success(t("papierkorb.restore.toast.ok", { label: record.label })),
        onError: (e) =>
          toast.error(
            t("papierkorb.restore.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  function endgueltigLoeschen() {
    purge.mutate(
      { table: record.table_name, id: record.id },
      {
        onSuccess: () => toast.success(t("papierkorb.purge.toast.ok", { label: record.label })),
        onError: (e) =>
          toast.error(
            t("papierkorb.purge.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return { restore, purge, wiederherstellen, endgueltigLoeschen };
}

/**
 * The padlock for a record that may be restored but never purged.
 *
 * A `<span>` carrying only a `title` was invisible on touch, unreachable by keyboard, and had no
 * accessible name — for the two cases where a deliberate, documented policy decision is being
 * enforced (ISSUES.md #9). It is a real button now: the reason is its accessible name, hovering or
 * focusing opens the tooltip, and tapping it opens the same tooltip on a device with no hover.
 */
function GesperrtHinweis({ grund }: { grund: string }) {
  const [offen, setOffen] = useState(false);
  return (
    <Tooltip open={offen} onOpenChange={setOffen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={grund}
          className="text-muted-foreground"
          onClick={() => setOffen((v) => !v)}
        >
          <Lock className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap text-left">{grund}</TooltipContent>
    </Tooltip>
  );
}

function TrashActions({ record, purgeable }: { record: TrashRecord; purgeable: boolean }) {
  const { t } = useTranslation();
  const { restore, wiederherstellen, endgueltigLoeschen } = useTrashRowActions(record);
  const [restoreOffen, setRestoreOffen] = useState(false);
  const [purgeOffen, setPurgeOffen] = useState(false);
  const [grund, setGrund] = useState("");

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
        aria-label={t("papierkorb.action.wiederherstellen")}
        disabled={restore.isPending}
        onClick={() => setRestoreOffen(true)}
      >
        <ArchiveRestore className="size-4" />
      </Button>
      <AlertDialog open={restoreOffen} onOpenChange={setRestoreOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("papierkorb.restore.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("papierkorb.restore.desc", { label: record.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor={`restore-grund-${record.id}`}>
              {t("papierkorb.restore.grundLabel")}
            </label>
            <Textarea
              id={`restore-grund-${record.id}`}
              rows={2}
              value={grund}
              placeholder={t("papierkorb.restore.grundPlaceholder")}
              onChange={(e) => setGrund(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("papierkorb.restore.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => wiederherstellen(grund)}>
              {t("papierkorb.restore.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Which tables can be purged is the database's answer, not a constant in this file
          (ISSUES.md #7). `invoices` is GoBD-blocked and `approvers` is the target of four foreign
          keys; both are rejected server-side, so a button here could only ever fail. */}
      {!purgeable ? (
        <GesperrtHinweis
          grund={t(
            record.table_name === TABLE.documents
              ? "papierkorb.purge.gobdGesperrt"
              : "papierkorb.purge.referenzGesperrt",
          )}
        />
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("papierkorb.action.endgueltigLoeschen")}
            onClick={() => setPurgeOffen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
          <AlertDialog open={purgeOffen} onOpenChange={setPurgeOffen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("papierkorb.purge.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("papierkorb.purge.desc", { label: record.label })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("papierkorb.purge.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={endgueltigLoeschen}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("papierkorb.purge.confirm")}
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
function BulkLeiste({
  ausgewaehlt,
  purgeable,
  gefiltertGesamt,
  alleGefiltertAusgewaehlt,
  kannAlleWaehlen,
  mehrAlsEineSeite,
  onAlleWaehlen,
  onFertig,
}: {
  ausgewaehlt: TrashRecord[];
  purgeable: Set<string>;
  gefiltertGesamt: number;
  alleGefiltertAusgewaehlt: boolean;
  kannAlleWaehlen: boolean;
  mehrAlsEineSeite: boolean;
  onAlleWaehlen: () => void;
  onFertig: () => void;
}) {
  const { t } = useTranslation();
  const restore = useRestoreRecord();
  const purge = usePurgeRecord();
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  if (ausgewaehlt.length === 0) return null;
  const purgebar = ausgewaehlt.filter((r) => purgeable.has(r.table_name));
  const gesperrt = ausgewaehlt.length - purgebar.length;

  async function alleWiederherstellen() {
    setLaeuft(true);
    let ok = 0;
    for (const r of ausgewaehlt) {
      try {
        await restore.mutateAsync({ table: r.table_name, id: r.id, reason: null });
        ok++;
      } catch (e) {
        toast.error(t("papierkorb.restore.toast.fehlgeschlagen", { error: fehlerText(e) }));
      }
    }
    setLaeuft(false);
    if (ok > 0) toast.success(t("papierkorb.restore.toast.mehrere", { count: ok }));
    onFertig();
  }

  async function alleLoeschen() {
    setLaeuft(true);
    let ok = 0;
    for (const r of purgebar) {
      try {
        await purge.mutateAsync({ table: r.table_name, id: r.id });
        ok++;
      } catch (e) {
        toast.error(t("papierkorb.purge.toast.fehlgeschlagen", { error: fehlerText(e) }));
      }
    }
    setLaeuft(false);
    setOffen(false);
    if (ok > 0) toast.success(t("papierkorb.purge.toast.mehrere", { count: ok }));
    onFertig();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <span className="text-sm font-medium text-foreground">
        {t("papierkorb.auswahl.anzahl", { count: ausgewaehlt.length })}
      </span>
      <Button size="sm" variant="outline" disabled={laeuft} onClick={alleWiederherstellen}>
        {t("papierkorb.auswahl.wiederherstellen", { count: ausgewaehlt.length })}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={laeuft || purgebar.length === 0}
        onClick={() => setOffen(true)}
      >
        {t("papierkorb.auswahl.loeschen", { count: purgebar.length })}
      </Button>
      <Button size="sm" variant="ghost" disabled={laeuft} onClick={onFertig}>
        {t("papierkorb.auswahl.aufheben")}
      </Button>
      {/* The escape hatch out of page scope. It only appears once the page IS fully ticked, and it
          names the number it is about to arm — the whole point of not letting the header checkbox
          do this quietly. */}
      {kannAlleWaehlen && (
        <Button
          size="sm"
          variant="link"
          className="h-auto p-0"
          disabled={laeuft}
          onClick={onAlleWaehlen}
        >
          {t("papierkorb.auswahl.alleGefiltert", { count: gefiltertGesamt })}
        </Button>
      )}
      {alleGefiltertAusgewaehlt && mehrAlsEineSeite && (
        <span className="text-xs text-muted-foreground">
          {t("papierkorb.auswahl.alleGewaehlt", { count: gefiltertGesamt })}
        </span>
      )}
      {gesperrt > 0 && (
        <span className="text-xs text-muted-foreground">
          {t("papierkorb.auswahl.nichtsPurgebar", { count: gesperrt })}
        </span>
      )}
      <AlertDialog open={offen} onOpenChange={setOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("papierkorb.purge.titelMehrere", { count: purgebar.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("papierkorb.purge.descMehrere", { count: purgebar.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("papierkorb.purge.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={alleLoeschen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("papierkorb.purge.confirm")}
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
          aria-label={t("papierkorb.auswahl.zeile", { label: record.label })}
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {t(`papierkorb.table.${record.table_name}`, { defaultValue: record.table_name })}
        </Badge>
      </TableCell>
      <TableCell className="font-medium text-foreground">{record.label}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div>{formatDateTime(record.deleted_at)}</div>
        <Alter deletedAt={record.deleted_at} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{record.deleted_by ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <GrundZelle grund={record.delete_reason} />
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
            aria-label={t("papierkorb.auswahl.zeile", { label: record.label })}
            className="mt-1"
          />
          <div className="min-w-0">
            <Badge variant="secondary">
              {t(`papierkorb.table.${record.table_name}`, { defaultValue: record.table_name })}
            </Badge>
            <div className="mt-1 truncate font-medium text-foreground">{record.label}</div>
          </div>
        </div>
        <TrashActions record={record} purgeable={purgeable} />
      </div>
      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          {t("papierkorb.col.gelöschtAm")}: {formatDateTime(record.deleted_at)} ·{" "}
          <Alter deletedAt={record.deleted_at} />
        </div>
        <div>
          {t("papierkorb.col.gelöschtVon")}: {record.deleted_by ?? "—"}
        </div>
        {record.delete_reason && (
          <div>
            <span className="mr-1">{t("papierkorb.col.grund")}:</span>
            <GrundZelle grund={record.delete_reason} />
          </div>
        )}
      </div>
    </div>
  );
}
