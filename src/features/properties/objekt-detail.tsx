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
  fehlerText,
  formatDate,
  formatDateTime,
  formatEUR,
  GesellschaftChip,
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
  useArchiveObjekt,
  useBelegeFuerObjektSeiten,
  useFetchNextSentinel,
  useLieferanten,
  useObjektBelegAggregat,
  useObjekte,
  useObjektGesellschaften,
  useTranslation,
  useUnarchiveObjekt,
  useUpdateObjekt,
  UstBadge,
  useZeitraumOptionen,
  ZEITRAUM_ALLE,
  ZEITRAUM_INDIVIDUELL,
  zeitraumBereich,
  ZeitraumPicker,
} from "./adapter";
import type { Fact } from "./adapter";
import type { ObjektDaten, ObjektZuordnung, PropertiesConfig } from "./config";

// "Gesamt" in the shared period vocabulary. The picker's whole option list is fixed and shared now
// (see `zeitraum-optionen`), so this screen no longer derives months and years from its own rows.
const ALLE_ZEITRAEUME = ZEITRAUM_ALLE;
const UST_STATUS_OPTIONEN = ["steuerpflichtig", "steuerfrei", "gemischt"] as const;
const OWNERSHIP_OPTIONEN = ["own", "client"] as const;

type OForm = {
  name: string;
  address: string;
  vat_status: string;
  drive_folder_url: string;
  ownership_type: string;
};

function oFormFrom(o: ObjektDaten): OForm {
  return {
    name: o.name ?? "",
    address: o.address ?? "",
    vat_status: o.vat_status ?? "__none",
    drive_folder_url: o.drive_folder_url ?? "",
    ownership_type: o.ownership_type ?? "own",
  };
}

