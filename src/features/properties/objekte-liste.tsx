import { useEffect, useMemo, useState } from "react";
import { useFokus } from "@/lib/use-fokus";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  cn,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ErrorState,
  FeldFehlerText,
  feldFehler,
  fehlerText,
  FilterPills,
  FilterPopover,
  formatDate,
  formatEUR,
  GesellschaftChip,
  Input,
  InvoiceSummaryCell,
  Label,
  ListToolbar,
  needsMasterDataReview,
  objektSchema,
  PflichtStern,
  Skeleton,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TablePagination,
  TableRow,
  TableSkeleton,
  useCreateObjekt,
  useObjekte,
  useObjektBelegSummen,
  useObjektGesellschaften,
  useTableView,
  useTranslation,
} from "./adapter";
import type { FilterField } from "./adapter";
import type { ObjektDaten, ObjektGesellschaft, PropertiesConfig, PropertiesSearch } from "./config";

/**
 * The status axis of the filter popover, the same three states the supplier and company lists
 * offer.
 *
 * The screen used to carry a bare "Archivierte anzeigen" switch, which could only ever say "active"
 * or "everything". Archived properties mixed into the active ones are dimmed rows among all the
 * others, so the list stops being a usable answer to either question.
 */
type StatusFilter = "aktiv" | "archiviert" | "alle";
const STATUS_DEFAULT: StatusFilter = "aktiv";

/** "Any company" / "any ownership", the neutral value of the two select filters. */
const ALLE = "__alle";

const UST_STATUS_OPTIONEN = ["steuerpflichtig", "steuerfrei", "gemischt"] as const;
const OWNERSHIP_OPTIONEN = ["own", "client"] as const;

