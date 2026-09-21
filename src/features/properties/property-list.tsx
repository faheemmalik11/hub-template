import { useEffect, useMemo, useState } from "react";
import { useFocus } from "@/lib/use-focus";
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
  FieldErrorText,
  fieldError,
  errorText,
  FilterPills,
  FilterPopover,
  formatDate,
  formatEUR,
  CompanyChip,
  Input,
  InvoiceSummaryCell,
  Label,
  ListToolbar,
  needsMasterDataReview,
  propertySchema,
  RequiredStern,
  Skeleton,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TablePagination,
  TableRow,
  TableSkeleton,
  useCreateProperty,
  useProperties,
  usePropertyDocumentTotals,
  usePropertyCompanyIndex,
  useTableView,
  useTranslation,
} from "./adapter";
import type { FilterField } from "./adapter";
import type { PropertyData, PropertyCompany, PropertiesConfig, PropertiesSearch } from "./config";

/**
 * The status axis of the filter popover, the same three states the supplier and company lists
 * offer.
 *
 * The screen used to carry a bare "Archivierte anzeigen" switch, which could only ever say "active"
 * or "everything". Archived properties mixed into the active ones are dimmed rows among all the
 * others, so the list stops being a usable answer to either question.
 */
type StatusFilter = "aktiv" | "archived" | "alle";
const STATUS_DEFAULT: StatusFilter = "aktiv";

/** "Any company" / "any ownership", the neutral value of the two select filters. */
const ALL = "__alle";

const VAT_STATUS_OPTIONS = ["taxable", "exempt", "gemischt"] as const;
const OWNERSHIP_OPTIONS = ["own", "client"] as const;

