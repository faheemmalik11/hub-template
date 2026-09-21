import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Layers, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  FilterPills,
  FilterPopover,
  SearchInput,
  SortableColumnHeader,
  TablePagination,
  useTableView,
} from "@/kit/components/data-table";
import type { FilterField } from "@/kit/components/data-table";
import {
  useCreateOposWhitelistRule,
  useDeleteOposWhitelistRule,
  useOposRuleHitCounts,
  useOposTermImpact,
  useOposWhitelistRules,
  useReapplyOposWhitelist,
  useUpdateOposWhitelistRule,
} from "@/data";
import type { OposTermImpact } from "@/data";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  asciiSpelling,
  OPOS_CATEGORIES,
  OPOS_SCOPES,
  OPOS_TERM_MIN_LENGTH,
  coveringRule,
} from "@/lib/data/opos";
import type { OposCategory, OposWhitelistRule, OposWhitelistScope } from "@/lib/data/types";
import { errorText, formatDate } from "@/lib/data/format";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/opos-whitelist/")({
  head: () => ({ meta: [{ title: pageTitle("Ausgeschlossene Zahlungen") }] }),
  component: OposWhitelistPage,
});

// Writes are RLS-gated to these three roles (migration 20260819190000): the rules carry no
// company_id, so any one of them hides outgoing movements for every company at once. Reading stays
// open to everyone on purpose — "why is this booking not in Offene Posten?" is a question every
// bookkeeper has to be able to answer, and this list is the answer.
function useCanWrite() {
  const { can } = useAuth();
  return can(PERMISSIONS.bankWrite);
}

type StatusFilter = "alle" | "aktiv" | "inaktiv";
type MatchFilter = "alle" | "mit" | "ohne";

const ALL = "alle";

