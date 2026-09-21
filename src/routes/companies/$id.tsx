import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  MoreVertical,
  Pencil,
  RotateCcw,
  Plus,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AssignmentDialog } from "@/components/properties/assignment-dialog";
import { KnownSpellingsCard } from "@/components/master-data/known-spellings-card";

import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldErrorText, RequiredStern } from "@/components/ui/form-field";
import { fieldError, companySchema } from "@/lib/forms/company-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDocumentsForCompanyPages,
  useCompanyDocumentAggregate,
  useCompany,
  useCompanies,
  useRestoreCompany,
  useSoftDeleteCompany,
  useProperties,
  usePropertyCompanies,
  useUpdateCompany,
  useFilingFolders,
  useRemovePropertyCompanyLink,
} from "@/data";
import { useAuth } from "@/lib/auth";
import { dateLocale, errorText, formatDate, formatEUR } from "@/lib/data/format";
import { StatusBadge } from "@/components/documents/badges";
import { ErrorState } from "@/components/documents/query-states";
import { FactList, type Fact } from "@/components/records/fact-list";
import { SectionSkeleton } from "@/components/records/section-skeleton";
import { PeriodPicker } from "@/components/data-table/period-picker";
import {
  usePeriodOptions,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";
import { useFetchNextSentinel } from "@/lib/use-fetch-next-sentinel";
import { useTranslation } from "@/lib/i18n";
import type { Company, PropertyCompany } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";
import { FolderTreePicker } from "@/components/inbox/folder-tree-picker";

export const Route = createFileRoute("/companies/$id")({
  head: () => ({ meta: [{ title: pageTitle("Gesellschaft") }] }),
  component: CompanyDetailPage,
});

const AREA_LEER = "__none";
// "Gesamt" in the shared period vocabulary. The option list is fixed and shared now (see
// `zeitraum-optionen`), so this screen no longer derives months, quarters and years from its own
// rows -- the same nine presets appear on every screen that has a period picker.
const ALL_PERIODS = PERIOD_ALL;

type GForm = {
  code: string;
  name: string;
  area: string;
  bookingBasis: NonNullable<Company["booking_basis"]>;
  filingFolder: string;
  /** The overhead cost centre as typed. A string so an empty field means "no number". */
  overhead: string;
};

function gFormFrom(g: Company): GForm {
  return {
    code: g.code ?? "",
    name: g.name ?? "",
    area: g.area ?? AREA_LEER,
    // The same fallback the Kostenanalyse applies when the column is NULL (use-bwa-scope.ts), so
    // the form opens showing the rule that is actually in force rather than an empty control.
    bookingBasis: g.booking_basis ?? "payment_date",
    filingFolder: g.filing_folder ?? "",
    overhead: g.overhead_cost_centre != null ? String(g.overhead_cost_centre) : "",
  };
}

function CompanyDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const companyQ = useCompany(id);
  const companyCode = companyQ.data?.code;
  const propertiesQ = useProperties();
  const filingFoldersQ = useFilingFolders();
  const propertyCompaniesQ = usePropertyCompanies();
  const allCompaniesQ = useCompanies();
  const updateG = useUpdateCompany(id);
  const archiveG = useSoftDeleteCompany(id);
  const restoreG = useRestoreCompany(id);

  const [archiveReason, setArchiveReason] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { user } = useAuth();
  const removeProperty = useRemovePropertyCompanyLink();
  // The assignment modal, shared with the property page: add a property, or edit one row.
  const [assignmentDialog, setAssignmentDialog] = useState<{ link: PropertyCompany | null } | null>(
    null,
  );
  // The property whose assignment to this company is about to be removed, for the confirm dialog.
  const [propertyRemove, setPropertyRemove] = useState<{
    linkId: string;
    code: string;
    name: string | null;
    lastCompany: boolean;
  } | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<GForm | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState(ALL_PERIODS);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const company = companyQ.data ?? null;

  const range = useMemo(() => periodArea(period, fromDate, toDate), [period, fromDate, toDate]);
  const periodOptions = usePeriodOptions();

  /**
   * The invoice table, fetched a page at a time as the reader scrolls.
   *
   * The period is part of the query, not a filter applied to rows that were fetched anyway, so
   * picking a quarter narrows what the server sends instead of hiding most of what it already sent.
   */
  const documentsQ = useDocumentsForCompanyPages(id, companyCode, range, !companyQ.isLoading);
  const documents = useMemo(
    () => (documentsQ.data?.pages ?? []).flatMap((page) => page.rows),
    [documentsQ.data],
  );
  // The server's exact count for the current period, not "how many are loaded so far".
  const documentsTotal = documentsQ.data?.pages[0]?.total ?? 0;
  const sentinelRef = useFetchNextSentinel(
    documentsQ.hasNextPage,
    documentsQ.isFetchingNextPage,
    documentsQ.fetchNextPage,
  );

  /**
   * The narrow projection every page-level figure is computed from.
   *
   * The header total, the period picker's options and the foreign-property warning all describe the
   * COMPLETE set, so none of them can be derived from one page of rows. This carries five scalar
   * columns for that purpose and nothing else -- see BELEG_AGGREGAT_SPALTEN in queries.ts, and the
   * note there about what it would take to push it into Postgres.
   */
  const aggregateQ = useCompanyDocumentAggregate(id, companyCode, !companyQ.isLoading);
  const allDocuments = useMemo(() => aggregateQ.data ?? [], [aggregateQ.data]);

  // The periods the picker can offer, derived from the company's own invoices rather than from a
  // fixed calendar: a company with two years of documents should not be offered five.
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
  // This screen is gated on gesellschaftQ only, which resolves quickly, so the invoice section can
  // render before its own queries land. Tracked separately so the empty state is only ever shown
  // once it is actually true, rather than claiming this company has nothing while the rows are
  // still in flight.
  const documentsReady = documentsQ.data !== undefined;
  const totalsReady = aggregateQ.data !== undefined;
  // Properties belonging to this company come from property_companies (a property may belong to
  // several companies at once — migration 0083).
  const properties = useMemo(() => {
    const propIds = new Set(
      (propertyCompaniesQ.data ?? []).filter((a) => a.company_id === id).map((a) => a.property_id),
    );
    return (propertiesQ.data ?? []).filter((o) => propIds.has(o.id));
  }, [propertiesQ.data, propertyCompaniesQ.data, id]);
  // Per property: this company's assignment row, and how many companies the property has in all.
  // Removing is refused for a property's last company, the same rule the property page enforces.
  const propertyLinks = useMemo(() => {
    const links = propertyCompaniesQ.data ?? [];
    const map = new Map<
      string,
      { link: PropertyCompany; linkId: string; count: number; number: number | null }
    >();
    for (const link of links) {
      if (link.company_id !== id) continue;
      map.set(link.property_id, {
        link,
        linkId: link.id,
        count: links.filter((l) => l.property_id === link.property_id).length,
        number: link.cost_centre_number,
      });
    }
    return map;
  }, [propertyCompaniesQ.data, id]);
  const propertiesReady = propertiesQ.data !== undefined && propertyCompaniesQ.data !== undefined;

  // The filing folder as a readable path rather than the raw Dropbox id.
  //
  // filing_folder holds a provider id ("id:aBc123…"), which is what the page used to print. That
  // is unreadable, unverifiable and identical in shape for every company, so the one field telling
  // you where this company's documents land said nothing at all. Falls back to the id when the
  // folder list has not loaded or the folder no longer exists, since a stale id is still better
  // than an empty field, and an id that resolves to nothing is itself worth seeing.
  const filingPath = useMemo(() => {
    const folderId = companyQ.data?.filing_folder;
    if (!folderId) return null;
    const byId = new Map((filingFoldersQ.data ?? []).map((f) => [f.id, f]));
    const parts: string[] = [];
    let current = byId.get(folderId);
    // Guarded against a cycle in the provider's parent chain: a malformed list would otherwise
    // walk for ever here.
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.length > 0 ? parts.join(" / ") : folderId;
  }, [companyQ.data?.filing_folder, filingFoldersQ.data]);

  // id -> code, so the mismatch hint can name the company that actually owns the property
  // rather than showing a bare uuid.
  const companyCodeById = useMemo(
    () => new Map((allCompaniesQ.data ?? []).map((g) => [g.id, g.code])),
    [allCompaniesQ.data],
  );

  // Property codes booked against THIS company that belong to a different one.
  //
  // An invoice carries a free-standing `property_code`; nothing checks it against the company the
  // invoice is filed under. On the sibling Immonetz project this silently showed a 930,00 EUR
  // invoice for GRSC12, a property assigned to IMGM -- the wrong company's cost, sitting in this
  // company's total with no hint that anything was off.
  //
  // A property with NO ownership row at all is deliberately NOT flagged: that is "owner not
  // recorded yet", not a mismatch. This project has plenty of those, and flagging them would bury
  // the real signal under noise.
  const foreignProperties = useMemo(() => {
    const owner = new Map<string, Set<string>>();
    for (const a of propertyCompaniesQ.data ?? []) {
      const set = owner.get(a.property_id) ?? new Set<string>();
      set.add(a.company_id);
      owner.set(a.property_id, set);
    }
    const codeZuOwner = new Map<string, string[]>();
    for (const o of propertiesQ.data ?? []) {
      const assigned = owner.get(o.id);
      if (!assigned || assigned.size === 0 || assigned.has(id)) continue;
      codeZuOwner.set(o.code, [...assigned]);
    }
    return codeZuOwner;
  }, [propertyCompaniesQ.data, propertiesQ.data, id]);

  // Over the aggregate set, not the fetched pages: "3 invoices point at another company's
  // property" has to be true of the whole period, not of the first 50 rows someone happens to have
  // scrolled past.
  const foreignDocuments = useMemo(
    () =>
      documentsImPeriod.filter((b) => b.property_code && foreignProperties.has(b.property_code)),
    [documentsImPeriod, foreignProperties],
  );
  const foreignTotal = foreignDocuments.reduce((s, b) => s + (b.amount_gross ?? 0), 0);

  if (companyQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (companyQ.isError) {
    return <ErrorState error={companyQ.error} onRetry={() => companyQ.refetch()} />;
  }
  if (!company) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("companies.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/companies">{t("companies.detail.toList")}</Link>
        </Button>
      </div>
    );
  }
  const g = company;
  const f = form ?? gFormFrom(g);
  const setF = <K extends keyof GForm>(k: K, v: GForm[K]) => {
    setForm((prev) => ({ ...(prev ?? gFormFrom(g)), [k]: v }));
    // Clear a field's error as soon as it is touched, rather than leaving it until the next submit.
    setError((prev) => (prev[k] ? { ...prev, [k]: "" } : prev));
  };

  // Label above value, one under the other, the same list the supplier and invoice detail pages
  // read their master data from.
  const masterData: Fact[] = [
    {
      label: t("companies.detail.field.bereich"),
      value: g.area ? t(`approvalRules.bereich.${g.area}`) : null,
    },
    {
      label: t("companies.detail.field.buchungsbasis"),
      // NULL is shown as the rule that actually applies, not as a blank: the Kostenanalyse falls
      // back to the payment date, so an em dash here would hide a decision that is being made.
      value: t(`companies.buchungsbasis.${g.booking_basis ?? "payment_date"}`),
    },
    // The number every invoice booked to Gemeinkosten in this company carries. Shown rather than
    // hidden when missing, because an empty value here is why those invoices say none is recorded.
    {
      label: t("companies.detail.field.gemeinkosten"),
      value:
        g.overhead_cost_centre != null
          ? String(g.overhead_cost_centre)
          : t("companies.detail.field.gemeinkostenFehlt"),
    },
    { label: t("companies.detail.field.ablage"), value: filingPath, wide: true },
    { label: t("companies.detail.field.erstellt"), value: formatDate(g.created_at) },
    {
      label: t("companies.detail.field.aktualisiert"),
      value: formatDate(g.updated_at ?? g.created_at),
    },
  ];

  function startEdit() {
    setForm(gFormFrom(g));
    setError({});
    setEdit(true);
  }
  function cancel() {
    setForm(null);
    setEdit(false);
  }
  function save() {
    const changes: Partial<Company> = {};
    if (f.code.trim() && f.code.trim() !== g.code) changes.code = f.code.trim();
    if (f.name.trim() && f.name.trim() !== g.name) changes.name = f.name.trim();
    const areaValue = f.area === AREA_LEER ? null : (f.area as Company["area"]);
    if (areaValue !== g.area) changes.area = areaValue;
    // A NULL booking_basis behaves as 'payment_date', so picking that value on a company that has
    // never had one set is not a change and must not be written as one.
    if (f.bookingBasis !== (g.booking_basis ?? "payment_date"))
      changes.booking_basis = f.bookingBasis;
    const folder = f.filingFolder.trim() || null;
    if (folder !== (g.filing_folder ?? null)) changes.filing_folder = folder;
    const overhead = f.overhead.trim();
    if (overhead !== "" && !/^[1-9]\d{0,8}$/.test(overhead)) {
      setError({ overhead: t("companies.detail.field.gemeinkostenUngueltig") });
      return;
    }
    const overheadNumber = overhead === "" ? null : Number(overhead);
    if (overheadNumber !== (g.overhead_cost_centre ?? null)) {
      changes.overhead_cost_centre = overheadNumber;
    }
    // Same shared schema as the create dialog, so both ask for exactly the same thing and both
    // can point at the offending field instead of firing one toast that names every problem.
    const parsed = companySchema(t).safeParse({ code: f.code, name: f.name });
    if (!parsed.success) {
      setError(fieldError(parsed.error));
      return;
    }
    setError({});
    if (Object.keys(changes).length === 0) {
      toast.info(t("companies.detail.toast.keineAenderungen"));
      setEdit(false);
      return;
    }
    updateG.mutate(changes, {
      onSuccess: () => {
        toast.success(t("companies.detail.toast.gespeichert"));
        setForm(null);
        setEdit(false);
      },
      onError: (e) =>
        toast.error(
          t("companies.detail.toast.speichernFehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  return (
    <div>
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("companies.detail.back")}
      </Link>
      {/*
        One primary action and a ⋮ menu, the same shape the supplier and invoice detail screens
        use. Side-by-side buttons made every one of them look equally important and wrapped to a
        second row on a narrow window.

        The dialogs are driven by state and rendered OUTSIDE the menu on purpose: selecting a menu
        item closes the menu, which would unmount a trigger rendered inside it before it could open
        anything.
      */}
      <div
        data-tour="company-detail-header"
        className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <span className="font-mono">{g.code}</span> · {g.name}
          </h1>
          {g.area && (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
              {t(`approvalRules.bereich.${g.area}`)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startEdit} className="gap-2">
            <Pencil className="size-4" /> {t("companies.detail.action.bearbeiten")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("companies.detail.action.mehr")}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-auto min-w-56 [&_[role=menuitem]]:whitespace-nowrap"
            >
              {/* The two screens that hold the rest of a company's configuration. Reachable from
                  the company itself rather than only from the admin sections they live in. */}
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/datev-handover">
                  <Send className="size-4" /> {t("companies.detail.action.datev")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/properties">
                  <Archive className="size-4" /> {t("companies.detail.action.objekte")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* An archived company offers the opposite action rather than a second archive. */}
              {g.deleted_at ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={restoreG.isPending}
                  onSelect={() =>
                    restoreG.mutate(undefined, {
                      onSuccess: () => toast.success(t("companies.detail.toast.wiederhergestellt")),
                      onError: (e) =>
                        toast.error(
                          t("companies.detail.toast.archivierenFehlgeschlagen", {
                            error: errorText(e),
                          }),
                        ),
                    })
                  }
                >
                  <RotateCcw className="size-4" /> {t("companies.detail.action.wiederherstellen")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => setArchiveOpen(true)}
                >
                  <Archive className="size-4" /> {t("companies.detail.action.archivieren")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog
        open={!!propertyRemove}
        onOpenChange={(open) => (open ? undefined : setPropertyRemove(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.detail.objektEntfernen.titel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {propertyRemove?.lastCompany
                ? t("companies.detail.objektEntfernen.letzte", {
                    property: propertyRemove.code,
                    company: g.code,
                  })
                : t("companies.detail.objektEntfernen.beschreibung", {
                    property: propertyRemove
                      ? `${propertyRemove.code}${propertyRemove.name ? ` · ${propertyRemove.name}` : ""}`
                      : "",
                    company: `${g.code} · ${g.name}`,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("companies.detail.archiv.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!propertyRemove || propertyRemove.lastCompany || removeProperty.isPending}
              onClick={() => {
                if (!propertyRemove) return;
                removeProperty.mutate(
                  { linkId: propertyRemove.linkId, actor: user?.email ?? null },
                  {
                    onSuccess: () => {
                      toast.success(
                        t("companies.detail.objektEntfernen.erfolg", {
                          property: propertyRemove.code,
                        }),
                      );
                      setPropertyRemove(null);
                    },
                    onError: (e) =>
                      toast.error(
                        t("companies.detail.toast.speichernFehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  },
                );
              }}
            >
              {t("companies.detail.objektEntfernen.bestaetigen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.detail.archiv.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.detail.archiv.desc")}
              {totalsReady && allDocuments.length > 0
                ? " " + t("companies.detail.archiv.mitBelegen", { count: allDocuments.length })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder={t("companies.detail.archiv.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("companies.detail.archiv.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!archiveReason.trim()}
              onClick={() =>
                archiveG.mutate(archiveReason.trim(), {
                  onSuccess: () => {
                    toast.success(t("companies.detail.toast.archiviert"));
                    setArchiveReason("");
                  },
                  onError: (e) =>
                    toast.error(
                      t("companies.detail.toast.archivierenFehlgeschlagen", {
                        error: errorText(e),
                      }),
                    ),
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("companies.detail.archiv.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The list dims an archived row and tags it; opening it showed an entirely normal-looking
          record, and everything on this page then reads as current data for an active company. */}
      {g.deleted_at && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t("companies.detail.archiv.banner", {
            datum: formatDate(g.deleted_at),
            reason: g.delete_reason?.trim() || t("companies.detail.archiv.ohneGrund"),
          })}
        </div>
      )}

      {/* One grid with two real columns, not two grids of flowed cards: flowed children align row
          by row, so a tall card on one side stretches its neighbour and the left and right edges
          stop agreeing down the page. */}
      <div
        data-tour="company-detail-content"
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("companies.detail.section.stammdaten")}
            </h2>
            <FactList facts={masterData} columns={2} />
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("companies.detail.section.objekte")}
                {propertiesReady && properties.length > 0 && (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("companies.detail.objekteCount", { count: properties.length })}
                  </span>
                )}
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={!propertiesReady}
                onClick={() => setAssignmentDialog({ link: null })}
              >
                <Plus className="size-3.5" /> {t("companies.detail.objektHinzufuegen")}
              </Button>
            </div>
            {!propertiesReady ? (
              <SectionSkeleton className="h-16" />
            ) : properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("companies.detail.objekteEmpty")}</p>
            ) : (
              <div className="space-y-1.5">
                {properties.map((o) => {
                  const link = propertyLinks.get(o.id);
                  return (
                    // One row per property, the same shape as the company rows on the property
                    // page. The red cross appears on hover (and on keyboard focus, and always on a
                    // phone), and removing stays behind a confirmation.
                    <div
                      key={o.id}
                      className="group flex w-full items-center gap-2 rounded-md bg-muted/40 px-3 py-2 transition-colors hover:bg-muted"
                    >
                      <Link
                        to="/properties/$code"
                        params={{ code: o.code }}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-sm hover:underline"
                      >
                        <span className="shrink-0 font-mono text-xs text-foreground">{o.code}</span>
                        {o.name ? (
                          <span className="truncate text-xs text-muted-foreground">{o.name}</span>
                        ) : null}
                      </Link>
                      {link && (
                        <span
                          className={
                            link.number != null
                              ? "shrink-0 text-xs text-muted-foreground"
                              : "shrink-0 text-xs text-warning"
                          }
                        >
                          {link.number != null
                            ? t("properties.detail.kostenstelle", { nr: link.number })
                            : t("properties.detail.kostenstelleFehlt")}
                        </span>
                      )}
                      {link && (
                        <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setAssignmentDialog({ link: link.link })}
                            aria-label={t("properties.detail.zuordnungBearbeiten")}
                            title={t("properties.detail.zuordnungBearbeiten")}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setPropertyRemove({
                                linkId: link.linkId,
                                code: o.code,
                                name: o.name ?? null,
                                lastCompany: link.count <= 1,
                              })
                            }
                            aria-label={t("companies.detail.objektEntfernen.aktion", {
                              property: o.code,
                            })}
                            title={t("companies.detail.objektEntfernen.aktion", {
                              property: o.code,
                            })}
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {assignmentDialog && (
              <AssignmentDialog
                fest={{ art: "gesellschaft", companyId: id }}
                link={assignmentDialog.link}
                assign={[...propertyLinks.keys()]}
                onClose={() => setAssignmentDialog(null)}
              />
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {/* Count and total sit ON the heading line. As tiles underneath they were two more
                  boxes competing with the table for the eye, for two numbers that are a subtitle. */}
              <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("companies.detail.section.verbucht")}
                {/* Count and total come from two different queries -- the count from the paged
                    row query's exact count, the sum from the aggregate projection -- so they are
                    gated separately. Sharing one flag meant whichever landed first published the
                    other's zero as a settled figure. */}
                {documentsReady ? (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("companies.detail.gesamt", { count: documentsTotal })}
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
              {/* One control: the period list turns into the range calendar in place, the way the
                  overview's and the supplier's pickers work. */}
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

            {documentsReady && foreignDocuments.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs">
                  {t("companies.detail.fremdeObjekte", {
                    count: foreignDocuments.length,
                    total: formatEUR(foreignTotal),
                  })}
                </p>
              </div>
            )}

            {!documentsReady ? (
              <SectionSkeleton className="h-80" />
            ) : documents.length === 0 ? (
              <p className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted-foreground">
                {allDocuments.length === 0
                  ? t("companies.detail.belegeEmpty")
                  : t("companies.detail.belegeEmptyZeitraum")}
              </p>
            ) : (
              <>
                {/* Below `sm`, cards replace the table entirely rather than relying on any
                    horizontal scroll -- table-internal or page-level. */}
                <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
                  {/* Capped and scrolled rather than left to grow: the card sits in a grid row, so
                      an unbounded table drags the whole page height with it. The header cells are
                      sticky and carry their own solid background -- on the row alone the tint is
                      translucent and scrolled rows show through. */}
                  <Table containerClassName="max-h-[26rem]">
                    <TableHeader>
                      <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                        <TableHead>{t("companies.detail.col.beleg")}</TableHead>
                        <TableHead>{t("companies.detail.col.objekt")}</TableHead>
                        <TableHead>{t("companies.detail.col.datum")}</TableHead>
                        <TableHead className="text-right">
                          {t("companies.detail.col.betrag")}
                        </TableHead>
                        <TableHead>{t("companies.detail.col.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((b) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onClick={() =>
                            navigate({ to: "/incoming-invoices/$nr", params: { nr: b.id } })
                          }
                        >
                          <TableCell className="font-medium text-foreground">
                            {b.invoice_number ?? t("companies.detail.ohneNr")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <PropertyCell
                              code={b.property_code}
                              foreignProperties={foreignProperties}
                              companyCodeById={companyCodeById}
                            />
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-muted-foreground">
                            {formatDate(b.document_date)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatEUR(b.amount_gross)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={b.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {documentsQ.hasNextPage && (
                        <TableRow ref={sentinelRef}>
                          <TableCell
                            colSpan={99}
                            className="py-3 text-center text-xs text-muted-foreground"
                          >
                            {t("loadMore.rest", {
                              count: documentsTotal - documents.length,
                            })}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 sm:hidden">
                  {documents.map((b) => (
                    <div
                      key={b.id}
                      className="cursor-pointer rounded-lg border border-border p-3"
                      onClick={() =>
                        navigate({ to: "/incoming-invoices/$nr", params: { nr: b.id } })
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">
                            {b.invoice_number ?? t("companies.detail.ohneNr")}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(b.document_date)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                          {formatEUR(b.amount_gross)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <StatusBadge status={b.status} />
                        <PropertyCell
                          code={b.property_code}
                          foreignProperties={foreignProperties}
                          companyCodeById={companyCodeById}
                        />
                      </div>
                    </div>
                  ))}
                  {documentsQ.hasNextPage && (
                    <p ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                      {t("loadMore.rest", {
                        count: documentsTotal - documents.length,
                      })}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Under the invoice table rather than in the left column. The spellings are what makes
              the pipeline file a document against this company, so they belong next to the
              documents that were filed, not among the master-data fields. */}
          <KnownSpellingsCard entityType="gesellschaft" entityCode={g.code ?? ""} />
        </div>
      </div>

      <Dialog open={edit} onOpenChange={(o) => (o ? undefined : cancel())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("companies.detail.editTitle")}</DialogTitle>
            <DialogDescription>{t("companies.detail.editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.code")} <RequiredStern />
              </Label>
              <Input
                value={f.code}
                onChange={(e) => setF("code", e.target.value)}
                aria-invalid={!!error.code}
              />
              <FieldErrorText text={error.code} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.name")} <RequiredStern />
              </Label>
              <Input
                value={f.name}
                onChange={(e) => setF("name", e.target.value)}
                aria-invalid={!!error.name}
              />
              <FieldErrorText text={error.name} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.bereich")}
              </Label>
              <Select value={f.area} onValueChange={(v) => setF("area", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AREA_LEER}>{t("approvalRules.bereich.keiner")}</SelectItem>
                  <SelectItem value="hospitality">
                    {t("approvalRules.bereich.hospitality")}
                  </SelectItem>
                  <SelectItem value="stay_re">{t("approvalRules.bereich.stay_re")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* companies.booking_basis drives which date the Kostenanalyse buckets an invoice by
                (use-bwa-scope.ts). It has been read since migration 0041 and could until now only
                be changed in SQL, so every company silently ran on the payment-date fallback. */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.buchungsbasis")}
              </Label>
              <Select
                value={f.bookingBasis}
                onValueChange={(v) => setF("bookingBasis", v as GForm["bookingBasis"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice_date">
                    {t("companies.buchungsbasis.invoice_date")}
                  </SelectItem>
                  <SelectItem value="payment_date">
                    {t("companies.buchungsbasis.payment_date")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("companies.detail.field.buchungsbasisHinweis")}
              </p>
            </div>
            {/* companies.overhead_cost_centre: the cost centre for everything booked to Gemeinkosten in
                this company. Seeded from the tax adviser's workbook and until now only changeable in
                SQL. Updating a company is admin-only, so this field is too. */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.gemeinkosten")}
              </Label>
              <Input
                inputMode="numeric"
                value={f.overhead}
                onChange={(e) => setF("overhead", e.target.value)}
                aria-invalid={!!error.overhead}
                placeholder={t("companies.detail.field.gemeinkostenPlatzhalter")}
              />
              <FieldErrorText text={error.overhead} />
              <p className="text-xs text-muted-foreground">
                {t("companies.detail.field.gemeinkostenHinweis")}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("companies.detail.field.ablage")}
              </Label>
              <FolderTreePicker
                folders={filingFoldersQ.data}
                value={f.filingFolder ? [f.filingFolder] : []}
                onChange={(ids) => setF("filingFolder", ids[0] ?? "")}
                multi={false}
                placeholder={
                  filingFoldersQ.isLoading
                    ? t("documentSources.folder.laedt")
                    : t("companies.detail.field.ablagePlaceholder")
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("companies.detail.field.ablageHinweis")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancel}>
              {t("companies.detail.action.abbrechen")}
            </Button>
            <Button onClick={save} disabled={updateG.isPending}>
              {updateG.isPending
                ? t("companies.detail.action.speichere")
                : t("companies.detail.action.speichern")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * An invoice's property code, flagged when the property belongs to a different company.
 *
 * Shared by the table and the mobile cards so the two cannot disagree about which codes are
 * suspect, and so the hint text is written once.
 */
function PropertyCell({
  code,
  foreignProperties,
  companyCodeById,
}: {
  code: string | null | undefined;
  foreignProperties: Map<string, string[]>;
  companyCodeById: Map<string, string>;
}) {
  const { t } = useTranslation();
  if (!code) return <>—</>;
  if (!foreignProperties.has(code)) return <>{code}</>;
  return (
    <span
      className="inline-flex items-center gap-1 font-medium text-warning"
      title={t("companies.detail.fremdesObjektHinweis", {
        property: code,
        companies: (foreignProperties.get(code) ?? [])
          .map((cid) => companyCodeById.get(cid) ?? cid)
          .join(", "),
      })}
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      {code}
    </span>
  );
}
