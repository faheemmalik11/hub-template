import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  useCreateExclusion,
  useDeleteExclusion,
  useExclusions,
  useUpdateExclusion,
  useExclusionImpact,
} from "@/data";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import {
  FilterPills,
  FilterPopover,
  HintTooltip,
  SearchInput,
  SortableColumnHeader,
  TablePagination,
  useTableView,
} from "@/kit/components/data-table";
import type { FilterField } from "@/kit/components/data-table";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { Exclusion, ExclusionScope } from "@/lib/data/types";
import type { ExclusionImpact } from "@/data";
import { pageTitle } from "@/config/brand";
import { errorText } from "@/lib/data/format";

export const Route = createFileRoute("/exclusion-rules/")({
  head: () => ({ meta: [{ title: pageTitle("Ausschlussregeln") }] }),
  component: ExclusionRulesPage,
});

// Pre-read scopes match the mail/file envelope BEFORE the AI read; post-read scopes match the
// extracted fields afterwards. Order mirrors the pipeline (pipeline/exclusions.py).
const SCOPES_PRE: ExclusionScope[] = ["sender", "subject", "filename", "envelope"];
const SCOPES_POST: ExclusionScope[] = ["party", "supplier", "body", "company", "property"];

const ALL = "__alle";
const ALL_SCOPES: ExclusionScope[] = [...SCOPES_PRE, ...SCOPES_POST];

