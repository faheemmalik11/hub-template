import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useFokus } from "@/lib/use-fokus";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { FeldFehlerText, PflichtStern } from "@/components/ui/form-field";
import { feldFehler, gesellschaftSchema } from "@/lib/forms/gesellschaft-schema";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateGesellschaft,
  useGesellschaftBelegSummen,
  useGesellschaften,
  useObjekte,
  usePropertyCompanies,
} from "@/lib/data/queries";
import { fehlerText, formatDate, formatEUR } from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPills } from "@/components/data-table/filter-pills";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { InvoiceSummaryCell } from "@/components/records/invoice-summary-cell";
import { ListToolbar } from "@/components/records/list-toolbar";
import { useTableView } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/config/brand";
import type { Gesellschaft } from "@/lib/data/types";

export const Route = createFileRoute("/gesellschaften/")({
  head: () => ({ meta: [{ title: pageTitle("Gesellschaften") }] }),
  component: GesellschaftenPage,
});

/**
 * The status axis of the filter popover, the same three states the supplier list offers.
 *
 * The screen used to carry a bare "Archivierte anzeigen" checkbox, which could only ever say
 * "active" or "everything". Archived companies mixed into the active ones are dimmed rows among
 * all the others, so the list stops being a usable answer to either question. Splitting the
 * checkbox into three named states makes "show me only what I archived" reachable, which is what
 * someone looking for something to restore actually wants.
 */
type StatusFilter = "aktiv" | "archived" | "alle";
const STATUS_DEFAULT: StatusFilter = "aktiv";

/** The area filter's neutral value. Areas themselves are nullable, hence a third "no area" state. */
const BEREICH_ALLE = "__alle";
const BEREICH_OHNE = "__ohne";

