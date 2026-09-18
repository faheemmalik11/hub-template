import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ZeitraumPicker } from "@/components/data-table/zeitraum-picker";
import {
  useZeitraumOptionen,
  ZEITRAUM_ALLE,
  ZEITRAUM_INDIVIDUELL,
  zeitraumBereich,
} from "@/components/data-table/zeitraum-optionen";
import { useInfiniteRows } from "@/lib/use-infinite-rows";
import { useFetchNextSentinel } from "@/lib/use-fetch-next-sentinel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  TriangleAlert,
  Copy,
  History,
  MoreVertical,
  Star,
  ChevronDown,
  Landmark,
  Merge,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { KnownSpellingsCard } from "@/components/stammdaten/known-spellings-card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddSupplierBankAccount,
  useConfirmSupplierBankAccount,
  useBelegeBySupplierSeiten,
  useLieferantBelegAggregat,
  useDeleteSupplierBankAccount,
  useUpdateSupplierBankAccount,
  useLieferant,
  useLieferanten,
  useRestoreLieferant,
  useSoftDeleteLieferant,
  useSetDefaultSupplierIban,
  useSupplierBankAccounts,
  useSupplierIbanHistory,
  useUpdateLieferant,
} from "@/lib/data/queries";
import {
  compactIBAN,
  dateLocale,
  detectUnusualAmounts,
  fehlerText,
  formatDate,
  formatDateTime,
  formatEUR,
  formatIBAN,
  isPayableIBAN,
  istLastschrift,
  recentSupplierIbanChange,
} from "@/lib/data/format";
import { CopyButton } from "@/components/belege/copy-button";
import { GesellschaftChip, StatusBadge, UnusualAmountBadge } from "@/components/belege/badges";
import { MergeSupplierDialog } from "@/components/belege/merge-supplier-dialog";
import { ErrorState } from "@/components/belege/query-states";
import { NeueRegelDialog } from "@/components/zuordnung/neue-regel-dialog";
import { BankAccountDialog } from "@/components/suppliers/bank-account-dialog";
import { SectionSkeleton } from "@/components/records/section-skeleton";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { Lieferant, SupplierBankAccount } from "@/lib/data/types";

// "Gesamt" in the shared period vocabulary. The option list is fixed and shared now (see
// `zeitraum-optionen`), so this screen no longer derives months, quarters and years from its own
// rows -- the same nine presets appear on every screen that has a period picker.
const ALLE_ZEITRAEUME = ZEITRAUM_ALLE;

export const Route = createFileRoute("/lieferanten/$id")({
  head: () => ({ meta: [{ title: pageTitle("Lieferant") }] }),
  component: LieferantDetailPage,
});

// Bank details are absent on purpose. An account is edited where accounts live, in the
// Bankverbindungen section: the default's IBAN is also `suppliers.iban`, and moving it has to go
// through useSetDefaultSupplierIban so the change lands in supplier_iban_history.
type LForm = {
  name: string;
  address: string;
  vat_id: string;
  phone: string;
  email: string;
  contact_person: string;
};

function lFormFrom(l: Lieferant): LForm {
  const s = (v: string | null) => v ?? "";
  return {
    name: s(l.name),
    address: s(l.address),
    vat_id: s(l.vat_id),
    phone: s(l.phone),
    email: s(l.email),
    contact_person: s(l.contact_person),
  };
}

/**
 * Copy a whole bank account, one field per line.
 *
 * IBAN, then BIC, then bank name, which is the order a transfer form asks for them and the order
 * the row shows them in. Empty fields are left out rather than pasted as blank lines.
 */
/**
 * Who made an IBAN change, in words.
 *
 * The column holds three different things: "pipeline" for an ingest, an auth user id for a change
 * made in the Hub, and an email address for the older writes that went through actorEmail(). The
 * raw id was being printed at people, and it cannot be resolved to a name here because app_users is
 * admin-only readable. So an id says where the change came from rather than pretending to name
 * somebody.
 */
function verlaufAkteur(wert: string | null, t: (k: string) => string): string {
  const roh = wert?.trim();
  if (!roh) return t("lieferanten.detail.ibanVerlauf.akteurUnbekannt");
  if (roh === "pipeline") return t("lieferanten.detail.ibanVerlauf.akteurPipeline");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roh))
    return t("lieferanten.detail.ibanVerlauf.akteurHub");
  return roh;
}

function BankKontoKopieren({
  konto,
  className,
}: {
  konto: SupplierBankAccount;
  className?: string;
}) {
  const { t } = useTranslation();
  const [kopiert, setKopiert] = useState(false);
  const text = [formatIBAN(konto.iban), konto.bic?.trim(), konto.bank_name?.trim()]
    .filter((z): z is string => !!z && z !== "—")
    .join("\n");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("lieferanten.detail.bankkonten.kopieren")}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            className,
          )}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setKopiert(true);
              window.setTimeout(() => setKopiert(false), 1500);
            } catch {
              toast.error(t("lieferanten.detail.bankkonten.kopierenFehlgeschlagen"));
            }
          }}
        >
          {kopiert ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("lieferanten.detail.bankkonten.kopieren")}</TooltipContent>
    </Tooltip>
  );
}

function LieferantDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lieferantQ = useLieferant(id);
  const alleLieferantenQ = useLieferanten();
  const historyQ = useSupplierIbanHistory(id);
  const updateL = useUpdateLieferant(id);
  const deleteL = useSoftDeleteLieferant(id);
  const restoreL = useRestoreLieferant(id);
  const bankAccountsQ = useSupplierBankAccounts(id);
  const addBankAccount = useAddSupplierBankAccount(id);
  const confirmBankAccount = useConfirmSupplierBankAccount();
  const deleteBankAccount = useDeleteSupplierBankAccount(id);
  const updateBankAccount = useUpdateSupplierBankAccount(id);
  const setDefaultIban = useSetDefaultSupplierIban(id);

  const lieferant = lieferantQ.data ?? null;

  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<LForm | null>(null);
  const [loeschGrund, setLoeschGrund] = useState("");
  const [ibanVerlaufOffen, setIbanVerlaufOffen] = useState(false);
  /**
   * How tall the accounts table may grow: as far as the details card on the left, then it scrolls.
   *
   * A fixed row count was the obvious thing and the wrong one. Rows are not all one height, the
   * left card's height depends on how much the supplier record actually holds, and the two columns
   * are meant to end level. So the card is measured instead, and the table gets what is left after
   * this card's own header and padding.
   */
  const detailsCardRef = useRef<HTMLElement | null>(null);
  const bankHeaderRef = useRef<HTMLDivElement | null>(null);
  const [kontenMaxHoehe, setKontenMaxHoehe] = useState<number | null>(null);
  useEffect(() => {
    const details = detailsCardRef.current;
    if (!details) return;
    const messen = () => {
      const chrome = (bankHeaderRef.current?.getBoundingClientRect().height ?? 0) + 40;
      // A floor, so a supplier with almost nothing on file does not squeeze the table to nothing.
      setKontenMaxHoehe(Math.max(180, details.getBoundingClientRect().height - chrome));
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(details);
    if (bankHeaderRef.current) ro.observe(bankHeaderRef.current);
    return () => ro.disconnect();
  }, []);
  const [bankDialogOffen, setBankDialogOffen] = useState(false);
  const [regelOffen, setRegelOffen] = useState(false);
  const [mergeOffen, setMergeOffen] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [editKonto, setEditKonto] = useState<SupplierBankAccount | null>(null);
  const [editIban, setEditIban] = useState("");
  const [editBic, setEditBic] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [inaktiveKontenOffen, setInaktiveKontenOffen] = useState(false);
  const [zeitraum, setZeitraum] = useState(ALLE_ZEITRAEUME);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");

  const range = useMemo(() => zeitraumBereich(zeitraum, von, bis), [zeitraum, von, bis]);
  const zeitraumOptionen = useZeitraumOptionen();

  /**
   * The invoice table, fetched a page at a time as the reader scrolls.
   *
   * The period is part of the query, not a filter applied to rows that were fetched anyway, so
   * picking a quarter narrows what the server sends instead of hiding most of what it already sent.
   */
  const belegeQ = useBelegeBySupplierSeiten(id, range);
  const belege = useMemo(
    () => (belegeQ.data?.pages ?? []).flatMap((seite) => seite.rows),
    [belegeQ.data],
  );
  // The server's exact count for the current period, not "how many are loaded so far".
  const belegeGesamt = belegeQ.data?.pages[0]?.total ?? 0;
  const belegeSentinelRef = useFetchNextSentinel(
    belegeQ.hasNextPage,
    belegeQ.isFetchingNextPage,
    belegeQ.fetchNextPage,
  );

  /**
   * Full, unfiltered history for this supplier, as a narrow projection.
   *
   * The period filter only applies to what is DISPLAYED; the unusual-amount baseline, the
   * direct-debit count and the period picker's own options all need the complete history, not the
   * currently filtered slice and certainly not one page of it. Five scalar columns rather than
   * whole invoice rows -- see BELEG_AGGREGAT_SPALTEN in queries.ts.
   */
  const aggregatQ = useLieferantBelegAggregat(id);
  const alleBelege = useMemo(() => aggregatQ.data ?? [], [aggregatQ.data]);

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
  const unusualIds = useMemo(() => detectUnusualAmounts(alleBelege), [alleBelege]);
  const lastschriftBelege = useMemo(
    () => alleBelege.filter((b) => istLastschrift(b.payment_method)),
    [alleBelege],
  );
  const ibanChange = useMemo(() => recentSupplierIbanChange(historyQ.data ?? []), [historyQ.data]);
  // The account suppliers.iban points at. Compared compacted on both sides: suppliers.iban keeps
  // whatever formatting the document reader printed, while supplier_bank_accounts.iban is
  // normalised by a database trigger, so the raw strings routinely differ for the same account.
  const standardIban = useMemo(() => compactIBAN(lieferantQ.data?.iban), [lieferantQ.data?.iban]);
  /**
   * What counts as the default account, defined once.
   *
   * The flag (migration 20260827190000) with the IBAN comparison as a fallback, for a row the sync
   * trigger has not touched yet. Both the card on the left and the table on the right ask this same
   * question, so they cannot disagree about which account is the default, and the card cannot come
   * up empty while the table plainly marks one.
   */
  const istStandardKonto = useCallback(
    (k: SupplierBankAccount) => k.is_default || k.iban === standardIban,
    [standardIban],
  );
  const standardKonto = useMemo(
    () => (bankAccountsQ.data ?? []).find(istStandardKonto) ?? null,
    [bankAccountsQ.data, istStandardKonto],
  );
  /**
   * The default account, and the raw value when there is not one.
   *
   * suppliers.iban is only a fallback while it is PAYABLE. It has always accepted whatever the
   * reader printed, and a few rows hold a masked number ("DE****************4556") or two IBANs run
   * together with a semicolon. supplier_bank_accounts refuses both, so no account row exists for
   * them, and the card used to present that raw string as the account money is sent to while the
   * table below it sat empty. Now the card says there is none and shows what is actually on file,
   * which is the thing someone has to go and fix.
   */
  const standardKontoIban =
    standardKonto?.iban ??
    (isPayableIBAN(compactIBAN(lieferantQ.data?.iban)) ? compactIBAN(lieferantQ.data?.iban) : null);
  const unbrauchbareIban =
    !standardKontoIban && (lieferantQ.data?.iban?.trim() ?? "") !== ""
      ? (lieferantQ.data?.iban ?? null)
      : null;
  const standardBic = standardKonto?.bic ?? lieferantQ.data?.bic ?? null;
  const standardBankName = standardKonto?.bank_name ?? lieferantQ.data?.bank_name ?? null;
  /**
   * The active accounts, default first, in an order that is fixed while the page is open.
   *
   * The order is decided once per set of accounts and then held. Sorting reactively meant that
   * starring a row made it jump to the top under the cursor, which is disorienting and loses your
   * place in a long list. The row is marked immediately, and on the next load it is at the top
   * where it belongs.
   *
   * `reihenfolge` is recomputed only when the accounts themselves change (one added or removed),
   * not when the flag moves between them.
   */
  // Any live account still waiting to be vouched for, however many the supplier has.
  const hatUnbestaetigtesKonto = (bankAccountsQ.data ?? []).some(
    (k) => k.is_active && !k.deleted_at && !k.confirmed_at,
  );
  const aktiveKonten = useMemo(
    () => (bankAccountsQ.data ?? []).filter((k) => k.is_active),
    [bankAccountsQ.data],
  );
  const kontenSchluessel = aktiveKonten
    .map((k) => k.id)
    .sort()
    .join("|");
  // React-sanctioned "adjust state during render", the same pattern useTableView uses for its page
  // reset: no effect, no second paint, and the order is right on the first render of a new set.
  const [reihenfolge, setReihenfolge] = useState<{ schluessel: string; ids: string[] }>({
    schluessel: "",
    ids: [],
  });
  if (reihenfolge.schluessel !== kontenSchluessel) {
    setReihenfolge({
      schluessel: kontenSchluessel,
      ids: [...aktiveKonten]
        .sort((a, b) => Number(istStandardKonto(b)) - Number(istStandardKonto(a)))
        .map((k) => k.id),
    });
  }
  const sortierteKonten = useMemo(() => {
    const platz = new Map(reihenfolge.ids.map((id, i) => [id, i]));
    return [...aktiveKonten].sort(
      (a, b) => (platz.get(a.id) ?? Infinity) - (platz.get(b.id) ?? Infinity),
    );
  }, [aktiveKonten, reihenfolge]);
  // Non-empty and not a payable shape: drives the inline hint and disables Add, so a mistyped
  // IBAN is caught while it is still on screen rather than after a round-trip.
  const editIbanUngueltig = editIban.trim() !== "" && !isPayableIBAN(editIban);
  /**
   * Whether the edit dialog is showing exactly what is already stored.
   *
   * Both sides are normalised before comparing, and that is the whole point. The IBAN column holds
   * the compacted form while the field shows it grouped, so "DE14 5138" and "DE145138" are the same
   * account. BIC and bank name are trimmed on both sides because some rows hold a single space
   * rather than null: untrimmed, such a row armed Save the moment the dialog opened, on a form
   * nobody had touched.
   */
  const editUnveraendert =
    !!editKonto &&
    compactIBAN(editIban) === compactIBAN(editKonto.iban) &&
    (editBic.trim() || null) === (editKonto.bic?.trim() || null) &&
    (editBankName.trim() || null) === (editKonto.bank_name?.trim() || null);
  const inaktiveKonten = useMemo(
    () => (bankAccountsQ.data ?? []).filter((k) => !k.is_active),
    [bankAccountsQ.data],
  );
  // Same treatment as the invoice table: revealed a page at a time, while the count in the
  // header and the list page's `+N` badge still count every active account.
  const kontenSeite = useInfiniteRows(sortierteKonten, 15);

  if (lieferantQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (lieferantQ.isError) {
    return <ErrorState error={lieferantQ.error} onRetry={() => lieferantQ.refetch()} />;
  }
  if (!lieferant) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("lieferanten.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/lieferanten">{t("lieferanten.detail.toList")}</Link>
        </Button>
      </div>
    );
  }
  const l = lieferant;
  const f = form ?? lFormFrom(l);
  const setF = (k: keyof LForm, v: string) =>
    setForm((prev) => ({ ...(prev ?? lFormFrom(l)), [k]: v }));

  function starteBearbeiten() {
    setForm(lFormFrom(l));
    setEdit(true);
  }
  function abbrechen() {
    setForm(null);
    setEdit(false);
  }
  /**
   * The fields that actually differ from the record.
   *
   * Compared trimmed, so typing a space into a field and taking it out again is not a change and
   * cannot arm the Save button. The button reads this too, rather than letting you save and then
   * being told there was nothing to save.
   */
  const aenderungen = (): Partial<Lieferant> => {
    const changes: Partial<Lieferant> = {};
    (Object.keys(f) as (keyof LForm)[]).forEach((k) => {
      const neu = f[k].trim() || null;
      // Trimmed on the record side too: a field holding a single space is not a value, and left
      // untrimmed it counted as a difference against an empty input and armed Save on open.
      const alt = ((l[k] as string | null) ?? "").trim() || null;
      if (neu !== alt) (changes as Record<string, unknown>)[k] = neu;
    });
    return changes;
  };
  const hatAenderungen = Object.keys(aenderungen()).length > 0;

  function speichern() {
    const changes = aenderungen();
    if (Object.keys(changes).length === 0) {
      toast.info(t("lieferanten.detail.toast.keineAenderungen"));
      setEdit(false);
      return;
    }
    updateL.mutate(changes, {
      onSuccess: () => {
        toast.success(t("lieferanten.detail.toast.gespeichert"));
        setForm(null);
        setEdit(false);
      },
      onError: (e) =>
        toast.error(
          t("lieferanten.detail.toast.speichernFehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }
  function loeschen() {
    deleteL.mutate(loeschGrund.trim(), {
      onSuccess: () => {
        toast.success(t("lieferanten.detail.toast.geloescht"));
        navigate({ to: "/lieferanten" });
      },
      onError: (e) =>
        toast.error(
          t("lieferanten.detail.toast.loeschenFehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  // The name is the page's heading, two lines above this card. Repeating it as the first field said
  // the same thing twice and pushed everything that is not the heading further down.
  const readFields: { label: string; value: string; mono?: boolean; copy?: string }[] = [
    {
      label: t("lieferanten.detail.field.adresse"),
      value: l.address ?? "—",
      copy: l.address ?? undefined,
    },
    {
      label: t("lieferanten.detail.field.ustId"),
      value: l.vat_id ?? "—",
      copy: l.vat_id ?? undefined,
    },
    {
      label: t("lieferanten.detail.field.telefon"),
      value: l.phone ?? "—",
      copy: l.phone ?? undefined,
    },
    {
      label: t("lieferanten.detail.field.email"),
      value: l.email ?? "—",
      copy: l.email ?? undefined,
    },
    { label: t("lieferanten.detail.field.ansprechpartner"), value: l.contact_person ?? "—" },
  ];

  return (
    <div>
      <Link
        to="/lieferanten"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("lieferanten.detail.back")}
      </Link>
      {/*
        One primary action and a ⋮ menu, the same shape the invoice detail screen uses. Four
        side-by-side buttons made every one of them look equally important and wrapped to a second
        row on a narrow window; the menu leaves the action people actually came for on the surface.

        The dialogs are driven by state and rendered OUTSIDE the menu on purpose: selecting a menu
        item closes the menu, which would unmount a trigger rendered inside it before it could open
        anything.
      */}
      <div
        data-tour="supplier-detail-header"
        className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{l.name}</h1>
          {/* Beside the name, so a supplier carrying an account nobody has vouched for says so
              before anyone scrolls to the accounts table. Shown for a single account too: "the one
              account we have is one we have never seen before" is the case most worth saying. */}
          {hatUnbestaetigtesKonto && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  <TriangleAlert className="size-3.5" />
                  {t("lieferanten.detail.bankkonten.neu.header")}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[20rem]">
                {t("lieferanten.detail.bankkonten.neu.headerHinweis")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={starteBearbeiten} className="gap-2">
            <Pencil className="size-4" /> {t("lieferanten.detail.action.bearbeiten")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("lieferanten.detail.action.mehr")}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-auto min-w-56 [&_[role=menuitem]]:whitespace-nowrap"
            >
              {/* Briefing Screen 4's first of two rule-creation entry points: "Everything from Ikea
                  is normally office material" -- start from the supplier, not from a receipt. */}
              {!l.deleted_at && (
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setRegelOffen(true)}>
                  <Wand2 className="size-4" /> {t("lieferanten.detail.regel.button")}
                </DropdownMenuItem>
              )}
              {/* merge_suppliers() rejects an already-deleted merge-away supplier, so the action is
                  hidden here rather than left to fail as a raw exception toast. */}
              {!l.deleted_at && (
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setMergeOffen(true)}>
                  <Merge className="size-4" /> {t("lieferanten.detail.merge.button")}
                </DropdownMenuItem>
              )}
              {!l.deleted_at && <DropdownMenuSeparator />}
              {/* Offering "Löschen" on an already-deleted record was the only way this page
                  acknowledged the state at all, and it acknowledged it wrongly. Deleted records
                  offer the opposite action instead. */}
              {l.deleted_at ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={restoreL.isPending}
                  onSelect={() =>
                    restoreL.mutate(undefined, {
                      onSuccess: () => toast.success(t("lieferanten.detail.restore.toast")),
                      onError: (e) =>
                        toast.error(
                          t("lieferanten.detail.toast.loeschenFehlgeschlagen", {
                            error: fehlerText(e),
                          }),
                        ),
                    })
                  }
                >
                  <RotateCcw className="size-4" /> {t("lieferanten.detail.restore.button")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => setLoeschenOffen(true)}
                >
                  <Trash2 className="size-4" /> {t("lieferanten.detail.delete.button")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!l.deleted_at && (
        <NeueRegelDialog
          defaultSupplierId={l.id}
          fixedTarget="cost_category"
          open={regelOffen}
          onOpenChange={setRegelOffen}
        />
      )}
      {!l.deleted_at && (
        <MergeSupplierDialog
          supplier={l}
          suppliers={(alleLieferantenQ.data ?? []).filter((s) => s.id !== l.id && !s.deleted_at)}
          open={mergeOffen}
          onOpenChange={setMergeOffen}
          onMerged={() => navigate({ to: "/lieferanten" })}
        />
      )}
      <AlertDialog open={loeschenOffen} onOpenChange={setLoeschenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lieferanten.detail.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("lieferanten.detail.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={loeschGrund}
            onChange={(e) => setLoeschGrund(e.target.value)}
            placeholder={t("lieferanten.detail.delete.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("lieferanten.detail.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!loeschGrund.trim()}
              onClick={loeschen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("lieferanten.detail.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The list dims a deleted row and tags it; opening it showed an entirely normal-looking
          record. Everything on this page — the totals, the invoice history, the bank details — then
          reads as current data for an active supplier. */}
      {l.deleted_at && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Trash2 className="size-4 shrink-0" />
          <span>
            {t("lieferanten.detail.geloeschtBanner", {
              datum: formatDateTime(l.deleted_at),
              grund: l.delete_reason || t("lieferanten.detail.geloeschtOhneGrund"),
            })}
          </span>
        </div>
      )}

      {/* One grid with two real columns, not two grids of flowed cards: flowed children
          align row by row, so a tall card on one side stretches its neighbour and the left
          and right edges stop agreeing down the page. */}
      <div
        data-tour="supplier-detail-content"
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]"
      >
        <div className="space-y-6">
          <section ref={detailsCardRef} className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("lieferanten.detail.section.stammdaten")}
            </h2>
            <dl className="space-y-3">
              {readFields.map((rf) => (
                <div
                  key={rf.label}
                  className="flex items-start justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{rf.label}</dt>
                    <dd
                      className={
                        rf.mono ? "font-mono text-sm text-foreground" : "text-sm text-foreground"
                      }
                    >
                      {rf.value}
                    </dd>
                  </div>
                  {rf.copy ? <CopyButton value={rf.copy} label={rf.label} /> : null}
                </div>
              ))}
            </dl>
          </section>
          {/* Beside the master data, not under the invoice table: an alias is a property of the
              supplier record, and this is the column that record lives in. */}
          <KnownSpellingsCard entityType="lieferant" entityCode={id} rahmen={false} />
        </div>
        <div className="space-y-6">
          <section className="rounded-xl bg-card p-5">
            <div
              ref={bankHeaderRef}
              className="mb-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("lieferanten.detail.section.bankkonten")}
                </h2>
                {/* The recently-changed warning belongs to these accounts, not to the supplier's
                    contact details. Beside the History button it also reads as one thought: the
                    default moved, and here is where to see what it was. */}
              </div>
              <div className="flex items-center gap-2">
                {/* The IBAN history used to be a collapsible buried in the Stammdaten card, which
                    is the wrong place: it is the history of THESE accounts. As a button here it is
                    next to the table it describes, and it costs one control's width instead of an
                    expanding panel. */}
                {(historyQ.data?.length ?? 0) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setIbanVerlaufOffen(true)}
                  >
                    <History className="size-3.5" />
                    {t("lieferanten.detail.ibanVerlauf.button")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setBankDialogOffen(true)}
                >
                  <Plus className="size-3.5" /> {t("lieferanten.detail.bankkonten.hinzufuegen")}
                </Button>
              </div>
            </div>

            {bankAccountsQ.isLoading ? (
              <SectionSkeleton className="h-44" />
            ) : aktiveKonten.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                {t("lieferanten.detail.bankkonten.empty")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: kontenMaxHoehe ? `${kontenMaxHoehe}px` : undefined }}
                >
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                        {/* The star leads the row: it is what you scan for, and reading "which one
                            is the default" should not mean crossing four columns first. */}
                        <TableHead className="w-9" />
                        <TableHead>{t("lieferanten.detail.bankkonten.col.iban")}</TableHead>
                        <TableHead>{t("lieferanten.detail.bankkonten.col.bic")}</TableHead>
                        <TableHead>{t("lieferanten.detail.bankkonten.col.bank")}</TableHead>
                        <TableHead>{t("lieferanten.detail.bankkonten.col.quelle")}</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kontenSeite.visible.map((k) => {
                        const istStandard = istStandardKonto(k);
                        return (
                          <TableRow
                            key={k.id}
                            className={
                              istStandard
                                ? "group bg-primary/5 [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-primary"
                                : "group"
                            }
                          >
                            <TableCell className="w-9 pr-0">
                              {istStandard ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="flex size-7 cursor-default items-center justify-center text-primary"
                                      aria-label={t("lieferanten.detail.bankkonten.standard")}
                                    >
                                      <Star className="size-3.5 fill-current" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("lieferanten.detail.bankkonten.standard")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label={t("lieferanten.detail.bankkonten.alsStandard")}
                                      disabled={setDefaultIban.isPending}
                                      onClick={() =>
                                        setDefaultIban.mutate(
                                          { iban: k.iban, bic: k.bic, bank_name: k.bank_name },
                                          {
                                            onSuccess: () =>
                                              toast.success(
                                                t(
                                                  "lieferanten.detail.bankkonten.toast.standardGesetzt",
                                                  { iban: formatIBAN(k.iban) },
                                                ),
                                              ),
                                            onError: (e) =>
                                              toast.error(
                                                t(
                                                  "lieferanten.detail.bankkonten.toast.fehlgeschlagen",
                                                  { error: fehlerText(e) },
                                                ),
                                              ),
                                          },
                                        )
                                      }
                                    >
                                      <Star className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("lieferanten.detail.bankkonten.alsStandard")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              <span
                                className={istStandard ? "font-medium text-foreground" : undefined}
                              >
                                {formatIBAN(k.iban)}
                              </span>
                              {/* An account the pipeline read off an invoice that this supplier had
                                  never billed from. It stays flagged until a person says it is
                                  genuine, here or on the invoice that brought it in. */}
                              {!k.confirmed_at && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="ml-2 inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-sans text-[11px] font-medium text-amber-900">
                                      <TriangleAlert className="size-3" />
                                      {t("lieferanten.detail.bankkonten.neu.badge")}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[20rem]">
                                    {t("lieferanten.detail.bankkonten.neu.hinweis")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                              {k.bic || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {k.bank_name || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              <div>{t(`lieferanten.detail.bankkonten.quelle.${k.source}`)}</div>
                              <div className="text-[11px] opacity-80">
                                {t("lieferanten.detail.bankkonten.seit", {
                                  datum: formatDate(k.first_seen_at),
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/*
                                  Three icon buttons of one size, so the column does not change
                                  width row to row. "Als Standard" used to be a text button here,
                                  which made the row it appeared on wider than the default's row and
                                  put the two remaining icons in a different place.
                                */}
                                {/*
                                  Edit is offered on EVERY account, the default included: migration
                                  20260828100000 widened trg_supplier_default_account_sync so an edit
                                  to the default writes through to `suppliers.iban`, which is what the
                                  payment path reads. Delete is still refused for the default,
                                  because there would be nothing left to point that column at.

                                  No spacers standing in for the two controls the default does not
                                  get: the row is `justify-end`, so with the star and the cross simply
                                  absent the pencil lands where the cross sits on every other row,
                                  which is the right edge the eye is already following down.
                                */}
                                {/* Always there on the default, on hover for the rest. The default
                                    is the one people copy into a banking form again and again; the
                                    others are looked at, not used, so their button stays out of the
                                    way until the row is under the cursor. Focus reveals it too, so
                                    it is reachable by keyboard. */}
                                {/* Leftmost, and holding its slot whether or not it is showing:
                                    `hidden` made the whole button group jump sideways the moment a
                                    row was hovered. `invisible` keeps the width, so revealing it
                                    moves nothing. */}
                                <BankKontoKopieren
                                  konto={k}
                                  className={
                                    istStandard
                                      ? undefined
                                      : "invisible group-hover:visible group-focus-within:visible"
                                  }
                                />
                                {!k.confirmed_at && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className="flex size-7 cursor-pointer items-center justify-center rounded text-amber-700 transition-colors hover:bg-background hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={t(
                                          "lieferanten.detail.bankkonten.neu.bestaetigen",
                                        )}
                                        disabled={confirmBankAccount.isPending}
                                        onClick={() =>
                                          confirmBankAccount.mutate(k.id, {
                                            onSuccess: () =>
                                              toast.success(
                                                t("lieferanten.detail.bankkonten.neu.bestaetigt", {
                                                  iban: formatIBAN(k.iban),
                                                }),
                                              ),
                                            onError: (e) =>
                                              toast.error(
                                                t(
                                                  "lieferanten.detail.bankkonten.toast.fehlgeschlagen",
                                                  { error: fehlerText(e) },
                                                ),
                                              ),
                                          })
                                        }
                                      >
                                        <Check className="size-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t("lieferanten.detail.bankkonten.neu.bestaetigen")}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                      aria-label={t("lieferanten.detail.bankkonten.bearbeiten")}
                                      onClick={() => {
                                        setEditKonto(k);
                                        // Grouped, the way the table renders it. The column is
                                        // stored compacted, so an unformatted string in the field
                                        // invited "fixing" the spacing, which then saved nothing.
                                        setEditIban(formatIBAN(k.iban));
                                        setEditBic(k.bic ?? "");
                                        setEditBankName(k.bank_name ?? "");
                                      }}
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("lieferanten.detail.bankkonten.bearbeiten")}
                                  </TooltipContent>
                                </Tooltip>
                                {!istStandard && (
                                  <AlertDialog>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                            aria-label={t(
                                              "lieferanten.detail.bankkonten.entfernen",
                                            )}
                                          >
                                            <X className="size-3.5" />
                                          </button>
                                        </AlertDialogTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {t("lieferanten.detail.bankkonten.entfernen")}
                                      </TooltipContent>
                                    </Tooltip>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          {t("lieferanten.detail.bankkonten.confirm.title")}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {t("lieferanten.detail.bankkonten.confirm.desc", {
                                            iban: formatIBAN(k.iban),
                                          })}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          {t("lieferanten.detail.bankkonten.confirm.cancel")}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() =>
                                            deleteBankAccount.mutate(
                                              { id: k.id },
                                              {
                                                onSuccess: () =>
                                                  toast.success(
                                                    t(
                                                      "lieferanten.detail.bankkonten.toast.entfernt",
                                                      {
                                                        iban: formatIBAN(k.iban),
                                                      },
                                                    ),
                                                  ),
                                                onError: (e) =>
                                                  toast.error(
                                                    t(
                                                      "lieferanten.detail.bankkonten.toast.fehlgeschlagen",
                                                      { error: fehlerText(e) },
                                                    ),
                                                  ),
                                              },
                                            )
                                          }
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          {t("lieferanten.detail.bankkonten.confirm.confirm")}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {kontenSeite.hasMore && (
                        <TableRow ref={kontenSeite.sentinelRef}>
                          <TableCell
                            colSpan={6}
                            className="py-3 text-center text-xs text-muted-foreground"
                          >
                            {t("mehrLaden.rest", {
                              count: kontenSeite.total - kontenSeite.visible.length,
                            })}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Collapsed, because a deactivated account is history rather than something to act on. */}
            {inaktiveKonten.length > 0 && (
              <Collapsible
                open={inaktiveKontenOffen}
                onOpenChange={setInaktiveKontenOffen}
                className="mt-4 border-t border-border pt-3"
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
                    {t("lieferanten.detail.bankkonten.inaktivTitle", {
                      count: inaktiveKonten.length,
                    })}
                    <ChevronDown
                      className={`size-3.5 transition-transform ${inaktiveKontenOffen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5">
                  {inaktiveKonten.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono text-muted-foreground line-through">
                        {formatIBAN(k.iban)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {t(`lieferanten.detail.bankkonten.quelle.${k.source}`)}
                      </span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* An account carries what the default carries -- BIC and bank name included -- so it is
                collected in a dialog rather than through a single inline field. */}
            <Dialog open={ibanVerlaufOffen} onOpenChange={setIbanVerlaufOffen}>
              <DialogContent
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement | null)?.focus();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {t("lieferanten.detail.ibanVerlauf.title", {
                      count: historyQ.data?.length ?? 0,
                    })}
                  </DialogTitle>
                </DialogHeader>
                {/* A rail, the same shape the workflow history uses: newest at the top, each
                    arrow pointing UP at what replaced the account below it.

                    What the table actually holds is the account that was SUPERSEDED, written by
                    trg_capture_supplier_iban_history whenever suppliers.iban changes, so the
                    current default is not in it. The rail therefore starts with the current one and
                    the history hangs beneath it, which is the only reading in which the arrows are
                    true. */}
                <p className="text-xs text-muted-foreground">
                  {t("lieferanten.detail.ibanVerlauf.hinweis")}
                </p>
                <ol className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
                  {(historyQ.data ?? []).map((h, i, alle) => (
                    <li key={h.id} className="flex gap-3">
                      <div className="flex w-5 shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-3 shrink-0 rounded-full",
                            i === 0
                              ? "bg-brand ring-2 ring-brand/60 ring-offset-2 ring-offset-background"
                              : "bg-muted-foreground/40",
                          )}
                        />
                        {i < alle.length - 1 && (
                          <>
                            <ArrowUp
                              className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/70"
                              aria-hidden="true"
                            />
                            <span className="-mt-1 mb-1 w-0 flex-1 border-l-2 border-muted-foreground/20" />
                          </>
                        )}
                      </div>
                      <div className="min-w-0 pb-4">
                        {/* The event first, then the account it is about. A list of IBANs with
                            dates left you to work out which line was an addition and which was a
                            promotion. */}
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-foreground">
                            {t(
                              `lieferanten.detail.ibanVerlauf.event.${h.event ?? "default_changed"}`,
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(h.changed_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-sm text-foreground">
                          {h.iban ? formatIBAN(h.iban) : "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {verlaufAkteur(h.changed_by, t)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </DialogContent>
            </Dialog>

            {/* Editing an existing account. Same three fields as adding one, because an account
                is the same thing whether it is new or not. Only ever opened for a non-default row:
                the mutation carries `is_default = false` in its WHERE as the last line of defence. */}
            <Dialog open={!!editKonto} onOpenChange={(o) => !o && setEditKonto(null)}>
              {/* Radix focuses the first field when a dialog opens, which drops a caret into the
                  IBAN before anyone has decided to type there. Focus goes to the panel instead,
                  so Escape and Tab still work and no field looks half filled in. */}
              <DialogContent
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement | null)?.focus();
                }}
              >
                <DialogHeader>
                  <DialogTitle>{t("lieferanten.detail.bankkonten.editDialog.title")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-iban">
                      {t("lieferanten.detail.bankkonten.col.iban")}{" "}
                      <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="edit-iban"
                      required
                      value={editIban}
                      onChange={(e) => setEditIban(e.target.value)}
                      className={`mt-1 font-mono text-sm ${editIbanUngueltig ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {editIbanUngueltig && (
                      <p className="mt-1 text-[11px] text-destructive">
                        {t("lieferanten.detail.bankkonten.toast.ungueltig")}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-bic">{t("lieferanten.detail.bankkonten.col.bic")}</Label>
                    <Input
                      id="edit-bic"
                      value={editBic}
                      onChange={(e) => setEditBic(e.target.value)}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-bank">{t("lieferanten.detail.bankkonten.col.bank")}</Label>
                    <Input
                      id="edit-bank"
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditKonto(null)}>
                    {t("lieferanten.detail.bankkonten.dialog.abbrechen")}
                  </Button>
                  <Button
                    disabled={
                      !editIban.trim() ||
                      editIbanUngueltig ||
                      editUnveraendert ||
                      updateBankAccount.isPending
                    }
                    onClick={() => {
                      if (!editKonto) return;
                      if (editUnveraendert) return;
                      updateBankAccount.mutate(
                        {
                          id: editKonto.id,
                          iban: editIban,
                          bic: editBic,
                          bank_name: editBankName,
                        },
                        {
                          onSuccess: () => {
                            toast.success(
                              t("lieferanten.detail.bankkonten.toast.gespeichert", {
                                iban: formatIBAN(compactIBAN(editIban) ?? editIban),
                              }),
                            );
                            setEditKonto(null);
                          },
                          onError: (e) =>
                            toast.error(
                              t("lieferanten.detail.bankkonten.toast.fehlgeschlagen", {
                                error: fehlerText(e),
                              }),
                            ),
                        },
                      );
                    }}
                  >
                    {t("lieferanten.detail.bankkonten.editDialog.speichern")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <BankAccountDialog
              open={bankDialogOffen}
              onOpenChange={setBankDialogOffen}
              existingIbans={aktiveKonten.map((k) => k.iban)}
              saving={addBankAccount.isPending}
              labels={{
                title: t("lieferanten.detail.bankkonten.dialog.title"),
                iban: t("lieferanten.detail.bankkonten.col.iban"),
                bic: t("lieferanten.detail.bankkonten.col.bic"),
                bank: t("lieferanten.detail.bankkonten.col.bank"),
                cancel: t("lieferanten.detail.bankkonten.dialog.abbrechen"),
                save: t("lieferanten.detail.bankkonten.dialog.speichern"),
                invalidIban: t("lieferanten.detail.bankkonten.toast.ungueltig"),
                duplicateIban: t("lieferanten.detail.bankkonten.toast.bereitsVorhanden"),
              }}
              onSave={(input) =>
                addBankAccount.mutate(input, {
                  onSuccess: () => {
                    setBankDialogOffen(false);
                    toast.success(
                      t("lieferanten.detail.bankkonten.toast.hinzugefuegt", {
                        iban: formatIBAN(input.iban),
                      }),
                    );
                  },
                  onError: (e) =>
                    toast.error(
                      t("lieferanten.detail.bankkonten.toast.fehlgeschlagen", {
                        error: fehlerText(e),
                      }),
                    ),
                })
              }
            />
          </section>
          <section className="rounded-xl bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {/* Count and total sit ON the heading line. As tiles underneath they were two more
                  boxes competing with the table for the eye, for two numbers that are a subtitle. */}
              <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("lieferanten.detail.section.verbucht")}
                {/* Count and total come from two different queries -- the count from the paged
                    row query's exact count, the sum from the aggregate projection -- so they are
                    gated separately rather than one publishing the other's zero. */}
                {belegeQ.data !== undefined ? (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("lieferanten.detail.gesamt", { count: belegeGesamt })}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
                {aggregatQ.data !== undefined ? (
                  <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                    {formatEUR(summe)}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
                {/* On the heading line with the count and the total, which is where the eye already
                    is. As a tile below it was a box of its own for one number. */}
                {lastschriftBelege.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium normal-case tracking-normal text-amber-900">
                    <Landmark className="size-3 shrink-0" />
                    {t("lieferanten.detail.lastschrift.anzahl", {
                      count: lastschriftBelege.length,
                    })}
                  </span>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {/* One control: the period list turns into the range calendar in place, the way
                    the overview's picker works. */}
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
            </div>
            <div className="mb-4 flex flex-wrap gap-3 empty:mb-0">
              {/* Direct debit used to be a card of its own, which meant the same invoices were
                  listed twice on one screen and the count sat away from the totals it belongs with.
                  Shown only when there are any: a supplier that never collects by direct debit does
                  not need a tile saying zero. */}
            </div>
            {/* Below `sm`, cards replace the table entirely rather than relying on any horizontal
                scroll -- table-internal or page-level. */}
            <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
              {/* Capped and scrolled rather than left to grow: the card sits in a grid
                  row, so an unbounded table drags the whole page height with it. The
                  header cells are sticky and carry their own solid background -- on the
                  row alone the tint is translucent and scrolled rows show through. */}
              <Table containerClassName="max-h-[26rem]">
                <TableHeader>
                  <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                    <TableHead>{t("lieferanten.detail.col.beleg")}</TableHead>
                    <TableHead>{t("lieferanten.detail.col.ges")}</TableHead>
                    <TableHead>{t("lieferanten.detail.col.datum")}</TableHead>
                    <TableHead className="text-right">
                      {t("lieferanten.detail.col.betrag")}
                    </TableHead>
                    <TableHead>{t("lieferanten.detail.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {belege.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({ to: "/eingangsrechnungen/$nr", params: { nr: b.id } })
                      }
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {b.invoice_number ?? t("lieferanten.detail.ohneNr")}
                        </div>
                        <div className="max-w-[140px] truncate text-xs text-muted-foreground">
                          {b.property_code ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <GesellschaftChip code={b.company_code} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(b.document_date)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          {unusualIds.has(b.id) && <UnusualAmountBadge />}
                          {/* Which invoices were collected by direct debit is the part of the old
                              card worth keeping, and it belongs on the row it describes. */}
                          {istLastschrift(b.payment_method) && (
                            <Landmark
                              className="size-3.5 shrink-0 text-amber-700"
                              aria-label={t("lieferanten.detail.section.lastschrift")}
                            />
                          )}
                          {formatEUR(b.amount_gross)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {belegeQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <SectionSkeleton className="h-80" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!belegeQ.isLoading && belege.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t("lieferanten.detail.belegeEmpty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {belegeQ.hasNextPage && (
                    <TableRow ref={belegeSentinelRef}>
                      <TableCell
                        colSpan={99}
                        className="py-3 text-center text-xs text-muted-foreground"
                      >
                        {t("mehrLaden.rest", {
                          count: belegeGesamt - belege.length,
                        })}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Windowed exactly like the table above it. This list used to map `belege` whole, so
                the windowing only ever applied on a desktop width and a supplier with hundreds of
                invoices put every one of them in the DOM on the device least able to carry it. */}
            <div className="space-y-2 sm:hidden">
              {belege.map((b) => (
                <div
                  key={b.id}
                  className="cursor-pointer rounded-lg border border-border p-3"
                  onClick={() => navigate({ to: "/eingangsrechnungen/$nr", params: { nr: b.id } })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {b.invoice_number ?? t("lieferanten.detail.ohneNr")}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {b.property_code ?? "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                      {formatEUR(b.amount_gross)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <GesellschaftChip code={b.company_code} />
                    <StatusBadge status={b.status} />
                    {unusualIds.has(b.id) && <UnusualAmountBadge />}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {formatDate(b.document_date)}
                    </span>
                  </div>
                </div>
              ))}
              {belegeQ.hasNextPage && (
                <p
                  ref={belegeSentinelRef}
                  className="py-3 text-center text-xs text-muted-foreground"
                >
                  {t("mehrLaden.rest", {
                    count: belegeGesamt - belege.length,
                  })}
                </p>
              )}
              {belegeQ.isLoading && <SectionSkeleton className="h-80" />}
              {!belegeQ.isLoading && belege.length === 0 && (
                <p className="rounded-lg border border-border py-8 text-center text-muted-foreground">
                  {t("lieferanten.detail.belegeEmpty")}
                </p>
              )}
            </div>
          </section>
          {/*
            Bankverbindungen. suppliers.iban is still the default and still what the payment path and
            the pipeline's fraud screen read; this lists every account the supplier is known to bill
            from, so a second legitimate account can be recorded instead of overwriting the first.

            A table rather than a list, and a dialog rather than an inline field, because an account
            is not just an IBAN: BIC and bank name are carried on the default already, and an account
            added here should be able to hold everything the default does.

            Deactivate rather than delete throughout: the table has no delete policy on purpose, so an
            account that was once paid stays explainable.
          */}
        </div>
      </div>

      <Dialog open={edit} onOpenChange={(o) => (o ? undefined : abbrechen())}>
        {/* Radix focuses the first field when a dialog opens, which drops a caret into the Name
            field before anyone has decided to type there. Focus goes to the panel instead, so
            Escape and Tab still work and no field looks half filled in. */}
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("lieferanten.detail.editTitle")}</DialogTitle>
            <DialogDescription>{t("lieferanten.detail.editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <LField
              label={t("lieferanten.detail.field.name")}
              value={f.name}
              onChange={(v) => setF("name", v)}
              full
            />
            <LField
              label={t("lieferanten.detail.field.adresse")}
              value={f.address}
              onChange={(v) => setF("address", v)}
              full
            />
            <LField
              label={t("lieferanten.detail.field.ustId")}
              value={f.vat_id}
              onChange={(v) => setF("vat_id", v)}
            />
            <LField
              label={t("lieferanten.detail.field.telefon")}
              value={f.phone}
              onChange={(v) => setF("phone", v)}
            />
            <LField
              label={t("lieferanten.detail.field.email")}
              value={f.email}
              onChange={(v) => setF("email", v)}
            />
            <LField
              label={t("lieferanten.detail.field.ansprechpartner")}
              value={f.contact_person}
              onChange={(v) => setF("contact_person", v)}
              full
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={abbrechen}>
              {t("lieferanten.detail.action.abbrechen")}
            </Button>
            <Button onClick={speichern} disabled={updateL.isPending || !hatAenderungen}>
              {updateL.isPending
                ? t("lieferanten.detail.action.speichere")
                : t("lieferanten.detail.action.speichern")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LField({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
