import { createFileRoute, Link } from "@tanstack/react-router";
import { ZeitraumPicker } from "@/components/data-table/zeitraum-picker";
import {
  useZeitraumOptionen,
  ZEITRAUM_INDIVIDUELL,
  zeitraumBereich,
} from "@/components/data-table/zeitraum-optionen";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  SlidersHorizontal,
  Table as TableIcon,
  Trash2,
  Flag,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useKostenstelleResolver } from "@/lib/data/kostenstelle";

const LAST_OPENED_INVOICE_KEY = "belege.lastOpenedInvoice";
/** Stable across renders, so the selection hook does not rebuild its id list every time. */
const belegRowId = (b: BelegListeRow) => b.id;
const AI_SEARCH_RETURN_KEY = "belege.aiSearchReturn";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBelegeFacets,
  useBelegeKanbanCounts,
  useBelegeKanbanSpalte,
  useBelegeKpis,
  useInvoiceQueueKpis,
  useBelegeOhneGesellschaftCount,
  useBelegeListe,
  useBulkInvoiceActions,
  useGesellschaften,
} from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";
import {
  GESELLSCHAFT_OHNE,
  OBJEKT_OHNE,
  WORKFLOW_REIHENFOLGE,
  belegartKey,
  dateLocale,
  dueBucket,
  dueFilterRange,
  formatDate,
  formatDateTime,
  formatEUR,
  heuteLokal,
  istDatevBereit,
  istEingangsrechnung,
  istLastschrift,
  type DueFilter,
} from "@/lib/data/format";
import { ohnePruefungen, pruefGruende } from "@/features/invoice-detail/pruefung";
// The rows arrive already re-checked against their current data: useBelegeListe verifies at the
// read (see `nachgeprueft` in queries.ts), so a row whose company has since been assigned is not
// still counted as missing one.
import { ReviewBadge } from "@/features/invoice-detail/ReviewChip";
import { AusgangBadge } from "@/features/invoice-detail/AusgangFlag";
import {
  BelegartBadge,
  DatevBereitBadge,
  DatevUebergabeBadge,
  GesellschaftChip,
  KanalBadge,
  KonfidenzPill,
  LastschriftBadge,
  UstBadge,
  WorkflowBadge,
  BankMatchBadge,
  ZahlungBadge,
} from "@/components/belege/badges";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { QueueKpiRow } from "@/components/invoice-queue/queue-kpi-row";
import { NextActionCell } from "@/components/invoice-queue/next-action-cell";
import { CARD_FILTER_KEYS, QUEUE_CARDS, nextAction } from "@/lib/data/invoice-queue-config";
import {
  clearStoredAiSearch,
  IntentConsolePanel,
  readStoredAiSearch,
} from "@/components/belege/intent-console-panel";
import type { InvoiceSearchOutcome } from "@/lib/api/invoice-intent.functions";
import { AiSimpleSearch, type AiSearchLabels } from "@hub-kit/core/ai-search/ui";
import { FilterFieldsGroup, type FilterField } from "@hub-kit/core/filters";
import {
  BulkActionBar,
  SelectPageCheckbox,
  SelectRowCheckbox,
  useRowSelection,
  type BulkAction,
} from "@hub-kit/core/bulk-actions";
import type { BelegeFilter, BelegListeRow, BelegSortKey } from "@/lib/data/types";
import { pageTitle } from "@/lib/brand";
import {
  ALLE,
  DATEV_VALUES,
  DUE_FILTER_VALUES,
  PAGE_SIZES,
  PAYMENT_TYPE_VALUES,
  STATUS_VALUES,
  WORKFLOW_FILTER_VALUES,
  ZAHLUNG_VALUES,
  carryListSearch,
  normalize,
  validateSearch,
} from "@/lib/belege-list-search";
import type { BelegeSearch, NormalizedSearch, PageSize } from "@/lib/belege-list-search";

export const Route = createFileRoute("/eingangsrechnungen/")({
  validateSearch,
  head: () => ({ meta: [{ title: pageTitle("Eingangsrechnungen") }] }),
  component: EingangsrechnungenPage,
});

// Supabase rejects with a PostgrestError OBJECT (not an Error instance), so pull the
// message/code fields explicitly instead of String(err) → "[object Object]".

function errText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  const o = err as Record<string, unknown>;
  return [o.message, o.code, o.details, o.hint].filter(Boolean).join(" ");
}

// Detect "the view/RPC from migration 0042 isn't in the DB yet" so we can show a clear
// developer note instead of a confusing generic error.
function isBackendMissing(err: unknown): boolean {
  const m = errText(err).toLowerCase();
  return (
    m.includes("v_invoices_list") ||
    m.includes("v_invoices_review") ||
    m.includes("invoices_kpis") ||
    m.includes("invoices_facets") ||
    m.includes("does not exist") ||
    m.includes("pgrst202") || // function not found in schema cache
    m.includes("pgrst205") || // table/view not found in schema cache
    m.includes("schema cache")
  );
}

