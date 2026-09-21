import { TABLE } from "@/config/tables";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PeriodPicker } from "@/components/data-table/period-picker";
import {
  usePeriodOptions,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";
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
import { useCostCentreResolver } from "@/lib/data/cost-centre";

const LAST_OPENED_INVOICE_KEY = "documents.lastOpenedInvoice";
/** Stable across renders, so the selection hook does not rebuild its id list every time. */
const documentRowId = (b: DocumentListRow) => b.id;
const AI_SEARCH_RETURN_KEY = "documents.aiSearchReturn";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDocumentsFacets,
  useDocumentsKanbanCounts,
  useDocumentsKanbanColumn,
  useDocumentsKpis,
  useInvoiceQueueKpis,
  useDocumentsWithoutCompanyCount,
  useDocumentsList,
  useBulkInvoiceActions,
  useCompanies,
} from "@/data";
import { useTranslation } from "@/lib/i18n";
import {
  COMPANY_WITHOUT,
  PROPERTY_WITHOUT,
  WORKFLOW_ORDER,
  documentTypeKey,
  dateLocale,
  dueBucket,
  dueFilterRange,
  formatDate,
  formatDateTime,
  formatEUR,
  todayLocal,
  isDatevReady,
  isIncomingInvoice,
  isDirectDebit,
  type DueFilter,
} from "@/lib/data/format";
import { withoutChecks, checkReasons } from "@/features/invoice-detail/checks";
// The rows arrive already re-checked against their current data: useBelegeListe verifies at the
// read (see `nachgeprueft` in queries.ts), so a row whose company has since been assigned is not
// still counted as missing one.
import { ReviewBadge } from "@/features/invoice-detail/ReviewChip";
import { OutgoingBadge } from "@/features/invoice-detail/OutgoingFlag";
import {
  DocumentTypeBadge,
  DatevReadyBadge,
  DatevHandoverBadge,
  CompanyChip,
  ChannelBadge,
  ConfidencePill,
  DirectDebitBadge,
  VatBadge,
  WorkflowBadge,
  BankMatchBadge,
  PaymentBadge,
} from "@/components/documents/badges";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { QueueKpiRow } from "@/components/invoice-queue/queue-kpi-row";
import { NextActionCell } from "@/components/invoice-queue/next-action-cell";
import { CARD_FILTER_KEYS, QUEUE_CARDS, nextAction } from "@/lib/data/invoice-queue-config";
import {
  clearStoredAiSearch,
  IntentConsolePanel,
  readStoredAiSearch,
} from "@/components/documents/intent-console-panel";
import type { InvoiceSearchOutcome } from "@/lib/api/invoice-intent.functions";
import { AiSimpleSearch, type AiSearchLabels } from "@/kit/components/ai-search";
import { FilterFieldsGroup, type FilterField } from "@/kit/components/filters";
import {
  BulkActionBar,
  SelectPageCheckbox,
  SelectRowCheckbox,
  useRowSelection,
  type BulkAction,
} from "@/kit/components/bulk-actions";
import type { DocumentsFilter, DocumentListRow, DocumentSortKey } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";
import {
  ALL,
  DATEV_VALUES,
  DUE_FILTER_VALUES,
  PAGE_SIZES,
  PAYMENT_TYPE_VALUES,
  STATUS_VALUES,
  WORKFLOW_FILTER_VALUES,
  PAYMENT_VALUES,
  carryListSearch,
  normalize,
  validateSearch,
} from "@/lib/documents-list-search";
import type { DocumentsSearch, NormalizedSearch, PageSize } from "@/lib/documents-list-search";

export const Route = createFileRoute("/incoming-invoices/")({
  validateSearch,
  head: () => ({ meta: [{ title: pageTitle("Eingangsrechnungen") }] }),
  component: IncomingInvoicesPage,
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
    m.includes(TABLE.vDocumentsList) ||
    m.includes("v_invoices_review") ||
    m.includes("invoices_kpis") ||
    m.includes("invoices_facets") ||
    m.includes("does not exist") ||
    m.includes("pgrst202") || // function not found in schema cache
    m.includes("pgrst205") || // table/view not found in schema cache
    m.includes("schema cache")
  );
}