function OposWhitelistPage() {
  const { t } = useTranslation();
  const q = useOposWhitelistRules();
  const hitsQ = useOposRuleHitCounts();
  const canWrite = useCanWrite();

  const rules = useMemo(() => q.data ?? [], [q.data]);
  const hits = useMemo(() => hitsQ.data ?? new Map<string, number>(), [hitsQ.data]);

  const [search, setSearch] = useState("");
  const suchTerm = useDebouncedValue(search, 300);
  const [category, setCategory] = useState<OposCategory | "alle">(ALL);
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [match, setMatch] = useState<MatchFilter>(ALL);

  const filtered = useMemo(() => {
    const needle = suchTerm.trim().toLowerCase();
    return rules.filter((r) => {
      if (needle && !`${r.term} ${r.note ?? ""}`.toLowerCase().includes(needle)) return false;
      if (category !== ALL && r.category !== category) return false;
      if (status === "aktiv" && !r.is_active) return false;
      if (status === "inaktiv" && r.is_active) return false;
      const count = hits.get(r.id) ?? 0;
      if (match === "mit" && count === 0) return false;
      if (match === "ohne" && count > 0) return false;
      return true;
    });
  }, [rules, hits, suchTerm, category, status, match]);

  // Category order is the vocabulary order from OPOS_CATEGORIES (salary, tax, private,
  // rebooking …), not alphabetical German labels — that is the order the briefing lists them in
  // and the order the create dialog offers them, so the table matching it keeps one mental model.
  const view = useTableView(filtered, {
    initialSort: "category",
    resetKey: `${suchTerm}|${category}|${status}|${match}`,
    sortValue: (r, key) => {
      if (key === "category") return OPOS_CATEGORIES.indexOf(r.category);
      if (key === "hits") return hits.get(r.id) ?? 0;
      if (key === "created") return r.created_at;
      return r.term;
    },
  });

  // Which rule each row is shadowed by, computed once for the whole list rather than per row.
  const covered = useMemo(() => {
    const map = new Map<string, OposWhitelistRule>();
    for (const r of rules) {
      const winner = coveringRule(r, rules);
      if (winner) map.set(r.id, winner);
    }
    return map;
  }, [rules]);

  const filterActive = suchTerm !== "" || category !== ALL || status !== ALL || match !== ALL;
  function filterReset() {
    setSearch("");
    setCategory(ALL);
    setStatus(ALL);
    setMatch(ALL);
  }

  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "kategorie",
      label: t("openItemWhitelist.list.col.category"),
      value: category,
      defaultValue: ALL,
      onChange: (v) => setCategory(v as OposCategory | "alle"),
      options: [
        { value: ALL, label: t("openItemWhitelist.filter.kategorieAlle") },
        ...OPOS_CATEGORIES.map((c) => ({
          value: c,
          label: t(`openItemWhitelist.category.${c}`),
        })),
      ],
    },
    {
      kind: "select",
      key: "status",
      label: t("openItemWhitelist.list.col.active"),
      value: status,
      defaultValue: ALL,
      onChange: (v) => setStatus(v as StatusFilter),
      options: [
        { value: ALL, label: t("openItemWhitelist.filter.statusAlle") },
        { value: "aktiv", label: t("openItemWhitelist.filter.statusAktiv") },
        { value: "inaktiv", label: t("openItemWhitelist.filter.statusInaktiv") },
      ],
    },
    {
      kind: "select",
      key: "treffer",
      label: t("openItemWhitelist.list.col.hits"),
      value: match,
      defaultValue: ALL,
      onChange: (v) => setMatch(v as MatchFilter),
      options: [
        { value: ALL, label: t("openItemWhitelist.filter.trefferAlle") },
        { value: "mit", label: t("openItemWhitelist.filter.trefferMit") },
        { value: "ohne", label: t("openItemWhitelist.filter.trefferOhne") },
      ],
    },
  ];

  const paginationLabels = {
    perPage: t("common.pagination.perPage"),
    showing: (from: number, to: number, total: number) =>
      t("common.pagination.showing", { from, to, total }),
    pageOf: (page: number, pages: number) => t("common.pagination.page", { page, pages }),
    previous: t("common.pagination.prev"),
    next: t("common.pagination.next"),
  };

  return (
    <div>
      <div data-tour="opos-intro" className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("openItemWhitelist.list.title")}
          </h1>
        </div>
        {canWrite && (
          <div data-tour="opos-actions" className="flex flex-wrap items-center gap-2">
            <ReapplyAllButton />
            <RuleDialog mode="new" />
          </div>
        )}
      </div>

      {!canWrite && (
        <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
          {t("openItemWhitelist.list.nurLesen")}
        </p>
      )}

      {/* Same control bar as Banktransaktionen/Ausschlussregeln: search, then every other filter
          behind one labelled Filters button, with the active values repeated as chips underneath. */}
      <div data-tour="opos-filters" className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t("openItemWhitelist.filter.suche")}
          className="min-w-[240px] flex-1 max-w-none"
        />
        <FilterPopover
          fields={filterFields}
          labels={{
            button: t("openItemWhitelist.filter.button"),
            title: t("openItemWhitelist.filter.title"),
            reset: t("openItemWhitelist.filter.zuruecksetzen"),
          }}
        />
      </div>

      <FilterPills
        fields={filterFields}
        extra={
          suchTerm
            ? [
                {
                  key: "suche",
                  label: t("openItemWhitelist.filter.suche"),
                  valueLabel: suchTerm,
                  clear: () => setSearch(""),
                },
              ]
            : []
        }
        className="mt-3"
      />

      {q.isError ? (
        <div className="mt-6">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : view.total === 0 ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card py-12 text-center">
          <p className="text-muted-foreground">
            {rules.length === 0
              ? t("openItemWhitelist.list.empty")
              : t("openItemWhitelist.list.keineTreffer")}
          </p>
          {filterActive && (
            <Button variant="outline" className="mt-4" onClick={filterReset}>
              {t("openItemWhitelist.filter.zuruecksetzen")}
            </Button>
          )}
        </div>
      ) : (
        <div data-tour="opos-list">
          <p className="mt-4 text-sm text-muted-foreground">
            {t("openItemWhitelist.list.count", { count: view.total })}
          </p>

          {/* Below `sm` this table's own bounded scroll still needed real horizontal panning to
              see every column on a phone -- replaced there with one card per rule instead of
              trying to fit six columns into ~360px. Desktop keeps the table unchanged. */}
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortableColumnHeader
                    column="category"
                    sort={view.sort}
                    direction={view.direction}
                    onSort={view.toggleSort}
                  >
                    {t("openItemWhitelist.list.col.category")}
                  </SortableColumnHeader>
                  <TableHead>{t("openItemWhitelist.list.col.scope")}</TableHead>
                  <SortableColumnHeader
                    column="term"
                    sort={view.sort}
                    direction={view.direction}
                    onSort={view.toggleSort}
                  >
                    {t("openItemWhitelist.list.col.term")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="hits"
                    sort={view.sort}
                    direction={view.direction}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("openItemWhitelist.list.col.hits")}
                  </SortableColumnHeader>
                  <TableHead>{t("openItemWhitelist.list.col.note")}</TableHead>
                  <SortableColumnHeader
                    column="created"
                    sort={view.sort}
                    direction={view.direction}
                    onSort={view.toggleSort}
                  >
                    {t("openItemWhitelist.list.col.angelegt")}
                  </SortableColumnHeader>
                  <TableHead className="w-[80px] text-center">
                    {t("openItemWhitelist.list.col.active")}
                  </TableHead>
                  <TableHead className="w-[104px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((r) => (
                  <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {t(`openItemWhitelist.category.${r.category}`)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t(`openItemWhitelist.scope.${r.scope}`)}
                    </TableCell>
                    {/* The term IS the rule: it used to be cut off at 160px with the full value
                        only in a title tooltip, which is invisible on touch and unreachable by
                        keyboard, on exactly the value whose spelling matters most (#11). */}
                    <TableCell className="min-w-[160px] break-words font-medium text-foreground">
                      {r.term}
                      <CoveredBadge rule={r} winner={covered.get(r.id)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hits.get(r.id) ?? 0}
                    </TableCell>
                    <TableCell className="max-w-[260px] break-words text-sm text-muted-foreground">
                      {r.note ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{formatDate(r.created_at)}</div>
                      {r.created_by && <div className="truncate">{r.created_by}</div>}
                    </TableCell>
                    <TableCell className="text-center">
                      <ActiveToggle rule={r} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canWrite && <RuleDialog mode="edit" rule={r} />}
                        {canWrite && <DeleteRuleDialog rule={r} match={hits.get(r.id) ?? 0} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 space-y-3 sm:hidden">
            {view.pageRows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4",
                  !r.is_active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {t(`openItemWhitelist.category.${r.category}`)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(`openItemWhitelist.scope.${r.scope}`)}
                    </span>
                  </div>
                  <ActiveToggle rule={r} />
                </div>
                <p className="mt-3 break-words font-medium text-foreground">{r.term}</p>
                <CoveredBadge rule={r} winner={covered.get(r.id)} />
                {r.note && <p className="mt-1 text-sm text-muted-foreground">{r.note}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("openItemWhitelist.list.angelegtVon", {
                    datum: formatDate(r.created_at),
                    person: r.created_by ?? t("openItemWhitelist.list.unbekannt"),
                  })}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    {t("openItemWhitelist.list.col.hits")}{" "}
                    <span className="tabular-nums text-foreground">{hits.get(r.id) ?? 0}</span>
                  </span>
                  {canWrite && (
                    <div className="flex gap-1">
                      <RuleDialog mode="edit" rule={r} />
                      <DeleteRuleDialog rule={r} match={hits.get(r.id) ?? 0} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <TablePagination
            page={view.page}
            totalPages={view.totalPages}
            pageSize={view.pageSize}
            total={view.total}
            from={view.from}
            to={view.to}
            onPage={view.setPage}
            onPageSize={view.setPageSize}
            labels={paginationLabels}
          />
        </div>
      )}
    </div>
  );
}

/**
 * "Wird von … überdeckt".
 *
 * The Treffer column reads as "what this rule does", and it is not: the matcher credits a
 * transaction to exactly one rule, the oldest that matches, so a rule whose term contains an older
 * rule's term can only ever show 0 — no matter how much it would otherwise catch. Deleting it on
 * the strength of that 0 is safe; deleting the OLDER one silently moves its hits here. Neither is
 * visible without this line (#2).
 */
function CoveredBadge({
  rule,
  winner,
}: {
  rule: OposWhitelistRule;
  winner: OposWhitelistRule | undefined;
}) {
  const { t } = useTranslation();
  if (!winner || !rule.is_active) return null;
  return (
    <span className="mt-1 flex items-start gap-1 text-xs font-normal text-amber-700">
      <Layers className="mt-0.5 size-3 shrink-0" />
      {t("openItemWhitelist.ueberdeckt", { rule: winner.term })}
    </span>
  );
}

function ActiveToggle({ rule }: { rule: OposWhitelistRule }) {
  const { t } = useTranslation();
  const update = useUpdateOposWhitelistRule(rule.id);
  const canWrite = useCanWrite();
  return (
    <Switch
      checked={rule.is_active}
      disabled={update.isPending || !canWrite}
      aria-label={t("openItemWhitelist.list.col.active")}
      onCheckedChange={(v) =>
        update.mutate(
          { is_active: v },
          {
            onSuccess: () =>
              toast.success(
                t(
                  v ? "openItemWhitelist.toggle.aktiviert" : "openItemWhitelist.toggle.deaktiviert",
                ),
                {
                  // Switching a rule off stops it matching from here on; it does not by itself put
                  // the transactions it already hid back into Offene Posten. That used to be true
                  // and undocumented on screen except as a Python command.
                  description: v ? undefined : t("openItemWhitelist.toggle.hinweisNeuBewerten"),
                },
              ),
            onError: (e) =>
              toast.error(
                t("openItemWhitelist.toggle.fehlgeschlagen", {
                  error: errorText(e),
                }),
              ),
          },
        )
      }
    />
  );
}

/** Re-evaluate every rule-hidden transaction at once, from the header. */
function ReapplyAllButton() {
  const { t } = useTranslation();
  const reapply = useReapplyOposWhitelist();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <RefreshCw className={cn("size-4", reapply.isPending && "animate-spin")} />
          {t("openItemWhitelist.neuBewerten.button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("openItemWhitelist.neuBewerten.titel")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("openItemWhitelist.neuBewerten.beschreibung")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={reapply.isPending}>
            {t("openItemWhitelist.neuBewerten.abbrechen")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              reapply.mutate(null, {
                onSuccess: (count) => {
                  toast.success(t("openItemWhitelist.neuBewerten.toastOk", { count: count }));
                  setOpen(false);
                },
                onError: (err) =>
                  toast.error(
                    t("openItemWhitelist.neuBewerten.toastFehler", { error: errorText(err) }),
                  ),
              });
            }}
            disabled={reapply.isPending}
          >
            {reapply.isPending
              ? t("openItemWhitelist.neuBewerten.laeuft")
              : t("openItemWhitelist.neuBewerten.bestaetigen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** How much a term would take out of view, counted before the rule exists (#6). */
function ImpactPreview({
  impact,
  term,
}: {
  impact: { data?: OposTermImpact; isLoading: boolean; isError: boolean };
  term: string;
}) {
  const { t } = useTranslation();
  if (term.trim().length < OPOS_TERM_MIN_LENGTH) return null;
  if (impact.isLoading) {
    return (
      <p className="text-xs text-muted-foreground">{t("openItemWhitelist.vorschau.laeuft")}</p>
    );
  }
  if (impact.isError || !impact.data) {
    return (
      <p className="text-xs text-muted-foreground">{t("openItemWhitelist.vorschau.fehler")}</p>
    );
  }
  const { match, population } = impact.data;
  const share = population > 0 ? (match / population) * 100 : 0;
  // A term that would hide a fifth of every outgoing movement is the failure this preview exists
  // to catch. 20% is a heuristic, deliberately loud rather than precise.
  const wide = match > 0 && share >= 20;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs",
        wide ? "text-amber-700" : "text-muted-foreground",
      )}
    >
      {wide && <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
      {match === 0
        ? t("openItemWhitelist.vorschau.keine", { total: population })
        : t("openItemWhitelist.vorschau.treffer", {
            count: match,
            total: population,
            percent: share.toFixed(share < 10 ? 1 : 0),
          })}
    </p>
  );
}

/**
 * One dialog for both creating and correcting a rule.
 *
 * There used to be no edit path at all: fixing a typo, moving a rule from Verwendungszweck to
 * Gegenkonto or reclassifying it meant deleting and recreating, which re-credits transactions
 * between rules and leaves the old ones pointing at a dead id (#5).
 */
function RuleDialog({ mode, rule }: { mode: "new" | "edit"; rule?: OposWhitelistRule }) {
  const { t } = useTranslation();
  const create = useCreateOposWhitelistRule();
  const update = useUpdateOposWhitelistRule(rule?.id ?? "");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<OposCategory>(rule?.category ?? "rebooking");
  const [scope, setScope] = useState<OposWhitelistScope>(rule?.scope ?? "reference");
  const [term, setTerm] = useState(rule?.term ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  // Off by default: creating two rules is a bigger step than the person asked for, so it is
  // offered, not assumed.
  const [secondSpelling, setSecondSpelling] = useState(false);

  const debouncedTerm = useDebouncedValue(term, 400);
  const impact = useOposTermImpact(scope, debouncedTerm, open);
  const ascii = asciiSpelling(term.trim());
  const zuShort = term.trim().length < OPOS_TERM_MIN_LENGTH;
  const running = create.isPending || update.isPending;

  function reset() {
    setCategory(rule?.category ?? "rebooking");
    setScope(rule?.scope ?? "reference");
    setTerm(rule?.term ?? "");
    setNote(rule?.note ?? "");
    setSecondSpelling(false);
  }

  async function save() {
    if (zuShort) {
      toast.error(t("openItemWhitelist.dialog.toast.termZuKurz", { min: OPOS_TERM_MIN_LENGTH }));
      return;
    }
    try {
      if (mode === "edit" && rule) {
        await update.mutateAsync({ scope, category, term, note: note.trim() || null });
        toast.success(t("openItemWhitelist.dialog.toast.gespeichert"));
      } else {
        await create.mutateAsync({ scope, category, term, note });
        // The twin spelling is a second, independent rule — the same thing the seeded set does by
        // hand for Annuitaet/Annuität and Übertrag/Uebertrag.
        if (secondSpelling && ascii) {
          await create.mutateAsync({ scope, category, term: ascii, note });
          toast.success(t("openItemWhitelist.dialog.toast.angelegtBeide", { second: ascii }));
        } else {
          toast.success(t("openItemWhitelist.dialog.toast.angelegt"));
        }
        reset();
      }
      setOpen(false);
    } catch (e) {
      toast.error(
        t(
          mode === "edit"
            ? "openItemWhitelist.dialog.toast.speichernFehlgeschlagen"
            : "openItemWhitelist.dialog.toast.anlegenFehlgeschlagen",
          { error: errorText(e) },
        ),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset();
      }}
    >
      <DialogTrigger asChild>
        {mode === "new" ? (
          <Button className="gap-2">
            <Plus className="size-4" /> {t("openItemWhitelist.list.neu.button")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("openItemWhitelist.list.action.bearbeiten")}
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(
              mode === "new"
                ? "openItemWhitelist.dialog.neu.title"
                : "openItemWhitelist.dialog.bearbeiten.title",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              mode === "new"
                ? "openItemWhitelist.dialog.neu.desc"
                : "openItemWhitelist.dialog.bearbeiten.desc",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="opos-category" className="text-xs text-muted-foreground">
              {t("openItemWhitelist.dialog.field.category")}
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as OposCategory)}>
              <SelectTrigger id="opos-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPOS_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`openItemWhitelist.category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="opos-scope" className="text-xs text-muted-foreground">
              {t("openItemWhitelist.dialog.field.scope")}
            </Label>
            <Select value={scope} onValueChange={(v) => setScope(v as OposWhitelistScope)}>
              <SelectTrigger id="opos-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPOS_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`openItemWhitelist.scope.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="opos-term" className="text-xs text-muted-foreground">
              {t("openItemWhitelist.dialog.field.term")}
            </Label>
            <Input
              id="opos-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("openItemWhitelist.dialog.termPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("openItemWhitelist.dialog.termHinweis")}
            </p>
            {term.trim().length > 0 && zuShort && (
              <p className="text-xs text-amber-700">
                {t("openItemWhitelist.dialog.termZuKurz", { min: OPOS_TERM_MIN_LENGTH })}
              </p>
            )}
            <ImpactPreview impact={impact} term={debouncedTerm} />
            {/* opos_norm() folds case and whitespace but not umlauts, so "Annuität" and
                "Annuitaet" are two different terms and German booking texts use both (#4). */}
            {mode === "new" && ascii && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={secondSpelling}
                  onChange={(e) => setSecondSpelling(e.target.checked)}
                />
                <span>{t("openItemWhitelist.dialog.umlautHinweis", { ascii })}</span>
              </label>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="opos-note" className="text-xs text-muted-foreground">
              {t("openItemWhitelist.dialog.field.note")}
            </Label>
            <Input
              id="opos-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("openItemWhitelist.dialog.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
            {t("openItemWhitelist.dialog.cancel")}
          </Button>
          <Button onClick={save} disabled={running || zuShort}>
            {running
              ? t("openItemWhitelist.dialog.saving")
              : t(
                  mode === "new"
                    ? "openItemWhitelist.dialog.save"
                    : "openItemWhitelist.dialog.saveEdit",
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleDialog({ rule, match }: { rule: OposWhitelistRule; match: number }) {
  const { t } = useTranslation();
  const del = useDeleteOposWhitelistRule();
  const reapply = useReapplyOposWhitelist();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Pre-checked when the rule is actually hiding something: leaving those rows hidden behind a
  // rule nobody can name any more is the outcome #3 describes, and it is never the one somebody
  // deleting a rule is asking for.
  const [approve, setApprove] = useState(match > 0);
  const running = del.isPending || reapply.isPending;

  async function confirmDelete() {
    // Delete FIRST, release second, and the order is load-bearing: opos_reapply_whitelist
    // re-evaluates against the rules that are still active, so running it while this rule is still
    // live would re-match every one of its transactions to itself and change nothing. Only once
    // deleted_at is stamped and is_active is false does the rule stop matching, letting its rows
    // fall to another rule or back to Offene Posten.
    try {
      await del.mutateAsync({ id: rule.id, reason: reason });
    } catch (e) {
      toast.error(t("openItemWhitelist.delete.toast.fehlgeschlagen", { error: errorText(e) }));
      return;
    }

    let approved = 0;
    if (approve && match > 0) {
      try {
        approved = await reapply.mutateAsync(rule.id);
      } catch (e) {
        // The rule is already gone at this point, so this is not a failed deletion. Say exactly
        // that, and point at the header action that retries the same step for everything.
        toast.warning(t("openItemWhitelist.delete.toast.freigebenFehlgeschlagen"), {
          description: errorText(e),
        });
        setOpen(false);
        setReason("");
        return;
      }
    }

    toast.success(t("openItemWhitelist.delete.toast.geloescht"), {
      description:
        approved > 0
          ? t("openItemWhitelist.delete.toast.freigegeben", { count: approved })
          : undefined,
    });
    setOpen(false);
    setReason("");
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("openItemWhitelist.list.action.loeschen")}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("openItemWhitelist.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("openItemWhitelist.delete.desc", {
              term: rule.term,
              category: t(`openItemWhitelist.category.${rule.category}`),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {match > 0 && (
          <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={approve}
              onChange={(e) => setApprove(e.target.checked)}
            />
            <span>{t("openItemWhitelist.delete.freigeben", { count: match })}</span>
          </label>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="opos-delete-reason">{t("openItemWhitelist.delete.grund")}</Label>
          <Input
            id="opos-delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("openItemWhitelist.delete.grundPlatzhalter")}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>
            {t("openItemWhitelist.delete.cancel")}
          </AlertDialogCancel>
          {/* preventDefault, otherwise the dialog closes before the mutation resolves. */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmDelete();
            }}
            disabled={running || !reason.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {running ? t("openItemWhitelist.delete.laeuft") : t("openItemWhitelist.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
