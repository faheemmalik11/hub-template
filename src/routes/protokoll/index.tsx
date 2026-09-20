import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Info, Search } from "lucide-react";

import { KeinZugriff } from "@/components/layout/kein-zugriff";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useChangeHistoryPage,
  useVerarbeitungsLogPage,
  useVerarbeitungsLogStatusCounts,
  searchWasDropped,
  type ChangeHistoryEntry,
} from "@/data";
import { formatDateTime } from "@/lib/data/format";
import { parseReason, parseSender, type ParsedSender } from "@/lib/data/protokoll-format";
import { downloadCsv } from "@/lib/data/bwa-export";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { TablePagination } from "@/components/data-table/table-pagination";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";
import type { VerarbeitungsLog } from "@/lib/data/types";

export const Route = createFileRoute("/protokoll/")({
  head: () => ({ meta: [{ title: pageTitle("Protokoll") }] }),
  component: ProtokollGuard,
});

// A page that is hidden from a role in the nav must not be reachable by pasting its URL either.
// The nav entry for this screen is `roles: NOT_ASSISTANT` (app-shell.tsx), but nothing enforced it
// on the route: an assistant who typed /protokoll got the screen. The table is RLS-scoped so the
// rows came back empty, which made it look harmless — it is not the same thing as not being able
// to open the page, and the empty state reads as "nothing happened today" rather than "not for you".
// Same shape as TeamGuard/PapierkorbGuard/AuswertungenGuard.
function ProtokollGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageActivityLog)) return <KeinZugriff variant="manager" />;
  return <ProtokollPage />;
}

const ALLE = "__alle";

/** Period filter values. Kept local: the log's own periods are relative, not calendar months. */
const ZEITRAUM = { alle: "alle", heute: "heute", tage7: "tage7", tage30: "tage30" } as const;
type Zeitraum = (typeof ZEITRAUM)[keyof typeof ZEITRAUM];