function EingangsrechnungenPage() {
  const { t } = useTranslation();
  const search = normalize(Route.useSearch());
  const navigate = Route.useNavigate();
  // Handed to every link that opens an invoice, so the detail view can send the user back to the
  // list they were actually looking at. Filtering to "Zu prüfen", opening one and coming back used
  // to land on the full unfiltered list, with the filter to redo by hand every time. Defaults are
  // stripped, so opening an invoice off an unfiltered list still gives a clean URL.
  const detailSearch = carryListSearch(search);

  const statusLabel = (v: string) => t(`belege.status.${v}`, { defaultValue: v });
  const zahlungLabel = (v: string) => t(`belege.badge.${v}`, { defaultValue: v });
  const datevLabel = (v: string) =>
    t(`belege.list.filter.datev${v === "uebergeben" ? "Uebergeben" : "Offen"}`, {
      defaultValue: v,
    });
  // Through belegartKey, so the option label follows the same normalization the row badge uses.
  // The values come from the facets RPC, i.e. straight out of the column ("rechnung"), and used to
  // be rendered raw whenever the key did not match.
  const belegartLbl = (v: string) => {
    const key = belegartKey(v) ?? v;
    return t(`belege.belegart.${key}`, {
      defaultValue: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    });
  };

  // Merge a patch into the URL search params. Filter changes reset to page 1.
  const setSearch = (patch: Partial<BelegeSearch>, resetPage = true) => {
    navigate({
      replace: true,
      search: (prev) => {
        const next = { ...prev, ...patch };
        if (resetPage && patch.page === undefined) next.page = 1;
        return next;
      },
    });
  };

  // Mobile "Filters" opens as a bottom sheet (full overlay, slides up) instead of the desktop
  // Popover — an anchored popover has no backdrop and reads as a stray floating box on a touch
  // screen, which is the normal mobile-filter pattern this replaces it with.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [lastOpenedId, setLastOpenedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem(LAST_OPENED_INVOICE_KEY),
  );
  useEffect(() => {
    if (!lastOpenedId) return;
    const timer = window.setTimeout(() => setLastOpenedId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [lastOpenedId]);
  const rememberOpenedInvoice = (invoiceId: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LAST_OPENED_INVOICE_KEY, invoiceId);
      window.sessionStorage.setItem(AI_SEARCH_RETURN_KEY, "1");
    }
  };

  const { i18n } = useTranslation();
  const appliedFiltersLine = (outcome: InvoiceSearchOutcome): ReactNode | null => {
    const count = outcome.ids?.length ?? 0;
    if (count === 0) return null;
    const entities = outcome.preview.classification.entities;
    const locale = i18n.language === "de" ? "de-DE" : "en-GB";
    const monthName = (month: number) =>
      new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString(locale, { month: "long" });
    const day = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(locale);
    const clause = (name: string, values?: Record<string, string>) =>
      t(`belege.list.nlSearch.${name}`, values);
    const clauses: string[] = [];
    if (entities.companies.length > 0) {
      clauses.push(clause("clauseCompany", { value: entities.companies.join(", ") }));
    }
    if (entities.suppliers.length > 0) {
      clauses.push(clause("clauseSupplier", { value: entities.suppliers.join(", ") }));
    }
    if (entities.property) clauses.push(clause("clauseProperty", { value: entities.property }));
    if (entities.category) clauses.push(clause("clauseCategory", { value: entities.category }));
    if (entities.unassignedCompany) clauses.push(clause("clauseNoCompany"));
    if (entities.paymentState === "paid") clauses.push(clause("clausePaid"));
    if (entities.paymentState === "open") clauses.push(clause("clauseOpen"));
    if (entities.paymentState === "overdue") clauses.push(clause("clauseOverdue"));
    if (entities.reviewState === "needed") clauses.push(clause("clauseReviewNeeded"));
    if (entities.reviewState === "clear") clauses.push(clause("clauseReviewClear"));
    if (entities.bankMatch === "any") clauses.push(clause("clauseBankAny"));
    if (entities.bankMatch === "matched") clauses.push(clause("clauseBankMatched"));
    if (entities.bankMatch === "suggested") clauses.push(clause("clauseBankSuggested"));
    if (entities.bankMatch === "unmatched") clauses.push(clause("clauseBankUnmatched"));
    if (entities.documentType === "invoice") clauses.push(clause("clauseDocInvoice"));
    if (entities.documentType === "credit_note") clauses.push(clause("clauseDocCreditNote"));
    if (entities.documentType === "other") clauses.push(clause("clauseDocOther"));
    if (entities.workflowStep)
      clauses.push(clause("clauseWorkflow", { value: entities.workflowStep }));
    if (entities.datevHandover === "done") clauses.push(clause("clauseDatevDone"));
    if (entities.datevHandover === "pending") clauses.push(clause("clauseDatevPending"));
    if (entities.trafficLight === "green") clauses.push(clause("clauseLightGreen"));
    if (entities.trafficLight === "yellow") clauses.push(clause("clauseLightYellow"));
    if (entities.trafficLight === "red") clauses.push(clause("clauseLightRed"));
    if (entities.trafficLight === "flagged") clauses.push(clause("clauseLightFlagged"));
    if (entities.archived) clauses.push(clause("clauseArchived"));
    if (entities.dateMonth)
      clauses.push(clause("clauseInvoiceMonth", { value: monthName(entities.dateMonth) }));
    if (entities.dueDateMonth)
      clauses.push(clause("clauseDueMonth", { value: monthName(entities.dueDateMonth) }));
    if (entities.dateFrom && entities.dateTo) {
      clauses.push(
        clause("clauseInvoiceDateRange", {
          from: day(entities.dateFrom),
          to: day(entities.dateTo),
        }),
      );
    } else if (entities.dateFrom) {
      clauses.push(clause("clauseInvoiceDateFrom", { from: day(entities.dateFrom) }));
    } else if (entities.dateTo) {
      clauses.push(clause("clauseInvoiceDateTo", { to: day(entities.dateTo) }));
    }
    if (entities.dueDateFrom && entities.dueDateTo) {
      clauses.push(
        clause("clauseDueDateRange", {
          from: day(entities.dueDateFrom),
          to: day(entities.dueDateTo),
        }),
      );
    } else if (entities.dueDateFrom) {
      clauses.push(clause("clauseDueDateFrom", { from: day(entities.dueDateFrom) }));
    } else if (entities.dueDateTo) {
      clauses.push(clause("clauseDueDateTo", { to: day(entities.dueDateTo) }));
    }
    if (entities.amountMin !== null && entities.amountMax !== null) {
      clauses.push(
        clause("clauseAmountRange", {
          from: formatEUR(entities.amountMin),
          to: formatEUR(entities.amountMax),
        }),
      );
    } else if (entities.amountMin !== null) {
      clauses.push(clause("clauseAmountMin", { from: formatEUR(entities.amountMin) }));
    } else if (entities.amountMax !== null) {
      clauses.push(clause("clauseAmountMax", { to: formatEUR(entities.amountMax) }));
    }
    if (entities.directDebit === true) clauses.push(clause("clauseDirectDebit"));
    if (entities.directDebit === false) clauses.push(clause("clauseNoDirectDebit"));
    if (clauses.length === 0) return null;
    const template = clause("applied", { count: String(count), clauses: "\u0000" });
    const [before, after] = template.split("\u0000");
    return (
      <>
        {before}
        {clauses.map((part, index) => (
          <span key={part}>
            {index > 0 && (index === clauses.length - 1 ? clause("appliedAnd") : ", ")}
            <strong className="font-semibold text-foreground">{part}</strong>
          </span>
        ))}
        {after}
      </>
    );
  };

  const [restoredAiSearch] = useState(() => {
    if (typeof window === "undefined") return null;
    if (window.sessionStorage.getItem(AI_SEARCH_RETURN_KEY) === null) {
      clearStoredAiSearch();
      return null;
    }
    return readStoredAiSearch();
  });
  useEffect(() => {
    window.sessionStorage.removeItem(AI_SEARCH_RETURN_KEY);
  }, []);
  const [aiMode, setAiMode] = useState(restoredAiSearch !== null);
  const [aiIds, setAiIds] = useState<string[] | null>(restoredAiSearch?.outcome.ids ?? null);

  // Resolve controls to server-ready filter values.
  const range = zeitraumBereich(search.zeitraum, search.von ?? "", search.bis ?? "");
  // ALLE is this screen's own "no filter" sentinel, shared with its company/property/status
  // filters, so the period keeps it rather than adopting the shared vocabulary's own spelling.
  const zeitraumOptionen = useZeitraumOptionen(ALLE);
  const heute = heuteLokal();
  const faelligBand = search.faellig ? dueFilterRange(search.faellig as DueFilter, heute) : null;
  const filter: BelegeFilter = {
    q: search.q || undefined,
    ids: aiIds ?? undefined,
    gesellschaft: search.gesellschaft,
    objekt: search.objekt,
    status: search.status,
    belegart: search.belegart,
    zahlung: search.zahlung,
    paymentType: search.paymentType,
    datev: search.datev,
    bankMatch: search.bankMatch,
    ampel: search.ampel,
    workflow: search.workflow,
    archiv: search.archiv,
    von: range.von ?? undefined,
    bis: range.bis ?? undefined,
    faelligVon: faelligBand?.von,
    faelligBis: faelligBand?.bis,
    faelligUnbekannt: faelligBand?.unbekannt,
  };
  // EVERY filter the list applies goes to the tiles, except `status` -- that one stays out on
  // purpose, so the Erkannt / Zu pruefen tiles keep working as status toggles. `ids` (the AI
  // search's result set), `ampel` and `archiv` are forwarded since migration 20260815160000;
  // before it invoices_kpis had no parameter for them, so the tiles counted a wider set than the
  // rows underneath and the two openly disagreed. On a database that has not run that migration,
  // useBelegeKpis falls back to the old signature and reports `partial`, which is what the banner
  // below keys on.
  const kpiFilter = {
    q: filter.q,
    gesellschaft: filter.gesellschaft,
    objekt: filter.objekt,
    belegart: filter.belegart,
    zahlung: filter.zahlung,
    paymentType: filter.paymentType,
    von: filter.von,
    bis: filter.bis,
    datev: filter.datev,
    bankMatch: filter.bankMatch,
    workflow: filter.workflow,
    ampel: filter.ampel,
    archiv: filter.archiv,
    ids: filter.ids,
    faelligVon: filter.faelligVon,
    faelligBis: filter.faelligBis,
    faelligUnbekannt: filter.faelligUnbekannt,
  };

  const isListe = search.view === "liste";
  const listeQ = useBelegeListe(
    { ...filter, sort: search.sort, dir: search.dir, page: search.page, pageSize: search.pageSize },
    { enabled: isListe },
  );
  const kanbanQ = useBelegeKanbanCounts(filter, { enabled: !isListe });
  const kpiQ = useBelegeKpis(kpiFilter);
  const ohneGesellschaftQ = useBelegeOhneGesellschaftCount(filter);
  const ohneGesellschaft = ohneGesellschaftQ.data ?? 0;
  const ohneGesellschaftAktiv = search.gesellschaft === GESELLSCHAFT_OHNE;
  const queueQ = useInvoiceQueueKpis();
  const queueCards = useMemo(() => {
    const rows = new Map((queueQ.data ?? []).map((r) => [r.key, r]));
    return QUEUE_CARDS.filter((spec) => rows.has(spec.key)).map((spec) => {
      const row = rows.get(spec.key)!;
      const active = CARD_FILTER_KEYS.every(
        (k) => (search[k] ?? undefined) === (spec.search[k] ?? undefined),
      );
      // Selecting a card CLEARS the other cards' keys and goes back to page 1, so two cards can
      // never both look active and the list never opens on a page the new filter has no rows for.
      // Clicking the card that is already active clears it again, the way the old tiles toggled.
      const zielSearch: Record<string, unknown> = { ...search, page: 1 };
      for (const k of CARD_FILTER_KEYS) {
        zielSearch[k] = active ? undefined : (spec.search[k] ?? undefined);
      }
      // A card that names an order applies it too, and hands it back on deselect. "Jetzt zu
      // zahlen" is worked oldest first; leaving it on the received-date default put the most
      // urgent invoice anywhere in the list.
      if (spec.sort) {
        zielSearch.sort = active ? undefined : spec.sort;
        zielSearch.dir = active ? undefined : (spec.dir ?? "asc");
      }
      return {
        key: spec.key,
        label: t(`belege.list.queue.${spec.key}.label`),
        description: t(`belege.list.queue.${spec.key}.desc`),
        count: String(row.count),
        amount: formatEUR(row.amount),
        tone: spec.tone,
        icon: spec.icon,
        to: spec.to,
        search: zielSearch,
        active,
      };
    });
  }, [queueQ.data, t, search]);

  // The counter behind the chip under the KPI tiles. Its own query rather than a KPI field: it
  // answers "how many would a different company filter return", which is not the set the tiles
  // count.

  const facetsQ = useBelegeFacets();
  const gesellschaftenQ = useGesellschaften();
  // Resolved once for the whole page: all three master-data queries behind it are unscoped single
  // requests, so a list of 50 rows costs what one row costs.
  const kostenstellen = useKostenstelleResolver();

  const gesellschaften = gesellschaftenQ.data ?? [];
  const objektCodes = facetsQ.data?.objekt_codes ?? [];
  const belegartOptionen = facetsQ.data?.belegarten ?? [];
  // months/years are still returned by the facets RPC but no longer read: the period picker offers
  // a fixed set of calendar presets rather than a row per month present in the data.
  const stellerName = (b: BelegListeRow): string => b.issuer_sort ?? b.issuer ?? "—";

  const aktiveFilter =
    !!search.gesellschaft ||
    !!search.objekt ||
    !!search.status ||
    !!search.belegart ||
    !!search.zahlung ||
    !!search.datev ||
    search.zeitraum !== ALLE ||
    (search.q ?? "") !== "" ||
    // The two axes added with the review queue. Without them "Filter zurücksetzen" stayed hidden
    // while the list was still narrowed to the flagged or archived subset, which reads as "this is
    // everything" — the one thing a filter control must never imply.
    !!search.ampel ||
    !!search.archiv ||
    // Same reason as the two above, and the same bug: selecting only the workflow or the
    // bank-reconciliation filter narrowed the list while "Filter zurücksetzen" stayed hidden, so a
    // filtered list looked like the whole set with no visible way back. Every filter that can
    // narrow the list has to be counted here.
    !!search.workflow ||
    !!search.bankMatch ||
    !!search.faellig ||
    !!search.paymentType ||
    aiIds !== null;

  function resetFilter() {
    setAiIds(null);
    setSearch({
      q: undefined,
      gesellschaft: undefined,
      objekt: undefined,
      status: undefined,
      belegart: undefined,
      zahlung: undefined,
      datev: undefined,
      // workflow and bankMatch were missing here, which is why "Filter zurücksetzen" looked dead:
      // with only one of them active the click cleared nothing, aktiveFilter stayed true, and the
      // bar simply remained. Every key aktiveFilter counts as narrowing has to be cleared here, or
      // the reset silently does not reset.
      workflow: undefined,
      bankMatch: undefined,
      ampel: undefined,
      archiv: undefined,
      faellig: undefined,
      paymentType: undefined,
      zeitraum: ALLE,
      von: undefined,
      bis: undefined,
    });
  }

  // The KPI tiles come from invoices_kpis(). Its signature is no longer the frozen
  // (q, gesellschaft, objekt, belegart, zahlung, von, bis) this comment used to describe: it now
  // also takes p_datev, p_workflow and p_bank_match, and its definition IS version-controlled here
  // (migration 20260813180000, which recovered and extended it). Those axes therefore narrow the
  // tiles correctly and must NOT be listed as ignored -- doing so showed a "counts may differ"
  // caveat on a screen where they in fact agree, which trains people to distrust correct numbers.
  //
  // ampel, archiv and the AI search's `ids` reach it too since migration 20260815160000, so on an
  // up-to-date database nothing is ignored and no caveat shows. Where that migration has not run,
  // useBelegeKpis falls back to the old signature and reports `partial`: the caveat is then true
  // again, and it is worth saying out loud rather than papering over, because the tiles double as
  // status toggles and are read as counts of what is on screen.
  function toggleSort(key: BelegSortKey) {
    if (search.sort === key) setSearch({ dir: search.dir === "asc" ? "desc" : "asc" });
    else setSearch({ sort: key, dir: "asc" });
  }

  // Backend (migration 0010) not applied → clear developer note, no incorrect fallback.
  const backendErr =
    (listeQ.isError && isBackendMissing(listeQ.error)) ||
    (kanbanQ.isError && isBackendMissing(kanbanQ.error)) ||
    (kpiQ.isError && isBackendMissing(kpiQ.error)) ||
    (facetsQ.isError && isBackendMissing(facetsQ.error));

  // Pagination math (list view).
  const total = listeQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / search.pageSize));

  // The query served the last page that exists because the URL asked for one past the end, which
  // is what a bookmarked "?page=9" turns into once the result set shrinks. Correct the URL so the
  // two stop disagreeing, and replace rather than push so the dead page number leaves no history
  // entry to walk back into.
  const angepassteSeite = listeQ.data?.angepassteSeite;
  useEffect(() => {
    if (angepassteSeite && angepassteSeite !== search.page) {
      setSearch({ page: angepassteSeite });
    }
    // setSearch is rebuilt every render; depending on it would run this on every render instead of
    // when the page actually needs correcting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angepassteSeite, search.page]);
  const fromRow = total === 0 ? 0 : (search.page - 1) * search.pageSize + 1;
  const toRow = Math.min(search.page * search.pageSize, total);
  const rows = listeQ.data?.rows ?? [];

  // ---------------------------------------------------------------------------------------------
  // Bulk actions (client meeting 09.09.2026): the same review decisions the detail page offers,
  // applied to a ticked set instead of one receipt at a time. Saskia's cases were a batch belonging
  // to a company they sold and a pile of parking receipts that all belong to one company.
  //
  // Selection is per page and drops whenever the view changes, the same rule Eiffler's payment run
  // follows: a ticked row the user can no longer see is a row nobody reviewed before acting on it.
  // ---------------------------------------------------------------------------------------------
  const bulk = useBulkInvoiceActions();
  const selection = useRowSelection(rows, {
    rowId: belegRowId,
    resetKey: JSON.stringify(search),
  });

  const bulkActions: BulkAction[] = [
    {
      key: "archive",
      label: t("belege.list.bulk.archivieren.label"),
      icon: Archive,
      confirmTitle: t("belege.list.bulk.archivieren.titel", { count: selection.selectedCount }),
      confirmDescription: t("belege.list.bulk.archivieren.beschreibung"),
      input: {
        kind: "text",
        label: t("belege.list.bulk.archivieren.feld"),
        placeholder: t("belege.list.bulk.archivieren.platzhalter"),
      },
      run: bulk.archive,
    },
    {
      key: "not-relevant",
      label: t("belege.list.bulk.nichtRelevant.label"),
      icon: Undo2,
      confirmTitle: t("belege.list.bulk.nichtRelevant.titel", { count: selection.selectedCount }),
      confirmDescription: t("belege.list.bulk.nichtRelevant.beschreibung"),
      input: {
        kind: "text",
        label: t("belege.list.bulk.nichtRelevant.feld"),
        placeholder: t("belege.list.bulk.nichtRelevant.platzhalter"),
        required: true,
      },
      run: bulk.markNotRelevant,
    },
    {
      key: "assign-company",
      label: t("belege.list.bulk.gesellschaft.label"),
      icon: Building2,
      confirmTitle: t("belege.list.bulk.gesellschaft.titel", { count: selection.selectedCount }),
      confirmDescription: t("belege.list.bulk.gesellschaft.beschreibung"),
      input: {
        kind: "choice",
        label: t("belege.list.bulk.gesellschaft.feld"),
        placeholder: t("belege.list.bulk.gesellschaft.platzhalter"),
        required: true,
        options: gesellschaften.map((g) => ({
          value: g.id,
          label: g.name ? `${g.code} · ${g.name}` : g.code,
          keywords: g.code,
        })),
      },
      run: bulk.assignCompany,
    },
    {
      key: "delete",
      label: t("belege.list.bulk.loeschen.label"),
      icon: Trash2,
      tone: "destructive",
      confirmTitle: t("belege.list.bulk.loeschen.titel", { count: selection.selectedCount }),
      confirmDescription: t("belege.list.bulk.loeschen.beschreibung"),
      input: {
        kind: "text",
        label: t("belege.list.bulk.loeschen.feld"),
        placeholder: t("belege.list.bulk.loeschen.platzhalter"),
        required: true,
      },
      run: bulk.softDelete,
    },
  ];

  const bulkLabels = {
    selectedCount: (count: number) => t("belege.list.bulk.ausgewaehlt", { count }),
    clearSelection: t("belege.list.bulk.auswahlAufheben"),
    cancel: t("belege.list.bulk.abbrechen"),
    confirm: t("belege.list.bulk.anwenden"),
    running: t("belege.list.bulk.laeuft"),
    done: (count: number) => t("belege.list.bulk.fertig", { count }),
    partlyDone: (erfolg: number, fehler: number) =>
      t("belege.list.bulk.teilweise", { erfolg, fehler }),
    failed: (meldung: string) => t("belege.list.bulk.fehlgeschlagen", { meldung }),
  };

  // ---------------------------------------------------------------------------------------------
  // Secondary filters, as one list rather than six separate Comboboxes on the toolbar. Gesellschaft
  // and Zeitraum stay on the surface (what an accountant changes most); the rest live behind one
  // "Filters" popover with a count badge, and the active-filter chips below the bar are derived
  // from this SAME array so the popover, the chips and the count can never drift apart the way the
  // old hand-written chip block had (it was missing a chip for `ampel` entirely).
  // ---------------------------------------------------------------------------------------------
  type WeitererFilter = {
    key: string;
    label: string;
    value: string | undefined;
    options: { value: string; label: string }[];
    onChange: (v: string | undefined) => void;
  };

  const weitereFilter: WeitererFilter[] = [
    {
      key: "objekt",
      label: t("belege.list.filter.objekt"),
      value: search.objekt,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleObjekte") },
        // Same negative filter the company dropdown got: most of this queue has nothing assigned,
        // and until now there was no way to ask for exactly those rows.
        { value: OBJEKT_OHNE, label: t("belege.list.filter.ohneObjekt") },
        ...objektCodes.map((c) => ({ value: c, label: c })),
      ],
      onChange: (v) => setSearch({ objekt: v }),
    },
    {
      key: "status",
      label: t("belege.list.filter.status"),
      value: search.status,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleStatus") },
        ...STATUS_VALUES.map((v) => ({ value: v, label: statusLabel(v) })),
      ],
      onChange: (v) => setSearch({ status: v }),
    },
    {
      // Approval-chain stage — a separate axis from `status` (AI review) and `zahlung` (paid or
      // not). A receipt sitting at 'freigegeben_vorgesetzter', waiting on payment, is otherwise
      // indistinguishable in this list from one still at 'eingegangen'.
      key: "workflow",
      label: t("belege.list.filter.workflow"),
      value: search.workflow,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleWorkflow") },
        ...WORKFLOW_FILTER_VALUES.map((v) => ({ value: v, label: t(`belege.workflow.${v}`) })),
      ],
      onChange: (v) => setSearch({ workflow: v }),
    },
    ...(belegartOptionen.length > 0
      ? [
          {
            key: "belegart",
            label: t("belege.list.filter.belegart"),
            value: search.belegart,
            options: [
              { value: ALLE, label: t("belege.list.filter.alleBelegarten") },
              ...belegartOptionen.map((a) => ({ value: a, label: belegartLbl(a) })),
            ],
            onChange: (v: string | undefined) => setSearch({ belegart: v }),
          },
        ]
      : []),
    {
      key: "zahlung",
      label: t("belege.list.filter.zahlung"),
      value: search.zahlung,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleZahlungen") },
        ...ZAHLUNG_VALUES.map((v) => ({ value: v, label: zahlungLabel(v) })),
      ],
      onChange: (v) => setSearch({ zahlung: v }),
    },
    {
      key: "paymentType",
      label: t("belege.list.filter.zahlungsart"),
      value: search.paymentType,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleZahlungsarten") },
        ...PAYMENT_TYPE_VALUES.map((v) => ({
          value: v,
          label: t(`belege.list.filter.zahlungsartWert.${v}`),
        })),
      ],
      onChange: (v) => setSearch({ paymentType: v }),
    },
    {
      key: "faellig",
      label: t("belege.list.filter.faellig"),
      value: search.faellig,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleFaellig") },
        ...DUE_FILTER_VALUES.map((v) => ({ value: v, label: t(`offenePosten.due.${v}`) })),
      ],
      onChange: (v) => setSearch({ faellig: v }),
    },
    {
      key: "datev",
      label: t("belege.list.filter.datev"),
      value: search.datev,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleDatev") },
        ...DATEV_VALUES.map((v) => ({ value: v, label: datevLabel(v) })),
      ],
      onChange: (v) => setSearch({ datev: v }),
    },
    {
      // Bank-match presence -- a separate axis from `zahlung`: whether a reconciliation match
      // exists at all, and whether it is still waiting on a human. "Vorschlag" is the worklist
      // this filter exists for: before it, a suggestion was only visible by opening the invoice
      // or the bank transaction one at a time.
      key: "bankMatch",
      label: t("belege.list.filter.bankMatch"),
      value: search.bankMatch,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleBankMatch") },
        { value: "offen", label: t("belege.badge.bankMatchOffen") },
        { value: "vorschlag", label: t("belege.badge.bankMatchVorschlag") },
        { value: "zugeordnet", label: t("belege.badge.bankMatchZugeordnet") },
      ],
      onChange: (v) => setSearch({ bankMatch: v }),
    },
    {
      // Recognition traffic light. Its own filter because it is its own axis: the pipeline flags
      // a yellow receipt for a human nod while still leaving status='erkannt', so without this
      // there is no way to list the yellow ones at all.
      key: "ampel",
      label: t("belege.list.filter.ampel"),
      value: search.ampel,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleAmpeln") },
        { value: "auffaellig", label: t("belege.list.filter.ampelAuffaellig") },
        { value: "gruen", label: t("belege.ampel.gruen") },
        { value: "gelb", label: t("belege.ampel.gelb") },
        { value: "rot", label: t("belege.ampel.rot") },
      ],
      onChange: (v) => setSearch({ ampel: v }),
    },
  ];

  const aktiveWeitereFilter = weitereFilter.filter((f) => !!f.value);
  const weitereFilterLabel = (f: WeitererFilter) =>
    f.options.find((o) => o.value === f.value)?.label ?? f.value ?? "";

  const aiLabels: AiSearchLabels = {
    title: t("belege.list.nlSearch.titel"),
    description: t("belege.list.nlSearch.desc"),
    questionPlaceholder: t("belege.list.nlSearch.placeholder"),
    questionPlaceholderShort: t("belege.list.nlSearch.placeholderKurz"),
    simpleSearch: t("belege.list.nlSearch.einfach"),
    simplePlaceholder: t("belege.list.nlSearch.einfachPlatzhalter"),
    assistant: t("belege.list.nlSearch.aiButton"),
    clear: t("belege.list.nlSearch.clear"),
    submit: t("belege.list.nlSearch.submit"),
    searching: t("belege.list.nlSearch.searching"),
    error: t("belege.list.nlSearch.error"),
    offTopic: t("belege.list.nlSearch.offTopic"),
    aggregateHint: t("belege.list.nlSearch.aggregatHinweis"),
    truncated: (shown, total) => t("belege.list.nlSearch.gekuerzt", { shown, total }),
    truncatedSimilar: (shown, total) =>
      t("belege.list.nlSearch.gekuerztAehnlich", { shown, total }),
  };
  const timePeriodField = (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {t("belege.list.filter.zeitraum")}
      </span>
      <ZeitraumPicker
        value={search.zeitraum}
        onValueChange={(v) => setSearch({ zeitraum: v })}
        von={search.von ?? ""}
        bis={search.bis ?? ""}
        onRangeApply={(vonNeu, bisNeu) =>
          setSearch({ von: vonNeu || undefined, bis: bisNeu || undefined })
        }
        locale={dateLocale()}
        formatDay={(iso) => formatDate(iso)}
        backLabel={t("home.zeitraumAktion.zurueck")}
        placeholder={t("belege.list.filter.zeitraum")}
        ariaLabel={t("belege.list.filter.zeitraum")}
        className="w-full"
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
  );
  const filterGroupFields: FilterField[] = [
    {
      key: "gesellschaft",
      label: t("belege.list.filter.gesellschaft"),
      value: search.gesellschaft,
      options: [
        { value: ALLE, label: t("belege.list.filter.alleGesellschaften") },
        { value: GESELLSCHAFT_OHNE, label: t("belege.list.filter.ohneGesellschaft") },
        ...gesellschaften
          .filter((g) => g.code !== GESELLSCHAFT_OHNE)
          .map((g) => ({ value: g.code, label: `${g.code} · ${g.name}`, keywords: g.name })),
      ],
    },
    ...weitereFilter.map(({ key, label, value, options }) => ({ key, label, value, options })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("belege.list.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("belege.list.subtitle")}</p>
        </div>
        <Button asChild className="gap-2" data-tour="incoming-upload">
          <Link to="/eingangsrechnungen/upload">
            <Upload className="size-4" /> {t("belege.list.upload")}
          </Link>
        </Button>
      </div>

      {backendErr && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          {/* TWO SENTENCES FOR TWO READERS. The person in front of this is doing accounting, and
              the first line is for them: what they can and cannot do right now, and that their
              documents are fine. The second line is the bit the support call needs, kept small and
              underneath instead of being the whole message. It used to read "please apply
              migration 0042 to the database", which tells an accountant nothing except that
              something is badly wrong. */}
          <div>
            <p>{t("belege.list.backendMissing")}</p>
            <p className="mt-1 text-xs text-amber-800/80">
              {t("belege.list.backendMissingTechnisch")}
            </p>
          </div>
        </div>
      )}

      <div data-tour="incoming-queue">
        <QueueKpiRow className="mt-6" cards={queueCards} loading={queueQ.isLoading} />
      </div>

      {ohneGesellschaft > 0 && !ohneGesellschaftAktiv && (
        <div className="mt-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft py-1.5 pr-1.5 pl-3">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 text-[13px] text-foreground">
            {t("belege.list.filter.ohneGesellschaftStrip", { count: ohneGesellschaft })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => setSearch({ gesellschaft: GESELLSCHAFT_OHNE, page: 1 })}
          >
            {t("belege.list.filter.ohneGesellschaftZuweisen")}
          </Button>
        </div>
      )}

      {aiMode && (
        <IntentConsolePanel
          className="mt-3"
          labels={{
            title: t("belege.list.nlSearch.titel"),
            description: t("belege.list.nlSearch.desc"),
            placeholder: t("belege.list.nlSearch.placeholder"),
            close: t("belege.list.nlSearch.normalSearch"),
            searching: t("belege.list.nlSearch.searching"),
            error: t("belege.list.nlSearch.error"),
            offTopic: t("belege.list.nlSearch.offTopic"),
            found: (count) => t("belege.list.nlSearch.treffer", { count }),
            noResults: t("belege.list.nlSearch.keineTreffer"),
            notApplied: (aspects) => t("belege.list.nlSearch.nichtAngewendet", { aspects }),
            clear: t("belege.list.nlSearch.clear"),
          }}
          suggestions={[t("belege.list.nlSearch.v1"), t("belege.list.nlSearch.v2")]}
          appliedFilters={appliedFiltersLine}
          onResults={setAiIds}
          onClose={() => setAiMode(false)}
        />
      )}

      {/* Steuerleiste */}
      <div className="mt-3 flex flex-wrap items-center gap-3" data-tour="incoming-filters">
        {!aiMode && (
          <AiSimpleSearch
            initialValue={search.q ?? ""}
            onApply={(q) => setSearch({ q })}
            onOpenAssistant={() => setAiMode(true)}
            labels={aiLabels}
          />
        )}

        {/* Eight more axes (Objekt/Status/Workflow/Belegart/Zahlung/DATEV/Bank-Abgleich/Ampel) live
            behind one "Filters" control instead of eight Comboboxes side by side, wrapped onto two
            rows, each reading
            "Alle …" when nothing was picked — loudest exactly when nothing was filtered.
            Desktop keeps the compact anchored Popover; mobile gets its own trigger opening a
            bottom sheet (dark overlay, slides up) — the normal mobile-filter pattern, and an
            anchored popover with no backdrop reads as a stray floating box on a touch screen.
            Both share the same field grid + reset link below so the two can't drift apart. */}
        {(() => {
          const fields = (
            <FilterFieldsGroup
              fields={filterGroupFields}
              anyValue={ALLE}
              labels={{
                apply: t("belege.list.filter.anwenden"),
                reset: t("belege.list.filter.reset"),
              }}
              onApply={(values) => {
                setSearch(values as Partial<BelegeSearch>);
                setFilterOpen(false);
                setMobileFiltersOpen(false);
              }}
              onReset={() => {
                setFilterOpen(false);
                setMobileFiltersOpen(false);
                setSearch({
                  gesellschaft: undefined,
                  objekt: undefined,
                  status: undefined,
                  belegart: undefined,
                  zahlung: undefined,
                  datev: undefined,
                  workflow: undefined,
                  bankMatch: undefined,
                  ampel: undefined,
                  faellig: undefined,
                  paymentType: undefined,
                  zeitraum: ALLE,
                  von: undefined,
                  bis: undefined,
                });
              }}
              leading={timePeriodField}
            />
          );
          return (
            <>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors sm:hidden",
                  aktiveWeitereFilter.length > 0
                    ? "border-brand bg-brand-wash text-brand-dark"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-4" />
                {t("belege.list.filter.weitere")}
                {aktiveWeitereFilter.length > 0 && (
                  <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
                    {aktiveWeitereFilter.length}
                  </span>
                )}
              </button>
              <Sheet
                open={mobileFiltersOpen}
                onOpenChange={(o) => {
                  setMobileFiltersOpen(o);
                }}
              >
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:hidden">
                  <SheetHeader>
                    <SheetTitle>{t("belege.list.filter.weitere")}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-2">{fields}</div>
                </SheetContent>
              </Sheet>

              <Popover
                open={filterOpen}
                onOpenChange={(o) => {
                  setFilterOpen(o);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors sm:inline-flex",
                      aktiveWeitereFilter.length > 0
                        ? "border-brand bg-brand-wash text-brand-dark"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <SlidersHorizontal className="size-4" />
                    {t("belege.list.filter.weitere")}
                    {aktiveWeitereFilter.length > 0 && (
                      <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
                        {aktiveWeitereFilter.length}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(520px,90vw)] p-3">
                  {fields}
                </PopoverContent>
              </Popover>
            </>
          );
        })()}

        {/* Archived receipts are out of the everyday list, so the only way back to them is an
            explicit toggle. Kept visible rather than hidden in a menu: "nothing is ever hard
            deleted" is only true in practice if the archive is reachable. */}
        <button
          type="button"
          onClick={() => setSearch({ archiv: search.archiv === "nur" ? undefined : "nur" })}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
            search.archiv === "nur"
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title={t("belege.list.filter.archivTitle")}
        >
          <Archive className="size-4" /> {t("belege.list.filter.archiv")}
        </button>

        <button
          type="button"
          onClick={() =>
            search.sort === "pruefung"
              ? setSearch({ sort: "eingegangen_am", dir: "desc" })
              : setSearch({ sort: "pruefung", dir: "desc" })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
            search.sort === "pruefung"
              ? "border-brand bg-brand-wash text-brand-dark"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title={t("belege.list.sort.pruefPrioritaetTitle")}
        >
          {/* A sort control asks for nothing, so it does not get the alarm triangle. The flag says
              "these are the flagged ones" without reading as an error (Saskia, 09.09.2026). */}
          <Flag className="size-4" /> {t("belege.list.sort.pruefPrioritaet")}
        </button>

        <div
          className="inline-flex rounded-md border border-border p-0.5"
          data-tour="incoming-view-switch"
        >
          <button
            type="button"
            onClick={() => setSearch({ view: "liste" }, false)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
              isListe ? "bg-brand text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <TableIcon className="size-4" /> {t("belege.list.view.liste")}
          </button>
          <button
            type="button"
            onClick={() => setSearch({ view: "kanban" }, false)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
              !isListe ? "bg-brand text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="size-4" /> {t("belege.list.view.kanban")}
          </button>
        </div>
      </div>

      {/* Aktive Filter-Chips — derived from the same weitereFilter array the popover renders, so a
          chip can never go missing for an axis the popover offers (the old hand-written block here
          had no chip for `ampel` at all). Gesellschaft and Zeitraum keep their own chip logic since
          they're not part of the popover. */}
      {aktiveFilter && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {search.gesellschaft && (
            <FilterChip
              // "NZO" is the code that stands for "assigned to none". As a chip label it says
              // nothing to anyone reading it, so show what the filter option itself is called.
              label={
                search.gesellschaft === GESELLSCHAFT_OHNE
                  ? t("belege.list.filter.ohneGesellschaft")
                  : search.gesellschaft
              }
              onClear={() => setSearch({ gesellschaft: undefined })}
            />
          )}
          {aktiveWeitereFilter.map((f) => (
            <FilterChip
              key={f.key}
              label={`${f.label}: ${weitereFilterLabel(f)}`}
              onClear={() => f.onChange(undefined)}
            />
          ))}
          {search.zeitraum !== ALLE && (
            <FilterChip
              label={t("belege.list.filter.zeitraum")}
              onClear={() => setSearch({ zeitraum: ALLE, von: undefined, bis: undefined })}
            />
          )}
          <button
            type="button"
            onClick={resetFilter}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("belege.list.filter.reset")}
          </button>
        </div>
      )}

      {isListe ? (
        listeQ.isError && !backendErr ? (
          <div className="mt-4">
            <ErrorState error={listeQ.error} onRetry={() => listeQ.refetch()} />
          </div>
        ) : listeQ.isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("belege.list.pagination.showing", { from: fromRow, to: toRow, total })}
              {listeQ.isFetching && ` · ${t("belege.list.updating")}`}
            </p>

            {/* Only with something ticked, so the everyday list is unchanged for everyone who is
                not acting on a batch right now. */}
            <BulkActionBar
              selectedIds={selection.selectedIds}
              actions={bulkActions}
              labels={bulkLabels}
              onClear={selection.clear}
              onFinished={bulk.refresh}
            />

            {/* The table carries 11 columns — far past a phone's width. The app shell clips
                horizontal overflow rather than scrolling it, so on mobile everything from the
                amount rightwards was simply unreachable. Desktop keeps the table; below `sm` the
                same rows render as cards instead, carrying every column the table shows. */}
            {/* SCROLLS SIDEWAYS instead of being cut off. `overflow-hidden` clipped whatever did not fit
                the container, so on a laptop or a tablet the last columns (workflow, payment,
                DATEV) were simply gone, and the workflow badge at the boundary was sliced
                mid-word. Nothing on screen said so either. */}
            <div className="relative mt-3 hidden rounded-xl border border-border bg-card sm:block overflow-hidden">
              {listeQ.isFetching && <TableLoadingOverlay />}
              {/* `min-w` so the columns SCROLL instead of squeezing. Without it an auto-layout table just
                  compresses to fit: on a 1468px screen the issuer truncated mid-word and every received
                  date wrapped onto three lines, while the table technically still "fitted", so it never
                  overflowed and the edge shade correctly never appeared. Roughly 125px per column. */}
              <Table className="min-w-[1500px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <SelectPageCheckbox
                        state={selection.pageState}
                        onToggle={selection.togglePage}
                        disabled={rows.length === 0}
                        label={t("belege.list.bulk.seiteWaehlen")}
                      />
                    </TableHead>
                    <SortHeader
                      label={t("belege.list.col.steller")}
                      col="steller"
                      search={search}
                      onSort={toggleSort}
                    />
                    <SortHeader
                      label={t("belege.list.col.gesellschaft")}
                      col="gesellschaft"
                      search={search}
                      onSort={toggleSort}
                    />
                    <SortHeader
                      label={t("belege.list.col.betrag")}
                      col="betrag"
                      search={search}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHeader
                      label={t("belege.list.col.rechnungsdatum")}
                      col="beleg_datum"
                      secondary={{ label: t("belege.list.col.faellig"), col: "faellig" }}
                      search={search}
                      onSort={toggleSort}
                    />
                    <TableHead title={t("belege.list.col.konfidenzHint")}>
                      {t("belege.list.col.konfidenz")}
                    </TableHead>
                    <SortHeader
                      label={t("belege.list.col.status")}
                      col="status"
                      alsoFor="pruefung"
                      search={search}
                      onSort={toggleSort}
                    />
                    <TableHead>{t("belege.list.col.zahlung")}</TableHead>
                    <TableHead>{t("belege.list.col.bankAbgleich")}</TableHead>
                    <TableHead>{t("belege.list.col.naechsteAktion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => (
                    <TableRow
                      key={b.id}
                      ref={
                        b.id === lastOpenedId
                          ? (node) => node?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      className={cn(
                        "cursor-pointer transition-colors duration-1000",
                        b.id === lastOpenedId && "bg-brand-tint/50",
                      )}
                      onClick={() => {
                        rememberOpenedInvoice(b.id);
                        navigate({
                          to: "/eingangsrechnungen/$nr",
                          params: { nr: b.id },
                          search: detailSearch,
                        });
                      }}
                    >
                      <TableCell>
                        <SelectRowCheckbox
                          checked={selection.isSelected(b.id)}
                          onToggle={() => selection.toggleRow(b.id)}
                          label={t("belege.list.bulk.zeileWaehlen")}
                        />
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {/* The outgoing chip rides with the NAME: what it says is that this issuer
                            is one of our own companies, and beside the issuer is where that reads
                            as one fact instead of two. */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className="truncate font-medium text-foreground"
                            title={stellerName(b)}
                          >
                            {stellerName(b)}
                          </div>
                          <AusgangBadge beleg={b} />
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={b.invoice_number ?? ""}
                        >
                          {b.invoice_number
                            ? t("belege.list.row.nr", { nr: b.invoice_number })
                            : t("belege.list.row.ohneNr")}
                          {b.cost_category ? ` · ${b.cost_category}` : ""}
                        </div>
                        {!istEingangsrechnung(b.document_type) ||
                        istLastschrift(b.payment_method) ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {!istEingangsrechnung(b.document_type) && (
                              <BelegartBadge belegart={b.document_type} />
                            )}
                            {istLastschrift(b.payment_method) && <LastschriftBadge />}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <GesellschaftChip code={b.company_code} />
                        <KostenstelleZeile beleg={b} resolver={kostenstellen} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="block font-medium">{formatEUR(b.amount_gross)}</span>
                        <span className="mt-0.5 block">
                          <UstBadge ustSatz={b.vat_rate} steuer={b.tax} />
                        </span>
                      </TableCell>
                      {/* The invoice date, on its own. The service period used to hang under it as
                          a subtitle, and being a full date RANGE it set the width of the whole
                          column and pushed every column right of it off the screen, for a line
                          only a minority of rows carry. It lives on the detail screen now, in
                          Rechnungsdaten, where there is room to read it. */}
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                        <span className="block">{formatDate(b.document_date)}</span>
                        {b.due_date && !b.paid_at && (
                          <span
                            className={cn(
                              "block text-xs",
                              dueBucket(b.due_date, heute) === "overdue" && "text-destructive",
                            )}
                          >
                            {t("belege.list.col.faelligAm", { datum: formatDate(b.due_date) })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <KonfidenzPill score={b.confidence_score} />
                      </TableCell>
                      <TableCell>
                        <ReviewBadge
                          reasonCount={pruefGruende(b).length}
                          ungeprueft={ohnePruefungen(b)}
                          status={b.status}
                        />
                      </TableCell>
                      <TableCell>
                        <ZahlungBadge bezahltAm={b.paid_at} />
                      </TableCell>
                      <TableCell>
                        <BankMatchBadge
                          hasConfirmed={b.has_confirmed_bank_match}
                          hasSuggested={b.has_suggested_bank_match}
                          showWhenEmpty
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const aktion = nextAction(b);
                          if (aktion === "none")
                            return <NextActionCell muted label={t("belege.list.aktion.none")} />;
                          // "pay" opens the payment tab straight away instead of the overview, so
                          // working down the pay list is one click per invoice.
                          if (aktion === "pay")
                            return (
                              <Button
                                size="sm"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate({
                                    to: "/eingangsrechnungen/$nr",
                                    params: { nr: b.id },
                                    search: { ...detailSearch, tab: "zahlung" },
                                  });
                                }}
                              >
                                {t("belege.list.aktion.pay")}
                              </Button>
                            );
                          return <NextActionCell label={t(`belege.list.aktion.${aktion}`)} />;
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Not while a fetch is still running. Changing the filter (an AI search most
                      visibly) empties `rows` until the new page arrives, and this line then claimed
                      there was nothing to show, directly under an answer that had just named a
                      figure. The loading overlay below already covers that moment. */}
                  {rows.length === 0 && !listeQ.isFetching && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-12 text-center text-muted-foreground">
                        {t("belege.list.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list — same rows, same order, nothing clipped. */}
            <div className="relative mt-3 space-y-2 sm:hidden">
              {listeQ.isFetching && <TableLoadingOverlay />}
              {rows.map((b) => (
                <Link
                  key={b.id}
                  to="/eingangsrechnungen/$nr"
                  params={{ nr: b.id }}
                  search={detailSearch}
                  onClick={() => rememberOpenedInvoice(b.id)}
                  className={cn(
                    "block rounded-xl border border-border bg-card p-3 transition-colors duration-1000 hover:shadow-sm",
                    b.id === lastOpenedId && "bg-brand-tint/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-foreground">
                      {stellerName(b)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {formatEUR(b.amount_gross)}
                    </span>
                  </div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">
                    {b.invoice_number
                      ? t("belege.list.row.nr", { nr: b.invoice_number })
                      : t("belege.list.row.ohneNr")}
                    {b.cost_category ? ` · ${b.cost_category}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <GesellschaftChip code={b.company_code} />
                    <KostenstelleZeile beleg={b} resolver={kostenstellen} inline />
                    <UstBadge ustSatz={b.vat_rate} steuer={b.tax} />
                    <KanalBadge kanal={b.intake_channel} />
                    {!istEingangsrechnung(b.document_type) && (
                      <BelegartBadge belegart={b.document_type} />
                    )}
                    {istLastschrift(b.payment_method) && <LastschriftBadge />}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <KonfidenzPill score={b.confidence_score} />
                    <ReviewBadge
                      reasonCount={pruefGruende(b).length}
                      ungeprueft={ohnePruefungen(b)}
                      status={b.status}
                    />
                    <WorkflowBadge status={b.workflow_status} />
                  </div>
                  {/* Labelled: the table distinguished these two by column header, and without
                      that a card can show two badges both reading "Offen" with no way to tell
                      which is the payment and which is the DATEV hand-off. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {t("belege.list.col.zahlungAbgleich")}: <ZahlungBadge bezahltAm={b.paid_at} />
                      <BankMatchBadge
                        hasConfirmed={b.has_confirmed_bank_match}
                        hasSuggested={b.has_suggested_bank_match}
                      />
                    </span>
                    <span className="flex items-center gap-1">
                      {t("belege.list.col.datev")}:{" "}
                      <DatevUebergabeBadge handedOverAt={b.datev_handed_over_at} />
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {t("belege.list.col.rechnungsdatum")}: {formatDate(b.document_date)}
                    </span>
                    <span>
                      {t("belege.list.col.eingang")}: {formatDateTime(b.created_at)}
                    </span>
                    {b.due_date && !b.paid_at && (
                      <span
                        className={cn(
                          dueBucket(b.due_date, heute) === "overdue" && "text-destructive",
                        )}
                      >
                        {t("belege.list.col.faelligAm", { datum: formatDate(b.due_date) })}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {rows.length === 0 && !listeQ.isFetching && (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground">
                  {t("belege.list.empty")}
                </div>
              )}
            </div>

            {/* Pagination bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("belege.list.pagination.perPage")}</span>
                <Combobox
                  value={String(search.pageSize)}
                  onValueChange={(v) => setSearch({ pageSize: Number(v) as PageSize, page: 1 })}
                  className="h-8 w-[80px]"
                  options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("belege.list.pagination.page", { page: search.page, pages: totalPages })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={search.page <= 1 || listeQ.isFetching}
                    onClick={() => setSearch({ page: search.page - 1 }, false)}
                  >
                    <ChevronLeft className="size-4" /> {t("belege.list.pagination.prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={search.page >= totalPages || listeQ.isFetching}
                    onClick={() => setSearch({ page: search.page + 1 }, false)}
                  >
                    {t("belege.list.pagination.next")} <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )
      ) : kanbanQ.isError && !backendErr ? (
        <div className="mt-4">
          <ErrorState error={kanbanQ.error} onRetry={() => kanbanQ.refetch()} />
        </div>
      ) : kanbanQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} cols={4} />
        </div>
      ) : (
        <>
          {/* No "showing the first 500 of N" banner any more: each column pages its own cards,
              so there is no ceiling left to warn about. */}
          <div className="relative min-h-[120px]">
            {kanbanQ.isFetching && <TableLoadingOverlay />}
            <KanbanBoard
              counts={kanbanQ.data ?? {}}
              filter={filter}
              aktiv={!isListe}
              stellerName={stellerName}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The cost centre a row books to, under (or beside) the company it books in.
 *
 * The number is not stored on the invoice: it follows from the company plus the property, which is
 * why it is resolved here rather than selected. See `src/lib/data/kostenstelle.ts`.
 *
 * A pairing with no number says so instead of rendering nothing. That is a master-data gap, and a
 * blank cell would read as "this row has no cost centre", which is a different statement.
 */
function KostenstelleZeile({
  beleg,
  resolver,
  inline,
}: {
  beleg: BelegListeRow;
  resolver: ReturnType<typeof useKostenstelleResolver>;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const kostenstelle = resolver.resolve({
    companyCode: beleg.company_code,
    propertyCode: beleg.property_code,
    gemeinkosten: beleg.is_overhead,
  });
  // Nothing at all while the master data is in flight, and nothing when no cost centre can be
  // named (unknown company, or a property that is not in the master data). Neither is a gap the
  // reader can act on from this screen.
  if (!kostenstelle) return null;
  return (
    <span
      className={cn(
        "text-xs text-muted-foreground",
        inline ? "inline-block" : "mt-0.5 block whitespace-nowrap",
      )}
    >
      {kostenstelle.nummer != null
        ? t("belege.list.row.kostenstelle", { nr: kostenstelle.nummer })
        : t("belege.list.row.kostenstelleFehlt")}
    </span>
  );
}

// Centered spinner over the table/board while a server request is in flight. Keeps the
// previous (stale) rows visible but dimmed so it's clear something is loading.
function TableLoadingOverlay() {
  const { t } = useTranslation();
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label={t("belege.list.loading")}
    >
      <Loader2 className="size-6 animate-spin text-brand" />
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-wash px-3 py-1 text-xs font-medium text-brand-dark">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={t("belege.list.filter.remove")}
        className="hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function SortHeader({
  label,
  col,
  alsoFor,
  secondary,
  search,
  onSort,
  align = "left",
}: {
  label: string;
  col: BelegSortKey;
  /**
   * A second key sorted from the same header, for a column whose cell carries two dates. The due
   * date lives under the invoice date rather than in a column of its own, so without this there is
   * no way to order a payment list by what is due first.
   */
  secondary?: { label: string; col: BelegSortKey };
  /**
   * A second sort key this column also owns. "Review priority" in the toolbar sorts by the review
   * score, which is this column's other value, so the header has to show that the table is sorted
   * even though the key is not its own. Without it every header sat on the neutral icon while the
   * rows were plainly reordered, and the only clue was a toolbar button you scroll past.
   */
  alsoFor?: BelegSortKey;
  search: NormalizedSearch;
  onSort: (k: BelegSortKey) => void;
  align?: "left" | "right";
}) {
  const viaAlso = alsoFor !== undefined && search.sort === alsoFor;
  const active = search.sort === col || viaAlso;
  return (
    <TableHead
      // The icons below carry the sort state visually; aria-sort carries it for screen readers,
      // which otherwise get an unlabelled button and no indication the table is sorted at all.
      aria-sort={
        active || search.sort === secondary?.col
          ? search.dir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        // When the header is marked active because of `alsoFor` (review-priority sort), toggling
        // has to act on THAT key. Passing `col` instead silently swapped the sort key and forced
        // `asc`, so a header showing "sorted descending" answered a click to flip direction by
        // sorting something else ascending -- and the aria-sort below was announcing a state the
        // click could not toggle.
        onClick={() => onSort(viaAlso ? alsoFor : col)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {/* The toolbar toggle's own icon, so "Prüf-Priorität" up there and this column down here
            read as the same thing rather than two unrelated controls. */}
        {viaAlso && <Flag className="size-3" />}
        {active ? (
          search.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={() => onSort(secondary.col)}
          className={cn(
            "ml-2 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground",
            search.sort === secondary.col ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {secondary.label}
          {search.sort === secondary.col ? (
            search.dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-40" />
          )}
        </button>
      )}
    </TableHead>
  );
}

// Kanban board = the WORKFLOW dimension (approval lifecycle). Columns are the
// workflow_status values (WORKFLOW_REIHENFOLGE — single source); label/subtitle from i18n.
// The service date, but only when it says something the invoice date does not. For a lot of
// invoices the period the work belongs to is the date that matters (a January invoice for December
// cleaning belongs in December), and it was never on the list at all. Same date on both, or no
// service date at all, and this stays out of the way rather than repeating what is already there.
function KanbanBoard({
  counts,
  filter,
  aktiv,
  stellerName,
}: {
  counts: Record<string, number>;
  filter: BelegeFilter;
  aktiv: boolean;
  stellerName: (b: BelegListeRow) => string;
}) {
  const { t } = useTranslation();
  // Same as in the list view: the cards carry the current filters too, so coming back from an
  // invoice opened off the board lands on the board with those filters still set.
  const detailSearch = carryListSearch(Route.useSearch());
  // Counts come from the server for the WHOLE filter, so a column header is right whether it holds
  // three receipts or three thousand. It used to count within one 500-row page shared by every
  // column, which quietly went wrong past 500.
  const hatKarten = (w: string) => (counts[w] ?? 0) > 0;
  const ersteMitInhalt = WORKFLOW_REIHENFOLGE.find(hatKarten) ?? null;
  // Which stage is expanded on a phone. `undefined` means the user has not chosen yet, `null` means
  // they closed the open one and want them all closed. The two have to stay apart: seeding the
  // state with `ersteMitInhalt` collapsed them into one value, so the seed was taken once on mount
  // and never revisited. The board stays mounted across filter changes, so narrowing the filter
  // left the previously opened stage open and empty while every stage that did have cards stayed
  // collapsed, which on a phone reads as "no results".
  const [wahl, setWahl] = useState<string | null | undefined>(undefined);
  const offeneSpalte =
    wahl === undefined || (wahl !== null && !hatKarten(wahl)) ? ersteMitInhalt : wahl;
  // PHONE: ONE COLUMN AT A TIME, STACKED. As a horizontal board a phone shows one column at nearly
  // full width with a sliver of the next, so reading all nine stages meant swiping across eight
  // times. Below `sm` the stages become a stacked list of headers with their counts, and tapping
  // one opens its cards. From `sm` up it is the board it always was.
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-3 sm:overflow-x-auto sm:pb-2">
      {WORKFLOW_REIHENFOLGE.map((workflow) => (
        <KanbanSpalte
          key={workflow}
          workflow={workflow}
          anzahl={counts[workflow] ?? 0}
          filter={filter}
          // Empty columns never fetch: the count already told us there is nothing to page through,
          // and nine requests where three would do is the kind of thing that makes a board feel
          // slow for no reason.
          aktiv={aktiv && (counts[workflow] ?? 0) > 0}
          offen={offeneSpalte === workflow}
          onToggle={() => setWahl(offeneSpalte === workflow ? null : workflow)}
          stellerName={stellerName}
          detailSearch={detailSearch}
          t={t}
        />
      ))}
    </div>
  );
}

/**
 * One workflow column, paging its own cards as it is scrolled.
 *
 * The column body was already the scroll container (`max-h-[60vh] overflow-y-auto`), so infinite
 * scroll belongs here rather than on the board: scrolling the "Eingegangen" column should fetch
 * more receipts that are eingegangen, not more of everything. A sentinel at the bottom of the
 * container asks for the next page as it comes into view.
 */
function KanbanSpalte({
  workflow,
  anzahl,
  filter,
  aktiv,
  offen,
  onToggle,
  stellerName,
  detailSearch,
  t,
}: {
  workflow: string;
  anzahl: number;
  filter: BelegeFilter;
  aktiv: boolean;
  offen: boolean;
  onToggle: () => void;
  stellerName: (b: BelegListeRow) => string;
  detailSearch: ReturnType<typeof carryListSearch>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const spalteQ = useBelegeKanbanSpalte(filter, workflow, { enabled: aktiv });
  const items = (spalteQ.data?.pages ?? []).flatMap((seite) => seite.rows);
  const subtitle = t(`belege.list.kanban.col.${workflow}.subtitle`);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = spalteQ;

  useEffect(() => {
    const ziel = sentinelRef.current;
    // `root` is the column body, not the viewport: below `sm` the column is inside the page scroll
    // and from `sm` up it scrolls on its own, and the observer has to watch whichever one is
    // actually moving. Passing the container covers both -- a null root would only work for the
    // phone layout.
    const wurzel = scrollRef.current;
    if (!ziel || !hasNextPage || isFetchingNextPage) return;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      // A whole card's height of lead time, so the next page is usually there before the current
      // one runs out and the column does not visibly stall.
      { root: wurzel, rootMargin: "200px" },
    );
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div className="flex w-full shrink-0 flex-col rounded-xl border border-border bg-muted/30 p-2 sm:w-72">
      {/* The header is the toggle on a phone and a plain heading from `sm` up, where every
          column is open anyway. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={offen}
        // A stable hook for the column, independent of markup. `[aria-expanded]` alone is not
        // specific enough: in Eiffler the accounting screens render inside the hub shell, whose
        // sidebar groups carry it too.
        data-kanban-spalte={workflow}
        className="flex w-full items-start justify-between gap-2 px-2 py-2 text-left sm:pointer-events-none"
      >
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground">
            {t(`belege.list.kanban.col.${workflow}.label`)}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[0.7rem] leading-tight text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
            {anzahl}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform sm:hidden",
              offen && "rotate-180",
            )}
          />
        </span>
      </button>
      <div
        ref={scrollRef}
        className={cn(
          "max-h-[60vh] space-y-2 overflow-y-auto pr-0.5",
          // Closed on a phone, always shown from `sm` up.
          !offen && "hidden sm:block",
        )}
      >
        {items.map((b) => (
          <Link
            key={b.id}
            to="/eingangsrechnungen/$nr"
            params={{ nr: b.id }}
            search={detailSearch}
            className="block rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">{stellerName(b)}</span>
              <GesellschaftChip code={b.company_code} />
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {b.invoice_number ?? t("belege.list.row.ohneNr")}
            </div>
            {!istEingangsrechnung(b.document_type) || istLastschrift(b.payment_method) ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {!istEingangsrechnung(b.document_type) && (
                  <BelegartBadge belegart={b.document_type} />
                )}
                {istLastschrift(b.payment_method) && <LastschriftBadge />}
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatEUR(b.amount_gross)}
              </span>
              <div className="flex items-center gap-1.5">
                {istDatevBereit(b.workflow_status) && <DatevBereitBadge />}
                <ZahlungBadge bezahltAm={b.paid_at} />
                <UstBadge ustSatz={b.vat_rate} steuer={b.tax} />
              </div>
            </div>
          </Link>
        ))}

        {/* First page still in flight: a skeleton rather than the empty-state text, which would
            otherwise flash "keine Belege" on every column that does have some. */}
        {spalteQ.isLoading && anzahl > 0 && (
          <div className="space-y-2">
            {Array.from({ length: Math.min(anzahl, 3) }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        {/* The sentinel sits after the cards and inside the scroll container, so it only comes
            into view once the column has actually been scrolled to its end. */}
        {hasNextPage && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}

        {isFetchingNextPage && (
          <p className="px-2 py-2 text-center text-xs text-muted-foreground">
            {t("belege.list.kanban.laedtMehr")}
          </p>
        )}

        {anzahl === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("belege.list.kanban.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