export function ObjekteListe({
  config,
  search,
}: {
  config: PropertiesConfig;
  search: PropertiesSearch;
}) {
  useFokus();
  const { t } = useTranslation();
  const objekteQ = useObjekte();
  const summenQ = useObjektBelegSummen();
  const zuordnung = useObjektGesellschaften();

  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState<StatusFilter>(STATUS_DEFAULT);
  const [gesellschaft, setGesellschaft] = useState(ALLE);
  const [eigentum, setEigentum] = useState(ALLE);
  const [nurPruefen, setNurPruefen] = useState(false);
  const [nurOhneAdresse, setNurOhneAdresse] = useState(false);

  // Typed as the shared shape, not the Hub's own Objekt: the optional fields below are read
  // through the capability flags, and a Hub whose table lacks a column must still compile.
  const objekte = useMemo<ObjektDaten[]>(() => objekteQ.data ?? [], [objekteQ.data]);

  // Booked volume + count per property, aggregated by Postgres (view v_property_invoice_totals)
  // instead of grouping every invoice in the browser. Keyed by property_id only: the old code also
  // had a property_code fallback for rows not yet backfilled, and there are none left in any Hub.
  //
  // useMemo, not a bare `??`: the fallback Map is a new identity on every render, so a useMemo
  // depending on it re-ran every time even when nothing had changed.
  const summen = useMemo(
    () => summenQ.data ?? new Map<string, { summe: number; anzahl: number }>(),
    [summenQ.data],
  );
  // Only the property query gates the table, so codes and addresses appear as soon as they are
  // known. The two columns fed by OTHER queries say so themselves instead of inventing a value: a
  // real property row rendering "0,00 € · 0 Belege" and an empty Gesellschaft column is a
  // fabricated answer, and a total of zero and a total that has not arrived yet are not the same
  // statement.
  const summenBereit = summenQ.data !== undefined;

  const zuPruefenGesamt = useMemo(
    () =>
      config.stammdatenPruefung
        ? objekte.filter((o) => !o.deleted_at && needsMasterDataReview(o.reviewed_at)).length
        : 0,
    [objekte, config.stammdatenPruefung],
  );
  const ohneAdresseGesamt = useMemo(
    () => objekte.filter((o) => !o.deleted_at && !o.address?.trim()).length,
    [objekte],
  );

  // Every company that actually owns a property, so the filter offers the ones that can return a
  // row rather than the whole company list.
  const gesellschaftOptionen = useMemo(() => {
    const byCode = new Map<string, ObjektGesellschaft>();
    for (const list of zuordnung.byProperty.values()) {
      for (const g of list) if (!byCode.has(g.code)) byCode.set(g.code, g);
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [zuordnung.byProperty]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return objekte.filter((o) => {
      if (config.archivierung) {
        if (status === "aktiv" && o.deleted_at) return false;
        if (status === "archiviert" && !o.deleted_at) return false;
      }
      if (nurPruefen && !needsMasterDataReview(o.reviewed_at)) return false;
      if (nurOhneAdresse && o.address?.trim()) return false;
      if (eigentum !== ALLE && o.ownership_type !== eigentum) return false;
      if (gesellschaft !== ALLE) {
        const eigner = zuordnung.byProperty.get(o.id) ?? [];
        if (!eigner.some((g) => g.code === gesellschaft)) return false;
      }
      return !q || `${o.code} ${o.name ?? ""} ${o.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [
    objekte,
    suche,
    status,
    nurPruefen,
    nurOhneAdresse,
    eigentum,
    gesellschaft,
    zuordnung.byProperty,
    config.archivierung,
  ]);

  const view = useTableView(gefiltert, {
    initialSort: "updatedAt",
    initialDir: "desc",
    resetKey: `${suche}|${status}|${gesellschaft}|${eigentum}|${nurPruefen}|${nurOhneAdresse}`,
    sortValue: (o, key) => {
      const s = summen.get(o.id) ?? { summe: 0, anzahl: 0 };
      switch (key) {
        case "gesellschaft":
          return (zuordnung.byProperty.get(o.id) ?? []).map((g) => g.code).join(",");
        case "summe":
          return s.summe;
        case "createdAt":
          return o.created_at ?? "";
        case "updatedAt":
          return o.updated_at ?? o.created_at ?? "";
        default:
          return o.code ?? "";
      }
    },
  });

  // The sortable columns, named once. The table headers below and the mobile sort control inside
  // the filter sheet both read this list, so the two can't offer different columns.
  const sortColumns = [
    { value: "code", label: t("objekte.list.col.objekt") },
    { value: "gesellschaft", label: t("objekte.list.col.gesellschaft") },
    { value: "summe", label: t("objekte.list.col.verbucht") },
    { value: "createdAt", label: t("objekte.list.col.createdAt") },
    { value: "updatedAt", label: t("objekte.list.col.updatedAt") },
  ];

  // -----------------------------------------------------------------------------------------
  // Filters, declared as data. FilterPopover itself knows nothing about properties, and the
  // chips below are fed from this same array so the two cannot drift apart.
  // -----------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    // Only where the Hub can archive at all. Without the column every property is active, so the
    // axis would be a control with one reachable value.
    ...(config.archivierung
      ? [
          {
            kind: "select" as const,
            key: "status",
            label: t("objekte.list.filter.status"),
            value: status,
            defaultValue: STATUS_DEFAULT,
            options: [
              { value: "alle", label: t("objekte.list.filter.statusAlle") },
              { value: "aktiv", label: t("objekte.list.filter.statusAktiv") },
              { value: "archiviert", label: t("objekte.list.filter.statusArchiviert") },
            ],
            onChange: (v: string) => setStatus(v as StatusFilter),
          },
        ]
      : []),
    {
      kind: "select",
      key: "gesellschaft",
      label: t("objekte.list.col.gesellschaft"),
      value: gesellschaft,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("objekte.list.filter.gesellschaftAlle") },
        ...gesellschaftOptionen.map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` })),
      ],
      onChange: setGesellschaft,
    },
    ...(config.eigentum
      ? [
          {
            kind: "select" as const,
            key: "eigentum",
            label: t("objekte.detail.field.eigentum"),
            value: eigentum,
            defaultValue: ALLE,
            options: [
              { value: ALLE, label: t("objekte.list.filter.eigentumAlle") },
              ...OWNERSHIP_OPTIONEN.map((o) => ({ value: o, label: t(`objekte.eigentum.${o}`) })),
            ],
            onChange: setEigentum,
          },
        ]
      : []),
    {
      kind: "toggle",
      key: "ohneAdresse",
      fieldLabel: t("objekte.list.filter.adresse"),
      // Kept offered even at zero: inside the popover it costs no surface area, and a filter that
      // appears and disappears is harder to trust than one that comes back empty.
      label: t("objekte.list.filter.ohneAdresse", { count: ohneAdresseGesamt }),
      value: nurOhneAdresse,
      onChange: setNurOhneAdresse,
    },
    // Only where the Hub actually runs the review. Elsewhere this would be a control for a
    // workflow that never marks anything, i.e. a filter that can only ever return nothing.
    ...(config.stammdatenPruefung
      ? [
          {
            kind: "toggle" as const,
            key: "pruefen",
            fieldLabel: t("objekte.list.filter.pruefung"),
            label: t("objekte.list.nurPruefen", { count: zuPruefenGesamt }),
            value: nurPruefen,
            onChange: setNurPruefen,
          },
        ]
      : []),
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

  // Derived once per row and shared by both the desktop table and the mobile cards below, so a
  // future change to one of these lookups can't drift between the two renderings.
  const rows = useMemo(
    () =>
      view.pageRows.map((o) => ({
        objekt: o,
        companies: zuordnung.byProperty.get(o.id) ?? [],
        ...(summen.get(o.id) ?? { summe: 0, anzahl: 0 }),
      })),
    [view.pageRows, zuordnung.byProperty, summen],
  );

  return (
    <div>
      {/* Title, search and every control on ONE row. The heading used to sit in its own block
          with a sentence of description under it and the search on a row below that, so three rows
          of chrome stood between the reader and the table. Below `sm` the row still stacks. */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h1
          data-tour="properties-header"
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        >
          {t("objekte.list.title")}
        </h1>
        <ListToolbar
          dataTour="properties-toolbar"
          className="sm:ml-auto"
          value={suche}
          onValueChange={setSuche}
          placeholder={t("objekte.list.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("objekte.list.filter.button"),
                  title: t("objekte.list.filter.title"),
                  reset: t("objekte.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NeuesObjektDialog config={config} initialCode={search.neu} />
            </>
          }
        />
      </div>
      {/* What is narrowing the list, spelled out. The trigger's badge says how many filters are on
          but never which, and reading a list wrong because a filter was left set is the failure
          this prevents. */}
      <FilterPills className="mt-3" fields={filterFields} />

      {objekteQ.isError ? (
        <div className="mt-4">
          <ErrorState error={objekteQ.error} onRetry={() => objekteQ.refetch()} />
        </div>
      ) : objekteQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <div data-tour="properties-list" data-fokus="liste">
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {/* Sorting sits on the headers, where the column being sorted and the control
                      that sorts it are the same thing, rather than in a separate toolbar widget. */}
                  <SortableColumnHeader
                    column="code"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                  >
                    {t("objekte.list.col.objekt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="gesellschaft"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                  >
                    {t("objekte.list.col.gesellschaft")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("objekte.list.col.verbucht")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="createdAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[120px]"
                  >
                    {t("objekte.list.col.createdAt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="updatedAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[130px]"
                  >
                    {t("objekte.list.col.updatedAt")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ objekt: o, companies, summe, anzahl }) => (
                  <TableRow
                    key={o.id}
                    className={cn("cursor-pointer", o.deleted_at && "opacity-60")}
                    onClick={() => config.oeffneObjekt(o.code)}
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span className="font-mono">{o.code}</span>
                        {o.name ? <span className="font-sans">{o.name}</span> : null}
                        <ObjektMerkmale objekt={o} config={config} />
                      </div>
                      {o.address ? (
                        <div className="text-xs text-muted-foreground">{o.address}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <GesellschaftZellen companies={companies} bereit={zuordnung.bereit} />
                    </TableCell>
                    <TableCell>
                      <InvoiceSummaryCell
                        count={anzahl}
                        amount={summe}
                        formatAmount={formatEUR}
                        formatCount={(count) => t("objekte.list.belegeCount", { count })}
                        loading={!summenBereit}
                      />
                    </TableCell>
                    <TableCell className="w-[120px] whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(o.created_at)}
                    </TableCell>
                    <TableCell className="w-[130px] whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(o.updated_at ?? o.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      {t("objekte.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Below `sm`, cards replace the 5-column table entirely rather than relying on any
              horizontal scroll. Same click-through to the detail page as the table row. */}
          <div className="mt-4 space-y-3 sm:hidden">
            {rows.map(({ objekt: o, companies, summe, anzahl }) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => config.oeffneObjekt(o.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") config.oeffneObjekt(o.code);
                }}
                className={cn(
                  "cursor-pointer rounded-xl border border-border bg-card p-4",
                  o.deleted_at && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                      <span className="font-mono">{o.code}</span>
                      {o.name ? <span className="font-sans">{o.name}</span> : null}
                      <ObjektMerkmale objekt={o} config={config} />
                    </div>
                    {o.address ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{o.address}</div>
                    ) : null}
                  </div>
                  <InvoiceSummaryCell
                    className="shrink-0"
                    count={anzahl}
                    amount={summe}
                    formatAmount={formatEUR}
                    formatCount={(count) => t("objekte.list.belegeCount", { count })}
                    loading={!summenBereit}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <GesellschaftZellen companies={companies} bereit={zuordnung.bereit} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>
                    {t("objekte.list.col.createdAt")}: {formatDate(o.created_at)}
                  </span>
                  <span>
                    {t("objekte.list.col.updatedAt")}: {formatDate(o.updated_at ?? o.created_at)}
                  </span>
                </div>
              </div>
            ))}
            {view.total === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {t("objekte.list.empty")}
              </p>
            )}
          </div>
        </div>
      )}

      {!objekteQ.isError && !objekteQ.isLoading && view.total > 0 && (
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
 * The badges that qualify a property's name: review due, archived, third-party managed.
 *
 * "Eigenbestand" is deliberately NOT badged. It is the default on every row, so drawing it would
 * put a label on the whole table to distinguish the handful that carry the other value.
 */
function ObjektMerkmale({ objekt, config }: { objekt: ObjektDaten; config: PropertiesConfig }) {
  const { t } = useTranslation();
  return (
    <>
      {config.stammdatenPruefung &&
        !objekt.deleted_at &&
        needsMasterDataReview(objekt.reviewed_at) && (
          <span
            className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 font-sans text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            title={t("objekte.list.pruefenTitle")}
          >
            {t("objekte.list.pruefenBadge")}
          </span>
        )}
      {config.eigentum && objekt.ownership_type === "client" && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground">
          {t("objekte.eigentum.client")}
        </span>
      )}
      {config.archivierung && objekt.deleted_at && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          {t("objekte.list.archiviert")}
        </span>
      )}
    </>
  );
}

/** The company column: chips once known, a skeleton while it is not, never a fabricated blank. */
function GesellschaftZellen({
  companies,
  bereit,
}: {
  companies: ObjektGesellschaft[];
  bereit: boolean;
}) {
  if (!bereit) return <Skeleton className="h-5 w-16" />;
  if (companies.length === 0) return <GesellschaftChip code={null} />;
  return (
    <div className="flex flex-wrap gap-1">
      {companies.map((c) => (
        <GesellschaftChip key={c.code} code={c.code} />
      ))}
    </div>
  );
}

function NeuesObjektDialog({
  config,
  initialCode,
}: {
  config: PropertiesConfig;
  initialCode?: string;
}) {
  const { t } = useTranslation();
  const create = useCreateObjekt();
  // The list this dialog sits on is already loaded, so the duplicate check costs no extra request.
  // Archived properties are included on purpose: the code stays taken while archived (the unique
  // index does not care about deleted_at), so offering it would produce a rejection nobody could
  // act on from this screen.
  const objekteQ = useObjekte();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [adresse, setAdresse] = useState("");
  const [ustStatus, setUstStatus] = useState("__none");
  const [eigentum, setEigentum] = useState<NonNullable<ObjektDaten["ownership_type"]>>("own");
  const [fehler, setFehler] = useState<Record<string, string>>({});

  const vergebeneCodes = useMemo(
    () => new Set((objekteQ.data ?? []).map((o) => o.code.toLocaleLowerCase())),
    [objekteQ.data],
  );

  // Deep link (?neu=<code>): open pre-filled with the code, then consume the param so it doesn't
  // reopen on re-render / back navigation.
  useEffect(() => {
    if (!initialCode) return;
    setCode(initialCode);
    setOpen(true);
    config.verwerfeNeuParam();
  }, [initialCode, config]);

  function reset() {
    setCode("");
    setName("");
    setAdresse("");
    setUstStatus("__none");
    setEigentum("own");
    setFehler({});
    config.anlegenFeld?.zuruecksetzen();
  }

  function anlegen() {
    // Validate through the shared schema so the dialog can point at the offending field instead of
    // firing a toast that vanishes without ever saying which input was wrong.
    const parsed = objektSchema(t, vergebeneCodes).safeParse({ code });
    if (!parsed.success) {
      setFehler(feldFehler(parsed.error));
      return;
    }
    setFehler({});
    create.mutate(
      {
        code: parsed.data.code,
        name: name.trim() || null,
        address: adresse.trim() || null,
        vat_status: ustStatus === "__none" ? null : ustStatus,
        // Only sent where the column exists. The cast is the seam between this shared screen and a
        // Hub's own insert type, which is narrower on a Hub without the column.
        ...(config.eigentum ? { ownership_type: eigentum } : {}),
      } as Parameters<typeof create.mutate>[0],
      {
        onSuccess: async (neu) => {
          // The Hub's own relation is written after the row exists, because it needs the new id.
          // A failure here is reported and the dialog stays open: the property was created, so
          // closing on a silent error would leave it in the state this field exists to prevent.
          try {
            await config.anlegenFeld?.speichern(neu.id);
          } catch (e) {
            toast.error(t("objekte.list.toast.anlegenFehlgeschlagen", { error: fehlerText(e) }));
            return;
          }
          toast.success(t("objekte.list.toast.angelegt"));
          reset();
          setOpen(false);
        },
        onError: (e) =>
          toast.error(t("objekte.list.toast.anlegenFehlgeschlagen", { error: fehlerText(e) })),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A dialog reopened after a failed attempt should not still be showing the old message.
        if (next) {
          setFehler({});
          config.anlegenFeld?.zuruecksetzen();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full gap-2 sm:w-auto">
          <Plus className="size-4" /> {t("objekte.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("objekte.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("objekte.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("objekte.list.neu.codeLabel")} <PflichtStern />
            </Label>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                // Clear the error as soon as the field is touched, so it goes away when it is
                // addressed rather than lingering until the next submit.
                setFehler((prev) => (prev.code ? { ...prev, code: "" } : prev));
              }}
              placeholder={t("objekte.list.neu.codePlaceholder")}
              aria-invalid={!!fehler.code}
            />
            <FeldFehlerText text={fehler.code} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("objekte.list.neu.nameLabel")}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("objekte.list.neu.namePlaceholder")}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              {t("objekte.list.neu.adresseLabel")}
            </Label>
            <Input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder={t("objekte.list.neu.adressePlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("objekte.list.neu.ustStatusLabel")}
            </Label>
            <Combobox
              value={ustStatus}
              onValueChange={setUstStatus}
              placeholder="—"
              options={[
                { value: "__none", label: t("objekte.ohne") },
                ...UST_STATUS_OPTIONEN.map((s) => ({
                  value: s,
                  label: t(`objekte.ustStatus.${s}`),
                })),
              ]}
            />
          </div>
          {/* Collected up front rather than left to an immediate follow-up edit -- the same reason
              the company dialog takes its whole field set. Third-party managed properties are
              pass-through costs, so getting this wrong at creation misstates the books. */}
          {config.eigentum && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("objekte.detail.field.eigentum")}
              </Label>
              <Combobox
                value={eigentum}
                onValueChange={(v) => setEigentum(v as NonNullable<ObjektDaten["ownership_type"]>)}
                options={OWNERSHIP_OPTIONEN.map((o) => ({
                  value: o,
                  label: t(`objekte.eigentum.${o}`),
                }))}
              />
            </div>
          )}
          {config.anlegenFeld && <div className="sm:col-span-2">{config.anlegenFeld.node}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("objekte.list.neu.cancel")}
          </Button>
          <Button
            onClick={anlegen}
            disabled={create.isPending || !!config.anlegenFeld?.unvollstaendig}
          >
            {create.isPending ? t("objekte.list.neu.anlege") : t("objekte.list.neu.anlegen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