/** Local YYYY-MM-DD, `offsetDays` before today. Local, not UTC: "today" means the user's today. */
function isoDaysAgo(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inclusive date bounds for a period. Audit issue #4 — the log had no date filter at all. */
function zeitraumBounds(z: Zeitraum): { von: string | null; bis: string | null } {
  if (z === ZEITRAUM.heute) return { von: isoDaysAgo(0), bis: isoDaysAgo(0) };
  if (z === ZEITRAUM.tage7) return { von: isoDaysAgo(6), bis: isoDaysAgo(0) };
  if (z === ZEITRAUM.tage30) return { von: isoDaysAgo(29), bis: isoDaysAgo(0) };
  return { von: null, bis: null };
}

// Farbe je Verarbeitungs-Status.
const STATUS_STYLE: Record<string, string> = {
  recognised: "bg-brand-tint text-brand-dark",
  needs_review: "bg-amber-100 text-amber-800",
  fehler: "bg-red-100 text-red-800",
  duplikat: "bg-muted text-muted-foreground",
  kein_beleg_anhang: "bg-muted text-muted-foreground",
  ausgeschlossen: "bg-slate-200 text-slate-700",
  split: "bg-sky-100 text-sky-800",
  storage_nachgeholt: "bg-muted text-muted-foreground",
  // Not an error, but the mail was never read either, so it has to be re-run. Orange rather
  // than a neutral grey: a skipped receipt that looks harmless is one nobody goes back for.
  skipped: "bg-orange-100 text-orange-800",
};

function ProtokollPage() {
  const { t } = useTranslation();
  return (
    <div>
      <div data-tour="log-header" className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("protokoll.title")}
          </h1>
        </div>
      </div>

      {/* Two logs, two tabs. The screen was called "Protokoll" but only ever showed the ingestion
          pipeline, while change_history — role changes, restores, purges, deletions with their
          reasons — had no screen anywhere in the app (audit issue #10). Anyone looking for "who
          changed what" arrives here first, so this is where it belongs. */}
      <Tabs defaultValue="verarbeitung" className="mt-6">
        <TabsList data-tour="log-tabs">
          <TabsTrigger value="verarbeitung">{t("protokoll.tabs.verarbeitung")}</TabsTrigger>
          <TabsTrigger value="aenderungen">{t("protokoll.tabs.aenderungen")}</TabsTrigger>
        </TabsList>
        <TabsContent value="verarbeitung" className="mt-4">
          <VerarbeitungsLogTab />
        </TabsContent>
        <TabsContent value="aenderungen" className="mt-4">
          <AenderungsLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tab 1 — the ingestion log
// ---------------------------------------------------------------------------------------------

function VerarbeitungsLogTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [suche, setSuche] = useState("");
  const [suchTerm, setSuchTerm] = useState("");
  const [fStatus, setFStatus] = useState(ALLE);
  const [zeitraum, setZeitraum] = useState<Zeitraum>(ZEITRAUM.alle);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  /** The entry open in the detail dialog. Audit issue #9 — nothing could be got out of this screen. */
  const [detail, setDetail] = useState<VerarbeitungsLog | null>(null);

  // Debounced, because the search now goes to the server on every keystroke otherwise.
  useEffect(() => {
    const timer = window.setTimeout(() => setSuchTerm(suche.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [suche]);

  // Narrowing the result set invalidates the current page position.
  useEffect(() => {
    setPage(1);
  }, [suchTerm, fStatus, zeitraum, pageSize]);

  const bounds = useMemo(() => zeitraumBounds(zeitraum), [zeitraum]);

  const logQ = useVerarbeitungsLogPage({
    search: suchTerm,
    status: fStatus === ALLE ? undefined : fStatus,
    von: bounds.von,
    bis: bounds.bis,
    page,
    pageSize,
  });
  // Counts span the whole log and ignore the status filter, so the chips stay toggles. They DO
  // respect the search and the period, or they would describe a different set than the table.
  const countsQ = useVerarbeitungsLogStatusCounts({
    search: suchTerm,
    von: bounds.von,
    bis: bounds.bis,
  });

  const gefiltert = logQ.data?.rows ?? [];
  const total = logQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const von = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const bis = Math.min(page * pageSize, total);
  const termDropped = searchWasDropped(suchTerm);

  const counts = useMemo(() => countsQ.data ?? {}, [countsQ.data]);
  const statusWerte = useMemo(
    () => Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)),
    [counts],
  );

  function exportCsv() {
    // Exports what is on screen, page included — the honest scope for a button next to a paginated
    // table. The full reason goes in verbatim, which is the thing that could not be got out before.
    const header = [
      t("protokoll.col.zeitpunkt"),
      t("protokoll.col.betreff"),
      t("protokoll.col.absender"),
      t("protokoll.col.status"),
      t("protokoll.col.grund"),
    ];
    const lines = [
      header,
      ...gefiltert.map((e) => [
        e.processed_at ?? "",
        e.subject ?? "",
        e.sender ?? "",
        e.status ?? "",
        e.reason ?? "",
      ]),
    ];
    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    downloadCsv(`protokoll-${isoDaysAgo(0)}.csv`, csv);
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t("protokoll.subtitle")}</p>

      {/* Status summary — each chip is also the filter for that status (click again to clear). It
          shares fStatus with the dropdown below, so the two can never disagree.

          The block ALWAYS renders, with skeleton pills while the counts are in flight. Gating it on
          a query meant the header appeared chipless and then grew when the counts landed, shoving
          the search row 24px down (audit issue #8, measured). Reserving the row costs nothing and
          the shift becomes zero. */}
      <div className="mt-4 flex min-h-[34px] flex-wrap items-center gap-2">
        {countsQ.isLoading ? (
          <>
            <Skeleton className="h-[26px] w-28 rounded-full" />
            <Skeleton className="h-[26px] w-24 rounded-full" />
            <Skeleton className="h-[26px] w-20 rounded-full" />
          </>
        ) : (
          <>
            {statusWerte.map((s) => {
              const active = fStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  title={t(active ? "protokoll.chip.clear" : "protokoll.chip.filter")}
                  onClick={() => setFStatus(active ? ALLE : s)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    STATUS_STYLE[s] ?? "bg-muted text-muted-foreground",
                    active
                      ? "ring-2 ring-brand ring-offset-1 ring-offset-background"
                      : // Dim the others once a filter is on, so the active one reads at a glance.
                        fStatus !== ALLE && "opacity-40 hover:opacity-100",
                  )}
                >
                  {t(`protokoll.status.${s}`, { defaultValue: s })} · {counts[s]}
                </button>
              );
            })}
            {fStatus !== ALLE && (
              <button
                type="button"
                onClick={() => setFStatus(ALLE)}
                className="inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium text-muted-foreground underline hover:text-foreground"
              >
                {t("protokoll.chip.clear")}
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:min-w-[240px] sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder={t("protokoll.search")}
            className="pl-9"
          />
        </div>
        <Combobox
          value={fStatus}
          onValueChange={setFStatus}
          className="w-full sm:w-[180px]"
          placeholder={t("protokoll.filterStatus")}
          options={[
            { value: ALLE, label: t("protokoll.alleStatus") },
            ...statusWerte.map((s) => ({
              value: s,
              label: t(`protokoll.status.${s}`, { defaultValue: s }),
            })),
          ]}
        />
        {/* Audit issue #4: a log with no date filter. The first question anyone asks of a pipeline
            log is "what did it do this morning", and answering it meant paging a newest-first table
            and reading timestamps. */}
        <Combobox
          value={zeitraum}
          onValueChange={(v) => setZeitraum(v as Zeitraum)}
          className="w-full sm:w-[170px]"
          placeholder={t("protokoll.filter.zeitraum")}
          options={[
            { value: ZEITRAUM.alle, label: t("protokoll.filter.gesamterZeitraum") },
            { value: ZEITRAUM.heute, label: t("protokoll.filter.heute") },
            { value: ZEITRAUM.tage7, label: t("protokoll.filter.letzte7Tage") },
            { value: ZEITRAUM.tage30, label: t("protokoll.filter.letzte30Tage") },
          ]}
        />
        {/* One tap for the common case, next to the dropdown that covers the rest. */}
        <Button
          type="button"
          variant={zeitraum === ZEITRAUM.heute ? "default" : "outline"}
          size="sm"
          onClick={() => setZeitraum(zeitraum === ZEITRAUM.heute ? ZEITRAUM.alle : ZEITRAUM.heute)}
        >
          {t("protokoll.filter.heute")}
        </Button>
        {/* Audit issue #9: there was no way to get anything off this screen at all. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={gefiltert.length === 0}
          onClick={exportCsv}
        >
          <Download className="size-4" />
          {t("protokoll.export.csv")}
        </Button>
      </div>

      {/* The search term was rewritten out of existence. Previously the filter was silently dropped
          and the whole table came back while the box showed an active search (audit issue #7). */}
      {termDropped && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("protokoll.searchDropped")}
        </p>
      )}

      {logQ.isError ? (
        <div className="mt-4">
          <ErrorState error={logQ.error} onRetry={() => logQ.refetch()} />
        </div>
      ) : logQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={10} cols={4} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {/* The matching total, not the current page's length. */}
            {t("protokoll.count", { count: total })}
            {logQ.isFetching && ` · ${t("bank.list.updating")}`}
          </p>
          {/* Desktop: unchanged table, `sm` and up. */}
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("protokoll.col.zeitpunkt")}</TableHead>
                  <TableHead>{t("protokoll.col.betreff")}</TableHead>
                  <TableHead>{t("protokoll.col.absender")}</TableHead>
                  <TableHead>{t("protokoll.col.status")}</TableHead>
                  <TableHead>{t("protokoll.col.grund")}</TableHead>
                  <TableHead className="w-[92px] text-right">
                    {t("protokoll.col.aktionen")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gefiltert.map((e) => (
                  <LogRow
                    key={e.id}
                    entry={e}
                    onOpenDetail={() => setDetail(e)}
                    onOpenInvoice={() =>
                      navigate({ to: "/eingangsrechnungen/$nr", params: { nr: e.document_id! } })
                    }
                  />
                ))}
                {gefiltert.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {t("protokoll.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: one card per entry instead of a 6-column table, so nothing needs even a
              table-bounded horizontal scroll. Subject + status up top (the two things worth
              scanning at a glance), sender/time/reason below. */}
          <div className="mt-3 space-y-3 sm:hidden">
            {gefiltert.map((e) => (
              <LogCard
                key={e.id}
                entry={e}
                onOpenDetail={() => setDetail(e)}
                onOpenInvoice={() =>
                  navigate({ to: "/eingangsrechnungen/$nr", params: { nr: e.document_id! } })
                }
              />
            ))}
            {gefiltert.length === 0 && (
              <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                {t("protokoll.empty")}
              </p>
            )}
          </div>

          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              from={von}
              to={bis}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          )}
        </>
      )}

      <DetailDialog entry={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/**
 * One log row.
 *
 * Audit issue #3: a row navigated only `if (e.document_id)` — 48 of 127 rows on the live database —
 * and the ONLY thing distinguishing a navigable row from an inert one was a `cursor-pointer`, which
 * is invisible until the pointer is already on the row and absent entirely on touch. The rows also
 * had no role, no tabIndex and no key handler, so the navigation was unreachable without a mouse.
 *
 * Now EVERY row is a real button, reachable by keyboard, and what it does is stated in its own
 * aria-label: a row with an invoice opens the invoice and carries a visible chevron, a row without
 * one opens its full log entry. That second half matters — the rows this screen exists to explain
 * are exactly the ones with no invoice, and they used to swallow the click and do nothing.
 */
function LogRow({
  entry: e,
  onOpenDetail,
  onOpenInvoice,
}: {
  entry: VerarbeitungsLog;
  onOpenDetail: () => void;
  onOpenInvoice: () => void;
}) {
  const { t } = useTranslation();
  const navigable = !!e.document_id;
  const sender = parseSender(e.sender);
  const reason = parseReason(e.reason);
  // Every row does something. Which something is the only difference, and it is announced.
  const activate = navigable ? onOpenInvoice : onOpenDetail;
  const label = navigable ? t("protokoll.row.openInvoice") : t("protokoll.row.details");

  return (
    <TableRow
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${e.subject ?? ""}`}
      onClick={activate}
      onKeyDown={(event) => {
        // Enter and Space, the two keys a button role promises.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
        {formatDateTime(e.processed_at)}
      </TableCell>
      <TableCell className="max-w-[260px] truncate text-sm text-foreground" title={e.subject ?? ""}>
        {e.subject ?? "—"}
      </TableCell>
      <TableCell className="max-w-[220px] text-sm text-muted-foreground" title={sender.raw}>
        <SenderCell sender={sender} />
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            "font-medium border-transparent",
            (e.status && STATUS_STYLE[e.status]) ?? "bg-muted text-muted-foreground",
          )}
        >
          {e.status ? t(`protokoll.status.${e.status}`, { defaultValue: e.status }) : "—"}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[300px] text-xs text-muted-foreground" title={reason.raw}>
        <ReasonCell reason={reason} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("protokoll.row.details")}
            title={t("protokoll.row.details")}
            onClick={(event) => {
              // The row itself may be a button; this must not trigger it as well.
              event.stopPropagation();
              onOpenDetail();
            }}
          >
            <Info className="size-4" />
          </Button>
          {/* The affordance the audit asked for: which rows navigate is now visible at rest, on
              every device, without a pointer anywhere near them. */}
          {navigable && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Mobile card equivalent of LogRow, with the same affordances. */
function LogCard({
  entry: e,
  onOpenDetail,
  onOpenInvoice,
}: {
  entry: VerarbeitungsLog;
  onOpenDetail: () => void;
  onOpenInvoice: () => void;
}) {
  const { t } = useTranslation();
  const navigable = !!e.document_id;
  const sender = parseSender(e.sender);
  const reason = parseReason(e.reason);
  const activate = navigable ? onOpenInvoice : onOpenDetail;
  const label = navigable ? t("protokoll.row.openInvoice") : t("protokoll.row.details");

  return (
    <div
      className="cursor-pointer rounded-xl border border-border bg-card p-4"
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${e.subject ?? ""}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground" title={e.subject ?? ""}>
          {e.subject ?? "—"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            className={cn(
              "border-transparent font-medium",
              (e.status && STATUS_STYLE[e.status]) ?? "bg-muted text-muted-foreground",
            )}
          >
            {e.status ? t(`protokoll.status.${e.status}`, { defaultValue: e.status }) : "—"}
          </Badge>
          {navigable && <ChevronRight className="size-4 text-muted-foreground" />}
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        <SenderCell sender={sender} />
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        {formatDateTime(e.processed_at)}
      </p>
      {reason.causes.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          <ReasonCell reason={reason} />
        </div>
      )}
      {/* Only where the two actions differ. A card WITHOUT an invoice already opens its entry when
          tapped, so a second full-width control for the same thing would just be a nested button
          sitting in the middle of the card's own tap target — which is exactly what it was: a tap
          aimed at the card body landed on this button instead. */}
      {navigable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
        >
          {t("protokoll.row.details")}
        </Button>
      )}
    </div>
  );
}

/**
 * Audit issue #6: the column printed the raw From header, so a cell read
 * `"Linda Spiegelberg | Immobilienverwaltung Walther GmbH & Co. KG" <lsp@immo-walther.de>` next to a
 * bare `buchhaltung@netz-immo.de`, and the column neither wrapped nor truncated — a long display
 * name pushed the layout around. Name and address are now separate lines, both bounded.
 */
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

/**
 * Audit issue #5: five semicolon-separated findings chained into one truncated cell, led by an
 * English phrase, in a German UI — and the only full copy lived in a `title` attribute.
 *
 * The stored text is NOT rewritten: the audit is explicit that these are stored values and correctly
 * not run through i18n. What changes is the structure. The pipeline's overall verdict ("Needs
 * review", "Accepted automatically") is chrome that applied to everything after it, so it becomes a
 * translated tag; each finding becomes its own item, verbatim.
 */
function ReasonCell({ reason }: { reason: ReturnType<typeof parseReason> }) {
  const { t } = useTranslation();
  if (!reason.raw) return <>—</>;

  return (
    <div className="min-w-0 space-y-1">
      {reason.verdict && (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            reason.verdict === "needs_review"
              ? "bg-amber-100 text-amber-800"
              : "bg-brand-tint text-brand-dark",
          )}
        >
          {t(
            reason.verdict === "needs_review"
              ? "protokoll.verdict.needsReview"
              : "protokoll.verdict.accepted",
          )}
        </span>
      )}
      {reason.causes.length > 0 && (
        <ul className="space-y-0.5">
          {reason.causes.map((cause, i) => (
            <li key={i} data-cause className="truncate" title={cause}>
              · {cause}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Audit issue #9: for the one screen whose job is explaining why a mail did not become an invoice,
 * there was no "show full entry", no detail view and no CSV — both the subject and the reason were
 * `truncate` with a `title` tooltip, which does nothing on touch and cannot be copied.
 */
function DetailDialog({ entry, onClose }: { entry: VerarbeitungsLog | null; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!entry) return null;
  const sender = parseSender(entry.sender);
  const reason = parseReason(entry.reason);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("protokoll.detail.title")}</DialogTitle>
          <DialogDescription>{formatDateTime(entry.processed_at)}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-4 text-sm">
          <Field label={t("protokoll.detail.betreff")}>{entry.subject ?? "—"}</Field>
          <Field label={t("protokoll.detail.absender")}>
            {sender.name && <div>{sender.name}</div>}
            {sender.address && <div className="text-muted-foreground">{sender.address}</div>}
            {!sender.name && !sender.address && "—"}
            {sender.name && sender.address && (
              // The header verbatim, because a support question about a sender is usually about the
              // exact header rather than the pretty version of it.
              <div className="mt-1 break-all text-xs text-muted-foreground/70">{sender.raw}</div>
            )}
          </Field>
          <Field label={t("protokoll.detail.status")}>
            {entry.status
              ? t(`protokoll.status.${entry.status}`, { defaultValue: entry.status })
              : "—"}
          </Field>
          <Field label={t("protokoll.detail.grund")}>
            {reason.causes.length === 0 && !reason.verdict ? (
              t("protokoll.detail.keinGrund")
            ) : (
              <div className="space-y-2">
                {reason.verdict && (
                  <div className="font-medium">
                    {t(
                      reason.verdict === "needs_review"
                        ? "protokoll.verdict.needsReview"
                        : "protokoll.verdict.accepted",
                    )}
                  </div>
                )}
                {/* Not truncated and not in a tooltip: the whole point of this dialog. */}
                <ul className="list-disc space-y-1 pl-5">
                  {reason.causes.map((cause, i) => (
                    <li key={i} className="break-words">
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Field>
          <Field label={t("protokoll.detail.beleg")}>
            {entry.document_id ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  navigate({
                    to: "/eingangsrechnungen/$nr",
                    params: { nr: entry.document_id! },
                  });
                }}
              >
                {t("protokoll.detail.belegOeffnen")}
              </Button>
            ) : (
              <span className="text-muted-foreground">{t("protokoll.detail.keinBeleg")}</span>
            )}
          </Field>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tab 2 — the change history (audit issue #10)
// ---------------------------------------------------------------------------------------------

function AenderungsLogTab() {
  const { t } = useTranslation();
  const [suche, setSuche] = useState("");
  const [suchTerm, setSuchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const timer = window.setTimeout(() => setSuchTerm(suche.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [suche]);

  useEffect(() => {
    setPage(1);
  }, [suchTerm, pageSize]);

  const q = useChangeHistoryPage({ search: suchTerm, page, pageSize });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const von = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const bis = Math.min(page * pageSize, total);

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t("protokoll.aenderungen.subtitle")}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:min-w-[240px] sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder={t("protokoll.aenderungen.search")}
            className="pl-9"
          />
        </div>
      </div>

      {searchWasDropped(suchTerm) && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("protokoll.searchDropped")}
        </p>
      )}

      {q.isError ? (
        <div className="mt-4">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={10} cols={5} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("protokoll.aenderungen.count", { count: total })}
            {q.isFetching && ` · ${t("bank.list.updating")}`}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("protokoll.aenderungen.col.zeitpunkt")}</TableHead>
                  <TableHead>{t("protokoll.aenderungen.col.akteur")}</TableHead>
                  <TableHead>{t("protokoll.aenderungen.col.typ")}</TableHead>
                  <TableHead>{t("protokoll.aenderungen.col.tabelle")}</TableHead>
                  <TableHead>{t("protokoll.aenderungen.col.text")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: ChangeHistoryEntry) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {formatDateTime(r.at)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm" title={r.actor ?? ""}>
                      {r.actor ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge className="border-transparent bg-muted font-medium text-muted-foreground">
                        {r.type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.table_name ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[360px] truncate text-sm text-muted-foreground"
                      title={r.text ?? ""}
                    >
                      {r.text ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      {t("protokoll.aenderungen.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 space-y-3 sm:hidden">
            {rows.map((r: ChangeHistoryEntry) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {r.text ?? "—"}
                  </p>
                  <Badge className="shrink-0 border-transparent bg-muted font-medium text-muted-foreground">
                    {r.type ?? "—"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{r.actor ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.table_name ?? "—"}</p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(r.at)}
                </p>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                {t("protokoll.aenderungen.empty")}
              </p>
            )}
          </div>

          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              from={von}
              to={bis}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
