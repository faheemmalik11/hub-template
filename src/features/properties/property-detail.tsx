import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Combobox,
  CopyButton,
  dateLocale,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorState,
  FactList,
  errorText,
  formatDate,
  formatDateTime,
  formatEUR,
  CompanyChip,
  Input,
  Label,
  needsMasterDataReview,
  SectionSkeleton,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useArchiveProperty,
  useDocumentsForPropertyPages,
  useFetchNextSentinel,
  useSuppliers,
  usePropertyDocumentAggregate,
  useProperties,
  usePropertyCompanyIndex,
  useTranslation,
  useUnarchiveProperty,
  useUpdateProperty,
  VatBadge,
  usePeriodOptions,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  periodArea,
  PeriodPicker,
} from "./adapter";
import type { Fact } from "./adapter";
import type { PropertyData, PropertyAssignment, PropertiesConfig } from "./config";

// "Gesamt" in the shared period vocabulary. The picker's whole option list is fixed and shared now
// (see `zeitraum-optionen`), so this screen no longer derives months and years from its own rows.
const ALL_PERIODS = PERIOD_ALL;
const VAT_STATUS_OPTIONS = ["taxable", "exempt", "gemischt"] as const;
const OWNERSHIP_OPTIONS = ["own", "client"] as const;

type OForm = {
  name: string;
  address: string;
  vat_status: string;
  drive_folder_url: string;
  ownership_type: string;
};

function oFormFrom(o: PropertyData): OForm {
  return {
    name: o.name ?? "",
    address: o.address ?? "",
    vat_status: o.vat_status ?? "__none",
    drive_folder_url: o.drive_folder_url ?? "",
    ownership_type: o.ownership_type ?? "own",
  };
}