export function ObjektDetail({ code, config }: { code: string; config: PropertiesConfig }) {
  const { t } = useTranslation();
  const objekteQ = useObjekte();
  const lieferantenQ = useLieferanten();
  const zuordnung = useObjektGesellschaften();

  // Typed as the shared shape, not the Hub's own Objekt: the optional fields below are read
  // through the capability flags, and a Hub whose table lacks a column must still compile.
  const objekt = useMemo<ObjektDaten | null>(
    () => (objekteQ.data ?? []).find((o) => o.code === code) ?? null,
    [objekteQ.data, code],
  );

  const [zeitraum, setZeitraum] = useState(ALLE_ZEITRAEUME);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const range = useMemo(() => zeitraumBereich(zeitraum, von, bis), [zeitraum, von, bis]);
  const zeitraumOptionen = useZeitraumOptionen();

  /**
   * The invoice table, fetched a page at a time as the reader scrolls.
   *
   * This screen used to pull EVERY invoice on the property in one request and then window the array
   * in the browser, which made it feel paginated while the request behind it still fetched the lot.
   * The period is part of the query too, so picking a quarter narrows what the server sends instead
   * of hiding most of what it already sent.
   */
  const belegeQ = useBelegeFuerObjektSeiten(objekt?.id ?? null, code, range, !objekteQ.isLoading);
  const belege = useMemo(
    () => (belegeQ.data?.pages ?? []).flatMap((seite) => seite.rows),
    [belegeQ.data],
  );
  // The server's exact count for the current period, not "how many are loaded so far".
  const belegeGesamt = belegeQ.data?.pages[0]?.total ?? 0;
  const belegeBereit = belegeQ.data !== undefined;
  const sentinelRef = useFetchNextSentinel(
    belegeQ.hasNextPage,
    belegeQ.isFetchingNextPage,
    belegeQ.fetchNextPage,
  );

  /**
   * The narrow projection every page-level figure is computed from.
   *
   * The header total, the period picker's options and the company-mismatch warning all describe the
   * COMPLETE set, so none of them can come from one page of rows.
   */
  const aggregatQ = useObjektBelegAggregat(objekt?.id ?? null, code, !objekteQ.isLoading);
  const alleBelege = useMemo(() => aggregatQ.data ?? [], [aggregatQ.data]);
  const summenBereit = aggregatQ.data !== undefined;

  // The same period the rows are fetched for, applied to the aggregate set, so the total in the
  // heading describes exactly the rows underneath it.
  const belegeImZeitraum = useMemo(() => {
    if (!range.von && !range.bis) return alleBelege;
    return alleBelege.filter((b) => {
      if (!b.document_date) return false;
      if (range.von && b.document_date < range.von) return false;
      if (range.bis && b.document_date > range.bis) return false;
      return true;
    });
  }, [alleBelege, range]);
  const summe = belegeImZeitraum.reduce((s, b) => s + (b.amount_gross ?? 0), 0);

  // Memoised, not derived inline: a fresh array on every render makes every useMemo below it
  // recompute every render, which is exactly what the dependency it feeds is there to avoid.
  const companies = useMemo(
    () => (objekt ? (zuordnung.byProperty.get(objekt.id) ?? []) : []),
    [objekt, zuordnung.byProperty],
  );
  const zuordnungen: ObjektZuordnung[] = objekt
    ? (zuordnung.zuordnungenByProperty.get(objekt.id) ?? [])
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
  const zugeordneteCodes = useMemo(() => new Set(companies.map((c) => c.code)), [companies]);
  const gesellschaftPasstNicht = (belegCompanyCode: string | null | undefined) =>
    !!belegCompanyCode && zugeordneteCodes.size > 0 && !zugeordneteCodes.has(belegCompanyCode);
  const abweichendeBelege = belegeImZeitraum.filter((b) =>
    gesellschaftPasstNicht(b.company_code),
  ).length;

  const lieferantById = useMemo(
    () => new Map((lieferantenQ.data ?? []).map((l) => [l.id, l])),
    [lieferantenQ.data],
  );
  const stellerName = (id: string | null, fallback: string | null) =>
    (id ? lieferantById.get(id)?.name : null) ?? fallback ?? "—";

  const updateO = useUpdateObjekt(objekt?.id ?? "");
  const archiveO = useArchiveObjekt(objekt?.id ?? "");
  const unarchiveO = useUnarchiveObjekt(objekt?.id ?? "");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<OForm | null>(null);
  const [archiveGrund, setArchiveGrund] = useState("");
  const [archivierenOffen, setArchivierenOffen] = useState(false);

  const f = form ?? (objekt ? oFormFrom(objekt) : null);
  const setF = (k: keyof OForm, v: string) =>
    setForm((prev) => ({ ...(prev ?? (objekt ? oFormFrom(objekt) : ({} as OForm))), [k]: v }));

  function abbrechen() {
    setForm(null);
    setEdit(false);
  }

  function speichern() {
    if (!objekt || !f) return;
    const changes: Partial<ObjektDaten> = {};
    const name = f.name.trim() || null;
    const adresse = f.address.trim() || null;
    const ustStatus = f.vat_status === "__none" ? null : f.vat_status;
    if (name !== (objekt.name ?? null)) changes.name = name;
    if (adresse !== (objekt.address ?? null)) changes.address = adresse;
    if (ustStatus !== (objekt.vat_status ?? null)) changes.vat_status = ustStatus;
    // The two optional fields are only ever written where the column exists. Their inputs are not
    // rendered otherwise, so `f` still carries the empty default and writing it would clear a
    // column that is not there.
    if (config.driveOrdner) {
      const driveFolderUrl = f.drive_folder_url.trim() || null;
      if (driveFolderUrl !== (objekt.drive_folder_url ?? null))
        changes.drive_folder_url = driveFolderUrl;
    }
    if (config.eigentum && f.ownership_type !== objekt.ownership_type) {
      changes.ownership_type = f.ownership_type as ObjektDaten["ownership_type"];
    }
    if (Object.keys(changes).length === 0) {
      toast.info(t("objekte.detail.toast.keineAenderungen"));
      setEdit(false);
      return;
    }
    // The cast is the seam between this shared screen and a Hub's own update type, which is
    // narrower on a Hub without the optional columns.
    updateO.mutate(changes as Parameters<typeof updateO.mutate>[0], {
      onSuccess: () => {
        toast.success(t("objekte.detail.toast.gespeichert"));
        setForm(null);
        setEdit(false);
      },
      onError: (e) =>
        toast.error(t("objekte.detail.toast.speichernFehlgeschlagen", { error: fehlerText(e) })),
    });
  }

  if (belegeQ.isError) {
    return <ErrorState error={belegeQ.error} onRetry={() => belegeQ.refetch()} />;
  }

  // Label above value, one under the other, the same list the supplier and company pages read their
  // master data from.
  const stammdaten: Fact[] = objekt
    ? [
        {
          label: t("objekte.detail.field.code"),
          value: objekt.code,
          mono: true,
          node: (
            <span className="inline-flex items-center gap-1 font-mono">
              {objekt.code}
              <CopyButton value={objekt.code} label={t("objekte.detail.field.code")} />
            </span>
          ),
        },
        { label: t("objekte.detail.field.name"), value: objekt.name },
        { label: t("objekte.detail.field.adresse"), value: objekt.address, wide: true },
        {
          label: t("objekte.detail.field.ustStatus"),
          value: objekt.vat_status
            ? t(`objekte.ustStatus.${objekt.vat_status}`, { defaultValue: objekt.vat_status })
            : null,
        },
        ...(config.eigentum
          ? [
              {
                label: t("objekte.detail.field.eigentum"),
                value: t(`objekte.eigentum.${objekt.ownership_type ?? "own"}`),
              },
            ]
          : []),
        ...(config.driveOrdner
          ? [
              {
                label: t("objekte.detail.field.driveFolder"),
                value: objekt.drive_folder_url,
                wide: true,
                node: objekt.drive_folder_url ? (
                  <a
                    href={objekt.drive_folder_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
                  >
                    {t("objekte.detail.action.ordnerOeffnen")}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : undefined,
              },
            ]
          : []),
      ]
    : [];

  const zurueckKlasse =
    "inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
  const zurueckInhalt = (
    <>
      <ArrowLeft className="size-4" /> {t("objekte.detail.back")}
    </>
  );

  return (
    <div>
      {/* A real link where the Hub supplies one, so it can be middle-clicked and opened in a new
          tab; a button otherwise, which still navigates. */}
      {config.zurueckLink ? (
        config.zurueckLink({ className: zurueckKlasse, children: zurueckInhalt })
      ) : (
        <button type="button" onClick={() => config.oeffneListe()} className={zurueckKlasse}>
          {zurueckInhalt}
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
            {objekt?.name ? (
              <SelectableUnit className="ml-2 font-sans">{objekt.name}</SelectableUnit>
            ) : null}
          </h1>
          {/* Skeleton rather than nothing: an empty chip row on a property that HAS companies is a
              wrong answer shown before anything was known. */}
          {!zuordnung.bereit ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            companies.map((c) => <GesellschaftChip key={c.code} code={c.code} />)
          )}
        </div>
        {objekt && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              onClick={() => {
                setForm(oFormFrom(objekt));
                setEdit(true);
              }}
              className="gap-2"
            >
              <Pencil className="size-4" /> {t("objekte.detail.action.bearbeiten")}
            </Button>
            {/* The destructive action moved into a menu, matching the company page: it was a
                full-width red button sitting beside Edit, given the same weight as the thing
                people actually come here to do.

                Rendered only when it would actually contain something. Every item behind it is
                gated on a capability, so on a Hub with no archive and no Drive folder the trigger
                was still drawn and opened an empty popover. */}
            {(config.archivierung || (config.driveOrdner && !!objekt.drive_folder_url)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("objekte.detail.action.mehr")}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-auto min-w-56 [&_[role=menuitem]]:whitespace-nowrap"
                >
                  {config.driveOrdner && objekt.drive_folder_url && (
                    <>
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <a href={objekt.drive_folder_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />{" "}
                          {t("objekte.detail.action.ordnerOeffnen")}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {/* An archived property offers the opposite action rather than a second archive.
                    A Hub without the column gets neither: there is nothing to archive to. */}
                  {!config.archivierung ? null : objekt.deleted_at ? (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={unarchiveO.isPending}
                      onSelect={() =>
                        unarchiveO.mutate(undefined, {
                          onSuccess: () =>
                            toast.success(t("objekte.detail.toast.wiederhergestellt")),
                          onError: (e) =>
                            toast.error(
                              t("objekte.detail.toast.speichernFehlgeschlagen", {
                                error: fehlerText(e),
                              }),
                            ),
                        })
                      }
                    >
                      <RotateCcw className="size-4" /> {t("objekte.detail.action.wiederherstellen")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive focus:text-destructive"
                      onSelect={() => setArchivierenOffen(true)}
                    >
                      <Archive className="size-4" /> {t("objekte.detail.action.archivieren")}
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
      {config.archivierung && (
        <AlertDialog
          open={archivierenOffen}
          onOpenChange={(o) => {
            setArchivierenOffen(o);
            if (!o) setArchiveGrund("");
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("objekte.detail.archiveDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("objekte.detail.archiveDialog.desc")}
                {summenBereit && alleBelege.length > 0
                  ? " " + t("objekte.detail.archiveDialog.mitBelegen", { count: alleBelege.length })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={archiveGrund}
              onChange={(e) => setArchiveGrund(e.target.value)}
              placeholder={t("objekte.detail.archiveDialog.grundPlaceholder")}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>{t("objekte.detail.action.abbrechen")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={!archiveGrund.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  archiveO.mutate(archiveGrund.trim(), {
                    onSuccess: () => {
                      toast.success(t("objekte.detail.toast.archiviert"));
                      setArchiveGrund("");
                    },
                    onError: (e) =>
                      toast.error(
                        t("objekte.detail.toast.speichernFehlgeschlagen", { error: fehlerText(e) }),
                      ),
                  })
                }
              >
                {t("objekte.detail.archiveDialog.bestaetigen")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {config.archivierung && objekt?.deleted_at && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t("objekte.detail.archivedNotice", {
            grund: objekt.delete_reason?.trim() || t("objekte.detail.archivedNoticeOhneGrund"),
          })}
        </div>
      )}

      {config.stammdatenPruefung &&
        objekt &&
        !objekt.deleted_at &&
        needsMasterDataReview(objekt.reviewed_at) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <TriangleAlert className="size-4 shrink-0" />
              {t("objekte.detail.reviewBanner", { datum: formatDateTime(objekt.reviewed_at) })}
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
                  { onSuccess: () => toast.success(t("objekte.detail.toast.geprueft")) },
                )
              }
            >
              <CheckCircle2 className="size-4" /> {t("objekte.detail.action.nochKorrekt")}
            </Button>
          </div>
        )}

      {/* Explicit columns rather than letting a 2-column grid flow: with several cards on the left,
          grid rows would align each one against the invoice list and leave gaps wherever the two
          sides disagree on height. */}
      <div data-tour="property-detail-content" className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {objekteQ.isLoading ? (
            <SectionSkeleton className="h-72" />
          ) : !objekt ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <p>
                {t("objekte.detail.notInStammBefore")}
                <span className="font-mono">{code}</span>
                {t("objekte.detail.notInStammAfter")}
              </p>
              {/* The text told you to go create it and then left you to find the way there
                  yourself. The list page already accepts `?neu=<code>` and opens its create dialog
                  pre-filled with exactly this code, which is the mechanism it was describing. */}
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => config.oeffneNeu(code)}>
                <Plus className="size-4" /> {t("objekte.detail.action.jetztAnlegen")}
              </Button>
            </div>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("objekte.detail.section.stammdaten")}
              </h2>
              <FactList facts={stammdaten} columns={2} />
              <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-border/60 pt-3.5">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("objekte.detail.field.erstellt")}
                  </dt>
                  <dd className="mt-0.5 text-base text-foreground">
                    {formatDate(objekt.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("objekte.detail.field.aktualisiert")}
                  </dt>
                  <dd className="mt-0.5 text-base text-foreground">
                    {formatDate(objekt.updated_at ?? objekt.created_at)}
                  </dd>
                </div>
              </div>
            </section>
          )}

          {/* Its own card rather than a block inside Stammdaten: these assignments read differently
              from master data, and on some Hubs they are not even editable from here. */}
          {objekt && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("objekte.detail.section.gesellschaften")}
                </h2>
                {config.zuordnungAktion?.(objekt)}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("objekte.detail.gesellschaftenHint")}
              </p>
              {config.zuordnungEditor ? (
                config.zuordnungEditor(objekt)
              ) : !zuordnung.bereit ? (
                <SectionSkeleton className="h-20" />
              ) : zuordnungen.length === 0 ? (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  {t("objekte.detail.gesellschaftenEmpty")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {zuordnungen.map((z) => (
                    <div
                      key={z.id}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
                    >
                      {z.bereich && config.oeffneBereich ? (
                        <button
                          type="button"
                          // Names the row being followed, so the business line page can light it up
                          // instead of dropping you into a table with no sense of where you landed.
                          onClick={() => config.oeffneBereich?.(z.bereich!.code, z.id)}
                          className="min-w-[7rem] cursor-pointer text-left text-xs font-medium text-brand underline-offset-4 hover:underline"
                        >
                          {z.bereich.name}
                        </button>
                      ) : z.bereich ? (
                        <span className="min-w-[7rem] text-xs font-medium text-foreground">
                          {z.bereich.name}
                        </span>
                      ) : null}
                      {/* Leads to the company, the same way the company page's rows lead back to
                          the property. Both sides of the relation are reachable from either end. */}
                      {z.gesellschaft ? (
                        <button
                          type="button"
                          disabled={!config.oeffneGesellschaft || !z.gesellschaft.id}
                          onClick={() =>
                            z.gesellschaft?.id && config.oeffneGesellschaft?.(z.gesellschaft.id)
                          }
                          className={cn(
                            "inline-flex items-center gap-2 text-left",
                            config.oeffneGesellschaft && z.gesellschaft.id
                              ? "cursor-pointer hover:underline"
                              : "cursor-default",
                          )}
                        >
                          <GesellschaftChip code={z.gesellschaft.code} />
                          <span className="text-xs text-muted-foreground">
                            {z.gesellschaft.name}
                          </span>
                        </button>
                      ) : (
                        <GesellschaftChip code={null} />
                      )}
                      {/* The cost-centre number this property carries IN THIS COMPANY. It sits on
                          the assignment because the same building is numbered differently per
                          company, which is the whole reason this row exists rather than a single
                          number on the property. A Hub that does not number cost centres passes
                          undefined and nothing renders. */}
                      {z.kostenstelle !== undefined && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {z.kostenstelle != null
                            ? t("objekte.detail.kostenstelle", { nr: z.kostenstelle })
                            : t("objekte.detail.kostenstelleFehlt")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {config.zuordnungHinweis && (
                <div className="mt-3 text-xs text-muted-foreground">{config.zuordnungHinweis}</div>
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
                {t("objekte.detail.section.verbucht")}
                {/* Count and total come from two different queries -- the count from the paged row
                    query's exact count, the sum from the aggregate projection -- so they are gated
                    separately rather than one publishing the other's zero. */}
                {belegeBereit ? (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("objekte.detail.belegeCount", { count: belegeGesamt })}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
                {summenBereit ? (
                  <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                    {formatEUR(summe)}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </h2>
              {/* One control: the period list turns into the range calendar in place. */}
              <ZeitraumPicker
                value={zeitraum}
                onValueChange={(v) => setZeitraum(v)}
                von={von}
                bis={bis}
                onRangeApply={(vonNeu, bisNeu) => {
                  setVon(vonNeu);
                  setBis(bisNeu);
                }}
                locale={dateLocale()}
                formatDay={(iso) => formatDate(iso)}
                backLabel={t("home.zeitraumAktion.zurueck")}
                placeholder={t("belege.list.filter.zeitraum")}
                ariaLabel={t("belege.list.filter.zeitraum")}
                className="w-full sm:w-[190px]"
                rangeLabels={{
                  placeholder: t("belege.list.filter.zeitraumWaehlen"),
                  reset: t("belege.list.filter.zeitraumZuruecksetzen"),
                  apply: t("belege.list.filter.zeitraumAnwenden"),
                  previousMonth: t("belege.list.filter.monatZurueck"),
                  nextMonth: t("belege.list.filter.monatVor"),
                  pickSecond: t("belege.list.filter.zweitesDatum"),
                }}
                options={zeitraumOptionen}
                customValue={ZEITRAUM_INDIVIDUELL}
              />
            </div>

            {summenBereit && abweichendeBelege > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs">
                  {t("objekte.detail.gesellschaftAbweichung", {
                    count: abweichendeBelege,
                    gesellschaften: companies.map((c) => c.code).join(", "),
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
                    <TableHead>{t("objekte.detail.col.steller")}</TableHead>
                    <TableHead>{t("objekte.detail.col.ges")}</TableHead>
                    <TableHead>{t("objekte.detail.col.datum")}</TableHead>
                    <TableHead>{t("objekte.detail.col.ust")}</TableHead>
                    <TableHead className="text-right">{t("objekte.detail.col.betrag")}</TableHead>
                    <TableHead>{t("objekte.detail.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {belege.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer"
                      onClick={() => config.oeffneBeleg(b.id)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {stellerName(b.supplier_id, b.issuer)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.invoice_number ?? t("objekte.detail.ohneNr")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <GesellschaftChip code={b.company_code} />
                          {gesellschaftPasstNicht(b.company_code) && (
                            <span title={t("objekte.detail.gesellschaftAbweichungZeile")}>
                              <TriangleAlert
                                className="size-3.5 shrink-0 text-amber-600"
                                aria-label={t("objekte.detail.gesellschaftAbweichungZeile")}
                              />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDate(b.document_date)}
                      </TableCell>
                      <TableCell>
                        <UstBadge ustSatz={b.vat_rate} steuer={b.tax} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatEUR(b.amount_gross)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!belegeBereit &&
                    [0, 1, 2].map((i) => (
                      <TableRow key={`beleg-skeleton-${i}`}>
                        <TableCell colSpan={6} className="py-3">
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {belegeBereit && belege.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {alleBelege.length === 0
                          ? t("objekte.detail.noBelege")
                          : t("objekte.detail.noBelegeZeitraum")}
                      </TableCell>
                    </TableRow>
                  )}
                  {belegeQ.hasNextPage && (
                    <TableRow ref={sentinelRef}>
                      <TableCell
                        colSpan={99}
                        className="py-3 text-center text-xs text-muted-foreground"
                      >
                        {t("mehrLaden.rest", { count: belegeGesamt - belege.length })}
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
              {belege.map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-lg border border-border p-3"
                  onClick={() => config.oeffneBeleg(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") config.oeffneBeleg(b.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {stellerName(b.supplier_id, b.issuer)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.invoice_number ?? t("objekte.detail.ohneNr")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                      {formatEUR(b.amount_gross)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <GesellschaftChip code={b.company_code} />
                    {gesellschaftPasstNicht(b.company_code) && (
                      <TriangleAlert
                        className="size-3.5 shrink-0 text-amber-600"
                        aria-label={t("objekte.detail.gesellschaftAbweichungZeile")}
                      />
                    )}
                    <UstBadge ustSatz={b.vat_rate} steuer={b.tax} />
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formatDate(b.document_date)}
                  </div>
                </div>
              ))}
              {!belegeBereit && <SectionSkeleton className="h-40" />}
              {belegeBereit && belege.length === 0 && (
                <p className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  {alleBelege.length === 0
                    ? t("objekte.detail.noBelege")
                    : t("objekte.detail.noBelegeZeitraum")}
                </p>
              )}
              {belegeQ.hasNextPage && (
                <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                  {t("mehrLaden.rest", { count: belegeGesamt - belege.length })}
                </div>
              )}
            </div>
          </section>
          {/* Under the invoice table, not beside the master data: the spellings are what routes a
              document to this property, so they read as context for the documents rather than as
              another master-data field. Same position as on the company page. */}
          {config.schreibweisen?.(code)}
        </div>
      </div>

      <Dialog open={edit} onOpenChange={(o) => (o ? undefined : abbrechen())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("objekte.detail.editTitle")}</DialogTitle>
            <DialogDescription>{t("objekte.detail.editDesc")}</DialogDescription>
          </DialogHeader>
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {t("objekte.detail.field.name")}
                </Label>
                <Input value={f.name} onChange={(e) => setF("name", e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {t("objekte.detail.field.adresse")}
                </Label>
                <Input value={f.address} onChange={(e) => setF("address", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("objekte.detail.field.ustStatus")}
                </Label>
                <Combobox
                  value={f.vat_status}
                  onValueChange={(v) => setF("vat_status", v)}
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
              {config.eigentum && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("objekte.detail.field.eigentum")}
                  </Label>
                  <Combobox
                    value={f.ownership_type}
                    onValueChange={(v) => setF("ownership_type", v)}
                    options={OWNERSHIP_OPTIONEN.map((o) => ({
                      value: o,
                      label: t(`objekte.eigentum.${o}`),
                    }))}
                  />
                </div>
              )}
              {config.driveOrdner && (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("objekte.detail.field.driveFolder")}
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
            <Button variant="outline" onClick={abbrechen}>
              {t("objekte.detail.action.abbrechen")}
            </Button>
            <Button onClick={speichern} disabled={updateO.isPending}>
              {updateO.isPending
                ? t("objekte.detail.action.speichere")
                : t("objekte.detail.action.speichern")}
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
        const auswahl = window.getSelection();
        if (!auswahl) return;
        const bereich = document.createRange();
        bereich.selectNodeContents(e.currentTarget);
        auswahl.removeAllRanges();
        auswahl.addRange(bereich);
      }}
    >
      {children}
    </span>
  );
}