function IncomingInvoicesPage() {
  const { t } = useTranslation();
  const search = normalize(Route.useSearch());
  const navigate = Route.useNavigate();
  // Handed to every link that opens an invoice, so the detail view can send the user back to the
  // list they were actually looking at. Filtering to "Zu prüfen", opening one and coming back used
  // to land on the full unfiltered list, with the filter to redo by hand every time. Defaults are
  // stripped, so opening an invoice off an unfiltered list still gives a clean URL.
  const detailSearch = carryListSearch(search);

  const statusLabel = (v: string) => t(`documents.status.${v}`, { defaultValue: v });
  const paymentLabel = (v: string) => t(`documents.badge.${v}`, { defaultValue: v });
  const datevLabel = (v: string) =>
    t(`documents.list.filter.datev${v === "uebergeben" ? "Uebergeben" : "Offen"}`, {
      defaultValue: v,
    });
  // Through belegartKey, so the option label follows the same normalization the row badge uses.
  // The values come from the facets RPC, i.e. straight out of the column ("rechnung"), and used to
  // be rendered raw whenever the key did not match.
  const documentTypeLbl = (v: string) => {
    const key = documentTypeKey(v) ?? v;
    return t(`documents.belegart.${key}`, {
      defaultValue: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    });
  };

  // Merge a patch into the URL search params. Filter changes reset to page 1.
  const setSearch = (patch: Partial<DocumentsSearch>, resetPage = true) => {
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
      t(`documents.list.nlSearch.${name}`, values);
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
  const range = periodArea(search.period, search.fromDate ?? "", search.toDate ?? "");
  // ALLE is this screen's own "no filter" sentinel, shared with its company/property/status
  // filters, so the period keeps it rather than adopting the shared vocabulary's own spelling.
  const periodOptions = usePeriodOptions(ALL);
  const today = todayLocal();
  const dueBand = search.due ? dueFilterRange(search.due as DueFilter, today) : null;
  const filter: DocumentsFilter = {
    q: search.q || undefined,
    ids: aiIds ?? undefined,
    company: search.company,
    property: search.property,
    status: search.status,
    documentType: search.documentType,
    payment: search.payment,
    paymentType: search.paymentType,
    datev: search.datev,
    bankMatch: search.bankMatch,
    trafficLight: search.trafficLight,
    workflow: search.workflow,
    archive: search.archive,
    fromDate: range.fromDate ?? undefined,
    toDate: range.toDate ?? undefined,
    dueFromDate: dueBand?.fromDate,
    dueToDate: dueBand?.toDate,
    dueUnknown: dueBand?.unknown,
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
    company: filter.company,
    property: filter.property,
    documentType: filter.documentType,
    payment: filter.payment,
    paymentType: filter.paymentType,
    fromDate: filter.fromDate,
    toDate: filter.toDate,
    datev: filter.datev,
    bankMatch: filter.bankMatch,
    workflow: filter.workflow,
    trafficLight: filter.trafficLight,
    archive: filter.archive,
    ids: filter.ids,
    dueFromDate: filter.dueFromDate,
    dueToDate: filter.dueToDate,
    dueUnknown: filter.dueUnknown,
  };

  const isList = search.view === "liste";
  const listQ = useDocumentsList(
    { ...filter, sort: search.sort, dir: search.dir, page: search.page, pageSize: search.pageSize },
    { enabled: isList },
  );
  const kanbanQ = useDocumentsKanbanCounts(filter, { enabled: !isList });
  const kpiQ = useDocumentsKpis(kpiFilter);
  const withoutCompanyQ = useDocumentsWithoutCompanyCount(filter);
  const withoutCompany = withoutCompanyQ.data ?? 0;
  const withoutCompanyActive = search.company === COMPANY_WITHOUT;
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
      const targetSearch: Record<string, unknown> = { ...search, page: 1 };
      for (const k of CARD_FILTER_KEYS) {
        targetSearch[k] = active ? undefined : (spec.search[k] ?? undefined);
      }
      // A card that names an order applies it too, and hands it back on deselect. "Jetzt zu
      // zahlen" is worked oldest first; leaving it on the received-date default put the most
      // urgent invoice anywhere in the list.
      if (spec.sort) {
        targetSearch.sort = active ? undefined : spec.sort;
        targetSearch.dir = active ? undefined : (spec.dir ?? "asc");
      }
      return {
        key: spec.key,
        label: t(`documents.list.queue.${spec.key}.label`),
        description: t(`documents.list.queue.${spec.key}.desc`),
        count: String(row.count),
        amount: formatEUR(row.amount),
        tone: spec.tone,
        icon: spec.icon,
        to: spec.to,
        search: targetSearch,
        active,
      };
    });
  }, [queueQ.data, t, search]);

  // The counter behind the chip under the KPI tiles. Its own query rather than a KPI field: it
  // answers "how many would a different company filter return", which is not the set the tiles
  // count.

  const facetsQ = useDocumentsFacets();
  const companiesQ = useCompanies();
  // Resolved once for the whole page: all three master-data queries behind it are unscoped single
  // requests, so a list of 50 rows costs what one row costs.
  const costCentres = useCostCentreResolver();

  const companies = companiesQ.data ?? [];
  const propertyCodes = facetsQ.data?.objekt_codes ?? [];
  const documentTypeOptions = facetsQ.data?.documentTypes ?? [];
  // months/years are still returned by the facets RPC but no longer read: the period picker offers
  // a fixed set of calendar presets rather than a row per month present in the data.
  const issuerName = (b: DocumentListRow): string => b.issuer_sort ?? b.issuer ?? "—";

  const activeFilter =
    !!search.company ||
    !!search.property ||
    !!search.status ||
    !!search.documentType ||
    !!search.payment ||
    !!search.datev ||
    search.period !== ALL ||
    (search.q ?? "") !== "" ||
    // The two axes added with the review queue. Without them "Filter zurücksetzen" stayed hidden
    // while the list was still narrowed to the flagged or archived subset, which reads as "this is
    // everything" — the one thing a filter control must never imply.
    !!search.trafficLight ||
    !!search.archive ||
    // Same reason as the two above, and the same bug: selecting only the workflow or the
    // bank-reconciliation filter narrowed the list while "Filter zurücksetzen" stayed hidden, so a
    // filtered list looked like the whole set with no visible way back. Every filter that can
    // narrow the list has to be counted here.
    !!search.workflow ||
    !!search.bankMatch ||
    !!search.due ||
    !!search.paymentType ||
    aiIds !== null;

  function resetFilter() {
    setAiIds(null);
    setSearch({
      q: undefined,
      company: undefined,
      property: undefined,
      status: undefined,
      documentType: undefined,
      payment: undefined,
      datev: undefined,
      // workflow and bankMatch were missing here, which is why "Filter zurücksetzen" looked dead:
      // with only one of them active the click cleared nothing, aktiveFilter stayed true, and the
      // bar simply remained. Every key aktiveFilter counts as narrowing has to be cleared here, or
      // the reset silently does not reset.
      workflow: undefined,
      bankMatch: undefined,
      trafficLight: undefined,
      archive: undefined,
      due: undefined,
      paymentType: undefined,
      period: ALL,
      fromDate: undefined,
      toDate: undefined,
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
  function toggleSort(key: DocumentSortKey) {
    if (search.sort === key) setSearch({ dir: search.dir === "asc" ? "desc" : "asc" });
    else setSearch({ sort: key, dir: "asc" });
  }

  // Backend (migration 0010) not applied → clear developer note, no incorrect fallback.
  const backendErr =
    (listQ.isError && isBackendMissing(listQ.error)) ||
    (kanbanQ.isError && isBackendMissing(kanbanQ.error)) ||
    (kpiQ.isError && isBackendMissing(kpiQ.error)) ||
    (facetsQ.isError && isBackendMissing(facetsQ.error));

  // Pagination math (list view).
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / search.pageSize));

  // The query served the last page that exists because the URL asked for one past the end, which
  // is what a bookmarked "?page=9" turns into once the result set shrinks. Correct the URL so the
  // two stop disagreeing, and replace rather than push so the dead page number leaves no history
  // entry to walk back into.
  const adjustedPage = listQ.data?.adjustedPage;
  useEffect(() => {
    if (adjustedPage && adjustedPage !== search.page) {
      setSearch({ page: adjustedPage });
    }
    // setSearch is rebuilt every render; depending on it would run this on every render instead of
    // when the page actually needs correcting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustedPage, search.page]);
  const fromRow = total === 0 ? 0 : (search.page - 1) * search.pageSize + 1;
  const toRow = Math.min(search.page * search.pageSize, total);
  const rows = listQ.data?.rows ?? [];

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
    rowId: documentRowId,
    resetKey: JSON.stringify(search),
  });

  const bulkActions: BulkAction[] = [
    {
      key: "archive",
      label: t("documents.list.bulk.archivieren.label"),
      icon: Archive,
      confirmTitle: t("documents.list.bulk.archivieren.titel", { count: selection.selectedCount }),
      confirmDescription: t("documents.list.bulk.archivieren.beschreibung"),
      input: {
        kind: "text",
        label: t("documents.list.bulk.archivieren.feld"),
        placeholder: t("documents.list.bulk.archivieren.platzhalter"),
      },
      run: bulk.archive,
    },
    {
      key: "not-relevant",
      label: t("documents.list.bulk.nichtRelevant.label"),
      icon: Undo2,
      confirmTitle: t("documents.list.bulk.nichtRelevant.titel", {
        count: selection.selectedCount,
      }),
      confirmDescription: t("documents.list.bulk.nichtRelevant.beschreibung"),
      input: {
        kind: "text",
        label: t("documents.list.bulk.nichtRelevant.feld"),
        placeholder: t("documents.list.bulk.nichtRelevant.platzhalter"),
        required: true,
      },
      run: bulk.markNotRelevant,
    },
    {
      key: "assign-company",
      label: t("documents.list.bulk.gesellschaft.label"),
      icon: Building2,
      confirmTitle: t("documents.list.bulk.gesellschaft.titel", { count: selection.selectedCount }),
      confirmDescription: t("documents.list.bulk.gesellschaft.beschreibung"),
      input: {
        kind: "choice",
        label: t("documents.list.bulk.gesellschaft.feld"),
        placeholder: t("documents.list.bulk.gesellschaft.platzhalter"),
        required: true,
        options: companies.map((g) => ({
          value: g.id,
          label: g.name ? `${g.code} · ${g.name}` : g.code,
          keywords: g.code,
        })),
      },
      run: bulk.assignCompany,
    },
    {
      key: "delete",
      label: t("documents.list.bulk.loeschen.label"),
      icon: Trash2,
      tone: "destructive",
      confirmTitle: t("documents.list.bulk.loeschen.titel", { count: selection.selectedCount }),
      confirmDescription: t("documents.list.bulk.loeschen.beschreibung"),
      input: {
        kind: "text",
        label: t("documents.list.bulk.loeschen.feld"),
        placeholder: t("documents.list.bulk.loeschen.platzhalter"),
        required: true,
      },
      run: bulk.softDelete,
    },
  ];

  const bulkLabels = {
    selectedCount: (count: number) => t("documents.list.bulk.ausgewaehlt", { count }),
    clearSelection: t("documents.list.bulk.auswahlAufheben"),
    cancel: t("documents.list.bulk.abbrechen"),
    confirm: t("documents.list.bulk.anwenden"),
    running: t("documents.list.bulk.laeuft"),
    done: (count: number) => t("documents.list.bulk.fertig", { count }),
    partlyDone: (success: number, error: number) =>
      t("documents.list.bulk.teilweise", { success, error }),
    failed: (message: string) => t("documents.list.bulk.fehlgeschlagen", { message }),
  };

  // ---------------------------------------------------------------------------------------------
  // Secondary filters, as one list rather than six separate Comboboxes on the toolbar. Gesellschaft
  // and Zeitraum stay on the surface (what an accountant changes most); the rest live behind one
  // "Filters" popover with a count badge, and the active-filter chips below the bar are derived
  // from this SAME array so the popover, the chips and the count can never drift apart the way the
  // old hand-written chip block had (it was missing a chip for `ampel` entirely).
  // ---------------------------------------------------------------------------------------------
  type FurtherFilter = {
    key: string;
    label: string;
    value: string | undefined;
    options: { value: string; label: string }[];
    onChange: (v: string | undefined) => void;
  };

  const furtherFilter: FurtherFilter[] = [
    {
      key: "property",
      label: t("documents.list.filter.objekt"),
      value: search.property,
      options: [
        { value: ALL, label: t("documents.list.filter.alleObjekte") },
        // Same negative filter the company dropdown got: most of this queue has nothing assigned,
        // and until now there was no way to ask for exactly those rows.
        { value: PROPERTY_WITHOUT, label: t("documents.list.filter.ohneObjekt") },
        ...propertyCodes.map((c) => ({ value: c, label: c })),
      ],
      onChange: (v) => setSearch({ property: v }),
    },
    {
      key: "status",
      label: t("documents.list.filter.status"),
      value: search.status,
      options: [
        { value: ALL, label: t("documents.list.filter.alleStatus") },
        ...STATUS_VALUES.map((v) => ({ value: v, label: statusLabel(v) })),
      ],
      onChange: (v) => setSearch({ status: v }),
    },
    {
      // Approval-chain stage — a separate axis from `status` (AI review) and `zahlung` (paid or
      // not). A receipt sitting at 'approved_final', waiting on payment, is otherwise
      // indistinguishable in this list from one still at 'received'.
      key: "workflow",
      label: t("documents.list.filter.workflow"),
      value: search.workflow,
      options: [
        { value: ALL, label: t("documents.list.filter.alleWorkflow") },
        ...WORKFLOW_FILTER_VALUES.map((v) => ({ value: v, label: t(`documents.workflow.${v}`) })),
      ],
      onChange: (v) => setSearch({ workflow: v }),
    },
    ...(documentTypeOptions.length > 0
      ? [
          {
            key: "belegart",
            label: t("documents.list.filter.belegart"),
            value: search.documentType,
            options: [
              { value: ALL, label: t("documents.list.filter.alleBelegarten") },
              ...documentTypeOptions.map((a) => ({ value: a, label: documentTypeLbl(a) })),
            ],
            onChange: (v: string | undefined) => setSearch({ documentType: v }),
          },
        ]
      : []),
    {
      key: "zahlung",
      label: t("documents.list.filter.zahlung"),
      value: search.payment,
      options: [
        { value: ALL, label: t("documents.list.filter.alleZahlungen") },
        ...PAYMENT_VALUES.map((v) => ({ value: v, label: paymentLabel(v) })),
      ],
      onChange: (v) => setSearch({ payment: v }),
    },
    {
      key: "paymentType",
      label: t("documents.list.filter.zahlungsart"),
      value: search.paymentType,
      options: [
        { value: ALL, label: t("documents.list.filter.alleZahlungsarten") },
        ...PAYMENT_TYPE_VALUES.map((v) => ({
          value: v,
          label: t(`documents.list.filter.zahlungsartWert.${v}`),
        })),
      ],
      onChange: (v) => setSearch({ paymentType: v }),
    },
    {
      key: "due",
      label: t("documents.list.filter.faellig"),
      value: search.due,
      options: [
        { value: ALL, label: t("documents.list.filter.alleFaellig") },
        ...DUE_FILTER_VALUES.map((v) => ({ value: v, label: t(`openItems.due.${v}`) })),
      ],
      onChange: (v) => setSearch({ due: v }),
    },
    {
      key: "datev",
      label: t("documents.list.filter.datev"),
      value: search.datev,
      options: [
        { value: ALL, label: t("documents.list.filter.alleDatev") },
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
      label: t("documents.list.filter.bankMatch"),
      value: search.bankMatch,
      options: [
        { value: ALL, label: t("documents.list.filter.alleBankMatch") },
        { value: "open", label: t("documents.badge.bankMatchOffen") },
        { value: "suggestion", label: t("documents.badge.bankMatchVorschlag") },
        { value: "matched", label: t("documents.badge.bankMatchZugeordnet") },
      ],
      onChange: (v) => setSearch({ bankMatch: v }),
    },
    {
      // Recognition traffic light. Its own filter because it is its own axis: the pipeline flags
      // a yellow receipt for a human nod while still leaving status='recognised', so without this
      // there is no way to list the yellow ones at all.
      key: "ampel",
      label: t("documents.list.filter.ampel"),
      value: search.trafficLight,
      options: [
        { value: ALL, label: t("documents.list.filter.alleAmpeln") },
        { value: "auffaellig", label: t("documents.list.filter.ampelAuffaellig") },
        { value: "green", label: t("documents.ampel.gruen") },
        { value: "yellow", label: t("documents.ampel.gelb") },
        { value: "red", label: t("documents.ampel.rot") },
      ],
      onChange: (v) => setSearch({ trafficLight: v }),
    },
  ];

  const activeFurtherFilter = furtherFilter.filter((f) => !!f.value);
  const furtherFilterLabel = (f: FurtherFilter) =>
    f.options.find((o) => o.value === f.value)?.label ?? f.value ?? "";

  const aiLabels: AiSearchLabels = {
    title: t("documents.list.nlSearch.titel"),
    description: t("documents.list.nlSearch.desc"),
    questionPlaceholder: t("documents.list.nlSearch.placeholder"),
    questionPlaceholderShort: t("documents.list.nlSearch.placeholderKurz"),
    simpleSearch: t("documents.list.nlSearch.einfach"),
    simplePlaceholder: t("documents.list.nlSearch.einfachPlatzhalter"),
    assistant: t("documents.list.nlSearch.aiButton"),
    clear: t("documents.list.nlSearch.clear"),
    submit: t("documents.list.nlSearch.submit"),
    searching: t("documents.list.nlSearch.searching"),
    error: t("documents.list.nlSearch.error"),
    offTopic: t("documents.list.nlSearch.offTopic"),
    aggregateHint: t("documents.list.nlSearch.aggregatHinweis"),
    truncated: (shown, total) => t("documents.list.nlSearch.gekuerzt", { shown, total }),
    truncatedSimilar: (shown, total) =>
      t("documents.list.nlSearch.gekuerztAehnlich", { shown, total }),
  };
  const timePeriodField = (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {t("documents.list.filter.zeitraum")}
      </span>
      <PeriodPicker
        value={search.period}
        onValueChange={(v) => setSearch({ period: v })}
        fromDate={search.fromDate ?? ""}
        toDate={search.toDate ?? ""}
        onRangeApply={(fromDateNew, toDateNew) =>
          setSearch({ fromDate: fromDateNew || undefined, toDate: toDateNew || undefined })
        }
        locale={dateLocale()}
        formatDay={(iso) => formatDate(iso)}
        backLabel={t("home.zeitraumAktion.zurueck")}
        placeholder={t("documents.list.filter.zeitraum")}
        ariaLabel={t("documents.list.filter.zeitraum")}
        className="w-full"
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
  );
  const filterGroupFields: FilterField[] = [
    {
      key: "company",
      label: t("documents.list.filter.gesellschaft"),
      value: search.company,
      options: [
        { value: ALL, label: t("documents.list.filter.alleGesellschaften") },
        { value: COMPANY_WITHOUT, label: t("documents.list.filter.ohneGesellschaft") },
        ...companies
          .filter((g) => g.code !== COMPANY_WITHOUT)
          .map((g) => ({ value: g.code, label: `${g.code} · ${g.name}`, keywords: g.name })),
      ],
    },
    ...furtherFilter.map(({ key, label, value, options }) => ({ key, label, value, options })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("documents.list.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("documents.list.subtitle")}</p>
        </div>
        <Button asChild className="gap-2" data-tour="incoming-upload">
          <Link to="/incoming-invoices/upload">
            <Upload className="size-4" /> {t("documents.list.upload")}
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
            <p>{t("documents.list.backendMissing")}</p>
            <p className="mt-1 text-xs text-amber-800/80">
              {t("documents.list.backendMissingTechnisch")}
            </p>
          </div>
        </div>
      )}

      <div data-tour="incoming-queue">
        <QueueKpiRow className="mt-6" cards={queueCards} loading={queueQ.isLoading} />
      </div>

      {withoutCompany > 0 && !withoutCompanyActive && (
        <div className="mt-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft py-1.5 pr-1.5 pl-3">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 text-[13px] text-foreground">
            {t("documents.list.filter.ohneGesellschaftStrip", { count: withoutCompany })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => setSearch({ company: COMPANY_WITHOUT, page: 1 })}
          >
            {t("documents.list.filter.ohneGesellschaftZuweisen")}
          </Button>
        </div>
      )}

      {aiMode && (
        <IntentConsolePanel
          className="mt-3"
          labels={{
            title: t("documents.list.nlSearch.titel"),
            description: t("documents.list.nlSearch.desc"),
            placeholder: t("documents.list.nlSearch.placeholder"),
            close: t("documents.list.nlSearch.normalSearch"),
            searching: t("documents.list.nlSearch.searching"),
            error: t("documents.list.nlSearch.error"),
            offTopic: t("documents.list.nlSearch.offTopic"),
            found: (count) => t("documents.list.nlSearch.treffer", { count }),
            noResults: t("documents.list.nlSearch.keineTreffer"),
            notApplied: (aspects) => t("documents.list.nlSearch.nichtAngewendet", { aspects }),
            clear: t("documents.list.nlSearch.clear"),
          }}
          suggestions={[t("documents.list.nlSearch.v1"), t("documents.list.nlSearch.v2")]}
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
              anyValue={ALL}
              labels={{
                apply: t("documents.list.filter.anwenden"),
                reset: t("documents.list.filter.reset"),
              }}
              onApply={(values) => {
                setSearch(values as Partial<DocumentsSearch>);
                setFilterOpen(false);
                setMobileFiltersOpen(false);
              }}
              onReset={() => {
                setFilterOpen(false);
                setMobileFiltersOpen(false);
                setSearch({
                  company: undefined,
                  property: undefined,
                  status: undefined,
                  documentType: undefined,
                  payment: undefined,
                  datev: undefined,
                  workflow: undefined,
                  bankMatch: undefined,
                  trafficLight: undefined,
                  due: undefined,
                  paymentType: undefined,
                  period: ALL,
                  fromDate: undefined,
                  toDate: undefined,
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
                  activeFurtherFilter.length > 0
                    ? "border-brand bg-brand-wash text-brand-dark"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-4" />
                {t("documents.list.filter.weitere")}
                {activeFurtherFilter.length > 0 && (
                  <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
                    {activeFurtherFilter.length}
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
                    <SheetTitle>{t("documents.list.filter.weitere")}</SheetTitle>
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
                      activeFurtherFilter.length > 0
                        ? "border-brand bg-brand-wash text-brand-dark"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <SlidersHorizontal className="size-4" />
                    {t("documents.list.filter.weitere")}
                    {activeFurtherFilter.length > 0 && (
                      <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
                        {activeFurtherFilter.length}
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
          onClick={() => setSearch({ archive: search.archive === "only" ? undefined : "only" })}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
            search.archive === "only"
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title={t("documents.list.filter.archivTitle")}
        >
          <Archive className="size-4" /> {t("documents.list.filter.archiv")}
        </button>

        <button
          type="button"
          onClick={() =>
            search.sort === "check"
              ? setSearch({ sort: "received_at", dir: "desc" })
              : setSearch({ sort: "check", dir: "desc" })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
            search.sort === "check"
              ? "border-brand bg-brand-wash text-brand-dark"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title={t("documents.list.sort.pruefPrioritaetTitle")}
        >
          {/* A sort control asks for nothing, so it does not get the alarm triangle. The flag says
              "these are the flagged ones" without reading as an error (Saskia, 09.09.2026). */}
          <Flag className="size-4" /> {t("documents.list.sort.pruefPrioritaet")}
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
              isList ? "bg-brand text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <TableIcon className="size-4" /> {t("documents.list.view.liste")}
          </button>
          <button
            type="button"
            onClick={() => setSearch({ view: "kanban" }, false)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
              !isList ? "bg-brand text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="size-4" /> {t("documents.list.view.kanban")}
          </button>
        </div>
      </div>

      {/* Aktive Filter-Chips — derived from the same weitereFilter array the popover renders, so a
          chip can never go missing for an axis the popover offers (the old hand-written block here
          had no chip for `ampel` at all). Gesellschaft and Zeitraum keep their own chip logic since
          they're not part of the popover. */}
      {activeFilter && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {search.company && (
            <FilterChip
              // "NZO" is the code that stands for "assigned to none". As a chip label it says
              // nothing to anyone reading it, so show what the filter option itself is called.
              label={
                search.company === COMPANY_WITHOUT
                  ? t("documents.list.filter.ohneGesellschaft")
                  : search.company
              }
              onClear={() => setSearch({ company: undefined })}
            />
          )}
          {activeFurtherFilter.map((f) => (
            <FilterChip
              key={f.key}
              label={`${f.label}: ${furtherFilterLabel(f)}`}
              onClear={() => f.onChange(undefined)}
            />
          ))}
          {search.period !== ALL && (
            <FilterChip
              label={t("documents.list.filter.zeitraum")}
              onClear={() => setSearch({ period: ALL, fromDate: undefined, toDate: undefined })}
            />
          )}
          <button
            type="button"
            onClick={resetFilter}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("documents.list.filter.reset")}
          </button>
        </div>
      )}

      {isList ? (
        listQ.isError && !backendErr ? (
          <div className="mt-4">
            <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
          </div>
        ) : listQ.isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("documents.list.pagination.showing", { from: fromRow, to: toRow, total })}
              {listQ.isFetching && ` · ${t("documents.list.updating")}`}
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
              {listQ.isFetching && <TableLoadingOverlay />}
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
                        label={t("documents.list.bulk.seiteWaehlen")}
                      />
                    </TableHead>
                    <SortHeader
                      label={t("documents.list.col.steller")}
                      col="issuer"
                      search={search}
                      onSort={toggleSort}
                    />
                    <SortHeader
                      label={t("documents.list.col.gesellschaft")}
                      col="company"
                      search={search}
                      onSort={toggleSort}
                    />
                    <SortHeader
                      label={t("documents.list.col.betrag")}
                      col="amount"
                      search={search}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHeader
                      label={t("documents.list.col.rechnungsdatum")}
                      col="document_date"
                      secondary={{ label: t("documents.list.col.faellig"), col: "due" }}
                      search={search}
                      onSort={toggleSort}
                    />
                    <TableHead title={t("documents.list.col.konfidenzHint")}>
                      {t("documents.list.col.konfidenz")}
                    </TableHead>
                    <SortHeader
                      label={t("documents.list.col.status")}
                      col="status"
                      alsoFor="check"
                      search={search}
                      onSort={toggleSort}
                    />
                    <TableHead>{t("documents.list.col.zahlung")}</TableHead>
                    <TableHead>{t("documents.list.col.bankAbgleich")}</TableHead>
                    <TableHead>{t("documents.list.col.naechsteAktion")}</TableHead>
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
                          to: "/incoming-invoices/$nr",
                          params: { nr: b.id },
                          search: detailSearch,
                        });
                      }}
                    >
                      <TableCell>
                        <SelectRowCheckbox
                          checked={selection.isSelected(b.id)}
                          onToggle={() => selection.toggleRow(b.id)}
                          label={t("documents.list.bulk.zeileWaehlen")}
                        />
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {/* The outgoing chip rides with the NAME: what it says is that this issuer
                            is one of our own companies, and beside the issuer is where that reads
                            as one fact instead of two. */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className="truncate font-medium text-foreground"
                            title={issuerName(b)}
                          >
                            {issuerName(b)}
                          </div>
                          <OutgoingBadge doc={b} />
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={b.invoice_number ?? ""}
                        >
                          {b.invoice_number
                            ? t("documents.list.row.nr", { nr: b.invoice_number })
                            : t("documents.list.row.ohneNr")}
                          {b.cost_category ? ` · ${b.cost_category}` : ""}
                        </div>
                        {!isIncomingInvoice(b.document_type) || isDirectDebit(b.payment_method) ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {!isIncomingInvoice(b.document_type) && (
                              <DocumentTypeBadge documentType={b.document_type} />
                            )}
                            {isDirectDebit(b.payment_method) && <DirectDebitBadge />}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <CompanyChip code={b.company_code} />
                        <CostCentreRow doc={b} resolver={costCentres} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="block font-medium">{formatEUR(b.amount_gross)}</span>
                        <span className="mt-0.5 block">
                          <VatBadge vatRate={b.vat_rate} tax={b.tax} />
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
                              dueBucket(b.due_date, today) === "overdue" && "text-destructive",
                            )}
                          >
                            {t("documents.list.col.faelligAm", { datum: formatDate(b.due_date) })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidencePill score={b.confidence_score} />
                      </TableCell>
                      <TableCell>
                        <ReviewBadge
                          reasonCount={checkReasons(b).length}
                          unchecked={withoutChecks(b)}
                          status={b.status}
                        />
                      </TableCell>
                      <TableCell>
                        <PaymentBadge paidAm={b.paid_at} />
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
                          const action = nextAction(b);
                          if (action === "none")
                            return <NextActionCell muted label={t("documents.list.aktion.none")} />;
                          // "pay" opens the payment tab straight away instead of the overview, so
                          // working down the pay list is one click per invoice.
                          if (action === "pay")
                            return (
                              <Button
                                size="sm"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate({
                                    to: "/incoming-invoices/$nr",
                                    params: { nr: b.id },
                                    search: { ...detailSearch, tab: "zahlung" },
                                  });
                                }}
                              >
                                {t("documents.list.aktion.pay")}
                              </Button>
                            );
                          return <NextActionCell label={t(`documents.list.aktion.${action}`)} />;
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Not while a fetch is still running. Changing the filter (an AI search most
                      visibly) empties `rows` until the new page arrives, and this line then claimed
                      there was nothing to show, directly under an answer that had just named a
                      figure. The loading overlay below already covers that moment. */}
                  {rows.length === 0 && !listQ.isFetching && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-12 text-center text-muted-foreground">
                        {t("documents.list.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list — same rows, same order, nothing clipped. */}
            <div className="relative mt-3 space-y-2 sm:hidden">
              {listQ.isFetching && <TableLoadingOverlay />}
              {rows.map((b) => (
                <Link
                  key={b.id}
                  to="/incoming-invoices/$nr"
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
                      {issuerName(b)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {formatEUR(b.amount_gross)}
                    </span>
                  </div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">
                    {b.invoice_number
                      ? t("documents.list.row.nr", { nr: b.invoice_number })
                      : t("documents.list.row.ohneNr")}
                    {b.cost_category ? ` · ${b.cost_category}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CompanyChip code={b.company_code} />
                    <CostCentreRow doc={b} resolver={costCentres} inline />
                    <VatBadge vatRate={b.vat_rate} tax={b.tax} />
                    <ChannelBadge channel={b.intake_channel} />
                    {!isIncomingInvoice(b.document_type) && (
                      <DocumentTypeBadge documentType={b.document_type} />
                    )}
                    {isDirectDebit(b.payment_method) && <DirectDebitBadge />}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <ConfidencePill score={b.confidence_score} />
                    <ReviewBadge
                      reasonCount={checkReasons(b).length}
                      unchecked={withoutChecks(b)}
                      status={b.status}
                    />
                    <WorkflowBadge status={b.workflow_status} />
                  </div>
                  {/* Labelled: the table distinguished these two by column header, and without
                      that a card can show two badges both reading "Offen" with no way to tell
                      which is the payment and which is the DATEV hand-off. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {t("documents.list.col.zahlungAbgleich")}: <PaymentBadge paidAm={b.paid_at} />
                      <BankMatchBadge
                        hasConfirmed={b.has_confirmed_bank_match}
                        hasSuggested={b.has_suggested_bank_match}
                      />
                    </span>
                    <span className="flex items-center gap-1">
                      {t("documents.list.col.datev")}:{" "}
                      <DatevHandoverBadge handedOverAt={b.handed_over_at} />
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {t("documents.list.col.rechnungsdatum")}: {formatDate(b.document_date)}
                    </span>
                    <span>
                      {t("documents.list.col.eingang")}: {formatDateTime(b.created_at)}
                    </span>
                    {b.due_date && !b.paid_at && (
                      <span
                        className={cn(
                          dueBucket(b.due_date, today) === "overdue" && "text-destructive",
                        )}
                      >
                        {t("documents.list.col.faelligAm", { datum: formatDate(b.due_date) })}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {rows.length === 0 && !listQ.isFetching && (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground">
                  {t("documents.list.empty")}
                </div>
              )}
            </div>

            {/* Pagination bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("documents.list.pagination.perPage")}</span>
                <Combobox
                  value={String(search.pageSize)}
                  onValueChange={(v) => setSearch({ pageSize: Number(v) as PageSize, page: 1 })}
                  className="h-8 w-[80px]"
                  options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("documents.list.pagination.page", { page: search.page, pages: totalPages })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={search.page <= 1 || listQ.isFetching}
                    onClick={() => setSearch({ page: search.page - 1 }, false)}
                  >
                    <ChevronLeft className="size-4" /> {t("documents.list.pagination.prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={search.page >= totalPages || listQ.isFetching}
                    onClick={() => setSearch({ page: search.page + 1 }, false)}
                  >
                    {t("documents.list.pagination.next")} <ChevronRight className="size-4" />
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
              active={!isList}
              issuerName={issuerName}
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
function CostCentreRow({
  doc,
  resolver,
  inline,
}: {
  doc: DocumentListRow;
  resolver: ReturnType<typeof useCostCentreResolver>;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const costCentre = resolver.resolve({
    companyCode: doc.company_code,
    propertyCode: doc.property_code,
    overhead: doc.is_overhead,
  });
  // Nothing at all while the master data is in flight, and nothing when no cost centre can be
  // named (unknown company, or a property that is not in the master data). Neither is a gap the
  // reader can act on from this screen.
  if (!costCentre) return null;
  return (
    <span
      className={cn(
        "text-xs text-muted-foreground",
        inline ? "inline-block" : "mt-0.5 block whitespace-nowrap",
      )}
    >
      {costCentre.number != null
        ? t("documents.list.row.kostenstelle", { nr: costCentre.number })
        : t("documents.list.row.kostenstelleFehlt")}
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
      aria-label={t("documents.list.loading")}
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
        aria-label={t("documents.list.filter.remove")}
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
  col: DocumentSortKey;
  /**
   * A second key sorted from the same header, for a column whose cell carries two dates. The due
   * date lives under the invoice date rather than in a column of its own, so without this there is
   * no way to order a payment list by what is due first.
   */
  secondary?: { label: string; col: DocumentSortKey };
  /**
   * A second sort key this column also owns. "Review priority" in the toolbar sorts by the review
   * score, which is this column's other value, so the header has to show that the table is sorted
   * even though the key is not its own. Without it every header sat on the neutral icon while the
   * rows were plainly reordered, and the only clue was a toolbar button you scroll past.
   */
  alsoFor?: DocumentSortKey;
  search: NormalizedSearch;
  onSort: (k: DocumentSortKey) => void;
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
  active,
  issuerName,
}: {
  counts: Record<string, number>;
  filter: DocumentsFilter;
  active: boolean;
  issuerName: (b: DocumentListRow) => string;
}) {
  const { t } = useTranslation();
  // Same as in the list view: the cards carry the current filters too, so coming back from an
  // invoice opened off the board lands on the board with those filters still set.
  const detailSearch = carryListSearch(Route.useSearch());
  // Counts come from the server for the WHOLE filter, so a column header is right whether it holds
  // three receipts or three thousand. It used to count within one 500-row page shared by every
  // column, which quietly went wrong past 500.
  const hatCards = (w: string) => (counts[w] ?? 0) > 0;
  const firstMitContent = WORKFLOW_ORDER.find(hatCards) ?? null;
  // Which stage is expanded on a phone. `undefined` means the user has not chosen yet, `null` means
  // they closed the open one and want them all closed. The two have to stay apart: seeding the
  // state with `ersteMitInhalt` collapsed them into one value, so the seed was taken once on mount
  // and never revisited. The board stays mounted across filter changes, so narrowing the filter
  // left the previously opened stage open and empty while every stage that did have cards stayed
  // collapsed, which on a phone reads as "no results".
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const openColumn =
    choice === undefined || (choice !== null && !hatCards(choice)) ? firstMitContent : choice;
  // PHONE: ONE COLUMN AT A TIME, STACKED. As a horizontal board a phone shows one column at nearly
  // full width with a sliver of the next, so reading all nine stages meant swiping across eight
  // times. Below `sm` the stages become a stacked list of headers with their counts, and tapping
  // one opens its cards. From `sm` up it is the board it always was.
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-3 sm:overflow-x-auto sm:pb-2">
      {WORKFLOW_ORDER.map((workflow) => (
        <KanbanColumn
          key={workflow}
          workflow={workflow}
          count={counts[workflow] ?? 0}
          filter={filter}
          // Empty columns never fetch: the count already told us there is nothing to page through,
          // and nine requests where three would do is the kind of thing that makes a board feel
          // slow for no reason.
          active={active && (counts[workflow] ?? 0) > 0}
          open={openColumn === workflow}
          onToggle={() => setChoice(openColumn === workflow ? null : workflow)}
          issuerName={issuerName}
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
function KanbanColumn({
  workflow,
  count,
  filter,
  active,
  open,
  onToggle,
  issuerName,
  detailSearch,
  t,
}: {
  workflow: string;
  count: number;
  filter: DocumentsFilter;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  issuerName: (b: DocumentListRow) => string;
  detailSearch: ReturnType<typeof carryListSearch>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const columnQ = useDocumentsKanbanColumn(filter, workflow, { enabled: active });
  const items = (columnQ.data?.pages ?? []).flatMap((page) => page.rows);
  const subtitle = t(`documents.list.kanban.col.${workflow}.subtitle`);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = columnQ;

  useEffect(() => {
    const target = sentinelRef.current;
    // `root` is the column body, not the viewport: below `sm` the column is inside the page scroll
    // and from `sm` up it scrolls on its own, and the observer has to watch whichever one is
    // actually moving. Passing the container covers both -- a null root would only work for the
    // phone layout.
    const root = scrollRef.current;
    if (!target || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      // A whole card's height of lead time, so the next page is usually there before the current
      // one runs out and the column does not visibly stall.
      { root: root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div className="flex w-full shrink-0 flex-col rounded-xl border border-border bg-muted/30 p-2 sm:w-72">
      {/* The header is the toggle on a phone and a plain heading from `sm` up, where every
          column is open anyway. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // A stable hook for the column, independent of markup. `[aria-expanded]` alone is not
        // specific enough: in Eiffler the accounting screens render inside the hub shell, whose
        // sidebar groups carry it too.
        data-kanban-column={workflow}
        className="flex w-full items-start justify-between gap-2 px-2 py-2 text-left sm:pointer-events-none"
      >
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground">
            {t(`documents.list.kanban.col.${workflow}.label`)}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[0.7rem] leading-tight text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform sm:hidden",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <div
        ref={scrollRef}
        className={cn(
          "max-h-[60vh] space-y-2 overflow-y-auto pr-0.5",
          // Closed on a phone, always shown from `sm` up.
          !open && "hidden sm:block",
        )}
      >
        {items.map((b) => (
          <Link
            key={b.id}
            to="/incoming-invoices/$nr"
            params={{ nr: b.id }}
            search={detailSearch}
            className="block rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">{issuerName(b)}</span>
              <CompanyChip code={b.company_code} />
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {b.invoice_number ?? t("documents.list.row.ohneNr")}
            </div>
            {!isIncomingInvoice(b.document_type) || isDirectDebit(b.payment_method) ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {!isIncomingInvoice(b.document_type) && (
                  <DocumentTypeBadge documentType={b.document_type} />
                )}
                {isDirectDebit(b.payment_method) && <DirectDebitBadge />}
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatEUR(b.amount_gross)}
              </span>
              <div className="flex items-center gap-1.5">
                {isDatevReady(b.workflow_status) && <DatevReadyBadge />}
                <PaymentBadge paidAm={b.paid_at} />
                <VatBadge vatRate={b.vat_rate} tax={b.tax} />
              </div>
            </div>
          </Link>
        ))}

        {/* First page still in flight: a skeleton rather than the empty-state text, which would
            otherwise flash "keine Belege" on every column that does have some. */}
        {columnQ.isLoading && count > 0 && (
          <div className="space-y-2">
            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        {/* The sentinel sits after the cards and inside the scroll container, so it only comes
            into view once the column has actually been scrolled to its end. */}
        {hasNextPage && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}

        {isFetchingNextPage && (
          <p className="px-2 py-2 text-center text-xs text-muted-foreground">
            {t("documents.list.kanban.laedtMehr")}
          </p>
        )}

        {count === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("documents.list.kanban.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