export function PropertiesList({
  config,
  search,
}: {
  config: PropertiesConfig;
  search: PropertiesSearch;
}) {
  useFocus();
  const { t } = useTranslation();
  const propertiesQ = useProperties();
  const totalsQ = usePropertyDocumentTotals();
  const assignment = usePropertyCompanyIndex();

  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<StatusFilter>(STATUS_DEFAULT);
  const [company, setCompany] = useState(ALL);
  const [ownership, setOwnership] = useState(ALL);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [onlyWithoutAddress, setOnlyWithoutAddress] = useState(false);

  // Typed as the shared shape, not the Hub's own Objekt: the optional fields below are read
  // through the capability flags, and a Hub whose table lacks a column must still compile.
  const properties = useMemo<PropertyData[]>(() => propertiesQ.data ?? [], [propertiesQ.data]);

  // Booked volume + count per property, aggregated by Postgres (view v_property_invoice_totals)
  // instead of grouping every invoice in the browser. Keyed by property_id only: the old code also
  // had a property_code fallback for rows not yet backfilled, and there are none left in any Hub.
  //
  // useMemo, not a bare `??`: the fallback Map is a new identity on every render, so a useMemo
  // depending on it re-ran every time even when nothing had changed.
  const totals = useMemo(
    () => totalsQ.data ?? new Map<string, { total: number; count: number }>(),
    [totalsQ.data],
  );
  // Only the property query gates the table, so codes and addresses appear as soon as they are
  // known. The two columns fed by OTHER queries say so themselves instead of inventing a value: a
  // real property row rendering "0,00 € · 0 Belege" and an empty Gesellschaft column is a
  // fabricated answer, and a total of zero and a total that has not arrived yet are not the same
  // statement.
  const totalsReady = totalsQ.data !== undefined;

  const zuCheckTotal = useMemo(
    () =>
      config.masterDataCheck
        ? properties.filter((o) => !o.deleted_at && needsMasterDataReview(o.reviewed_at)).length
        : 0,
    [properties, config.masterDataCheck],
  );
  const withoutAddressTotal = useMemo(
    () => properties.filter((o) => !o.deleted_at && !o.address?.trim()).length,
    [properties],
  );

  // Every company that actually owns a property, so the filter offers the ones that can return a
  // row rather than the whole company list.
  const companyOptions = useMemo(() => {
    const byCode = new Map<string, PropertyCompany>();
    for (const list of assignment.byProperty.values()) {
      for (const g of list) if (!byCode.has(g.code)) byCode.set(g.code, g);
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [assignment.byProperty]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return properties.filter((o) => {
      if (config.archiving) {
        if (status === "aktiv" && o.deleted_at) return false;
        if (status === "archived" && !o.deleted_at) return false;
      }
      if (onlyCheck && !needsMasterDataReview(o.reviewed_at)) return false;
      if (onlyWithoutAddress && o.address?.trim()) return false;
      if (ownership !== ALL && o.ownership_type !== ownership) return false;
      if (company !== ALL) {
        const owner = assignment.byProperty.get(o.id) ?? [];
        if (!owner.some((g) => g.code === company)) return false;
      }
      return !q || `${o.code} ${o.name ?? ""} ${o.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [
    properties,
    searchTerm,
    status,
    onlyCheck,
    onlyWithoutAddress,
    ownership,
    company,
    assignment.byProperty,
    config.archiving,
  ]);

  const view = useTableView(filtered, {
    initialSort: "updatedAt",
    initialDir: "desc",
    resetKey: `${searchTerm}|${status}|${company}|${ownership}|${onlyCheck}|${onlyWithoutAddress}`,
    sortValue: (o, key) => {
      const s = totals.get(o.id) ?? { total: 0, count: 0 };
      switch (key) {
        case "gesellschaft":
          return (assignment.byProperty.get(o.id) ?? []).map((g) => g.code).join(",");
        case "summe":
          return s.total;
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
    { value: "code", label: t("properties.list.col.objekt") },
    { value: "gesellschaft", label: t("properties.list.col.gesellschaft") },
    { value: "summe", label: t("properties.list.col.verbucht") },
    { value: "createdAt", label: t("properties.list.col.createdAt") },
    { value: "updatedAt", label: t("properties.list.col.updatedAt") },
  ];

  // -----------------------------------------------------------------------------------------
  // Filters, declared as data. FilterPopover itself knows nothing about properties, and the
  // chips below are fed from this same array so the two cannot drift apart.
  // -----------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    // Only where the Hub can archive at all. Without the column every property is active, so the
    // axis would be a control with one reachable value.
    ...(config.archiving
      ? [
          {
            kind: "select" as const,
            key: "status",
            label: t("properties.list.filter.status"),
            value: status,
            defaultValue: STATUS_DEFAULT,
            options: [
              { value: "alle", label: t("properties.list.filter.statusAlle") },
              { value: "aktiv", label: t("properties.list.filter.statusAktiv") },
              { value: "archived", label: t("properties.list.filter.statusArchiviert") },
            ],
            onChange: (v: string) => setStatus(v as StatusFilter),
          },
        ]
      : []),
    {
      kind: "select",
      key: "gesellschaft",
      label: t("properties.list.col.gesellschaft"),
      value: company,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("properties.list.filter.gesellschaftAlle") },
        ...companyOptions.map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` })),
      ],
      onChange: setCompany,
    },
    ...(config.ownership
      ? [
          {
            kind: "select" as const,
            key: "eigentum",
            label: t("properties.detail.field.eigentum"),
            value: ownership,
            defaultValue: ALL,
            options: [
              { value: ALL, label: t("properties.list.filter.eigentumAlle") },
              ...OWNERSHIP_OPTIONS.map((o) => ({
                value: o,
                label: t(`properties.eigentum.${o}`),
              })),
            ],
            onChange: setOwnership,
          },
        ]
      : []),
    {
      kind: "toggle",
      key: "ohneAdresse",
      fieldLabel: t("properties.list.filter.adresse"),
      // Kept offered even at zero: inside the popover it costs no surface area, and a filter that
      // appears and disappears is harder to trust than one that comes back empty.
      label: t("properties.list.filter.ohneAdresse", { count: withoutAddressTotal }),
      value: onlyWithoutAddress,
      onChange: setOnlyWithoutAddress,
    },
    // Only where the Hub actually runs the review. Elsewhere this would be a control for a
    // workflow that never marks anything, i.e. a filter that can only ever return nothing.
    ...(config.masterDataCheck
      ? [
          {
            kind: "toggle" as const,
            key: "pruefen",
            fieldLabel: t("properties.list.filter.pruefung"),
            label: t("properties.list.nurPruefen", { count: zuCheckTotal }),
            value: onlyCheck,
            onChange: setOnlyCheck,
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
        property: o,
        companies: assignment.byProperty.get(o.id) ?? [],
        ...(totals.get(o.id) ?? { total: 0, count: 0 }),
      })),
    [view.pageRows, assignment.byProperty, totals],
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
          {t("properties.list.title")}
        </h1>
        <ListToolbar
          dataTour="properties-toolbar"
          className="sm:ml-auto"
          value={searchTerm}
          onValueChange={setSearchTerm}
          placeholder={t("properties.list.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("properties.list.filter.button"),
                  title: t("properties.list.filter.title"),
                  reset: t("properties.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NewPropertyDialog config={config} initialCode={search.new} />
            </>
          }
        />
      </div>
      {/* What is narrowing the list, spelled out. The trigger's badge says how many filters are on
          but never which, and reading a list wrong because a filter was left set is the failure
          this prevents. */}
      <FilterPills className="mt-3" fields={filterFields} />

      {propertiesQ.isError ? (
        <div className="mt-4">
          <ErrorState error={propertiesQ.error} onRetry={() => propertiesQ.refetch()} />
        </div>
      ) : propertiesQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <div data-tour="properties-list" data-focus="list">
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
                    {t("properties.list.col.objekt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="gesellschaft"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                  >
                    {t("properties.list.col.gesellschaft")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("properties.list.col.verbucht")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="createdAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[120px]"
                  >
                    {t("properties.list.col.createdAt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="updatedAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[130px]"
                  >
                    {t("properties.list.col.updatedAt")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ property: o, companies, total, count }) => (
                  <TableRow
                    key={o.id}
                    className={cn("cursor-pointer", o.deleted_at && "opacity-60")}
                    onClick={() => config.openProperty(o.code)}
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span className="font-mono">{o.code}</span>
                        {o.name ? <span className="font-sans">{o.name}</span> : null}
                        <PropertyFeatures property={o} config={config} />
                      </div>
                      {o.address ? (
                        <div className="text-xs text-muted-foreground">{o.address}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <CompanyCells companies={companies} ready={assignment.ready} />
                    </TableCell>
                    <TableCell>
                      <InvoiceSummaryCell
                        count={count}
                        amount={total}
                        formatAmount={formatEUR}
                        formatCount={(count) => t("properties.list.belegeCount", { count })}
                        loading={!totalsReady}
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
                      {t("properties.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Below `sm`, cards replace the 5-column table entirely rather than relying on any
              horizontal scroll. Same click-through to the detail page as the table row. */}
          <div className="mt-4 space-y-3 sm:hidden">
            {rows.map(({ property: o, companies, total, count }) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => config.openProperty(o.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") config.openProperty(o.code);
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
                      <PropertyFeatures property={o} config={config} />
                    </div>
                    {o.address ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{o.address}</div>
                    ) : null}
                  </div>
                  <InvoiceSummaryCell
                    className="shrink-0"
                    count={count}
                    amount={total}
                    formatAmount={formatEUR}
                    formatCount={(count) => t("properties.list.belegeCount", { count })}
                    loading={!totalsReady}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <CompanyCells companies={companies} ready={assignment.ready} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>
                    {t("properties.list.col.createdAt")}: {formatDate(o.created_at)}
                  </span>
                  <span>
                    {t("properties.list.col.updatedAt")}: {formatDate(o.updated_at ?? o.created_at)}
                  </span>
                </div>
              </div>
            ))}
            {view.total === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {t("properties.list.empty")}
              </p>
            )}
          </div>
        </div>
      )}

      {!propertiesQ.isError && !propertiesQ.isLoading && view.total > 0 && (
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
function PropertyFeatures({
  property,
  config,
}: {
  property: PropertyData;
  config: PropertiesConfig;
}) {
  const { t } = useTranslation();
  return (
    <>
      {config.masterDataCheck &&
        !property.deleted_at &&
        needsMasterDataReview(property.reviewed_at) && (
          <span
            className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 font-sans text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            title={t("properties.list.pruefenTitle")}
          >
            {t("properties.list.pruefenBadge")}
          </span>
        )}
      {config.ownership && property.ownership_type === "client" && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground">
          {t("properties.eigentum.client")}
        </span>
      )}
      {config.archiving && property.deleted_at && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          {t("properties.list.archiviert")}
        </span>
      )}
    </>
  );
}

/** The company column: chips once known, a skeleton while it is not, never a fabricated blank. */
function CompanyCells({ companies, ready }: { companies: PropertyCompany[]; ready: boolean }) {
  if (!ready) return <Skeleton className="h-5 w-16" />;
  if (companies.length === 0) return <CompanyChip code={null} />;
  return (
    <div className="flex flex-wrap gap-1">
      {companies.map((c) => (
        <CompanyChip key={c.code} code={c.code} />
      ))}
    </div>
  );
}

function NewPropertyDialog({
  config,
  initialCode,
}: {
  config: PropertiesConfig;
  initialCode?: string;
}) {
  const { t } = useTranslation();
  const create = useCreateProperty();
  // The list this dialog sits on is already loaded, so the duplicate check costs no extra request.
  // Archived properties are included on purpose: the code stays taken while archived (the unique
  // index does not care about deleted_at), so offering it would produce a rejection nobody could
  // act on from this screen.
  const propertiesQ = useProperties();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [vatStatus, setVatStatus] = useState("__none");
  const [ownership, setOwnership] = useState<NonNullable<PropertyData["ownership_type"]>>("own");
  const [error, setError] = useState<Record<string, string>>({});

  const assignedCodes = useMemo(
    () => new Set((propertiesQ.data ?? []).map((o) => o.code.toLocaleLowerCase())),
    [propertiesQ.data],
  );

  // Deep link (?neu=<code>): open pre-filled with the code, then consume the param so it doesn't
  // reopen on re-render / back navigation.
  useEffect(() => {
    if (!initialCode) return;
    setCode(initialCode);
    setOpen(true);
    config.discardNewParam();
  }, [initialCode, config]);

  function reset() {
    setCode("");
    setName("");
    setAddress("");
    setVatStatus("__none");
    setOwnership("own");
    setError({});
    config.createField?.reset();
  }

  function submit() {
    // Validate through the shared schema so the dialog can point at the offending field instead of
    // firing a toast that vanishes without ever saying which input was wrong.
    const parsed = propertySchema(t, assignedCodes).safeParse({ code });
    if (!parsed.success) {
      setError(fieldError(parsed.error));
      return;
    }
    setError({});
    create.mutate(
      {
        code: parsed.data.code,
        name: name.trim() || null,
        address: address.trim() || null,
        vat_status: vatStatus === "__none" ? null : vatStatus,
        // Only sent where the column exists. The cast is the seam between this shared screen and a
        // Hub's own insert type, which is narrower on a Hub without the column.
        ...(config.ownership ? { ownership_type: ownership } : {}),
      } as Parameters<typeof create.mutate>[0],
      {
        onSuccess: async (created) => {
          // The Hub's own relation is written after the row exists, because it needs the new id.
          // A failure here is reported and the dialog stays open: the property was created, so
          // closing on a silent error would leave it in the state this field exists to prevent.
          try {
            await config.createField?.save(created.id);
          } catch (e) {
            toast.error(t("properties.list.toast.anlegenFehlgeschlagen", { error: errorText(e) }));
            return;
          }
          toast.success(t("properties.list.toast.angelegt"));
          reset();
          setOpen(false);
        },
        onError: (e) =>
          toast.error(t("properties.list.toast.anlegenFehlgeschlagen", { error: errorText(e) })),
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
          setError({});
          config.createField?.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full gap-2 sm:w-auto">
          <Plus className="size-4" /> {t("properties.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("properties.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("properties.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("properties.list.neu.codeLabel")} <RequiredStern />
            </Label>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                // Clear the error as soon as the field is touched, so it goes away when it is
                // addressed rather than lingering until the next submit.
                setError((prev) => (prev.code ? { ...prev, code: "" } : prev));
              }}
              placeholder={t("properties.list.neu.codePlaceholder")}
              aria-invalid={!!error.code}
            />
            <FieldErrorText text={error.code} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("properties.list.neu.nameLabel")}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("properties.list.neu.namePlaceholder")}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              {t("properties.list.neu.adresseLabel")}
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("properties.list.neu.adressePlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("properties.list.neu.ustStatusLabel")}
            </Label>
            <Combobox
              value={vatStatus}
              onValueChange={setVatStatus}
              placeholder="—"
              options={[
                { value: "__none", label: t("properties.ohne") },
                ...VAT_STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: t(`properties.ustStatus.${s}`),
                })),
              ]}
            />
          </div>
          {/* Collected up front rather than left to an immediate follow-up edit -- the same reason
              the company dialog takes its whole field set. Third-party managed properties are
              pass-through costs, so getting this wrong at creation misstates the books. */}
          {config.ownership && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("properties.detail.field.eigentum")}
              </Label>
              <Combobox
                value={ownership}
                onValueChange={(v) =>
                  setOwnership(v as NonNullable<PropertyData["ownership_type"]>)
                }
                options={OWNERSHIP_OPTIONS.map((o) => ({
                  value: o,
                  label: t(`properties.eigentum.${o}`),
                }))}
              />
            </div>
          )}
          {config.createField && <div className="sm:col-span-2">{config.createField.node}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("properties.list.neu.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending || !!config.createField?.incomplete}>
            {create.isPending ? t("properties.list.neu.anlege") : t("properties.list.neu.anlegen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