export function PropertyDetail({ code, config }: { code: string; config: PropertiesConfig }) {
  const { t } = useTranslation();
  const propertiesQ = useProperties();
  const suppliersQ = useSuppliers();
  const assignment = usePropertyCompanyIndex();

  // Typed as the shared shape, not the Hub's own Objekt: the optional fields below are read
  // through the capability flags, and a Hub whose table lacks a column must still compile.
  const property = useMemo<PropertyData | null>(
    () => (propertiesQ.data ?? []).find((o) => o.code === code) ?? null,
    [propertiesQ.data, code],
  );

  const [period, setPeriod] = useState(ALL_PERIODS);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const range = useMemo(() => periodArea(period, fromDate, toDate), [period, fromDate, toDate]);
  const periodOptions = usePeriodOptions();

  /**
   * The invoice table, fetched a page at a time as the reader scrolls.
   *
   * This screen used to pull EVERY invoice on the property in one request and then window the array
   * in the browser, which made it feel paginated while the request behind it still fetched the lot.
   * The period is part of the query too, so picking a quarter narrows what the server sends instead
   * of hiding most of what it already sent.
   */
  const documentsQ = useDocumentsForPropertyPages(
    property?.id ?? null,
    code,
    range,
    !propertiesQ.isLoading,
  );
  const documents = useMemo(
    () => (documentsQ.data?.pages ?? []).flatMap((page) => page.rows),
    [documentsQ.data],
  );
  // The server's exact count for the current period, not "how many are loaded so far".
  const documentsTotal = documentsQ.data?.pages[0]?.total ?? 0;
  const documentsReady = documentsQ.data !== undefined;
  const sentinelRef = useFetchNextSentinel(
    documentsQ.hasNextPage,
    documentsQ.isFetchingNextPage,
    documentsQ.fetchNextPage,
  );

  /**
   * The narrow projection every page-level figure is computed from.
   *
   * The header total, the period picker's options and the company-mismatch warning all describe the
   * COMPLETE set, so none of them can come from one page of rows.
   */
  const aggregateQ = usePropertyDocumentAggregate(
    property?.id ?? null,
    code,
    !propertiesQ.isLoading,
  );
  const allDocuments = useMemo(() => aggregateQ.data ?? [], [aggregateQ.data]);
  const totalsReady = aggregateQ.data !== undefined;

  // The same period the rows are fetched for, applied to the aggregate set, so the total in the
  // heading describes exactly the rows underneath it.
  const documentsImPeriod = useMemo(() => {
    if (!range.fromDate && !range.toDate) return allDocuments;
    return allDocuments.filter((b) => {
      if (!b.document_date) return false;
      if (range.fromDate && b.document_date < range.fromDate) return false;
      if (range.toDate && b.document_date > range.toDate) return false;
      return true;
    });
  }, [allDocuments, range]);
  const total = documentsImPeriod.reduce((s, b) => s + (b.amount_gross ?? 0), 0);

  // Memoised, not derived inline: a fresh array on every render makes every useMemo below it
  // recompute every render, which is exactly what the dependency it feeds is there to avoid.
  const companies = useMemo(
    () => (property ? (assignment.byProperty.get(property.id) ?? []) : []),
    [property, assignment.byProperty],
  );
  const assignments: PropertyAssignment[] = property
    ? (assignment.assignmentsByProperty.get(property.id) ?? [])
    : [];

  /**
   * An invoice booked to this property, but to a company this property is not assigned to.
   *
   * Confirmed live on this Hub: one invoice carries company_code IMKO while its property GRSC12 is
   * assigned only to IMGM, so IMKO's books include a cost that, per the official assignment, is not
   * theirs. Nothing on either the property page or the company page compared the two, so the drift
   * was invisible from both ends.
   *
   * Deliberately silent when the property has NO assignment at all: that is a different (and much
   * more common) state, and flagging those would mark almost every row on some Hubs, which is noise
   * rather than a finding. This warns only where an explicit assignment exists and the invoice
   * disagrees with it.
   *
   * Counted over the aggregate set, not the loaded page: a warning that grows as you scroll is
   * describing the scroll position rather than the property.
   */
  const assignedCodes = useMemo(() => new Set(companies.map((c) => c.code)), [companies]);
  const companyMatchesNot = (documentCompanyCode: string | null | undefined) =>
    !!documentCompanyCode && assignedCodes.size > 0 && !assignedCodes.has(documentCompanyCode);
  const differingDocuments = documentsImPeriod.filter((b) =>
    companyMatchesNot(b.company_code),
  ).length;

  const supplierById = useMemo(
    () => new Map((suppliersQ.data ?? []).map((l) => [l.id, l])),
    [suppliersQ.data],
  );
  const issuerName = (id: string | null, fallback: string | null) =>
    (id ? supplierById.get(id)?.name : null) ?? fallback ?? "—";

  const updateO = useUpdateProperty(property?.id ?? "");
  const archiveO = useArchiveProperty(property?.id ?? "");
  const unarchiveO = useUnarchiveProperty(property?.id ?? "");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<OForm | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const f = form ?? (property ? oFormFrom(property) : null);
  const setF = (k: keyof OForm, v: string) =>
    setForm((prev) => ({ ...(prev ?? (property ? oFormFrom(property) : ({} as OForm))), [k]: v }));

  function cancel() {
    setForm(null);
    setEdit(false);
  }

  function save() {
    if (!property || !f) return;
    const changes: Partial<PropertyData> = {};
    const name = f.name.trim() || null;
    const address = f.address.trim() || null;
    const vatStatus = f.vat_status === "__none" ? null : f.vat_status;
    if (name !== (property.name ?? null)) changes.name = name;
    if (address !== (property.address ?? null)) changes.address = address;
    if (vatStatus !== (property.vat_status ?? null)) changes.vat_status = vatStatus;
    // The two optional fields are only ever written where the column exists. Their inputs are not
    // rendered otherwise, so `f` still carries the empty default and writing it would clear a
    // column that is not there.
    if (config.driveFolder) {
      const driveFolderUrl = f.drive_folder_url.trim() || null;
      if (driveFolderUrl !== (property.drive_folder_url ?? null))
        changes.drive_folder_url = driveFolderUrl;
    }
    if (config.ownership && f.ownership_type !== property.ownership_type) {
      changes.ownership_type = f.ownership_type as PropertyData["ownership_type"];
    }
    if (Object.keys(changes).length === 0) {
      toast.info(t("properties.detail.toast.keineAenderungen"));
      setEdit(false);
      return;
    }
    // The cast is the seam between this shared screen and a Hub's own update type, which is
    // narrower on a Hub without the optional columns.
    updateO.mutate(changes as Parameters<typeof updateO.mutate>[0], {
      onSuccess: () => {
        toast.success(t("properties.detail.toast.gespeichert"));
        setForm(null);
        setEdit(false);
      },
      onError: (e) =>
        toast.error(t("properties.detail.toast.speichernFehlgeschlagen", { error: errorText(e) })),
    });
  }

  if (documentsQ.isError) {
    return <ErrorState error={documentsQ.error} onRetry={() => documentsQ.refetch()} />;
  }

  // Label above value, one under the other, the same list the supplier and company pages read their
  // master data from.
  const masterData: Fact[] = property
    ? [
        {
          label: t("properties.detail.field.code"),
          value: property.code,
          mono: true,
          node: (
            <span className="inline-flex items-center gap-1 font-mono">
              {property.code}
              <CopyButton value={property.code} label={t("properties.detail.field.code")} />
            </span>
          ),
        },
        { label: t("properties.detail.field.name"), value: property.name },
        { label: t("properties.detail.field.adresse"), value: property.address, wide: true },
        {
          label: t("properties.detail.field.ustStatus"),
          value: property.vat_status
            ? t(`properties.ustStatus.${property.vat_status}`, {
                defaultValue: property.vat_status,
              })
            : null,
        },
        ...(config.ownership
          ? [
              {
                label: t("properties.detail.field.eigentum"),
                value: t(`properties.eigentum.${property.ownership_type ?? "own"}`),
              },
            ]
          : []),
        ...(config.driveFolder
          ? [
              {
                label: t("properties.detail.field.driveFolder"),
                value: property.drive_folder_url,
                wide: true,
                node: property.drive_folder_url ? (
                  <a
                    href={property.drive_folder_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
                  >
                    {t("properties.detail.action.ordnerOeffnen")}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : undefined,
              },
            ]
          : []),
      ]
    : [];

  const backClasses =
    "inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
  const backContent = (
    <>
      <ArrowLeft className="size-4" /> {t("properties.detail.back")}
    </>
  );

  return (
    <div>
      {/* A real link where the Hub supplies one, so it can be middle-clicked and opened in a new
          tab; a button otherwise, which still navigates. */}
      {config.backLink ? (
        config.backLink({ className: backClasses, children: backContent })
      ) : (
        <button type="button" onClick={() => config.openList()} className={backClasses}>
          {backContent}
        </button>
      )}

      <div
        data-tour="property-detail-header"
        className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-wash text-brand-dark">
            <Building2 className="size-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <SelectableUnit className="font-mono">{code}</SelectableUnit>
            {property?.name ? (
              <SelectableUnit className="ml-2 font-sans">{property.name}</SelectableUnit>
            ) : null}
          </h1>
          {/* Skeleton rather than nothing: an empty chip row on a property that HAS companies is a
              wrong answer shown before anything was known. */}
          {!assignment.ready ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            companies.map((c) => <CompanyChip key={c.code} code={c.code} />)
          )}
        </div>
        {property && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              onClick={() => {
                setForm(oFormFrom(property));
                setEdit(true);
              }}
              className="gap-2"
            >
              <Pencil className="size-4" /> {t("properties.detail.action.bearbeiten")}
            </Button>
            {/* The destructive action moved into a menu, matching the company page: it was a
                full-width red button sitting beside Edit, given the same weight as the thing
                people actually come here to do.

                Rendered only when it would actually contain something. Every item behind it is
                gated on a capability, so on a Hub with no archive and no Drive folder the trigger
                was still drawn and opened an empty popover. */}
            {(config.archiving || (config.driveFolder && !!property.drive_folder_url)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("properties.detail.action.mehr")}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-auto min-w-56 [&_[role=menuitem]]:whitespace-nowrap"
                >
                  {config.driveFolder && property.drive_folder_url && (
                    <>
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <a href={property.drive_folder_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />{" "}
                          {t("properties.detail.action.ordnerOeffnen")}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {/* An archived property offers the opposite action rather than a second archive.
                    A Hub without the column gets neither: there is nothing to archive to. */}
                  {!config.archiving ? null : property.deleted_at ? (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={unarchiveO.isPending}
                      onSelect={() =>
                        unarchiveO.mutate(undefined, {
                          onSuccess: () =>
                            toast.success(t("properties.detail.toast.wiederhergestellt")),
                          onError: (e) =>
                            toast.error(
                              t("properties.detail.toast.speichernFehlgeschlagen", {
                                error: errorText(e),
                              }),
                            ),
                        })
                      }
                    >
                      <RotateCcw className="size-4" />{" "}
                      {t("properties.detail.action.wiederherstellen")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive focus:text-destructive"
                      onSelect={() => setArchiveOpen(true)}
                    >
                      <Archive className="size-4" /> {t("properties.detail.action.archivieren")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Driven by state and rendered OUTSIDE the menu on purpose: selecting a menu item closes the
          menu, which would unmount a trigger rendered inside it before it could open anything. */}
      {config.archiving && (
        <AlertDialog
          open={archiveOpen}
          onOpenChange={(o) => {
            setArchiveOpen(o);
            if (!o) setArchiveReason("");
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("properties.detail.archiveDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("properties.detail.archiveDialog.desc")}
                {totalsReady && allDocuments.length > 0
                  ? " " +
                    t("properties.detail.archiveDialog.mitBelegen", { count: allDocuments.length })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder={t("properties.detail.archiveDialog.grundPlaceholder")}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>{t("properties.detail.action.abbrechen")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={!archiveReason.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  archiveO.mutate(archiveReason.trim(), {
                    onSuccess: () => {
                      toast.success(t("properties.detail.toast.archiviert"));
                      setArchiveReason("");
                    },
                    onError: (e) =>
                      toast.error(
                        t("properties.detail.toast.speichernFehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  })
                }
              >
                {t("properties.detail.archiveDialog.bestaetigen")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {config.archiving && property?.deleted_at && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t("properties.detail.archivedNotice", {
            reason:
              property.delete_reason?.trim() || t("properties.detail.archivedNoticeOhneGrund"),
          })}
        </div>
      )}

      {config.masterDataCheck &&
        property &&
        !property.deleted_at &&
        needsMasterDataReview(property.reviewed_at) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <TriangleAlert className="size-4 shrink-0" />
              {t("properties.detail.reviewBanner", { datum: formatDateTime(property.reviewed_at) })}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-400 bg-white hover:bg-amber-100 dark:bg-transparent"
              disabled={updateO.isPending}
              onClick={() =>
                updateO.mutate(
                  // Same seam as in speichern(): only reached where the column exists, and cast
                  // because a Hub without it has a narrower update type.
                  { reviewed_at: new Date().toISOString() } as Parameters<typeof updateO.mutate>[0],
                  { onSuccess: () => toast.success(t("properties.detail.toast.geprueft")) },
                )
              }
            >
              <CheckCircle2 className="size-4" /> {t("properties.detail.action.nochKorrekt")}
            </Button>
          </div>
        )}

      {/* Explicit columns rather than letting a 2-column grid flow: with several cards on the left,
          grid rows would align each one against the invoice list and leave gaps wherever the two
          sides disagree on height. */}
      <div data-tour="property-detail-content" className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {propertiesQ.isLoading ? (
            <SectionSkeleton className="h-72" />
          ) : !property ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <p>
                {t("properties.detail.notInStammBefore")}
                <span className="font-mono">{code}</span>
                {t("properties.detail.notInStammAfter")}
              </p>
              {/* The text told you to go create it and then left you to find the way there
                  yourself. The list page already accepts `?neu=<code>` and opens its create dialog
                  pre-filled with exactly this code, which is the mechanism it was describing. */}
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => config.openNew(code)}>
                <Plus className="size-4" /> {t("properties.detail.action.jetztAnlegen")}
              </Button>
            </div>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("properties.detail.section.stammdaten")}
              </h2>
              <FactList facts={masterData} columns={2} />
              <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-border/60 pt-3.5">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("properties.detail.field.erstellt")}
                  </dt>
                  <dd className="mt-0.5 text-base text-foreground">
                    {formatDate(property.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("properties.detail.field.aktualisiert")}
                  </dt>
                  <dd className="mt-0.5 text-base text-foreground">
                    {formatDate(property.updated_at ?? property.created_at)}
                  </dd>
                </div>
              </div>
            </section>
          )}

          {/* Its own card rather than a block inside Stammdaten: these assignments read differently
              from master data, and on some Hubs they are not even editable from here. */}
          {property && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("properties.detail.section.gesellschaften")}
                </h2>
                {config.assignmentAction?.(property)}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("properties.detail.gesellschaftenHint")}
              </p>
              {config.assignmentEditor ? (
                config.assignmentEditor(property)
              ) : !assignment.ready ? (
                <SectionSkeleton className="h-20" />
              ) : assignments.length === 0 ? (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  {t("properties.detail.gesellschaftenEmpty")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {assignments.map((z) => (
                    <div
                      key={z.id}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
                    >
                      {z.area && config.openArea ? (
                        <button
                          type="button"
                          // Names the row being followed, so the business line page can light it up
                          // instead of dropping you into a table with no sense of where you landed.
                          onClick={() => config.openArea?.(z.area!.code, z.id)}
                          className="min-w-[7rem] cursor-pointer text-left text-xs font-medium text-brand underline-offset-4 hover:underline"
                        >
                          {z.area.name}
                        </button>
                      ) : z.area ? (
                        <span className="min-w-[7rem] text-xs font-medium text-foreground">
                          {z.area.name}
                        </span>
                      ) : null}
                      {/* Leads to the company, the same way the company page's rows lead back to
                          the property. Both sides of the relation are reachable from either end. */}
                      {z.company ? (
                        <button
                          type="button"
                          disabled={!config.openCompany || !z.company.id}
                          onClick={() => z.company?.id && config.openCompany?.(z.company.id)}
                          className={cn(
                            "inline-flex items-center gap-2 text-left",
                            config.openCompany && z.company.id
                              ? "cursor-pointer hover:underline"
                              : "cursor-default",
                          )}
                        >
                          <CompanyChip code={z.company.code} />
                          <span className="text-xs text-muted-foreground">{z.company.name}</span>
                        </button>
                      ) : (
                        <CompanyChip code={null} />
                      )}
                      {/* The cost-centre number this property carries IN THIS COMPANY. It sits on
                          the assignment because the same building is numbered differently per
                          company, which is the whole reason this row exists rather than a single
                          number on the property. A Hub that does not number cost centres passes
                          undefined and nothing renders. */}
                      {z.costCentre !== undefined && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {z.costCentre != null
                            ? t("properties.detail.kostenstelle", { nr: z.costCentre })
                            : t("properties.detail.kostenstelleFehlt")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {config.assignmentHint && (
                <div className="mt-3 text-xs text-muted-foreground">{config.assignmentHint}</div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {/* The section is ALWAYS rendered, with its heading, its period picker and its table
              header, even when the property has nothing booked. Replacing the whole block with a
              bare "no invoices" box made the controls disappear along with the rows, so a period
              that happened to be empty read as a missing feature rather than as an empty period. */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {/* Count and total sit ON the heading line. As a tinted tile underneath they were a
                  box competing with the table for the eye, for two numbers that are a subtitle. */}
              <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("properties.detail.section.verbucht")}
                {/* Count and total come from two different queries -- the count from the paged row
                    query's exact count, the sum from the aggregate projection -- so they are gated
                    separately rather than one publishing the other's zero. */}
                {documentsReady ? (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("properties.detail.belegeCount", { count: documentsTotal })}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
                {totalsReady ? (
                  <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                    {formatEUR(total)}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </h2>
              {/* One control: the period list turns into the range calendar in place. */}
              <PeriodPicker
                value={period}
                onValueChange={(v) => setPeriod(v)}
                fromDate={fromDate}
                toDate={toDate}
                onRangeApply={(fromDateNew, toDateNew) => {
                  setFromDate(fromDateNew);
                  setToDate(toDateNew);
                }}
                locale={dateLocale()}
                formatDay={(iso) => formatDate(iso)}
                backLabel={t("home.zeitraumAktion.zurueck")}
                placeholder={t("documents.list.filter.zeitraum")}
                ariaLabel={t("documents.list.filter.zeitraum")}
                className="w-full sm:w-[190px]"
                rangeLabels={{
                  placeholder: t("documents.list.filter.zeitraumWaehlen"),
                  reset: t("documents.list.filter.zeitraumZuruecksetzen"),
                  apply: t("documents.list.filter.zeitraumAnwenden"),
                  previousMonth: t("documents.list.filter.monatZurueck"),
                  nextMonth: t("documents.list.filter.monatVor"),
                  pickSecond: t("documents.list.filter.zweitesDatum"),
                }}
                options={periodOptions}
                customValue={PERIOD_CUSTOM}
              />
            </div>

            {totalsReady && differingDocuments > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs">
                  {t("properties.detail.gesellschaftAbweichung", {
                    count: differingDocuments,
                    companies: companies.map((c) => c.code).join(", "),
                  })}
                </p>
              </div>
            )}

            <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
              {/* Capped and scrolled rather than left to grow: the card sits in a grid row, so an
                  unbounded table drags the whole page height with it. The header cells are sticky
                  and carry their own solid background -- on the row alone the tint is translucent
                  and scrolled rows show through. */}
              <Table containerClassName="max-h-[26rem]">
                <TableHeader>
                  <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                    <TableHead>{t("properties.detail.col.steller")}</TableHead>
                    <TableHead>{t("properties.detail.col.ges")}</TableHead>
                    <TableHead>{t("properties.detail.col.datum")}</TableHead>
                    <TableHead>{t("properties.detail.col.ust")}</TableHead>
                    <TableHead className="text-right">
                      {t("properties.detail.col.betrag")}
                    </TableHead>
                    <TableHead>{t("properties.detail.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer"
                      onClick={() => config.openDocument(b.id)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {issuerName(b.supplier_id, b.issuer)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.invoice_number ?? t("properties.detail.ohneNr")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <CompanyChip code={b.company_code} />
                          {companyMatchesNot(b.company_code) && (
                            <span title={t("properties.detail.gesellschaftAbweichungZeile")}>
                              <TriangleAlert
                                className="size-3.5 shrink-0 text-amber-600"
                                aria-label={t("properties.detail.gesellschaftAbweichungZeile")}
                              />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDate(b.document_date)}
                      </TableCell>
                      <TableCell>
                        <VatBadge vatRate={b.vat_rate} tax={b.tax} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatEUR(b.amount_gross)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!documentsReady &&
                    [0, 1, 2].map((i) => (
                      <TableRow key={`beleg-skeleton-${i}`}>
                        <TableCell colSpan={6} className="py-3">
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {documentsReady && documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {allDocuments.length === 0
                          ? t("properties.detail.noBelege")
                          : t("properties.detail.noBelegeZeitraum")}
                      </TableCell>
                    </TableRow>
                  )}
                  {documentsQ.hasNextPage && (
                    <TableRow ref={sentinelRef}>
                      <TableCell
                        colSpan={99}
                        className="py-3 text-center text-xs text-muted-foreground"
                      >
                        {t("loadMore.rest", { count: documentsTotal - documents.length })}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: one card per invoice instead of a 6-column table. Renders the SAME paged
                rows as the table -- it used to render every fetched invoice, so the infinite scroll
                above it was doing nothing here. */}
            <div className="space-y-3 sm:hidden">
              {documents.map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-lg border border-border p-3"
                  onClick={() => config.openDocument(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") config.openDocument(b.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {issuerName(b.supplier_id, b.issuer)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.invoice_number ?? t("properties.detail.ohneNr")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                      {formatEUR(b.amount_gross)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CompanyChip code={b.company_code} />
                    {companyMatchesNot(b.company_code) && (
                      <TriangleAlert
                        className="size-3.5 shrink-0 text-amber-600"
                        aria-label={t("properties.detail.gesellschaftAbweichungZeile")}
                      />
                    )}
                    <VatBadge vatRate={b.vat_rate} tax={b.tax} />
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formatDate(b.document_date)}
                  </div>
                </div>
              ))}
              {!documentsReady && <SectionSkeleton className="h-40" />}
              {documentsReady && documents.length === 0 && (
                <p className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  {allDocuments.length === 0
                    ? t("properties.detail.noBelege")
                    : t("properties.detail.noBelegeZeitraum")}
                </p>
              )}
              {documentsQ.hasNextPage && (
                <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                  {t("loadMore.rest", { count: documentsTotal - documents.length })}
                </div>
              )}
            </div>
          </section>
          {/* Under the invoice table, not beside the master data: the spellings are what routes a
              document to this property, so they read as context for the documents rather than as
              another master-data field. Same position as on the company page. */}
          {config.spellings?.(code)}
        </div>
      </div>

      <Dialog open={edit} onOpenChange={(o) => (o ? undefined : cancel())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("properties.detail.editTitle")}</DialogTitle>
            <DialogDescription>{t("properties.detail.editDesc")}</DialogDescription>
          </DialogHeader>
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {t("properties.detail.field.name")}
                </Label>
                <Input value={f.name} onChange={(e) => setF("name", e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {t("properties.detail.field.adresse")}
                </Label>
                <Input value={f.address} onChange={(e) => setF("address", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("properties.detail.field.ustStatus")}
                </Label>
                <Combobox
                  value={f.vat_status}
                  onValueChange={(v) => setF("vat_status", v)}
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
              {config.ownership && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("properties.detail.field.eigentum")}
                  </Label>
                  <Combobox
                    value={f.ownership_type}
                    onValueChange={(v) => setF("ownership_type", v)}
                    options={OWNERSHIP_OPTIONS.map((o) => ({
                      value: o,
                      label: t(`properties.eigentum.${o}`),
                    }))}
                  />
                </div>
              )}
              {config.driveFolder && (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("properties.detail.field.driveFolder")}
                  </Label>
                  <Input
                    value={f.drive_folder_url}
                    onChange={(e) => setF("drive_folder_url", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancel}>
              {t("properties.detail.action.abbrechen")}
            </Button>
            <Button onClick={save} disabled={updateO.isPending}>
              {updateO.isPending
                ? t("properties.detail.action.speichere")
                : t("properties.detail.action.speichern")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Text that a double-click selects in full, on its own.
 *
 * The heading runs the code straight into the name with only a margin between them, no whitespace,
 * so the browser's own double-click reads "BEDO27Musterhaus" as a single word and selects both. A
 * space would not fix it either: double-click then takes one word, so a two-word name still cannot
 * be selected whole. Copying just the code, which is the thing people paste into DATEV and into a
 * search box, was not possible in either case.
 *
 * Selecting the node's contents explicitly makes each part its own unit: double-click the code and
 * you get the code, double-click the name and you get all of it however many words it runs to.
 * Single click and drag-selection are left alone, which `user-select: all` would not do.
 */
function SelectableUnit({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={className}
      onDoubleClick={(e) => {
        const selection = window.getSelection();
        if (!selection) return;
        const area = document.createRange();
        area.selectNodeContents(e.currentTarget);
        selection.removeAllRanges();
        selection.addRange(area);
      }}
    >
      {children}
    </span>
  );
}