function GesellschaftenPage() {
  useFokus();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState<StatusFilter>(STATUS_DEFAULT);
  const [bereich, setBereich] = useState<string>(BEREICH_ALLE);
  const [nurOhneAblage, setNurOhneAblage] = useState(false);

  const gesellschaftenQ = useGesellschaften({ includeArchived: status !== "aktiv" });
  const summenQ = useGesellschaftBelegSummen();
  // Both unscoped and both small tables: one request each feeds the property count of every row,
  // rather than one query per company.
  const objekteQ = useObjekte();
  const propertyCompaniesQ = usePropertyCompanies();
  const gesellschaften = useMemo(() => gesellschaftenQ.data ?? [], [gesellschaftenQ.data]);

  // Totals arrive pre-aggregated from Postgres (view v_company_invoice_totals) instead of being
  // grouped in the browser out of every invoice in the system. `summenBereit` still exists for the
  // same reason as before: this query is separate from the company list the table's skeleton is
  // gated on, so a row can render before its numbers are known, and a fabricated 0,00 EUR reads as
  // a settled fact rather than as "not loaded yet".
  const summenBereit = summenQ.data !== undefined;
  const summen = useMemo(
    () => summenQ.data ?? new Map<string, { summe: number; anzahl: number }>(),
    [summenQ.data],
  );

  // How many properties each company owns. A property may belong to several companies at once
  // (property_companies, migration 0083), so this is a count of links, not of rows in `objekte`.
  const objekteBereit = propertyCompaniesQ.data !== undefined && objekteQ.data !== undefined;
  const objektAnzahl = useMemo(() => {
    const bekannt = new Set((objekteQ.data ?? []).map((o) => o.id));
    const map = new Map<string, number>();
    for (const a of propertyCompaniesQ.data ?? []) {
      if (!bekannt.has(a.property_id)) continue;
      map.set(a.company_id, (map.get(a.company_id) ?? 0) + 1);
    }
    return map;
  }, [propertyCompaniesQ.data, objekteQ.data]);

  // How many companies file nowhere. Without a Dropbox folder the pipeline files nothing for them,
  // and until now that was invisible: no column, no count, no way to work through them.
  const ohneAblageGesamt = useMemo(
    () => gesellschaften.filter((g) => !g.filing_folder?.trim()).length,
    [gesellschaften],
  );

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return gesellschaften.filter((g) => {
      if (status === "archived" && !g.deleted_at) return false;
      if (bereich === BEREICH_OHNE && g.area) return false;
      if (bereich !== BEREICH_ALLE && bereich !== BEREICH_OHNE && g.area !== bereich) return false;
      if (nurOhneAblage && g.filing_folder?.trim()) return false;
      return !q || `${g.code} ${g.name}`.toLowerCase().includes(q);
    });
  }, [gesellschaften, suche, status, bereich, nurOhneAblage]);

  const view = useTableView(gefiltert, {
    // By code, not by last-updated. The code is how everyone here refers to a company, and it is
    // the only column with a stable order people already carry in their heads.
    initialSort: "code",
    initialDir: "asc",
    resetKey: `${suche}|${status}|${bereich}|${nurOhneAblage}`,
    sortValue: (g, key) => {
      switch (key) {
        case "name":
          return g.name ?? "";
        case "objekte":
          return objektAnzahl.get(g.id) ?? 0;
        case "summe":
          return summen.get(g.id)?.summe ?? 0;
        case "createdAt":
          return g.created_at ?? "";
        case "updatedAt":
          return g.updated_at ?? g.created_at ?? "";
        default:
          return g.code ?? "";
      }
    },
  });

  // The sortable columns, named once. The table headers below and the mobile sort control inside
  // the filter sheet both read this list, so the two cannot offer different columns.
  const sortColumns = [
    { value: "code", label: t("gesellschaften.list.col.code") },
    { value: "name", label: t("gesellschaften.list.col.name") },
    { value: "objekte", label: t("gesellschaften.list.col.objekte") },
    { value: "summe", label: t("gesellschaften.list.col.verbucht") },
    { value: "createdAt", label: t("gesellschaften.list.col.createdAt") },
    { value: "updatedAt", label: t("gesellschaften.list.col.updatedAt") },
  ];

  // -----------------------------------------------------------------------------------------
  // Filters, declared as data. This array is the repository-specific half of the filter feature.
  // FilterPopover itself knows nothing about companies, and a sibling hub replaces this list.
  // -----------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "status",
      label: t("gesellschaften.list.filter.status"),
      value: status,
      defaultValue: STATUS_DEFAULT,
      options: [
        { value: "alle", label: t("gesellschaften.list.filter.statusAlle") },
        { value: "aktiv", label: t("gesellschaften.list.filter.statusAktiv") },
        { value: "archived", label: t("gesellschaften.list.filter.statusArchiviert") },
      ],
      onChange: (v) => setStatus(v as StatusFilter),
    },
    {
      kind: "select",
      key: "bereich",
      label: t("gesellschaften.list.filter.bereich"),
      value: bereich,
      defaultValue: BEREICH_ALLE,
      options: [
        { value: BEREICH_ALLE, label: t("gesellschaften.list.filter.bereichAlle") },
        { value: "hospitality", label: t("freigabeRegeln.bereich.hospitality") },
        { value: "stay_re", label: t("freigabeRegeln.bereich.stay_re") },
        { value: BEREICH_OHNE, label: t("gesellschaften.list.filter.bereichOhne") },
      ],
      onChange: setBereich,
    },
    {
      kind: "toggle",
      key: "ohneAblage",
      fieldLabel: t("gesellschaften.list.filter.ablage"),
      // Kept offered even at zero: inside the popover it costs no surface area, and a filter that
      // appears and disappears is harder to trust than one that comes back empty.
      label: t("gesellschaften.list.filter.ohneAblage", { count: ohneAblageGesamt }),
      value: nurOhneAblage,
      onChange: setNurOhneAblage,
    },
  ];

  // Sorting is a table-header affordance and the table is desktop-only, so without this the mobile
  // card list could not be sorted at all. Same columns the headers expose.
  const mobileSortField = (
    <div className="grid grid-cols-1 gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common.sort.label")}</span>
        <Combobox
          value={view.sort}
          onValueChange={view.setSort}
          className="w-full"
          ariaLabel={t("common.sort.label")}
          options={sortColumns}
        />
      </label>
      <button
        type="button"
        onClick={() => view.setDir(view.dir === "asc" ? "desc" : "asc")}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        {view.dir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        {view.dir === "asc" ? t("common.sort.asc") : t("common.sort.desc")}
      </button>
    </div>
  );

  // Derived once per row and shared by the desktop table and the mobile cards below, so a future
  // change to one of these lookups cannot drift between the two renderings.
  const rows = useMemo(
    () =>
      view.pageRows.map((g) => ({
        gesellschaft: g,
        objekte: objektAnzahl.get(g.id) ?? 0,
        summe: summen.get(g.id)?.summe ?? 0,
        anzahl: summen.get(g.id)?.anzahl ?? 0,
        archived: !!g.deleted_at,
      })),
    [view.pageRows, summen, objektAnzahl],
  );

  return (
    <div>
      {/* Title, search and every control on ONE row. The heading used to sit in its own block
          with a sentence of description under it and the search on a row below that, so three rows
          of chrome stood between the reader and the table. Below `sm` the row still stacks. */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h1
          data-tour="companies-header"
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        >
          {t("gesellschaften.list.title")}
        </h1>
        <ListToolbar
          dataTour="companies-toolbar"
          className="sm:ml-auto"
          value={suche}
          onValueChange={setSuche}
          placeholder={t("gesellschaften.list.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("gesellschaften.list.filter.button"),
                  title: t("gesellschaften.list.filter.title"),
                  reset: t("gesellschaften.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NeueGesellschaftDialog />
            </>
          }
        />
      </div>
      {/* What is narrowing the list, spelled out. The trigger's badge can say how many filters are
          on but never which, and reading the numbers wrong because a filter was left set is the
          failure this prevents. */}
      <FilterPills className="mt-3" fields={filterFields} />

      {gesellschaftenQ.isError ? (
        <div className="mt-4">
          <ErrorState error={gesellschaftenQ.error} onRetry={() => gesellschaftenQ.refetch()} />
        </div>
      ) : gesellschaftenQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={7} />
        </div>
      ) : (
        <div data-tour="companies-list" data-fokus="liste" className="mt-4">
          {/* Below `sm`, cards replace the table entirely rather than relying on any horizontal
              scroll -- table-internal or page-level. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {/* Sorting sits on the headers, where the column being sorted and the control
                      that sorts it are the same thing, instead of in a dropdown on the toolbar. */}
                  <SortableColumnHeader
                    column="code"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[140px]"
                  >
                    {t("gesellschaften.list.col.code")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="name"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="min-w-[220px]"
                  >
                    {t("gesellschaften.list.col.name")}
                  </SortableColumnHeader>
                  <TableHead className="w-[150px]">
                    {t("gesellschaften.list.col.bereich")}
                  </TableHead>
                  <SortableColumnHeader
                    column="objekte"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                    className="w-[110px]"
                  >
                    {t("gesellschaften.list.col.objekte")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("gesellschaften.list.col.verbucht")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="createdAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[120px]"
                  >
                    {t("gesellschaften.list.col.createdAt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="updatedAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[130px]"
                  >
                    {t("gesellschaften.list.col.updatedAt")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ gesellschaft: g, objekte, summe, anzahl, archived }) => (
                  <TableRow
                    key={g.id}
                    className={cn("cursor-pointer", archived && "opacity-50")}
                    onClick={() => navigate({ to: "/gesellschaften/$id", params: { id: g.id } })}
                  >
                    <TableCell className="font-mono font-medium text-foreground">
                      {g.code}
                    </TableCell>
                    <TableCell className="min-w-[220px] whitespace-normal break-words text-foreground">
                      {g.name}
                      {archived && (
                        <span className="ml-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                          {t("gesellschaften.list.archiviertBadge")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <BereichBadge area={g.area} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {/* A skeleton, not a "—": the property links come from a different query
                          than the rows, and an em dash here is an affirmative "owns nothing"
                          shown before anything is known. */}
                      {objekteBereit ? objekte || "—" : <Skeleton className="ml-auto h-4 w-6" />}
                    </TableCell>
                    <TableCell>
                      <InvoiceSummaryCell
                        count={anzahl}
                        amount={summe}
                        formatAmount={formatEUR}
                        formatCount={(count) => t("gesellschaften.list.belegeCount", { count })}
                        loading={!summenBereit}
                      />
                    </TableCell>
                    <TableCell className="w-[120px] whitespace-normal text-sm text-muted-foreground">
                      {formatDate(g.created_at)}
                    </TableCell>
                    <TableCell className="w-[130px] whitespace-normal text-sm text-muted-foreground">
                      {formatDate(g.updated_at ?? g.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {t("gesellschaften.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 sm:hidden">
            {rows.map(({ gesellschaft: g, objekte, summe, anzahl, archived }) => (
              <div
                key={g.id}
                className={cn(
                  "cursor-pointer rounded-xl border border-border bg-card p-4",
                  archived && "opacity-50",
                )}
                onClick={() => navigate({ to: "/gesellschaften/$id", params: { id: g.id } })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-medium text-foreground">{g.code}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{g.name}</div>
                  </div>
                  <InvoiceSummaryCell
                    className="shrink-0"
                    count={anzahl}
                    amount={summe}
                    formatAmount={formatEUR}
                    formatCount={(count) => t("gesellschaften.list.belegeCount", { count })}
                    loading={!summenBereit}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <BereichBadge area={g.area} />
                  {objekteBereit && objekte > 0 && (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t("gesellschaften.list.objekteCount", { count: objekte })}
                    </span>
                  )}
                  {archived && (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t("gesellschaften.list.archiviertBadge")}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>
                    {t("gesellschaften.list.col.createdAt")} {formatDate(g.created_at)}
                  </span>
                  <span>
                    {t("gesellschaften.list.col.updatedAt")}{" "}
                    {formatDate(g.updated_at ?? g.created_at)}
                  </span>
                </div>
              </div>
            ))}
            {view.total === 0 && (
              <p className="rounded-xl border border-border bg-card px-5 py-12 text-center text-muted-foreground">
                {t("gesellschaften.list.empty")}
              </p>
            )}
          </div>
        </div>
      )}

      {!gesellschaftenQ.isError && !gesellschaftenQ.isLoading && view.total > 0 && (
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
    </div>
  );
}

/**
 * The area of responsibility, as a neutral chip.
 *
 * Deliberately not colour-coded: the two areas are peers, and a palette that tells them apart by
 * hue would claim one of them means something (good, urgent, blocked) that it does not.
 */
function BereichBadge({ area }: { area: Gesellschaft["area"] }) {
  const { t } = useTranslation();
  if (!area) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
      {t(`freigabeRegeln.bereich.${area}`)}
    </span>
  );
}

function NeueGesellschaftDialog() {
  const { t } = useTranslation();
  const create = useCreateGesellschaft();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<Record<string, string>>({});
  // Clear a field's error as soon as it is touched, so the message goes away when it is
  // addressed rather than lingering until the next submit.
  const clearFehler = (feld: string) =>
    setFehler((prev) => (prev[feld] ? { ...prev, [feld]: "" } : prev));

  function anlegen() {
    // Validate through the shared schema so the dialog can point at the offending field instead
    // of firing one toast that names every problem at once and then vanishes.
    const parsed = gesellschaftSchema(t).safeParse({ code, name });
    if (!parsed.success) {
      setFehler(feldFehler(parsed.error));
      return;
    }
    setFehler({});
    const { code: c, name: n } = parsed.data;
    create.mutate(
      { code: c, name: n },
      {
        onSuccess: () => {
          toast.success(t("gesellschaften.list.toast.angelegt"));
          setCode("");
          setName("");
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("gesellschaften.list.toast.anlegenFehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFehler({});
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {t("gesellschaften.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("gesellschaften.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("gesellschaften.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("gesellschaften.list.neu.codeLabel")} <PflichtStern />
            </Label>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                clearFehler("code");
              }}
              placeholder={t("gesellschaften.list.neu.codePlaceholder")}
              aria-invalid={!!fehler.code}
            />
            <FeldFehlerText text={fehler.code} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("gesellschaften.list.neu.nameLabel")} <PflichtStern />
            </Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFehler("name");
              }}
              placeholder={t("gesellschaften.list.neu.namePlaceholder")}
              aria-invalid={!!fehler.name}
            />
            <FeldFehlerText text={fehler.name} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("gesellschaften.list.neu.cancel")}
          </Button>
          <Button onClick={anlegen} disabled={create.isPending}>
            {create.isPending
              ? t("gesellschaften.list.neu.anlege")
              : t("gesellschaften.list.neu.anlegen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
