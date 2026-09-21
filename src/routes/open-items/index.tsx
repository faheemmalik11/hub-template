import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { forwardRef, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  X,
  CreditCard,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useBankTransaction,
  useBankTransactionsPage,
  useDocument,
  useCostAnalysisCategories,
  useConfirmedAllocations,
  useConfirmedOutgoingAllocations,
  useCompanies,
  useSuppliers,
  useNotMatchableDocuments,
  useOpenDocuments,
  useOutgoingInvoice,
  useOutgoingInvoices,
  useSetTransactionCategory,
} from "@/data";
import { useCategoryOptions } from "@/components/assignment/new-rule-dialog";
import {
  coveredAmount,
  errorText,
  formatDate,
  formatEUR,
  formatSignedEUR,
  todayLocal,
  isFullyCovered,
  daysSince,
  dueBucket,
  DUE_BUCKETS,
  discountOpportunity,
  toDueBucket,
  overviewPeriodRange,
  type DiscountOpportunity,
  type DueBucket,
} from "@/lib/data/format";
import { PeriodPicker, type PeriodValue } from "@/components/home/period-picker";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { TablePagination } from "@/components/data-table/table-pagination";
import { MatchPanel, type MatchPanelTarget } from "@/components/bank/match-panel/match-panel";
import { CompanyChip } from "@/components/documents/badges";
import { useTranslation } from "@/lib/i18n";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import type { BankTransaction, OpenItemBlocker } from "@/lib/data/types";
import type { BankTransactionSort } from "@/data";
import { pageTitle } from "@/config/brand";

const ALL_COMPANIES = "__alle";
// "Ohne Gesellschaft" is the most common value in that column (20 of 28 rows on Immonetz, 225 of
// 433 on the this Hub) and it is the one worth working off, but the filter used to offer only the
// real companies plus "all", so the rows that need assigning were the only ones that could not be
// isolated. A sentinel of its own, matched against `company_id is null`.
const WITHOUT_COMPANY = "__ohne";

// The tab B search goes to Postgres (full-text or amount), so an undebounced box is one round trip
// per keystroke. Tab A's is a client-side filter, but it shares the delay so the two boxes do not
// feel different to type in.
const SEARCH_DEBOUNCE_MS = 300;

const ALL_SOURCES = "__alle__";
// Where a bank movement came from (bank_transactions.source, migration 0073). Kept to the values
// the importers actually write; anything else falls back to the raw string.
const SOURCE_ICON: Record<string, typeof Landmark> = { banksapi: Landmark, pleo: CreditCard };
// The provenances this Hub can show, in dropdown order. Adding one here is the same edit as
// adding its icon above and its label in the locale files.
const SOURCES = Object.keys(SOURCE_ICON);

// Overdue is red, and so is "very old with no due date at all". Amber is the warning before it.
const ALT_AB_DAYS = 30;
const VERY_ALT_AB_DAYS = 90;

export const Route = createFileRoute("/open-items/")({
  validateSearch: (
    input: Record<string, unknown>,
  ): {
    tab?: string;
    match?: string;
    type?: "incoming" | "outgoing";
    due?: DueBucket;
    cashDiscount?: "closing";
  } => ({
    ...tabSearch(input),
    match: typeof input.match === "string" ? input.match : undefined,
    type: input.type === "incoming" || input.type === "outgoing" ? input.type : undefined,
    due: toDueBucket(input.due),
    cashDiscount: input.cashDiscount === "closing" ? ("closing" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle("Offene Posten") }] }),
  component: OpenItemPage,
});

function matchParam(
  target: { kind: "invoice"; id: string; type: string } | { kind: "transaction"; id: string },
): string {
  return target.kind === "invoice" ? `${target.type}:${target.id}` : `txn:${target.id}`;
}

function parseMatchParam(
  raw: string | undefined,
):
  | { kind: "invoice"; type: "incoming" | "outgoing"; id: string }
  | { kind: "transaction"; id: string }
  | null {
  if (!raw) return null;
  const separator = raw.indexOf(":");
  if (separator < 1) return null;
  const prefix = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!id) return null;
  if (prefix === "txn") return { kind: "transaction", id };
  if (prefix === "incoming" || prefix === "outgoing") return { kind: "invoice", type: prefix, id };
  return null;
}

type Tab = "belege" | "fehlend";
// "incoming" = incoming invoices (what we owe), "outgoing" = outgoing invoices (revenue). Deliberately
// NOT named after bank_transactions.direction, which uses the OPPOSITE sense (eingehend = a credit,
// i.e. money that pays one of OUR outgoing invoices) -- see MatchPanel's own richtung mapping.
type ItemType = "alle" | "incoming" | "outgoing";

/** Sortable columns of tab A. */
type DocumentsSort = "counterparty" | "amount" | "received" | "invoiceDate" | "due";
/** Sortable columns of tab B. */
type MissingSort = "date" | "contraAccount" | "amount";

// The table's own sort keys, mapped to the columns the server orders by. Sorting happens in the
// database now, so a click on a header reorders the WHOLE result, not just the rows on screen.
const MISSING_SORT_COLUMN: Record<MissingSort, BankTransactionSort> = {
  date: "booking_date",
  contraAccount: "counterparty_holder",
  amount: "amount",
};
type SortDir = "asc" | "desc";

// A single unified open-item row, incoming or outgoing, so tab A can be ONE table with a Typ column
// rather than two differently-shaped tables.
interface OpenInvoiceRow {
  type: "incoming" | "outgoing";
  id: string;
  companyId: string | null;
  /** The supplier record behind an incoming row's issuer name, when the receipt was matched to
   *  one. Null for free-text issuers with no supplier record to open. Incoming rows only. */
  supplierId: string | null;
  counterparty: string;
  nr: string | null;
  amount: number | null;
  matched: number;
  datum: string | null;
  invoiceDate: string | null;
  due: string | null;
  /** Why this row can never be settled by a bank movement. Null for a normal open item. */
  blocker: OpenItemBlocker | null;
  /** Everything the counterparty box searches, lower-cased and joined once at build time. */
  searchText: string;
  cashDiscount: DiscountOpportunity | null;
}

/**
 * The date this row started being somebody's problem.
 *
 * A due date when there is one; otherwise the invoice date, otherwise the day it was ingested. It
 * is what the Fällig/Alter column shows and what that column sorts by, so the sort can never
 * disagree with the cell, and so a list where NO row has a due date (which is every incoming
 * invoice in both databases today, see docs/OFFENE_POSTEN.md) still sorts by real urgency instead
 * of by a column of dashes.
 */
function urgencyDatum(row: {
  due: string | null;
  invoiceDate: string | null;
  datum: string | null;
}): string | null {
  return row.due ?? row.invoiceDate ?? row.datum;
}

interface Urgency {
  /** Days past the due date, or days since the fallback date when there is none. */
  days: number | null;
  overdue: boolean;
  step: "normal" | "alt" | "kritisch";
}

function urgency(row: OpenInvoiceRow, today: string): Urgency {
  if (row.due) {
    const days = daysSince(row.due, today);
    // Strictly > 0: a due date of today is still payable today, not yet overdue. It only crosses
    // into "kritisch" the day after.
    const overdue = days != null && days > 0;
    return {
      days,
      overdue,
      step: overdue ? "kritisch" : "normal",
    };
  }
  // No due date: age stands in for it. Nothing here is "overdue" in the contractual sense, so the
  // word is not used, but a receipt nobody has settled in two months is still the one to look at.
  const days = daysSince(urgencyDatum(row), today);
  return {
    days,
    overdue: false,
    step:
      days == null || days < ALT_AB_DAYS ? "normal" : days < VERY_ALT_AB_DAYS ? "alt" : "kritisch",
  };
}

function OpenItemPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTabRaw] = useTabParam(["belege", "fehlend"] as const, "belege");
  const setTab = setTabRaw as (next: Tab) => void;
  const {
    match: matchParamValue,
    cashDiscount: cashDiscountParam,
    type: typeParam,
    due: dueParam,
  } = Route.useSearch();
  const [fDocumentsType, setFDocumentsType] = useState<ItemType>(typeParam ?? "alle");
  const [fDue, setFDue] = useState<DueBucket | "alle">(dueParam ?? "alle");
  const [periodInvoices, setPeriodInvoices] = useState<PeriodValue>({ period: "alle" });
  const [fCompanyDocuments, setFCompanyDocuments] = useState(ALL_COMPANIES);
  const [fCounterpartyDocuments, setFCounterpartyDocuments] = useState("");
  const [fMissingDirection, setFMissingDirection] = useState<"alle" | "eingehend" | "ausgehend">(
    "alle",
  );
  const openMatch = parseMatchParam(matchParamValue);
  // Tab B breakdown (Briefing Screen 8/10: "missing receipts must stand out early and clearly —
  // per company, service provider and project"). Scoped to exactly what bank_transactions can
  // actually back: company_id is a real FK (0014_bank_transaction_company.sql); "service
  // provider" has no FK on an unmatched transaction (that's inherent to it not having a receipt
  // yet), so counterparty is filtered by the bank's own free-text fields via the existing
  // full-text search. There is deliberately no "project" filter here — an unmatched transaction
  // carries no property reference at all, fabricating one would show a filter that never narrows
  // anything.
  const [fCompanyMissing, setFCompanyMissing] = useState(ALL_COMPANIES);
  const [periodTransactions, setPeriodTransactions] = useState<PeriodValue>({ period: "alle" });
  const [fSource, setFSource] = useState<string>(ALL_SOURCES);
  const [fCounterparty, setFCounterparty] = useState("");
  // Tab A's third state, next to "the open ones": the receipts that can never become open items
  // because coverage has nothing to measure against. See OpenItemBlocker.
  const [showBlocked, setShowBlocked] = useState(false);

  // Newest RECEIVED first, by product decision. created_at is always present, whereas
  // document_date is whatever the supplier printed and is often weeks older or missing; what
  // somebody opens this screen to work on is usually what just arrived. Urgency is one click away
  // instead of being the default: the Fällig/Alter header sorts oldest-first, and the figure above
  // the table already says how much of the list is overdue or long open.
  const [sortDocuments, setSortDocuments] = useState<DocumentsSort>("received");
  const [dirDocuments, setDirDocuments] = useState<SortDir>("desc");
  const [sortMissing, setSortMissing] = useState<MissingSort>("date");
  const [dirMissing, setDirMissing] = useState<SortDir>("desc");

  const openQ = useOpenDocuments();
  const blockedQ = useNotMatchableDocuments();
  const allocationsQ = useConfirmedAllocations();
  const outgoingInvoicesQ = useOutgoingInvoices();
  const outgoingAllocationsQ = useConfirmedOutgoingAllocations();
  const suppliersQ = useSuppliers();
  const companiesQ = useCompanies();
  const companyById = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g])),
    [companiesQ.data],
  );
  // Missing receipts = outgoing bank debits still unmatched (incoming invoices) or incoming bank
  // credits still unmatched (outgoing invoices/revenue). Transactions that can never have a receipt
  // (salaries, taxes, rebookings, loan installments …) are parked in matching_status 'ignored' by
  // the OPOS whitelist and therefore already excluded here — see the pipeline's migration 0018 and
  // the /opos-whitelist screen. They are counted, not hidden silently.
  // Declared before the queries below, which read the page and size to ask the server for
  // one page rather than the whole set.
  const [pageSize, setPageSize] = useState(25);
  const [pageDocuments, setPageDocuments] = useState(1);
  const [pageMissing, setPageMissing] = useState(1);

  const missingDirection = fMissingDirection === "alle" ? undefined : fMissingDirection;
  const searchMissing = useDebouncedValue(fCounterparty, SEARCH_DEBOUNCE_MS);
  // 25 rows at a time, filtered, sorted and counted BY THE DATABASE, the same way the Bank
  // transactions screen does it. This used to be the unpaginated hook, which pulled the whole open
  // set (thousands of rows over several requests) so it could filter, sort and page in the browser.
  // Every predicate below is a real column, so none of that had to happen here.
  const transactionRange = useMemo(
    () =>
      overviewPeriodRange(periodTransactions.period, new Date(), {
        fromDate: periodTransactions.fromDate,
        toDate: periodTransactions.toDate,
      }),
    [periodTransactions],
  );
  const missingQ = useBankTransactionsPage({
    matchingStatus: "open",
    direction: missingDirection,
    search: searchMissing,
    companyId:
      fCompanyMissing === ALL_COMPANIES
        ? undefined
        : fCompanyMissing === WITHOUT_COMPANY
          ? null
          : fCompanyMissing,
    source: fSource === ALL_SOURCES ? undefined : fSource,
    bookingDateFromDate: transactionRange.fromDate ?? undefined,
    bookingDateToDate: transactionRange.toDate ?? undefined,
    sort: MISSING_SORT_COLUMN[sortMissing],
    dir: dirMissing,
    page: pageMissing,
    pageSize,
  });
  const missingRows = useMemo(() => missingQ.data?.rows ?? [], [missingQ.data]);
  const missingTotal = missingQ.data?.total ?? 0;

  // The match panel fetches its own candidate/search pools internally (see match-panel/), scoped
  // to whichever single row it's open for -- nothing to load here at the page level for it.

  // Memoized: the ?? fallback would mint a fresh Map on every render, which would then invalidate
  // every useMemo below on every render.
  const allocatedByTxn = useMemo(
    () => allocationsQ.data?.byTransaction ?? new Map<string, number>(),
    [allocationsQ.data],
  );
  const outgoingMatchedByInvoice = useMemo(
    () => outgoingAllocationsQ.data?.byInvoice ?? new Map<string, number>(),
    [outgoingAllocationsQ.data],
  );
  const outgoingAllocatedByTxn = useMemo(
    () => outgoingAllocationsQ.data?.byTransaction ?? new Map<string, number>(),
    [outgoingAllocationsQ.data],
  );
  const supplierById = useMemo(
    () => new Map((suppliersQ.data ?? []).map((l) => [l.id, l])),
    [suppliersQ.data],
  );
  // The LOCAL day. `new Date().toISOString().slice(0,10)` is the UTC one, which between local
  // midnight and 01:00/02:00 is still yesterday, so an invoice that fell due at midnight was not
  // flagged overdue for the first hour or two of the day. See heuteLokal() in format.ts.
  const today = todayLocal();

  // An invoice stays an open item until it is actually COVERED, not merely until it has a match: a
  // 1.000 invoice with 400 matched still owes 600, so it has to remain here and remain pickable in
  // the manual tab. That test now lives in the database (view v_open_items, migration
  // 20260819210000) instead of being recomputed in the browser out of the whole invoices table.
  // which is what made this screen load 5.7 MB to render 28 rows.
  // Memoized: the ?? fallback would mint a fresh array on every render, which would then
  // invalidate the row-assembly memo below on every render.
  const openDocuments = useMemo(() => openQ.data ?? [], [openQ.data]);
  const blockedDocuments = useMemo(() => blockedQ.data ?? [], [blockedQ.data]);
  // Outgoing-direction mirror (migration 0045). Outgoing invoices have no view of their own: there
  // are few of them and their coverage math is the same helper, so they stay client-side.
  //
  // status === "open" is required alongside the coverage check: a draft (not yet a real
  // invoice) or a voided (cancelled) outgoing invoice can still have amount_gross set and no
  // confirmed match, so coverage alone let it show up here as "open" money owed to us that isn't
  // real. useOpenOutgoingInvoicesInfinite (the manual-search picker's own query, see
  // match-panel/manual-search.tsx) already filters on status server-side for exactly this
  // reason; this client-side list now matches it.
  const openOutgoingInvoices = useMemo(
    () =>
      (outgoingInvoicesQ.data ?? []).filter(
        (oi) =>
          oi.status === "open" &&
          // The alreadyPaid flag only ever mattered for a "paidoff" voucher, which the guard above
          // already excludes -- always false here, not oi.status === "paidoff" (which TS
          // correctly flags as unreachable once narrowed to "open").
          !isFullyCovered(
            oi.amount_gross,
            coveredAmount(oi.amount_gross, outgoingMatchedByInvoice.get(oi.id) ?? 0, false),
          ),
      ),
    [outgoingInvoicesQ.data, outgoingMatchedByInvoice],
  );

  // Tab A, unified: both directions merged into ONE list (a Typ badge per row instead of two
  // separately-shaped tables), filtered, then sorted by whichever header was clicked.
  const allDocumentsRows = useMemo<OpenInvoiceRow[]>(() => {
    const rows: OpenInvoiceRow[] = [];
    const source = showBlocked ? blockedDocuments : openDocuments;
    for (const b of source) {
      const issuerName =
        (b.supplier_id ? supplierById.get(b.supplier_id)?.name : null) ?? b.issuer ?? "";
      const company = b.company_id ? companyById.get(b.company_id) : undefined;
      rows.push({
        type: "incoming",
        id: b.id,
        companyId: b.company_id,
        supplierId: b.supplier_id,
        counterparty: issuerName || "—",
        nr: b.invoice_number,
        amount: b.amount_gross,
        matched: b.matched_sum,
        datum: b.created_at,
        invoiceDate: b.document_date,
        due: b.due_date,
        cashDiscount: discountOpportunity(b, today),
        blocker: b.open_blocker,
        searchText: searchTextFor([
          issuerName,
          b.invoice_number,
          b.company_code,
          company?.name,
          b.property_code,
          b.cost_category,
          b.amount_gross,
        ]),
      });
    }
    // The blocker list is an incoming-side concept only (it comes out of v_open_items), so the
    // outgoing half is skipped entirely while it is being shown rather than appearing unfiltered
    // beside rows that mean something else.
    if (!showBlocked) {
      for (const oi of openOutgoingInvoices) {
        const customerName = oi.customers?.name ?? "";
        const company = oi.company_id ? companyById.get(oi.company_id) : undefined;
        rows.push({
          type: "outgoing",
          id: oi.id,
          companyId: oi.company_id,
          supplierId: null,
          counterparty: customerName || "—",
          nr: oi.invoice_number,
          amount: oi.amount_gross,
          matched: outgoingMatchedByInvoice.get(oi.id) ?? 0,
          datum: oi.created_at,
          invoiceDate: oi.invoice_date,
          due: oi.due_date,
          cashDiscount: null,
          blocker: null,
          searchText: searchTextFor([
            customerName,
            oi.invoice_number,
            company?.code,
            company?.name,
            oi.amount_gross,
          ]),
        });
      }
    }
    return rows;
  }, [
    today,
    showBlocked,
    blockedDocuments,
    openDocuments,
    openOutgoingInvoices,
    outgoingMatchedByInvoice,
    supplierById,
    companyById,
  ]);

  const invoiceRange = useMemo(
    () =>
      overviewPeriodRange(periodInvoices.period, new Date(), {
        fromDate: periodInvoices.fromDate,
        toDate: periodInvoices.toDate,
      }),
    [periodInvoices],
  );
  const searchDocuments = useDebouncedValue(fCounterpartyDocuments, SEARCH_DEBOUNCE_MS);
  const openItemRows = useMemo<OpenInvoiceRow[]>(() => {
    const term = normaliseSearch(searchDocuments);
    const filtered = allDocumentsRows.filter((row) => {
      if (cashDiscountParam === "closing" && row.cashDiscount?.state !== "closing") return false;
      // Invoice date, falling back to the ingest date for rows the extraction never dated —
      // the same fallback sortDatum() uses, so filtering and sorting agree on which day a row is.
      const datum = (row.invoiceDate ?? row.datum)?.slice(0, 10);
      if (invoiceRange.fromDate && (!datum || datum < invoiceRange.fromDate)) return false;
      if (invoiceRange.toDate && (!datum || datum > invoiceRange.toDate)) return false;
      if (fDue !== "alle" && dueBucket(row.due, today) !== fDue) return false;
      if (!showBlocked && fDocumentsType !== "alle" && row.type !== fDocumentsType) return false;
      if (fCompanyDocuments === WITHOUT_COMPANY) {
        if (row.companyId !== null) return false;
      } else if (fCompanyDocuments !== ALL_COMPANIES && row.companyId !== fCompanyDocuments) {
        return false;
      }
      // Every term has to appear somewhere in the row, so "hansen 2024" narrows rather than widens.
      return term.every((part) => row.searchText.includes(part));
    });
    return sortDocumentRows(filtered, sortDocuments, dirDocuments);
  }, [
    allDocumentsRows,
    invoiceRange,
    cashDiscountParam,
    showBlocked,
    fDocumentsType,
    fDue,
    today,
    fCompanyDocuments,
    searchDocuments,
    sortDocuments,
    dirDocuments,
  ]);

  // Partially allocated transactions keep matching_status 'open' (migration 0024), so they arrive
  // here on their own and stay available for the receipts that still have to explain the rest.
  // Company filter applied client-side: the list is already fetched in full for pagination/count
  // purposes, and company_id is a real column so this is an exact filter, not a guess.
  // From the fixed vocabulary above, NOT from the data. Reading the distinct values meant asking
  // for every row's source column to learn that they all say the same thing. The screen already
  // has to know each source to give it an icon and a label, so the list lives in one place.
  const sourceOptions = useMemo(
    () => [
      { value: ALL_SOURCES, label: t("openItems.fehlend.filter.alleQuellen") },
      ...SOURCES.map((q) => ({
        value: q,
        label: t(`openItems.fehlend.quelle.${q}`, { defaultValue: q }),
      })),
    ],
    [t],
  );

  function openRest(txn: BankTransaction): number {
    const assigned = (txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(txn.id) ?? 0;
    return Math.max(Math.abs(txn.amount) - assigned, 0);
  }

  // Split on purpose. A type filter still has an empty state worth naming ("no open outgoing
  // invoices"); a search or a company filter does not. There the honest answer is "nothing matches
  // what you asked for", with a way back.
  const engFilterDocuments =
    fCompanyDocuments !== ALL_COMPANIES || fCounterpartyDocuments.trim() !== "";
  const filterActiveDocuments =
    engFilterDocuments ||
    fDocumentsType !== "alle" ||
    fDue !== "alle" ||
    periodInvoices.period !== "alle";
  const filterActiveMissing =
    fMissingDirection !== "alle" ||
    fCompanyMissing !== ALL_COMPANIES ||
    fSource !== ALL_SOURCES ||
    periodTransactions.period !== "alle" ||
    fCounterparty.trim() !== "";
  // Counts only the two dropdown filters behind the popover, not the search box (already visible
  // and editable on the surface, so it needs no chip/badge of its own).
  const documentsFilterCount =
    (fDocumentsType !== "alle" ? 1 : 0) +
    (fDue !== "alle" ? 1 : 0) +
    (fCompanyDocuments !== ALL_COMPANIES ? 1 : 0) +
    (periodInvoices.period !== "alle" ? 1 : 0) +
    (showBlocked ? 1 : 0);
  const missingFilterCount =
    (fMissingDirection !== "alle" ? 1 : 0) +
    (fCompanyMissing !== ALL_COMPANIES ? 1 : 0) +
    (periodTransactions.period !== "alle" ? 1 : 0) +
    (fSource !== ALL_SOURCES ? 1 : 0);

  const page = tab === "belege" ? pageDocuments : pageMissing;
  const setPage = tab === "belege" ? setPageDocuments : setPageMissing;
  const rows = tab === "fehlend" ? missingRows : openItemRows;
  // The payments tab is paged by the server, so its total is the count that came back with the
  // page, not the length of what is in memory.
  const total = tab === "fehlend" ? missingTotal : openItemRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp rather than reset: if the list shrinks under you (a link removes both sides), land on the
  // last real page instead of an empty one.
  const safePage = Math.min(page, totalPages);
  const fromDate = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toDate = Math.min(safePage * pageSize, total);
  // The payments tab already holds exactly one page; only the invoice side still slices.
  const pageRows =
    tab === "fehlend" ? rows : rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const documentsPage = tab === "belege" ? (pageRows as OpenInvoiceRow[]) : [];
  const missingPage = tab === "fehlend" ? (pageRows as BankTransaction[]) : [];

  function sortBy(column: DocumentsSort) {
    setPageDocuments(1);
    if (sortDocuments === column) {
      setDirDocuments((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortDocuments(column);
    // Each column opens on the direction somebody actually wants from it first: the biggest amount,
    // the newest date, the most urgent item, A first for a name.
    setDirDocuments(column === "counterparty" || column === "due" ? "asc" : "desc");
  }

  function sortMissingBy(column: MissingSort) {
    setPageMissing(1);
    if (sortMissing === column) {
      setDirMissing((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortMissing(column);
    setDirMissing(column === "contraAccount" ? "asc" : "desc");
  }

  function documentsFilterReset() {
    setFDocumentsType("alle");
    setFDue("alle");
    setFCompanyDocuments(ALL_COMPANIES);
    setFCounterpartyDocuments("");
    setPeriodInvoices({ period: "alle" });
    setShowBlocked(false);
    setPageDocuments(1);
  }

  function missingFilterReset() {
    setFMissingDirection("alle");
    setFCompanyMissing(ALL_COMPANIES);
    setFCounterparty("");
    setPeriodTransactions({ period: "alle" });
    setPageMissing(1);
  }

  const companyOptions = [
    { value: ALL_COMPANIES, label: t("openItems.fehlend.alleGesellschaften") },
    { value: WITHOUT_COMPANY, label: t("openItems.ohneGesellschaft") },
    ...(companiesQ.data ?? []).map((g) => ({
      value: g.id,
      label: `${g.code} · ${g.name}`,
      keywords: g.name,
    })),
  ];

  /** Opens the row's target, unless the click already landed on a real link inside it. */
  function openDocument(row: OpenInvoiceRow, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a")) return;
    if (row.type === "incoming") {
      navigate({ to: "/incoming-invoices/$nr", params: { nr: row.id } });
    } else {
      // An outgoing invoice has no detail page in this Hub at all (source is always 'upload',
      // migration 0086), so its file is only reachable from the Ausgangsrechnungen list. The row
      // used to have no click handler whatsoever while looking exactly like its clickable
      // neighbours; it goes to the list instead.
      navigate({ to: "/outgoing-invoices" });
    }
  }

  function setMatchParam(next: string | undefined, replace: boolean) {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, match: next }),
      replace,
    });
  }

  function openMatchPanelForDocument(row: OpenInvoiceRow) {
    setMatchParam(matchParam({ kind: "invoice", id: row.id, type: row.type }), false);
  }

  const matchRowInList =
    openMatch?.kind === "invoice"
      ? (allDocumentsRows.find((r) => r.id === openMatch.id && r.type === openMatch.type) ?? null)
      : null;
  const matchTxnInList =
    openMatch?.kind === "transaction"
      ? (missingRows.find((tx) => tx.id === openMatch.id) ?? null)
      : null;

  // A ?match= link stays valid once the row leaves this screen -- fully reconciled, blocked, or on
  // the other tab -- so a miss in the loaded list falls back to fetching that one record directly
  // instead of silently opening nothing.
  const missingDocumentId =
    openMatch?.kind === "invoice" && openMatch.type === "incoming" && !matchRowInList
      ? openMatch.id
      : "";
  const missingOutgoingInvoiceId =
    openMatch?.kind === "invoice" && openMatch.type === "outgoing" && !matchRowInList
      ? openMatch.id
      : "";
  const missingTxnId = openMatch?.kind === "transaction" && !matchTxnInList ? openMatch.id : "";
  const documentFallbackQ = useDocument(missingDocumentId);
  const outgoingInvoiceFallbackQ = useOutgoingInvoice(missingOutgoingInvoiceId);
  const txnFallbackQ = useBankTransaction(missingTxnId);

  const matchTarget: MatchPanelTarget | null = (() => {
    if (!openMatch) return null;
    if (openMatch.kind === "transaction") {
      const txn = matchTxnInList ?? txnFallbackQ.data ?? null;
      return txn ? { kind: "transaction", txn } : null;
    }
    if (matchRowInList) {
      return {
        kind: "invoice",
        id: matchRowInList.id,
        type: matchRowInList.type,
        label: matchRowInList.counterparty,
        nr: matchRowInList.nr,
        amount: matchRowInList.amount,
        documentDate: matchRowInList.invoiceDate,
        dueDate: matchRowInList.due,
      };
    }
    if (openMatch.type === "incoming") {
      const b = documentFallbackQ.data;
      if (!b) return null;
      const issuerName =
        (b.supplier_id ? supplierById.get(b.supplier_id)?.name : null) ?? b.issuer ?? "";
      return {
        kind: "invoice",
        id: b.id,
        type: "incoming",
        label: issuerName || "—",
        nr: b.invoice_number,
        amount: b.amount_gross,
        documentDate: b.document_date,
        dueDate: b.due_date,
      };
    }
    const oi = outgoingInvoiceFallbackQ.data;
    if (!oi) return null;
    return {
      kind: "invoice",
      id: oi.id,
      type: "outgoing",
      label: oi.customers?.name || "—",
      nr: oi.invoice_number,
      amount: oi.amount_gross,
      documentDate: oi.invoice_date,
      dueDate: oi.due_date,
    };
  })();

  return (
    <div>
      <div data-tour="reconcile-header">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("openItems.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(tab === "fehlend" ? "openItems.subtitleFehlend" : "openItems.subtitle")}
        </p>
      </div>

      {/* Tab A filter bar: counterparty search gets its own full-width row -- it's the primary way
          in -- with invoice type & company underneath. */}
      {tab === "belege" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div
              className="flex w-full shrink-0 rounded-md border border-border p-0.5 sm:inline-flex sm:w-auto"
              data-tour="reconcile-tabs"
            >
              <TabButton active count={openItemRows.length} onClick={() => setTab("belege")}>
                {t("openItems.tab.belege")}
              </TabButton>
              <TabButton
                active={false}
                count={missingQ.isPending ? undefined : missingTotal}
                onClick={() => setTab("fehlend")}
              >
                {t("openItems.tab.fehlend")}
              </TabButton>
            </div>
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2"
              data-tour="reconcile-filters"
            >
              <Input
                value={fCounterpartyDocuments}
                onChange={(e) => {
                  setFCounterpartyDocuments(e.target.value);
                  setPageDocuments(1);
                }}
                placeholder={t("openItems.belege.gegenparteiPlaceholder")}
                aria-label={t("openItems.belege.gegenparteiPlaceholder")}
                className="h-9 w-full shadow-none sm:w-96"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <FilterTriggerButton count={documentsFilterCount} />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[280px] overflow-hidden p-0 shadow-xl sm:w-[520px]"
                >
                  <div className="h-1 bg-primary" />
                  <div className="p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {t("openItems.filterButton")}
                      </span>
                      <div className="flex items-center gap-3">
                        {(filterActiveDocuments || showBlocked) && (
                          <button
                            type="button"
                            onClick={documentsFilterReset}
                            className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            {t("openItems.filterZuruecksetzen")}
                          </button>
                        )}
                        <PopoverClose
                          aria-label={t("openItems.filterSchliessen")}
                          className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-4" />
                        </PopoverClose>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.belege.filter.label")}
                        </span>
                        <Combobox
                          value={fDocumentsType}
                          onValueChange={(v) => {
                            setFDocumentsType(v as ItemType);
                            setPageDocuments(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            { value: "alle", label: t("openItems.belege.filter.alle") },
                            { value: "incoming", label: t("openItems.belege.filter.incoming") },
                            { value: "outgoing", label: t("openItems.belege.filter.outgoing") },
                          ]}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.belege.col.faelligAlter")}
                        </span>
                        <Combobox
                          value={fDue}
                          onValueChange={(v) => {
                            setFDue(v as DueBucket | "alle");
                            setPageDocuments(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            { value: "alle", label: t("openItems.due.any") },
                            ...DUE_BUCKETS.map((b) => ({
                              value: b,
                              label: t(`openItems.due.${b}`),
                            })),
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("documents.list.filter.zeitraum")}
                        </span>
                        <PeriodPicker
                          value={periodInvoices}
                          onChange={(v) => {
                            setPeriodInvoices(v);
                            setPageDocuments(1);
                          }}
                          className="h-9 w-full justify-between border border-input bg-background px-3 py-2 text-left text-sm font-normal text-foreground shadow-none hover:bg-background"
                          contentClassName="w-[var(--radix-popover-trigger-width)]"
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.fehlend.col.gesellschaft")}
                        </span>
                        <Combobox
                          value={fCompanyDocuments}
                          onValueChange={(v) => {
                            setFCompanyDocuments(v);
                            setPageDocuments(1);
                          }}
                          className="w-full shadow-none"
                          options={companyOptions}
                        />
                      </label>
                      {/* Receipts that can never leave this list on their own: no gross amount to
                        measure coverage against, a credit note, or paid privately. Kept reachable
                        as a filter toggle, not dropped: an exclusion nobody can see is
                        indistinguishable from a bug, the same rule the whitelisted transactions on
                        tab B already follow. */}
                      {blockedDocuments.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/50 p-2">
                          <Checkbox
                            checked={showBlocked}
                            onCheckedChange={(v) => {
                              setShowBlocked(v === true);
                              setPageDocuments(1);
                            }}
                          />
                          <span className="text-sm text-foreground">
                            {t("openItems.blocker.anzeigen", { count: blockedDocuments.length })}
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {documentsFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {fDocumentsType !== "alle" && (
                <FilterChip
                  label={t(
                    fDocumentsType === "incoming"
                      ? "openItems.belege.filter.incoming"
                      : "openItems.belege.filter.outgoing",
                  )}
                  onClear={() => {
                    setFDocumentsType("alle");
                    setPageDocuments(1);
                  }}
                />
              )}
              {fCompanyDocuments !== ALL_COMPANIES && (
                <FilterChip
                  label={
                    companyOptions.find((o) => o.value === fCompanyDocuments)?.label ??
                    fCompanyDocuments
                  }
                  onClear={() => {
                    setFCompanyDocuments(ALL_COMPANIES);
                    setPageDocuments(1);
                  }}
                />
              )}
              {showBlocked && (
                <FilterChip
                  label={t("openItems.blocker.anzeigen", { count: blockedDocuments.length })}
                  onClear={() => {
                    setShowBlocked(false);
                    setPageDocuments(1);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Missing-receipts breakdown (Briefing Screen 8): direction + company + counterparty, plus the
          EUR totals alongside the item count so this reads as "€X open", not just "N items". */}
      {tab === "fehlend" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div
              className="flex w-full shrink-0 rounded-md border border-border p-0.5 sm:inline-flex sm:w-auto"
              data-tour="reconcile-tabs"
            >
              <TabButton
                active={false}
                count={openItemRows.length}
                onClick={() => setTab("belege")}
              >
                {t("openItems.tab.belege")}
              </TabButton>
              <TabButton
                active
                count={missingQ.isPending ? undefined : missingTotal}
                onClick={() => setTab("fehlend")}
              >
                {t("openItems.tab.fehlend")}
              </TabButton>
            </div>
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2"
              data-tour="reconcile-filters"
            >
              {/* The old rows stay put while a search runs (keepPreviousData); this spinner in
                  the field is the only "working on it" signal, so typing never blanks the table. */}
              <div className="relative w-full sm:w-96">
                <Input
                  value={fCounterparty}
                  onChange={(e) => {
                    setFCounterparty(e.target.value);
                    setPageMissing(1);
                  }}
                  placeholder={t("openItems.fehlend.gegenparteiPlaceholder")}
                  aria-label={t("openItems.fehlend.gegenparteiPlaceholder")}
                  className="h-9 w-full shadow-none"
                />
                {fCounterparty.trim() !== "" && missingQ.isFetching && (
                  <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterTriggerButton count={missingFilterCount} />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[280px] overflow-hidden p-0 shadow-xl sm:w-[520px]"
                >
                  <div className="h-1 bg-primary" />
                  <div className="p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {t("openItems.filterButton")}
                      </span>
                      <div className="flex items-center gap-3">
                        {filterActiveMissing && (
                          <button
                            type="button"
                            onClick={missingFilterReset}
                            className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            {t("openItems.filterZuruecksetzen")}
                          </button>
                        )}
                        <PopoverClose
                          aria-label={t("openItems.filterSchliessen")}
                          className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-4" />
                        </PopoverClose>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.fehlend.col.richtung")}
                        </span>
                        <Combobox
                          value={fMissingDirection}
                          onValueChange={(v) => {
                            setFMissingDirection(v as "alle" | "eingehend" | "ausgehend");
                            setPageMissing(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            {
                              value: "alle",
                              label: t("openItems.fehlend.filter.alleRichtungen"),
                            },
                            {
                              value: "eingehend",
                              label: t("openItems.fehlend.filter.eingehend"),
                            },
                            {
                              value: "ausgehend",
                              label: t("openItems.fehlend.filter.ausgehend"),
                            },
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("documents.list.filter.zeitraum")}
                        </span>
                        <PeriodPicker
                          value={periodTransactions}
                          onChange={(v) => {
                            setPeriodTransactions(v);
                            setPageMissing(1);
                          }}
                          className="h-9 w-full justify-between border border-input bg-background px-3 py-2 text-left text-sm font-normal text-foreground shadow-none hover:bg-background"
                          contentClassName="w-[var(--radix-popover-trigger-width)]"
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.fehlend.col.quelle")}
                        </span>
                        <Combobox
                          value={fSource}
                          onValueChange={(v) => {
                            setFSource(v);
                            setPageMissing(1);
                          }}
                          className="w-full shadow-none"
                          options={sourceOptions}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("openItems.fehlend.col.gesellschaft")}
                        </span>
                        <Combobox
                          value={fCompanyMissing}
                          onValueChange={(v) => {
                            setFCompanyMissing(v);
                            setPageMissing(1);
                          }}
                          className="w-full shadow-none"
                          options={companyOptions}
                        />
                      </label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {missingFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {fMissingDirection !== "alle" && (
                <FilterChip
                  label={t(
                    fMissingDirection === "eingehend"
                      ? "openItems.fehlend.filter.eingehend"
                      : "openItems.fehlend.filter.ausgehend",
                  )}
                  onClear={() => {
                    setFMissingDirection("alle");
                    setPageMissing(1);
                  }}
                />
              )}
              {fSource !== ALL_SOURCES && (
                <FilterChip
                  label={t(`openItems.fehlend.quelle.${fSource}`, { defaultValue: fSource })}
                  onClear={() => {
                    setFSource(ALL_SOURCES);
                    setPageMissing(1);
                  }}
                />
              )}
              {fCompanyMissing !== ALL_COMPANIES && (
                <FilterChip
                  label={
                    companyOptions.find((o) => o.value === fCompanyMissing)?.label ??
                    fCompanyMissing
                  }
                  onClear={() => {
                    setFCompanyMissing(ALL_COMPANIES);
                    setPageMissing(1);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div data-tour="reconcile-list">
        {tab === "belege" ? (
          openQ.isError ||
          blockedQ.isError ||
          outgoingInvoicesQ.isError ||
          outgoingAllocationsQ.isError ? (
            <div className="mt-4">
              <ErrorState
                error={
                  openQ.error ??
                  blockedQ.error ??
                  outgoingInvoicesQ.error ??
                  outgoingAllocationsQ.error
                }
                onRetry={() => {
                  openQ.refetch();
                  blockedQ.refetch();
                  outgoingInvoicesQ.refetch();
                  outgoingAllocationsQ.refetch();
                }}
              />
            </div>
          ) : openQ.isLoading ||
            blockedQ.isLoading ||
            outgoingInvoicesQ.isLoading ||
            outgoingAllocationsQ.isLoading ? (
            <div className="mt-4">
              <TableSkeleton rows={6} cols={8} />
            </div>
          ) : openItemRows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t(
                  showBlocked
                    ? "openItems.blocker.emptyTitle"
                    : engFilterDocuments
                      ? "openItems.belege.gefiltertEmptyTitle"
                      : fDocumentsType === "outgoing"
                        ? "openItems.ausgangsrechnungen.emptyTitle"
                        : fDocumentsType === "incoming"
                          ? "openItems.belege.emptyTitle"
                          : "openItems.emptyTitle",
                )}
                hint={t(
                  showBlocked
                    ? "openItems.blocker.emptyHint"
                    : engFilterDocuments
                      ? "openItems.belege.gefiltertEmptyHint"
                      : fDocumentsType === "outgoing"
                        ? "openItems.ausgangsrechnungen.emptyHint"
                        : fDocumentsType === "incoming"
                          ? "openItems.belege.emptyHint"
                          : "openItems.emptyHint",
                )}
              />
            </div>
          ) : (
            <>
              {/* Desktop: the full table. Below `sm`, that's more columns than a phone can show
                without either shrinking text past readability or scrolling the table's own box on
                every row. Replaced there with one card per row instead (same data, same click
                targets, stacked vertically). */}
              <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card lg:block motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <SortHeader
                        column="counterparty"
                        active={sortDocuments}
                        dir={dirDocuments}
                        onSort={sortBy}
                      >
                        {t("openItems.col.gegenpartei")}
                      </SortHeader>
                      <TableHead>{t("openItems.belege.col.nr")}</TableHead>
                      <SortHeader
                        column="amount"
                        active={sortDocuments}
                        dir={dirDocuments}
                        onSort={sortBy}
                        className="text-right"
                      >
                        {t("openItems.belege.col.betrag")}
                      </SortHeader>
                      <SortHeader
                        column="invoiceDate"
                        active={sortDocuments}
                        dir={dirDocuments}
                        onSort={sortBy}
                      >
                        {t("openItems.belege.col.rechnungsdatum")}
                      </SortHeader>
                      <SortHeader
                        column="due"
                        active={sortDocuments}
                        dir={dirDocuments}
                        onSort={sortBy}
                      >
                        {t("openItems.belege.col.faelligAlter")}
                      </SortHeader>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentsPage.map((row) => (
                      <TableRow
                        key={`${row.type}-${row.id}`}
                        className="cursor-pointer"
                        onClick={(e) => openDocument(row, e)}
                      >
                        <TableCell className="max-w-[180px] truncate text-sm font-medium text-foreground sm:max-w-[300px]">
                          <div className="flex items-center gap-2.5">
                            {row.blocker && <BlockerBadge blocker={row.blocker} />}
                            <CounterpartyLink row={row} />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.nr ?? "—"}
                        </TableCell>
                        {/* A part-paid invoice stays on this list, so the row has to say what is
                          still owed rather than just the original total. */}
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatEUR(row.amount)}
                          {row.matched > 0.01 && (
                            <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                              {t("openItems.belege.restOffen", {
                                rest: formatEUR(
                                  Math.max(Math.abs(row.amount ?? 0) - row.matched, 0),
                                ),
                                paid: formatEUR(row.matched),
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {formatDate(row.invoiceDate)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          <DueCell row={row} today={today} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {!row.blocker && (
                            <Button
                              size="sm"
                              variant="link"
                              className="h-7 gap-1 px-0 font-medium"
                              onClick={() => openMatchPanelForDocument(row)}
                            >
                              {t("openItems.belege.verknuepfen")}
                              <ChevronRight />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: one card per row, same fields and same click target as the table row. */}
              <div className="mt-4 space-y-3 lg:hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                {documentsPage.map((row) => (
                  <div
                    key={`${row.type}-${row.id}`}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={(e) => openDocument(row, e)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <TypeBadge type={row.type} />
                        {row.blocker && <BlockerBadge blocker={row.blocker} />}
                      </div>
                      <CompanyChip code={companyById.get(row.companyId ?? "")?.code} />
                    </div>

                    <div className="mt-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          <CounterpartyLink row={row} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{row.nr ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                        {formatEUR(row.amount)}
                        {row.matched > 0.01 && (
                          <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                            {t("openItems.belege.restOffen", {
                              rest: formatEUR(Math.max(Math.abs(row.amount ?? 0) - row.matched, 0)),
                              paid: formatEUR(row.matched),
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="tabular-nums text-muted-foreground">
                        {formatDate(row.invoiceDate)}
                      </span>
                      <DueCell row={row} today={today} />
                    </div>

                    {!row.blocker && (
                      <div
                        className="mt-3 flex justify-end border-t border-border pt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="link"
                          className="h-7 gap-1 px-0 font-medium"
                          onClick={() => openMatchPanelForDocument(row)}
                        >
                          {t("openItems.belege.verknuepfen")}
                          <ChevronRight />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        ) : missingQ.isError ? (
          <div className="mt-4">
            <ErrorState error={missingQ.error} onRetry={() => missingQ.refetch()} />
          </div>
        ) : missingQ.isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={6} cols={8} />
          </div>
        ) : missingRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t(
                filterActiveMissing
                  ? "openItems.fehlend.gefiltertEmptyTitle"
                  : "openItems.fehlend.emptyTitle",
              )}
              hint={t(
                filterActiveMissing
                  ? "openItems.fehlend.gefiltertEmptyHint"
                  : "openItems.fehlend.emptyHint",
              )}
            />
          </div>
        ) : (
          <>
            {/* Desktop: the full 8-column table. Below `sm`, replaced with one card per row — same
              reasoning as Tab A above. */}
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card lg:block motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <MissingSortHeader
                      column="date"
                      active={sortMissing}
                      dir={dirMissing}
                      onSort={sortMissingBy}
                    >
                      {t("openItems.fehlend.col.datum")}
                    </MissingSortHeader>
                    <TableHead className="w-[110px]">{t("openItems.fehlend.col.quelle")}</TableHead>
                    <TableHead>{t("openItems.fehlend.col.gesellschaft")}</TableHead>
                    <MissingSortHeader
                      column="contraAccount"
                      active={sortMissing}
                      dir={dirMissing}
                      onSort={sortMissingBy}
                    >
                      {t("openItems.fehlend.col.gegenkonto")}
                    </MissingSortHeader>
                    <TableHead>{t("openItems.fehlend.col.verwendungszweck")}</TableHead>
                    <MissingSortHeader
                      column="amount"
                      active={sortMissing}
                      dir={dirMissing}
                      onSort={sortMissingBy}
                      className="text-right"
                    >
                      {t("openItems.fehlend.col.betrag")}
                    </MissingSortHeader>
                    <TableHead className="w-[64px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingPage.map((txn) => (
                    <TableRow
                      key={txn.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a")) return;
                        navigate({ to: "/bank-transactions/$id", params: { id: txn.id } });
                      }}
                    >
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(txn.booking_date)}
                      </TableCell>
                      <TableCell>
                        <SourceChip source={txn.source} />
                      </TableCell>
                      <TableCell>
                        <CompanyChip code={companyById.get(txn.company_id ?? "")?.code} />
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm font-medium text-foreground sm:max-w-[220px]">
                        {/* A real link, so the row is reachable by keyboard and openable in a new tab
                          The row's own onClick is a mouse convenience on top of it, not the only
                          way in. */}
                        <Link
                          to="/bank-transactions/$id"
                          params={{ id: txn.id }}
                          className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {txn.counterparty_holder ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell
                        className="max-w-[160px] truncate text-sm text-muted-foreground sm:max-w-[320px]"
                        title={txn.payment_reference ?? ""}
                      >
                        {txn.payment_reference ?? "—"}
                        {/* Category for a transaction with no receipt of its own (migration 0057):
                          auto-set from a supplier's learned rule (category_source='rule'), always
                          correctable by hand (-> 'human'), same "human beats rule" stance as the
                          invoice-side rule engine. Outgoing invoices have no learned-rule concept,
                          so a credit row shows nothing here. Kept compact under the reference
                          rather than its own column -- this is the only column left that needs
                          it. */}
                        {txn.amount < 0 && (
                          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                            <CategoryCell txn={txn} />
                          </div>
                        )}
                      </TableCell>
                      {/* A collective payment stays here until every part of it is explained by a
                        receipt, so show how much of it is still unaccounted for. */}
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatSignedEUR(txn.amount)}
                        {((txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(txn.id) ??
                          0) > 0.01 && (
                          <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                            {t("openItems.fehlend.restOffen", {
                              rest: formatEUR(openRest(txn)),
                              matched: formatEUR(
                                (txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(
                                  txn.id,
                                ) ?? 0,
                              ),
                            })}
                          </span>
                        )}
                      </TableCell>
                      {/* The one primary action: find the invoice this transaction belongs to. The
                        escape hatch (mark as no receipt expected) lives inside that same panel
                        now, not as a separate row icon. */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="link"
                            className="h-7 gap-1 px-0 font-medium"
                            onClick={() =>
                              setMatchParam(matchParam({ kind: "transaction", id: txn.id }), false)
                            }
                          >
                            {t("openItems.fehlend.belegFinden")}
                            <ChevronRight />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: one card per transaction, same fields and actions as the table row. */}
            <div className="mt-4 space-y-3 lg:hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              {missingPage.map((txn) => {
                const allocated =
                  (txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(txn.id) ?? 0;
                return (
                  <div
                    key={txn.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a")) return;
                      navigate({ to: "/bank-transactions/$id", params: { id: txn.id } });
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <SourceChip source={txn.source} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(txn.booking_date)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          <Link
                            to="/bank-transactions/$id"
                            params={{ id: txn.id }}
                            className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {txn.counterparty_holder ?? "—"}
                          </Link>
                        </div>
                        <div
                          className="mt-0.5 truncate text-xs text-muted-foreground"
                          title={txn.payment_reference ?? ""}
                        >
                          {txn.payment_reference ?? "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                        {formatSignedEUR(txn.amount)}
                        {allocated > 0.01 && (
                          <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                            {t("openItems.fehlend.restOffen", {
                              rest: formatEUR(Math.max(Math.abs(txn.amount) - allocated, 0)),
                              matched: formatEUR(allocated),
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <CompanyChip code={companyById.get(txn.company_id ?? "")?.code} />
                      {txn.amount < 0 && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <CategoryCell txn={txn} />
                        </div>
                      )}
                    </div>
                    <div
                      className="mt-2.5 flex justify-end border-t border-border pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="link"
                        className="h-7 gap-1 px-0 font-medium"
                        onClick={() =>
                          setMatchParam(matchParam({ kind: "transaction", id: txn.id }), false)
                        }
                      >
                        {t("openItems.fehlend.belegFinden")}
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <MatchPanel target={matchTarget} onClose={() => setMatchParam(undefined, true)} />

      {/* One pager for both tabs — page/total already switch with `tab` above. */}
      {total > 0 && (
        <TablePagination
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          from={fromDate}
          to={toDate}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPageDocuments(1);
            setPageMissing(1);
          }}
        />
      )}
    </div>
  );
}

// ---- Filtering & sorting helpers ----

/**
 * Everything one row can be found by, in one lower-cased string.
 *
 * The counterparty box used to match the issuer name and the invoice number and nothing else, so
 * typing a company code, an amount or a cost category found nothing on tab A while the identical
 * box one tab over searched the bank's full text. Amounts go in twice, German and plain, so both
 * "1.234,56" and "1234.56" hit the same row.
 */
function searchTextFor(parts: (string | number | null | undefined)[]): string {
  const pieces: string[] = [];
  for (const part of parts) {
    if (part == null || part === "") continue;
    if (typeof part === "number") {
      const raw = Math.abs(part).toFixed(2);
      pieces.push(raw, raw.replace(".", ","));
      continue;
    }
    pieces.push(part);
  }
  return pieces.join(" ").toLowerCase();
}

/** Search terms, lower-cased, with the thousands separators a typed amount usually carries. */
function normaliseSearch(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/\.(?=\d{3}\b)/g, "").trim())
    .filter(Boolean);
}

function comparisonsText(a: string, b: string): number {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

/** Nulls sort last in BOTH directions. An empty cell is never the most urgent thing on the list. */
function comparisonsDatum(a: string | null, b: string | null, dir: SortDir): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function sortDocumentRows(
  rows: OpenInvoiceRow[],
  column: DocumentsSort,
  dir: SortDir,
): OpenInvoiceRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (column) {
      case "counterparty": {
        const v = comparisonsText(a.counterparty, b.counterparty);
        return dir === "asc" ? v : -v;
      }
      case "amount": {
        // By what is STILL OPEN, not the original total. That is the figure the column shows for a
        // part-paid row and the one somebody sorting by size is after.
        const ra = Math.max(Math.abs(a.amount ?? 0) - a.matched, 0);
        const rb = Math.max(Math.abs(b.amount ?? 0) - b.matched, 0);
        return dir === "asc" ? ra - rb : rb - ra;
      }
      case "received":
        return comparisonsDatum(a.datum, b.datum, dir);
      case "invoiceDate":
        return comparisonsDatum(a.invoiceDate, b.invoiceDate, dir);
      case "due":
      default:
        // The same fallback the cell renders, so the order can never contradict what is on screen.
        return comparisonsDatum(urgencyDatum(a), urgencyDatum(b), dir);
    }
  });
  return copy;
}

// ---- Row-level pieces ----

/** Why a receipt is on the "cannot be reconciled" list rather than the open one. */
function BlockerBadge({ blocker }: { blocker: OpenItemBlocker }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
      title={t(`openItems.blocker.hint.${blocker}`)}
    >
      {t(`openItems.blocker.label.${blocker}`)}
    </span>
  );
}

function TypeBadge({ type }: { type: "incoming" | "outgoing" }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        type === "incoming" ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900",
      )}
    >
      {t(
        type === "incoming"
          ? "openItems.belege.filter.incoming"
          : "openItems.belege.filter.outgoing",
      )}
    </span>
  );
}

/**
 * The counterparty as a real link.
 *
 * Rows were clickable but not reachable: `<TableRow onClick>` with no href, no role and no key
 * handler, so nothing on either tab could be opened without a mouse and no row could be
 * middle-clicked into a new tab. An anchor solves both properly, and the row's own onClick stays as
 * a convenience on top of it.
 */
function CounterpartyLink({ row }: { row: OpenInvoiceRow }) {
  const { t } = useTranslation();
  const classes =
    "rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (row.type === "incoming") {
    // A matched supplier opens the supplier record; a free-text issuer with no supplier row has
    // nowhere else to go, so it still opens the invoice, same as clicking anywhere else in the row.
    if (row.supplierId) {
      return (
        <Link to="/suppliers/$id" params={{ id: row.supplierId }} className={classes}>
          {row.counterparty}
        </Link>
      );
    }
    return (
      <Link to="/incoming-invoices/$nr" params={{ nr: row.id }} className={classes}>
        {row.counterparty}
      </Link>
    );
  }
  // An outgoing invoice has no detail page in this Hub, so its file is only reachable from the
  // Ausgangsrechnungen list. Said out loud instead of leaving a row that looks like its neighbours
  // and does nothing when clicked.
  return (
    <Link to="/outgoing-invoices" className={classes} title={t("openItems.belege.zurListe")}>
      {row.counterparty}
    </Link>
  );
}

/**
 * "Fällig / Alter", a column that always says something.
 *
 * `invoices.due_date` is written by nobody today: the pipeline never extracts it (no
 * `faelligkeit` key exists in a single `extracted` blob in either database) and until now the
 * invoice form had no field for it, so the column was 0 of 30 filled on Immonetz and 0 of 433 on
 * the this Hub. A column of dashes on the screen whose entire purpose is "which of these is late".
 * A due date is now enterable on the invoice detail AND, when there is none, the cell falls back to
 * how long the receipt has been sitting there, which is always knowable.
 */
function DueCell({ row, today }: { row: OpenInvoiceRow; today: string }) {
  const { t } = useTranslation();
  const d = urgency(row, today);

  // A plain "overdue or not" cell, matching the mockup's binary Due column -- gated on a REAL due
  // date being past (d.ueberfaellig), not just "old" (d.stufe): a due-date-less receipt sitting
  // for months is a different claim than a missed contractual date, and showing "overdue" for both
  // would overclaim the one nobody actually promised. The real due date, days overdue, or how long
  // a due-date-less receipt has been open -- all still computed by dringlichkeit() and still
  // sortable via dringlichkeitsDatum -- surfaces on hover instead of cluttering the cell.
  const detail =
    d.days == null
      ? undefined
      : row.due
        ? t(d.overdue ? "openItems.belege.ueberfaelligTage" : "openItems.belege.faelligAm", {
            count: d.days,
            datum: formatDate(row.due),
          })
        : t("openItems.belege.offenSeit", { count: d.days });

  const cashDiscount = row.cashDiscount;
  const bucket = dueBucket(row.due, today);
  const TON: Partial<Record<typeof bucket, string>> = {
    overdue: "font-medium text-red-600",
    today: "font-medium text-red-600",
    within_3_days: "font-medium text-amber-700",
    within_week: "text-foreground",
  };
  const ton = TON[bucket];
  return (
    <span className="flex flex-col items-start gap-0.5">
      {ton ? (
        <span className={ton} title={detail}>
          {t(`openItems.due.short.${bucket}`)}
        </span>
      ) : (
        <span className="text-muted-foreground" title={detail}>
          —
        </span>
      )}
      {cashDiscount && cashDiscount.state !== "lapsed" && (
        <span
          className={cn(
            "text-[11px] font-medium whitespace-nowrap",
            cashDiscount.state === "closing" ? "text-emerald-700" : "text-muted-foreground",
          )}
          title={t("openItems.skonto.title", {
            percent: cashDiscount.percent ?? 0,
            datum: formatDate(cashDiscount.deadline),
          })}
        >
          {t("openItems.skonto.badge", {
            percent: cashDiscount.percent ?? 0,
            amount: formatEUR(cashDiscount.saving ?? 0),
          })}
        </span>
      )}
    </span>
  );
}

const NO_CATEGORY = "__none";

// Category of a transaction with no receipt (migration 0057): category_id/category_source are
// real, persisted columns now (auto-set by the categorize trigger, never overwriting a human
// value) — read straight off the already-loaded row, no extra query per cell. Always editable:
// the briefing's "learning system" asks for automatic categorization, not a suggestion a human has
// to separately act on, so the correction path has to be right here too.
function CategoryCell({ txn }: { txn: BankTransaction }) {
  const { t } = useTranslation();
  const categoriesQ = useCostAnalysisCategories();
  // Memoized fallback: `?? []` alone mints a fresh array every render while categoriesQ.data is
  // still undefined, which would invalidate useCategoryOptions' own memo on every render too.
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const categoryOptions = useCategoryOptions(categories);
  const setCategory = useSetTransactionCategory();

  return (
    <div className="flex items-center gap-1.5">
      <Combobox
        value={txn.category_id ?? NO_CATEGORY}
        disabled={setCategory.isPending}
        onValueChange={(v) => {
          const categoryId = v === NO_CATEGORY ? null : v;
          // This write used to have no callbacks at all: a failed opos_set_category left the
          // dropdown showing the value that was picked while the database still held the old one,
          // with nothing on screen, on the write that decides how a receipt-less payment lands in
          // the Kostenanalyse. It was the only mutation on this screen with no feedback; the hide
          // action beside it has always toasted on both outcomes.
          setCategory.mutate(
            { transactionId: txn.id, categoryId },
            {
              onSuccess: () =>
                toast.success(
                  t(
                    categoryId
                      ? "openItems.fehlend.kategorieGesetzt"
                      : "openItems.fehlend.kategorieEntfernt",
                  ),
                ),
              onError: (e) =>
                toast.error(t("openItems.fehlend.kategorieFehler", { error: errorText(e) })),
            },
          );
        }}
        options={[
          { value: NO_CATEGORY, label: t("openItems.fehlend.kategorieOhne") },
          ...categoryOptions,
        ]}
        placeholder={t("openItems.fehlend.kategoriePlaceholder")}
        className="h-7 w-auto min-w-[150px] px-2 py-1 text-xs"
      />
      {txn.category_source === "rule" && (
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          title={t("openItems.fehlend.kategorieRegelHint")}
        >
          {t("openItems.fehlend.kategorieRegel")}
        </span>
      )}
    </div>
  );
}

/** A clickable column header. Mirrors the one on the Banktransaktionen list. */
function SortHeader({
  column,
  active,
  dir,
  onSort,
  className,
  children,
}: {
  column: DocumentsSort;
  active: DocumentsSort;
  dir: SortDir;
  onSort: (column: DocumentsSort) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = active === column;
  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // The arrow sits to the RIGHT of the label in every column, including the right-aligned
          // ones. Mirroring the row for those put it on the left, so the same control changed sides
          // halfway across the header.
          className?.includes("text-right") && "w-full justify-end",
        )}
      >
        {children}
        <SortIcon active={isActive} dir={dir} />
      </button>
    </TableHead>
  );
}

function MissingSortHeader({
  column,
  active,
  dir,
  onSort,
  className,
  children,
}: {
  column: MissingSort;
  active: MissingSort;
  dir: SortDir;
  onSort: (column: MissingSort) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = active === column;
  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // The arrow sits to the RIGHT of the label in every column, including the right-aligned
          // ones. Mirroring the row for those put it on the left, so the same control changed sides
          // halfway across the header.
          className?.includes("text-right") && "w-full justify-end",
        )}
      >
        {children}
        <SortIcon active={isActive} dir={dir} />
      </button>
    </TableHead>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

/** Same grouped-filters pattern as eingangsrechnungen/index.tsx: one trigger with a count badge, */
/** opening a popover of the fields that would otherwise crowd the surface. */
// forwardRef + ...props: PopoverTrigger's `asChild` clones this element via Radix Slot, injecting
// its own onClick/ref/aria-expanded etc. A component that doesn't accept and forward those never
// receives the click handler that actually opens the popover -- it just sits there looking
// clickable.
const FilterTriggerButton = forwardRef<
  HTMLButtonElement,
  { count: number } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ count, className, ...props }, ref) => {
  const { t } = useTranslation();
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
        count > 0
          ? "border-brand bg-brand-wash text-brand-dark"
          : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      <SlidersHorizontal className="size-4" />
      {t("openItems.filterButton")}
      {count > 0 && (
        <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
});
FilterTriggerButton.displayName = "FilterTriggerButton";

/** Removable chip for one active filter, shown below the search/filter row once the popover
 * closes again — same shape as eingangsrechnungen/index.tsx's own FilterChip. */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-wash px-3 py-1 text-xs font-medium text-brand-dark">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={t("openItems.filterChipEntfernen")}
        className="cursor-pointer hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Rendered as "(n)" in a fixed-width slot (up to 4 digits), so a count that grows from 9 to
   *  698 never changes the tab's width and the pair stops jumping around. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "min-w-0 flex-1 cursor-pointer rounded px-3 py-1.5 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && (
        <span className="ml-1 inline-block min-w-[4ch] text-left tabular-nums">({count})</span>
      )}
    </button>
  );
}

function SourceChip({ source }: { source: string | null | undefined }) {
  const { t } = useTranslation();
  if (!source) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = SOURCE_ICON[source];
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {Icon && <Icon className="size-3 shrink-0" />}
      {t(`openItems.fehlend.quelle.${source}`, { defaultValue: source })}
    </span>
  );
}