function ExclusionRulesPage() {
  const { t } = useTranslation();
  const q = useExclusions();
  const rules = useMemo(() => q.data ?? [], [q.data]);

  const [search, setSearch] = useState("");
  const suchTerm = useDebounced(search, 300);
  const [fArea, setFArea] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "bereich",
      label: t("exclusionRules.list.col.scope"),
      value: fArea,
      defaultValue: ALL,
      onChange: setFArea,
      options: [
        { value: ALL, label: t("exclusionRules.list.filter.alleBereiche") },
        ...ALL_SCOPES.map((scope) => ({
          value: scope,
          label: t(`exclusionRules.scope.${scope}`),
        })),
      ],
    },
    {
      kind: "select",
      key: "status",
      label: t("exclusionRules.list.filter.status"),
      value: fStatus,
      defaultValue: ALL,
      onChange: setFStatus,
      options: [
        { value: ALL, label: t("exclusionRules.list.filter.alle") },
        { value: "aktiv", label: t("exclusionRules.list.filter.aktiv") },
        { value: "inaktiv", label: t("exclusionRules.list.filter.inaktiv") },
      ],
    },
  ];

  const filtered = useMemo(() => {
    const term = suchTerm.trim().toLowerCase();
    return rules.filter((r) => {
      if (fArea !== ALL && r.scope !== fArea) return false;
      if (fStatus === "aktiv" && !r.is_active) return false;
      if (fStatus === "inaktiv" && r.is_active) return false;
      if (!term) return true;
      return `${r.term} ${r.note ?? ""}`.toLowerCase().includes(term);
    });
  }, [rules, suchTerm, fArea, fStatus]);

  const view = useTableView(filtered, {
    initialSort: "term",
    resetKey: `${suchTerm}|${fArea}|${fStatus}`,
    sortValue: (r, key) => {
      if (key === "scope") return t(`exclusionRules.scope.${r.scope}`);
      if (key === "active") return r.is_active ? 1 : 0;
      return r.term;
    },
  });

  const paginationLabels = {
    perPage: t("common.pagination.perPage"),
    showing: (from: number, to: number, total: number) =>
      t("common.pagination.showing", { from, to, total }),
    pageOf: (page: number, pages: number) => t("common.pagination.page", { page, pages }),
    previous: t("common.pagination.prev"),
    next: t("common.pagination.next"),
  };

  const filterActive = suchTerm !== "" || fArea !== ALL || fStatus !== ALL;
  function filterReset() {
    setSearch("");
    setFArea(ALL);
    setFStatus(ALL);
  }

  return (
    <div>
      <div data-tour="exclusion-header" className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("exclusionRules.list.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("exclusionRules.list.subtitle")}
          </p>
        </div>
        <NewRuleDialog />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t("exclusionRules.list.search")}
          className="min-w-[240px] flex-1 max-w-none"
        />
        <FilterPopover
          fields={filterFields}
          labels={{
            button: t("exclusionRules.list.filter.button"),
            title: t("exclusionRules.list.filter.title"),
            reset: t("exclusionRules.list.filter.zuruecksetzen"),
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
                  label: t("exclusionRules.list.search"),
                  valueLabel: suchTerm,
                  clear: () => setSearch(""),
                },
              ]
            : []
        }
        className="mt-3"
      />

      <div data-tour="exclusion-list">
        {q.isError ? (
          <div className="mt-6">
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : q.isLoading ? (
          <div className="mt-6">
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : view.total === 0 ? (
          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card py-12 text-center">
            <p className="text-muted-foreground">
              {filterActive
                ? t("exclusionRules.list.keineTreffer")
                : t("exclusionRules.list.empty")}
            </p>
            {filterActive && (
              <Button variant="outline" className="mt-4" onClick={filterReset}>
                {t("exclusionRules.list.filterZuruecksetzen")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("exclusionRules.list.count", { count: view.total })}
            </p>

            <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <SortableColumnHeader
                      column="scope"
                      sort={view.sort}
                      direction={view.direction}
                      onSort={view.toggleSort}
                      className="whitespace-nowrap"
                    >
                      {t("exclusionRules.list.col.scope")}
                    </SortableColumnHeader>
                    <SortableColumnHeader
                      column="term"
                      sort={view.sort}
                      direction={view.direction}
                      onSort={view.toggleSort}
                    >
                      {t("exclusionRules.list.col.term")}
                    </SortableColumnHeader>
                    <TableHead>{t("exclusionRules.list.col.note")}</TableHead>
                    <SortableColumnHeader
                      column="active"
                      sort={view.sort}
                      direction={view.direction}
                      onSort={view.toggleSort}
                      className="w-[96px] whitespace-nowrap"
                    >
                      {t("exclusionRules.list.col.active")}
                    </SortableColumnHeader>
                    <TableHead className="w-[64px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.pageRows.map((r) => (
                    <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                      <TableCell className="align-top">
                        <span className="inline-flex whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {t(`exclusionRules.scope.${r.scope}`)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px] align-top font-medium text-foreground">
                        <HintTooltip label={r.term}>
                          <div className="truncate">{r.term}</div>
                        </HintTooltip>
                      </TableCell>
                      <TableCell className="max-w-[320px] align-top text-sm text-muted-foreground">
                        <HintTooltip label={r.note}>
                          <div className="truncate">{r.note ?? "—"}</div>
                        </HintTooltip>
                      </TableCell>
                      <TableCell className="text-center align-top">
                        <ActiveToggle rule={r} />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex justify-end">
                          <DeleteRuleDialog rule={r} />
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
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {t(`exclusionRules.scope.${r.scope}`)}
                    </span>
                    <ActiveToggle rule={r} />
                  </div>
                  <p className="mt-2 break-words font-medium text-foreground">{r.term}</p>
                  {r.note && <p className="mt-1 text-sm text-muted-foreground">{r.note}</p>}
                  <div className="mt-3 flex justify-end border-t border-border pt-2">
                    <DeleteRuleDialog rule={r} />
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
          </>
        )}
      </div>
    </div>
  );
}

function ActiveToggle({ rule }: { rule: Exclusion }) {
  const { t } = useTranslation();
  const update = useUpdateExclusion(rule.id);
  return (
    <Switch
      checked={rule.is_active}
      disabled={update.isPending}
      aria-label={t("exclusionRules.list.col.active")}
      onCheckedChange={(v) =>
        update.mutate(
          { is_active: v },
          {
            onSuccess: () =>
              toast.success(
                t(v ? "exclusionRules.toggle.aktiviert" : "exclusionRules.toggle.deaktiviert"),
              ),
            onError: (e) =>
              toast.error(
                t("exclusionRules.toggle.fehlgeschlagen", {
                  error: errorText(e),
                }),
              ),
          },
        )
      }
    />
  );
}

/** Debounce, so a preview count is not fired per keystroke. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * What the rule being typed would actually catch, before it is saved.
 *
 * Three states matter and are kept distinct: a real count, "this scope has no source to check
 * against", and "the check failed". The third is not folded into a zero -- processing_log is
 * readable only by admin/supervisor, so for anyone else the query returns nothing, and printing
 * "0 Treffer" there would be a confident lie about a rule that silently drops mail.
 */
function ImpactPreview({
  impact,
  term,
}: {
  impact: { data?: ExclusionImpact; isLoading: boolean; isError: boolean };
  term: string;
}) {
  const { t } = useTranslation();
  if (term.trim().length < 2) return null;
  if (impact.isLoading) {
    return <p className="text-xs text-muted-foreground">{t("exclusionRules.vorschau.laeuft")}</p>;
  }
  if (impact.isError) {
    return <p className="text-xs text-muted-foreground">{t("exclusionRules.vorschau.fehler")}</p>;
  }
  if (!impact.data || !impact.data.supported) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("exclusionRules.vorschau.nichtVerfuegbar")}
      </p>
    );
  }
  const { match, population } = impact.data;
  const share = population > 0 ? (match / population) * 100 : 0;
  // A rule matching a large share of everything ever seen is the failure this preview exists to
  // catch ("GmbH" in the Partei scope). 20% is a heuristic, deliberately loud rather than precise.
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
        ? t("exclusionRules.vorschau.keine", { total: population })
        : t("exclusionRules.vorschau.treffer", {
            count: match,
            total: population,
            percent: share.toFixed(share < 10 ? 1 : 0),
          })}
    </p>
  );
}

