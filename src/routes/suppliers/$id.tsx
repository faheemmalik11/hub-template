import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PeriodPicker } from "@/components/data-table/period-picker";
import {
  usePeriodOptions,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";
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

import { KnownSpellingsCard } from "@/components/master-data/known-spellings-card";

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
  useDocumentsBySupplierPages,
  useSupplierDocumentAggregate,
  useDeleteSupplierBankAccount,
  useUpdateSupplierBankAccount,
  useSupplier,
  useSuppliers,
  useRestoreSupplier,
  useSoftDeleteSupplier,
  useSetDefaultSupplierIban,
  useSupplierBankAccounts,
  useSupplierIbanHistory,
  useUpdateSupplier,
} from "@/data";
import {
  compactIBAN,
  dateLocale,
  detectUnusualAmounts,
  errorText,
  formatDate,
  formatDateTime,
  formatEUR,
  formatIBAN,
  isPayableIBAN,
  isDirectDebit,
  recentSupplierIbanChange,
} from "@/lib/data/format";
import { CopyButton } from "@/components/documents/copy-button";
import { CompanyChip, StatusBadge, UnusualAmountBadge } from "@/components/documents/badges";
import { MergeSupplierDialog } from "@/components/documents/merge-supplier-dialog";
import { ErrorState } from "@/components/documents/query-states";
import { NewRuleDialog } from "@/components/assignment/new-rule-dialog";
import { BankAccountDialog } from "@/components/suppliers/bank-account-dialog";
import { SectionSkeleton } from "@/components/records/section-skeleton";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Supplier, SupplierBankAccount } from "@/lib/data/types";

// "Gesamt" in the shared period vocabulary. The option list is fixed and shared now (see
// `zeitraum-optionen`), so this screen no longer derives months, quarters and years from its own
// rows -- the same nine presets appear on every screen that has a period picker.
const ALL_PERIODS = PERIOD_ALL;

export const Route = createFileRoute("/suppliers/$id")({
  head: () => ({ meta: [{ title: pageTitle("Lieferant") }] }),
  component: SupplierDetailPage,
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

function lFormFrom(l: Supplier): LForm {
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
function historyActor(value: string | null, t: (k: string) => string): string {
  const raw = value?.trim();
  if (!raw) return t("suppliers.detail.ibanVerlauf.akteurUnbekannt");
  if (raw === "pipeline") return t("suppliers.detail.ibanVerlauf.akteurPipeline");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))
    return t("suppliers.detail.ibanVerlauf.akteurHub");
  return raw;
}

function BankAccountCopy({
  account,
  className,
}: {
  account: SupplierBankAccount;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = [formatIBAN(account.iban), account.bic?.trim(), account.bank_name?.trim()]
    .filter((z): z is string => !!z && z !== "—")
    .join("\n");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("suppliers.detail.bankkonten.kopieren")}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            className,
          )}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error(t("suppliers.detail.bankkonten.kopierenFehlgeschlagen"));
            }
          }}
        >
          {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("suppliers.detail.bankkonten.kopieren")}</TooltipContent>
    </Tooltip>
  );
}

function SupplierDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const supplierQ = useSupplier(id);
  const allSuppliersQ = useSuppliers();
  const historyQ = useSupplierIbanHistory(id);
  const updateL = useUpdateSupplier(id);
  const deleteL = useSoftDeleteSupplier(id);
  const restoreL = useRestoreSupplier(id);
  const bankAccountsQ = useSupplierBankAccounts(id);
  const addBankAccount = useAddSupplierBankAccount(id);
  const confirmBankAccount = useConfirmSupplierBankAccount();
  const deleteBankAccount = useDeleteSupplierBankAccount(id);
  const updateBankAccount = useUpdateSupplierBankAccount(id);
  const setDefaultIban = useSetDefaultSupplierIban(id);

  const supplier = supplierQ.data ?? null;

  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<LForm | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [ibanHistoryOpen, setIbanHistoryOpen] = useState(false);
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
  const [accountsMaxHeight, setAccountsMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    const details = detailsCardRef.current;
    if (!details) return;
    const measure = () => {
      const chrome = (bankHeaderRef.current?.getBoundingClientRect().height ?? 0) + 40;
      // A floor, so a supplier with almost nothing on file does not squeeze the table to nothing.
      setAccountsMaxHeight(Math.max(180, details.getBoundingClientRect().height - chrome));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(details);
    if (bankHeaderRef.current) ro.observe(bankHeaderRef.current);
    return () => ro.disconnect();
  }, []);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<SupplierBankAccount | null>(null);
  const [editIban, setEditIban] = useState("");
  const [editBic, setEditBic] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [inactiveAccountsOpen, setInactiveAccountsOpen] = useState(false);
  const [period, setPeriod] = useState(ALL_PERIODS);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const range = useMemo(() => periodArea(period, fromDate, toDate), [period, fromDate, toDate]);
  const periodOptions = usePeriodOptions();

  /**
   * The invoice table, fetched a page at a time as the reader scrolls.
   *
   * The period is part of the query, not a filter applied to rows that were fetched anyway, so
   * picking a quarter narrows what the server sends instead of hiding most of what it already sent.
   */
  const documentsQ = useDocumentsBySupplierPages(id, range);
  const documents = useMemo(
    () => (documentsQ.data?.pages ?? []).flatMap((page) => page.rows),
    [documentsQ.data],
  );
  // The server's exact count for the current period, not "how many are loaded so far".
  const documentsTotal = documentsQ.data?.pages[0]?.total ?? 0;
  const documentsSentinelRef = useFetchNextSentinel(
    documentsQ.hasNextPage,
    documentsQ.isFetchingNextPage,
    documentsQ.fetchNextPage,
  );

  /**
   * Full, unfiltered history for this supplier, as a narrow projection.
   *
   * The period filter only applies to what is DISPLAYED; the unusual-amount baseline, the
   * direct-debit count and the period picker's own options all need the complete history, not the
   * currently filtered slice and certainly not one page of it. Five scalar columns rather than
   * whole invoice rows -- see BELEG_AGGREGAT_SPALTEN in queries.ts.
   */
  const aggregateQ = useSupplierDocumentAggregate(id);
  const allDocuments = useMemo(() => aggregateQ.data ?? [], [aggregateQ.data]);

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
  const unusualIds = useMemo(() => detectUnusualAmounts(allDocuments), [allDocuments]);
  const directDebitDocuments = useMemo(
    () => allDocuments.filter((b) => isDirectDebit(b.payment_method)),
    [allDocuments],
  );
  const ibanChange = useMemo(() => recentSupplierIbanChange(historyQ.data ?? []), [historyQ.data]);
  // The account suppliers.iban points at. Compared compacted on both sides: suppliers.iban keeps
  // whatever formatting the document reader printed, while supplier_bank_accounts.iban is
  // normalised by a database trigger, so the raw strings routinely differ for the same account.
  const standardIban = useMemo(() => compactIBAN(supplierQ.data?.iban), [supplierQ.data?.iban]);
  /**
   * What counts as the default account, defined once.
   *
   * The flag (migration 20260827190000) with the IBAN comparison as a fallback, for a row the sync
   * trigger has not touched yet. Both the card on the left and the table on the right ask this same
   * question, so they cannot disagree about which account is the default, and the card cannot come
   * up empty while the table plainly marks one.
   */
  const isStandardAccount = useCallback(
    (k: SupplierBankAccount) => k.is_default || k.iban === standardIban,
    [standardIban],
  );
  const standardAccount = useMemo(
    () => (bankAccountsQ.data ?? []).find(isStandardAccount) ?? null,
    [bankAccountsQ.data, isStandardAccount],
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
  const standardAccountIban =
    standardAccount?.iban ??
    (isPayableIBAN(compactIBAN(supplierQ.data?.iban)) ? compactIBAN(supplierQ.data?.iban) : null);
  const unusableIban =
    !standardAccountIban && (supplierQ.data?.iban?.trim() ?? "") !== ""
      ? (supplierQ.data?.iban ?? null)
      : null;
  const standardBic = standardAccount?.bic ?? supplierQ.data?.bic ?? null;
  const standardBankName = standardAccount?.bank_name ?? supplierQ.data?.bank_name ?? null;
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
  const hatUnconfirmedAccount = (bankAccountsQ.data ?? []).some(
    (k) => k.is_active && !k.deleted_at && !k.confirmed_at,
  );
  const activeAccounts = useMemo(
    () => (bankAccountsQ.data ?? []).filter((k) => k.is_active),
    [bankAccountsQ.data],
  );
  const accountsKey = activeAccounts
    .map((k) => k.id)
    .sort()
    .join("|");
  // React-sanctioned "adjust state during render", the same pattern useTableView uses for its page
  // reset: no effect, no second paint, and the order is right on the first render of a new set.
  const [order, setOrder] = useState<{ key: string; ids: string[] }>({
    key: "",
    ids: [],
  });
  if (order.key !== accountsKey) {
    setOrder({
      key: accountsKey,
      ids: [...activeAccounts]
        .sort((a, b) => Number(isStandardAccount(b)) - Number(isStandardAccount(a)))
        .map((k) => k.id),
    });
  }
  const sortedAccounts = useMemo(() => {
    const space = new Map(order.ids.map((id, i) => [id, i]));
    return [...activeAccounts].sort(
      (a, b) => (space.get(a.id) ?? Infinity) - (space.get(b.id) ?? Infinity),
    );
  }, [activeAccounts, order]);
  // Non-empty and not a payable shape: drives the inline hint and disables Add, so a mistyped
  // IBAN is caught while it is still on screen rather than after a round-trip.
  const editIbanInvalid = editIban.trim() !== "" && !isPayableIBAN(editIban);
  /**
   * Whether the edit dialog is showing exactly what is already stored.
   *
   * Both sides are normalised before comparing, and that is the whole point. The IBAN column holds
   * the compacted form while the field shows it grouped, so "DE14 5138" and "DE145138" are the same
   * account. BIC and bank name are trimmed on both sides because some rows hold a single space
   * rather than null: untrimmed, such a row armed Save the moment the dialog opened, on a form
   * nobody had touched.
   */
  const editUnchanged =
    !!editAccount &&
    compactIBAN(editIban) === compactIBAN(editAccount.iban) &&
    (editBic.trim() || null) === (editAccount.bic?.trim() || null) &&
    (editBankName.trim() || null) === (editAccount.bank_name?.trim() || null);
  const inactiveAccounts = useMemo(
    () => (bankAccountsQ.data ?? []).filter((k) => !k.is_active),
    [bankAccountsQ.data],
  );
  // Same treatment as the invoice table: revealed a page at a time, while the count in the
  // header and the list page's `+N` badge still count every active account.
  const accountsPage = useInfiniteRows(sortedAccounts, 15);

  if (supplierQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (supplierQ.isError) {
    return <ErrorState error={supplierQ.error} onRetry={() => supplierQ.refetch()} />;
  }
  if (!supplier) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("suppliers.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/suppliers">{t("suppliers.detail.toList")}</Link>
        </Button>
      </div>
    );
  }
  const l = supplier;
  const f = form ?? lFormFrom(l);
  const setF = (k: keyof LForm, v: string) =>
    setForm((prev) => ({ ...(prev ?? lFormFrom(l)), [k]: v }));

  function startEdit() {
    setForm(lFormFrom(l));
    setEdit(true);
  }
  function cancel() {
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
  const collectChanges = (): Partial<Supplier> => {
    const changes: Partial<Supplier> = {};
    (Object.keys(f) as (keyof LForm)[]).forEach((k) => {
      const next = f[k].trim() || null;
      // Trimmed on the record side too: a field holding a single space is not a value, and left
      // untrimmed it counted as a difference against an empty input and armed Save on open.
      const alt = ((l[k] as string | null) ?? "").trim() || null;
      if (next !== alt) (changes as Record<string, unknown>)[k] = next;
    });
    return changes;
  };
  const hatChanges = Object.keys(collectChanges()).length > 0;

  function save() {
    const changes = collectChanges();
    if (Object.keys(changes).length === 0) {
      toast.info(t("suppliers.detail.toast.keineAenderungen"));
      setEdit(false);
      return;
    }
    updateL.mutate(changes, {
      onSuccess: () => {
        toast.success(t("suppliers.detail.toast.gespeichert"));
        setForm(null);
        setEdit(false);
      },
      onError: (e) =>
        toast.error(
          t("suppliers.detail.toast.speichernFehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }
  function confirmDelete() {
    deleteL.mutate(deleteReason.trim(), {
      onSuccess: () => {
        toast.success(t("suppliers.detail.toast.geloescht"));
        navigate({ to: "/suppliers" });
      },
      onError: (e) =>
        toast.error(
          t("suppliers.detail.toast.loeschenFehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  // The name is the page's heading, two lines above this card. Repeating it as the first field said
  // the same thing twice and pushed everything that is not the heading further down.
  const readFields: { label: string; value: string; mono?: boolean; copy?: string }[] = [
    {
      label: t("suppliers.detail.field.adresse"),
      value: l.address ?? "—",
      copy: l.address ?? undefined,
    },
    {
      label: t("suppliers.detail.field.ustId"),
      value: l.vat_id ?? "—",
      copy: l.vat_id ?? undefined,
    },
    {
      label: t("suppliers.detail.field.telefon"),
      value: l.phone ?? "—",
      copy: l.phone ?? undefined,
    },
    {
      label: t("suppliers.detail.field.email"),
      value: l.email ?? "—",
      copy: l.email ?? undefined,
    },
    { label: t("suppliers.detail.field.ansprechpartner"), value: l.contact_person ?? "—" },
  ];

  return (
    <div>
      <Link
        to="/suppliers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("suppliers.detail.back")}
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
          {hatUnconfirmedAccount && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  <TriangleAlert className="size-3.5" />
                  {t("suppliers.detail.bankkonten.neu.header")}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[20rem]">
                {t("suppliers.detail.bankkonten.neu.headerHinweis")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startEdit} className="gap-2">
            <Pencil className="size-4" /> {t("suppliers.detail.action.bearbeiten")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("suppliers.detail.action.mehr")}>
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
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setRuleOpen(true)}>
                  <Wand2 className="size-4" /> {t("suppliers.detail.regel.button")}
                </DropdownMenuItem>
              )}
              {/* merge_suppliers() rejects an already-deleted merge-away supplier, so the action is
                  hidden here rather than left to fail as a raw exception toast. */}
              {!l.deleted_at && (
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setMergeOpen(true)}>
                  <Merge className="size-4" /> {t("suppliers.detail.merge.button")}
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
                      onSuccess: () => toast.success(t("suppliers.detail.restore.toast")),
                      onError: (e) =>
                        toast.error(
                          t("suppliers.detail.toast.loeschenFehlgeschlagen", {
                            error: errorText(e),
                          }),
                        ),
                    })
                  }
                >
                  <RotateCcw className="size-4" /> {t("suppliers.detail.restore.button")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" /> {t("suppliers.detail.delete.button")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!l.deleted_at && (
        <NewRuleDialog
          defaultSupplierId={l.id}
          fixedTarget="cost_category"
          open={ruleOpen}
          onOpenChange={setRuleOpen}
        />
      )}
      {!l.deleted_at && (
        <MergeSupplierDialog
          supplier={l}
          suppliers={(allSuppliersQ.data ?? []).filter((s) => s.id !== l.id && !s.deleted_at)}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          onMerged={() => navigate({ to: "/suppliers" })}
        />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suppliers.detail.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("suppliers.detail.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder={t("suppliers.detail.delete.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("suppliers.detail.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteReason.trim()}
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("suppliers.detail.delete.confirm")}
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
            {t("suppliers.detail.geloeschtBanner", {
              datum: formatDateTime(l.deleted_at),
              reason: l.delete_reason || t("suppliers.detail.geloeschtOhneGrund"),
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
              {t("suppliers.detail.section.stammdaten")}
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
          <KnownSpellingsCard entityType="lieferant" entityCode={id} frame={false} />
        </div>
        <div className="space-y-6">
          <section className="rounded-xl bg-card p-5">
            <div
              ref={bankHeaderRef}
              className="mb-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("suppliers.detail.section.bankkonten")}
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
                    onClick={() => setIbanHistoryOpen(true)}
                  >
                    <History className="size-3.5" />
                    {t("suppliers.detail.ibanVerlauf.button")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setBankDialogOpen(true)}
                >
                  <Plus className="size-3.5" /> {t("suppliers.detail.bankkonten.hinzufuegen")}
                </Button>
              </div>
            </div>

            {bankAccountsQ.isLoading ? (
              <SectionSkeleton className="h-44" />
            ) : activeAccounts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                {t("suppliers.detail.bankkonten.empty")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: accountsMaxHeight ? `${accountsMaxHeight}px` : undefined }}
                >
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                        {/* The star leads the row: it is what you scan for, and reading "which one
                            is the default" should not mean crossing four columns first. */}
                        <TableHead className="w-9" />
                        <TableHead>{t("suppliers.detail.bankkonten.col.iban")}</TableHead>
                        <TableHead>{t("suppliers.detail.bankkonten.col.bic")}</TableHead>
                        <TableHead>{t("suppliers.detail.bankkonten.col.bank")}</TableHead>
                        <TableHead>{t("suppliers.detail.bankkonten.col.quelle")}</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountsPage.visible.map((k) => {
                        const isStandard = isStandardAccount(k);
                        return (
                          <TableRow
                            key={k.id}
                            className={
                              isStandard
                                ? "group bg-primary/5 [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-primary"
                                : "group"
                            }
                          >
                            <TableCell className="w-9 pr-0">
                              {isStandard ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="flex size-7 cursor-default items-center justify-center text-primary"
                                      aria-label={t("suppliers.detail.bankkonten.standard")}
                                    >
                                      <Star className="size-3.5 fill-current" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("suppliers.detail.bankkonten.standard")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label={t("suppliers.detail.bankkonten.alsStandard")}
                                      disabled={setDefaultIban.isPending}
                                      onClick={() =>
                                        setDefaultIban.mutate(
                                          { iban: k.iban, bic: k.bic, bank_name: k.bank_name },
                                          {
                                            onSuccess: () =>
                                              toast.success(
                                                t(
                                                  "suppliers.detail.bankkonten.toast.standardGesetzt",
                                                  { iban: formatIBAN(k.iban) },
                                                ),
                                              ),
                                            onError: (e) =>
                                              toast.error(
                                                t(
                                                  "suppliers.detail.bankkonten.toast.fehlgeschlagen",
                                                  { error: errorText(e) },
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
                                    {t("suppliers.detail.bankkonten.alsStandard")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              <span
                                className={isStandard ? "font-medium text-foreground" : undefined}
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
                                      {t("suppliers.detail.bankkonten.neu.badge")}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[20rem]">
                                    {t("suppliers.detail.bankkonten.neu.hinweis")}
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
                              <div>{t(`suppliers.detail.bankkonten.quelle.${k.source}`)}</div>
                              <div className="text-[11px] opacity-80">
                                {t("suppliers.detail.bankkonten.seit", {
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
                                <BankAccountCopy
                                  account={k}
                                  className={
                                    isStandard
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
                                          "suppliers.detail.bankkonten.neu.bestaetigen",
                                        )}
                                        disabled={confirmBankAccount.isPending}
                                        onClick={() =>
                                          confirmBankAccount.mutate(k.id, {
                                            onSuccess: () =>
                                              toast.success(
                                                t("suppliers.detail.bankkonten.neu.bestaetigt", {
                                                  iban: formatIBAN(k.iban),
                                                }),
                                              ),
                                            onError: (e) =>
                                              toast.error(
                                                t(
                                                  "suppliers.detail.bankkonten.toast.fehlgeschlagen",
                                                  { error: errorText(e) },
                                                ),
                                              ),
                                          })
                                        }
                                      >
                                        <Check className="size-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t("suppliers.detail.bankkonten.neu.bestaetigen")}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                      aria-label={t("suppliers.detail.bankkonten.bearbeiten")}
                                      onClick={() => {
                                        setEditAccount(k);
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
                                    {t("suppliers.detail.bankkonten.bearbeiten")}
                                  </TooltipContent>
                                </Tooltip>
                                {!isStandard && (
                                  <AlertDialog>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                            aria-label={t("suppliers.detail.bankkonten.entfernen")}
                                          >
                                            <X className="size-3.5" />
                                          </button>
                                        </AlertDialogTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {t("suppliers.detail.bankkonten.entfernen")}
                                      </TooltipContent>
                                    </Tooltip>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          {t("suppliers.detail.bankkonten.confirm.title")}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {t("suppliers.detail.bankkonten.confirm.desc", {
                                            iban: formatIBAN(k.iban),
                                          })}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          {t("suppliers.detail.bankkonten.confirm.cancel")}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() =>
                                            deleteBankAccount.mutate(
                                              { id: k.id },
                                              {
                                                onSuccess: () =>
                                                  toast.success(
                                                    t(
                                                      "suppliers.detail.bankkonten.toast.entfernt",
                                                      {
                                                        iban: formatIBAN(k.iban),
                                                      },
                                                    ),
                                                  ),
                                                onError: (e) =>
                                                  toast.error(
                                                    t(
                                                      "suppliers.detail.bankkonten.toast.fehlgeschlagen",
                                                      { error: errorText(e) },
                                                    ),
                                                  ),
                                              },
                                            )
                                          }
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          {t("suppliers.detail.bankkonten.confirm.confirm")}
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
                      {accountsPage.hasMore && (
                        <TableRow ref={accountsPage.sentinelRef}>
                          <TableCell
                            colSpan={6}
                            className="py-3 text-center text-xs text-muted-foreground"
                          >
                            {t("loadMore.rest", {
                              count: accountsPage.total - accountsPage.visible.length,
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
            {inactiveAccounts.length > 0 && (
              <Collapsible
                open={inactiveAccountsOpen}
                onOpenChange={setInactiveAccountsOpen}
                className="mt-4 border-t border-border pt-3"
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
                    {t("suppliers.detail.bankkonten.inaktivTitle", {
                      count: inactiveAccounts.length,
                    })}
                    <ChevronDown
                      className={`size-3.5 transition-transform ${inactiveAccountsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5">
                  {inactiveAccounts.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono text-muted-foreground line-through">
                        {formatIBAN(k.iban)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {t(`suppliers.detail.bankkonten.quelle.${k.source}`)}
                      </span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* An account carries what the default carries -- BIC and bank name included -- so it is
                collected in a dialog rather than through a single inline field. */}
            <Dialog open={ibanHistoryOpen} onOpenChange={setIbanHistoryOpen}>
              <DialogContent
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement | null)?.focus();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {t("suppliers.detail.ibanVerlauf.title", {
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
                  {t("suppliers.detail.ibanVerlauf.hinweis")}
                </p>
                <ol className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
                  {(historyQ.data ?? []).map((h, i, all) => (
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
                        {i < all.length - 1 && (
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
                              `suppliers.detail.ibanVerlauf.event.${h.event ?? "default_changed"}`,
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
                          {historyActor(h.changed_by, t)}
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
            <Dialog open={!!editAccount} onOpenChange={(o) => !o && setEditAccount(null)}>
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
                  <DialogTitle>{t("suppliers.detail.bankkonten.editDialog.title")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-iban">
                      {t("suppliers.detail.bankkonten.col.iban")} <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="edit-iban"
                      required
                      value={editIban}
                      onChange={(e) => setEditIban(e.target.value)}
                      className={`mt-1 font-mono text-sm ${editIbanInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {editIbanInvalid && (
                      <p className="mt-1 text-[11px] text-destructive">
                        {t("suppliers.detail.bankkonten.toast.ungueltig")}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-bic">{t("suppliers.detail.bankkonten.col.bic")}</Label>
                    <Input
                      id="edit-bic"
                      value={editBic}
                      onChange={(e) => setEditBic(e.target.value)}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-bank">{t("suppliers.detail.bankkonten.col.bank")}</Label>
                    <Input
                      id="edit-bank"
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditAccount(null)}>
                    {t("suppliers.detail.bankkonten.dialog.abbrechen")}
                  </Button>
                  <Button
                    disabled={
                      !editIban.trim() ||
                      editIbanInvalid ||
                      editUnchanged ||
                      updateBankAccount.isPending
                    }
                    onClick={() => {
                      if (!editAccount) return;
                      if (editUnchanged) return;
                      updateBankAccount.mutate(
                        {
                          id: editAccount.id,
                          iban: editIban,
                          bic: editBic,
                          bank_name: editBankName,
                        },
                        {
                          onSuccess: () => {
                            toast.success(
                              t("suppliers.detail.bankkonten.toast.gespeichert", {
                                iban: formatIBAN(compactIBAN(editIban) ?? editIban),
                              }),
                            );
                            setEditAccount(null);
                          },
                          onError: (e) =>
                            toast.error(
                              t("suppliers.detail.bankkonten.toast.fehlgeschlagen", {
                                error: errorText(e),
                              }),
                            ),
                        },
                      );
                    }}
                  >
                    {t("suppliers.detail.bankkonten.editDialog.speichern")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <BankAccountDialog
              open={bankDialogOpen}
              onOpenChange={setBankDialogOpen}
              existingIbans={activeAccounts.map((k) => k.iban)}
              saving={addBankAccount.isPending}
              labels={{
                title: t("suppliers.detail.bankkonten.dialog.title"),
                iban: t("suppliers.detail.bankkonten.col.iban"),
                bic: t("suppliers.detail.bankkonten.col.bic"),
                bank: t("suppliers.detail.bankkonten.col.bank"),
                cancel: t("suppliers.detail.bankkonten.dialog.abbrechen"),
                save: t("suppliers.detail.bankkonten.dialog.speichern"),
                invalidIban: t("suppliers.detail.bankkonten.toast.ungueltig"),
                duplicateIban: t("suppliers.detail.bankkonten.toast.bereitsVorhanden"),
              }}
              onSave={(input) =>
                addBankAccount.mutate(input, {
                  onSuccess: () => {
                    setBankDialogOpen(false);
                    toast.success(
                      t("suppliers.detail.bankkonten.toast.hinzugefuegt", {
                        iban: formatIBAN(input.iban),
                      }),
                    );
                  },
                  onError: (e) =>
                    toast.error(
                      t("suppliers.detail.bankkonten.toast.fehlgeschlagen", {
                        error: errorText(e),
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
                {t("suppliers.detail.section.verbucht")}
                {/* Count and total come from two different queries -- the count from the paged
                    row query's exact count, the sum from the aggregate projection -- so they are
                    gated separately rather than one publishing the other's zero. */}
                {documentsQ.data !== undefined ? (
                  <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                    {t("suppliers.detail.gesamt", { count: documentsTotal })}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-20" />
                )}
                {aggregateQ.data !== undefined ? (
                  <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                    {formatEUR(total)}
                  </span>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
                {/* On the heading line with the count and the total, which is where the eye already
                    is. As a tile below it was a box of its own for one number. */}
                {directDebitDocuments.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium normal-case tracking-normal text-amber-900">
                    <Landmark className="size-3 shrink-0" />
                    {t("suppliers.detail.lastschrift.anzahl", {
                      count: directDebitDocuments.length,
                    })}
                  </span>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {/* One control: the period list turns into the range calendar in place, the way
                    the overview's picker works. */}
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
                    <TableHead>{t("suppliers.detail.col.beleg")}</TableHead>
                    <TableHead>{t("suppliers.detail.col.ges")}</TableHead>
                    <TableHead>{t("suppliers.detail.col.datum")}</TableHead>
                    <TableHead className="text-right">{t("suppliers.detail.col.betrag")}</TableHead>
                    <TableHead>{t("suppliers.detail.col.status")}</TableHead>
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
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {b.invoice_number ?? t("suppliers.detail.ohneNr")}
                        </div>
                        <div className="max-w-[140px] truncate text-xs text-muted-foreground">
                          {b.property_code ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <CompanyChip code={b.company_code} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(b.document_date)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          {unusualIds.has(b.id) && <UnusualAmountBadge />}
                          {/* Which invoices were collected by direct debit is the part of the old
                              card worth keeping, and it belongs on the row it describes. */}
                          {isDirectDebit(b.payment_method) && (
                            <Landmark
                              className="size-3.5 shrink-0 text-amber-700"
                              aria-label={t("suppliers.detail.section.lastschrift")}
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
                  {documentsQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <SectionSkeleton className="h-80" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!documentsQ.isLoading && documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t("suppliers.detail.belegeEmpty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {documentsQ.hasNextPage && (
                    <TableRow ref={documentsSentinelRef}>
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

            {/* Windowed exactly like the table above it. This list used to map `belege` whole, so
                the windowing only ever applied on a desktop width and a supplier with hundreds of
                invoices put every one of them in the DOM on the device least able to carry it. */}
            <div className="space-y-2 sm:hidden">
              {documents.map((b) => (
                <div
                  key={b.id}
                  className="cursor-pointer rounded-lg border border-border p-3"
                  onClick={() => navigate({ to: "/incoming-invoices/$nr", params: { nr: b.id } })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {b.invoice_number ?? t("suppliers.detail.ohneNr")}
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
                    <CompanyChip code={b.company_code} />
                    <StatusBadge status={b.status} />
                    {unusualIds.has(b.id) && <UnusualAmountBadge />}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {formatDate(b.document_date)}
                    </span>
                  </div>
                </div>
              ))}
              {documentsQ.hasNextPage && (
                <p
                  ref={documentsSentinelRef}
                  className="py-3 text-center text-xs text-muted-foreground"
                >
                  {t("loadMore.rest", {
                    count: documentsTotal - documents.length,
                  })}
                </p>
              )}
              {documentsQ.isLoading && <SectionSkeleton className="h-80" />}
              {!documentsQ.isLoading && documents.length === 0 && (
                <p className="rounded-lg border border-border py-8 text-center text-muted-foreground">
                  {t("suppliers.detail.belegeEmpty")}
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

      <Dialog open={edit} onOpenChange={(o) => (o ? undefined : cancel())}>
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
            <DialogTitle>{t("suppliers.detail.editTitle")}</DialogTitle>
            <DialogDescription>{t("suppliers.detail.editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <LField
              label={t("suppliers.detail.field.name")}
              value={f.name}
              onChange={(v) => setF("name", v)}
              full
            />
            <LField
              label={t("suppliers.detail.field.adresse")}
              value={f.address}
              onChange={(v) => setF("address", v)}
              full
            />
            <LField
              label={t("suppliers.detail.field.ustId")}
              value={f.vat_id}
              onChange={(v) => setF("vat_id", v)}
            />
            <LField
              label={t("suppliers.detail.field.telefon")}
              value={f.phone}
              onChange={(v) => setF("phone", v)}
            />
            <LField
              label={t("suppliers.detail.field.email")}
              value={f.email}
              onChange={(v) => setF("email", v)}
            />
            <LField
              label={t("suppliers.detail.field.ansprechpartner")}
              value={f.contact_person}
              onChange={(v) => setF("contact_person", v)}
              full
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancel}>
              {t("suppliers.detail.action.abbrechen")}
            </Button>
            <Button onClick={save} disabled={updateL.isPending || !hatChanges}>
              {updateL.isPending
                ? t("suppliers.detail.action.speichere")
                : t("suppliers.detail.action.speichern")}
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