function NewRuleDialog() {
  const { t } = useTranslation();
  const create = useCreateExclusion();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExclusionScope>("subject");
  const [term, setTerm] = useState("");
  const [note, setNote] = useState("");
  // Debounced so typing a term does not fire a count per keystroke. Only while the dialog is open.
  const debouncedTerm = useDebounced(term, 400);
  const impact = useExclusionImpact(scope, debouncedTerm, open);

  function submit() {
    if (!term.trim()) {
      toast.error(t("exclusionRules.dialog.toast.termPflicht"));
      return;
    }
    create.mutate(
      { scope, term, note },
      {
        onSuccess: () => {
          toast.success(t("exclusionRules.dialog.toast.angelegt"));
          setTerm("");
          setNote("");
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("exclusionRules.dialog.toast.anlegenFehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {t("exclusionRules.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exclusionRules.dialog.neu.title")}</DialogTitle>
          <DialogDescription>{t("exclusionRules.dialog.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("exclusionRules.dialog.field.scope")}
            </Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ExclusionScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("exclusionRules.scope.groupPre")}</SelectLabel>
                  {SCOPES_PRE.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`exclusionRules.scope.${s}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{t("exclusionRules.scope.groupPost")}</SelectLabel>
                  {SCOPES_POST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`exclusionRules.scope.${s}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("exclusionRules.dialog.field.term")}
            </Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("exclusionRules.dialog.termPlaceholder")}
            />
            <ImpactPreview impact={impact} term={debouncedTerm} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("exclusionRules.dialog.field.note")}
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("exclusionRules.dialog.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("exclusionRules.dialog.cancel")}
          </Button>
          {/* Disabled while the required field is empty, instead of letting the click through and
              answering with an error toast. Every comparable create dialog in the app (Freigabe-,
              Zuordnungs-, USt-Regeln, DATEV, LexOffice) already behaves this way; this was the one
              that scolded you afterwards. anlegen() keeps its own guard -- the button state is the
              affordance, not the enforcement. */}
          <Button onClick={submit} disabled={create.isPending || !term.trim()}>
            {create.isPending ? t("exclusionRules.dialog.saving") : t("exclusionRules.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleDialog({ rule }: { rule: Exclusion }) {
  const { t } = useTranslation();
  const del = useDeleteExclusion();

  function confirmDelete() {
    del.mutate(rule.id, {
      onSuccess: () => toast.success(t("exclusionRules.delete.toast.geloescht")),
      onError: (e) =>
        toast.error(
          t("exclusionRules.delete.toast.fehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("exclusionRules.list.action.loeschen")}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("exclusionRules.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("exclusionRules.delete.desc", {
              term: rule.term,
              scope: t(`exclusionRules.scope.${rule.scope}`),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("exclusionRules.delete.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("exclusionRules.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
