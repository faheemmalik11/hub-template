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
  useBeleg,
  useBwaCategories,
  useConfirmedAllocations,
  useConfirmedOutgoingAllocations,
  useGesellschaften,
  useLieferanten,
  useNichtAbgleichbareBelege,
  useOffeneBelege,
  useOutgoingInvoice,
  useOutgoingInvoices,
  useSetTransactionCategory,
} from "@/lib/data/queries";
import { useCategoryOptions } from "@/components/zuordnung/neue-regel-dialog";
import {
  coveredAmount,
  fehlerText,
  formatDate,
  formatEUR,
  formatSignedEUR,
  heuteLokal,
  isFullyCovered,
  tageSeit,
  dueBucket,
  DUE_BUCKETS,
  discountOpportunity,
  toDueBucket,
  overviewPeriodRange,
  type DiscountOpportunity,
  type DueBucket,
} from "@/lib/data/format";
import { PeriodPicker, type PeriodValue } from "@/components/home/period-picker";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { TablePagination } from "@/components/data-table/table-pagination";
import { MatchPanel, type MatchPanelTarget } from "@/components/bank/match-panel/match-panel";
import { GesellschaftChip } from "@/components/belege/badges";
import { useTranslation } from "@/lib/i18n";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import type { BankTransaction, OpenItemBlocker } from "@/lib/data/types";
import type { BankTransactionSort } from "@/lib/data/queries";
import { pageTitle } from "@/config/brand";

const ALLE_GESELLSCHAFTEN = "__alle";
// "Ohne Gesellschaft" is the most common value in that column (20 of 28 rows on Immonetz, 225 of
// 433 on the this Hub) and it is the one worth working off, but the filter used to offer only the
// real companies plus "all", so the rows that need assigning were the only ones that could not be
// isolated. A sentinel of its own, matched against `company_id is null`.
const OHNE_GESELLSCHAFT = "__ohne";

// The tab B search goes to Postgres (full-text or amount), so an undebounced box is one round trip
// per keystroke. Tab A's is a client-side filter, but it shares the delay so the two boxes do not
// feel different to type in.
const SUCHE_DEBOUNCE_MS = 300;

const ALLE_QUELLEN = "__alle__";
// Where a bank movement came from (bank_transactions.source, migration 0073). Kept to the values
// the importers actually write; anything else falls back to the raw string.
const QUELLE_ICON: Record<string, typeof Landmark> = { banksapi: Landmark, pleo: CreditCard };
// The provenances this Hub can show, in dropdown order. Adding one here is the same edit as
// adding its icon above and its label in the locale files.
const QUELLEN = Object.keys(QUELLE_ICON);

// Overdue is red, and so is "very old with no due date at all". Amber is the warning before it.
const ALT_AB_TAGEN = 30;
const SEHR_ALT_AB_TAGEN = 90;

export const Route = createFileRoute("/offene-posten/")({
  validateSearch: (
    input: Record<string, unknown>,
  ): {
    tab?: string;
    match?: string;
    typ?: "incoming" | "outgoing";
    due?: DueBucket;
    skonto?: "closing";
  } => ({
    ...tabSearch(input),
    match: typeof input.match === "string" ? input.match : undefined,
    typ: input.typ === "incoming" || input.typ === "outgoing" ? input.typ : undefined,
    due: toDueBucket(input.due),
    skonto: input.skonto === "closing" ? ("closing" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle("Offene Posten") }] }),
  component: OffenePostenPage,
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
  const trenner = raw.indexOf(":");
  if (trenner < 1) return null;
  const praefix = raw.slice(0, trenner);
  const id = raw.slice(trenner + 1);
  if (!id) return null;
  if (praefix === "txn") return { kind: "transaction", id };
  if (praefix === "incoming" || praefix === "outgoing")
    return { kind: "invoice", type: praefix, id };
  return null;
}

type Tab = "belege" | "fehlend";
// "incoming" = incoming invoices (what we owe), "outgoing" = outgoing invoices (revenue). Deliberately
// NOT named after bank_transactions.direction, which uses the OPPOSITE sense (eingehend = a credit,
// i.e. money that pays one of OUR outgoing invoices) -- see MatchPanel's own richtung mapping.
type PostenTyp = "alle" | "incoming" | "outgoing";

/** Sortable columns of tab A. */
type BelegeSort = "gegenpartei" | "betrag" | "eingang" | "rechnungsdatum" | "faellig";
/** Sortable columns of tab B. */
type FehlendSort = "datum" | "gegenkonto" | "betrag";

// The table's own sort keys, mapped to the columns the server orders by. Sorting happens in the
// database now, so a click on a header reorders the WHOLE result, not just the rows on screen.
const FEHLEND_SORT_SPALTE: Record<FehlendSort, BankTransactionSort> = {
  datum: "booking_date",
  gegenkonto: "counterparty_holder",
  betrag: "amount",
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
  gegenpartei: string;
  nr: string | null;
  betrag: number | null;
  matched: number;
  datum: string | null;
  rechnungsdatum: string | null;
  faellig: string | null;
  /** Why this row can never be settled by a bank movement. Null for a normal open item. */
  blocker: OpenItemBlocker | null;
  /** Everything the counterparty box searches, lower-cased and joined once at build time. */
  suchtext: string;
  skonto: DiscountOpportunity | null;
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
function dringlichkeitsDatum(row: {
  faellig: string | null;
  rechnungsdatum: string | null;
  datum: string | null;
}): string | null {
  return row.faellig ?? row.rechnungsdatum ?? row.datum;
}

interface Dringlichkeit {
  /** Days past the due date, or days since the fallback date when there is none. */
  tage: number | null;
  ueberfaellig: boolean;
  stufe: "normal" | "alt" | "kritisch";
}

function dringlichkeit(row: OpenInvoiceRow, heute: string): Dringlichkeit {
  if (row.faellig) {
    const tage = tageSeit(row.faellig, heute);
    // Strictly > 0: a due date of today is still payable today, not yet overdue. It only crosses
    // into "kritisch" the day after.
    const ueberfaellig = tage != null && tage > 0;
    return {
      tage,
      ueberfaellig,
      stufe: ueberfaellig ? "kritisch" : "normal",
    };
  }
  // No due date: age stands in for it. Nothing here is "overdue" in the contractual sense, so the
  // word is not used, but a receipt nobody has settled in two months is still the one to look at.
  const tage = tageSeit(dringlichkeitsDatum(row), heute);
  return {
    tage,
    ueberfaellig: false,
    stufe:
      tage == null || tage < ALT_AB_TAGEN
        ? "normal"
        : tage < SEHR_ALT_AB_TAGEN
          ? "alt"
          : "kritisch",
  };
}

function OffenePostenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTabRaw] = useTabParam(["belege", "fehlend"] as const, "belege");
  const setTab = setTabRaw as (next: Tab) => void;
  const {
    match: matchParamValue,
    skonto: skontoParam,
    typ: typParam,
    due: dueParam,
  } = Route.useSearch();
  const [fBelegeTyp, setFBelegeTyp] = useState<PostenTyp>(typParam ?? "alle");
  const [fFaellig, setFFaellig] = useState<DueBucket | "alle">(dueParam ?? "alle");
  const [periodInvoices, setPeriodInvoices] = useState<PeriodValue>({ period: "alle" });
  const [fGesellschaftBelege, setFGesellschaftBelege] = useState(ALLE_GESELLSCHAFTEN);
  const [fGegenparteiBelege, setFGegenparteiBelege] = useState("");
  const [fFehlendRichtung, setFFehlendRichtung] = useState<"alle" | "eingehend" | "ausgehend">(
    "alle",
  );
  const offenesMatch = parseMatchParam(matchParamValue);
  // Tab B breakdown (Briefing Screen 8/10: "missing receipts must stand out early and clearly —
  // per company, service provider and project"). Scoped to exactly what bank_transactions can
  // actually back: company_id is a real FK (0014_bank_transaction_company.sql); "service
  // provider" has no FK on an unmatched transaction (that's inherent to it not having a receipt
  // yet), so counterparty is filtered by the bank's own free-text fields via the existing
  // full-text search. There is deliberately no "project" filter here — an unmatched transaction
  // carries no property reference at all, fabricating one would show a filter that never narrows
  // anything.
  const [fGesellschaftFehlend, setFGesellschaftFehlend] = useState(ALLE_GESELLSCHAFTEN);
  const [periodTransactions, setPeriodTransactions] = useState<PeriodValue>({ period: "alle" });
  const [fQuelle, setFQuelle] = useState<string>(ALLE_QUELLEN);
  const [fGegenpartei, setFGegenpartei] = useState("");
  // Tab A's third state, next to "the open ones": the receipts that can never become open items
  // because coverage has nothing to measure against. See OpenItemBlocker.
  const [zeigeBlockiert, setZeigeBlockiert] = useState(false);

  // Newest RECEIVED first, by product decision. created_at is always present, whereas
  // document_date is whatever the supplier printed and is often weeks older or missing; what
  // somebody opens this screen to work on is usually what just arrived. Urgency is one click away
  // instead of being the default: the Fällig/Alter header sorts oldest-first, and the figure above
  // the table already says how much of the list is overdue or long open.
  const [sortBelege, setSortBelege] = useState<BelegeSort>("eingang");
  const [dirBelege, setDirBelege] = useState<SortDir>("desc");
  const [sortFehlend, setSortFehlend] = useState<FehlendSort>("datum");
  const [dirFehlend, setDirFehlend] = useState<SortDir>("desc");

  const offenQ = useOffeneBelege();
  const blockiertQ = useNichtAbgleichbareBelege();
  const allocationsQ = useConfirmedAllocations();
  const outgoingInvoicesQ = useOutgoingInvoices();
  const outgoingAllocationsQ = useConfirmedOutgoingAllocations();
  const lieferantenQ = useLieferanten();
  const gesellschaftenQ = useGesellschaften();
  const gesellschaftById = useMemo(
    () => new Map((gesellschaftenQ.data ?? []).map((g) => [g.id, g])),
    [gesellschaftenQ.data],
  );
  // Missing receipts = outgoing bank debits still unmatched (incoming invoices) or incoming bank
  // credits still unmatched (outgoing invoices/revenue). Transactions that can never have a receipt
  // (salaries, taxes, rebookings, loan installments …) are parked in matching_status 'ignored' by
  // the OPOS whitelist and therefore already excluded here — see the pipeline's migration 0018 and
  // the /opos-whitelist screen. They are counted, not hidden silently.
  // Declared before the queries below, which read the page and size to ask the server for
  // one page rather than the whole set.
  const [pageSize, setPageSize] = useState(25);
  const [pageBelege, setPageBelege] = useState(1);
  const [pageFehlend, setPageFehlend] = useState(1);

  const fehlendRichtung = fFehlendRichtung === "alle" ? undefined : fFehlendRichtung;
  const sucheFehlend = useDebouncedValue(fGegenpartei, SUCHE_DEBOUNCE_MS);
  // 25 rows at a time, filtered, sorted and counted BY THE DATABASE, the same way the Bank
  // transactions screen does it. This used to be the unpaginated hook, which pulled the whole open
  // set (thousands of rows over several requests) so it could filter, sort and page in the browser.
  // Every predicate below is a real column, so none of that had to happen here.
  const transactionRange = useMemo(
    () =>
      overviewPeriodRange(periodTransactions.period, new Date(), {
        von: periodTransactions.von,
        bis: periodTransactions.bis,
      }),
    [periodTransactions],
  );
  const fehlendQ = useBankTransactionsPage({
    matchingStatus: "open",
    richtung: fehlendRichtung,
    search: sucheFehlend,
    companyId:
      fGesellschaftFehlend === ALLE_GESELLSCHAFTEN
        ? undefined
        : fGesellschaftFehlend === OHNE_GESELLSCHAFT
          ? null
          : fGesellschaftFehlend,
    source: fQuelle === ALLE_QUELLEN ? undefined : fQuelle,
    bookingDateVon: transactionRange.von ?? undefined,
    bookingDateBis: transactionRange.bis ?? undefined,
    sort: FEHLEND_SORT_SPALTE[sortFehlend],
    dir: dirFehlend,
    page: pageFehlend,
    pageSize,
  });
  const fehlendRows = useMemo(() => fehlendQ.data?.rows ?? [], [fehlendQ.data]);
  const fehlendTotal = fehlendQ.data?.total ?? 0;

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
  const lieferantById = useMemo(
    () => new Map((lieferantenQ.data ?? []).map((l) => [l.id, l])),
    [lieferantenQ.data],
  );
  // The LOCAL day. `new Date().toISOString().slice(0,10)` is the UTC one, which between local
  // midnight and 01:00/02:00 is still yesterday, so an invoice that fell due at midnight was not
  // flagged overdue for the first hour or two of the day. See heuteLokal() in format.ts.
  const heute = heuteLokal();

  // An invoice stays an open item until it is actually COVERED, not merely until it has a match: a
  // 1.000 invoice with 400 matched still owes 600, so it has to remain here and remain pickable in
  // the manual tab. That test now lives in the database (view v_open_items, migration
  // 20260819210000) instead of being recomputed in the browser out of the whole invoices table.
  // which is what made this screen load 5.7 MB to render 28 rows.
  // Memoized: the ?? fallback would mint a fresh array on every render, which would then
  // invalidate the row-assembly memo below on every render.
  const offeneBelege = useMemo(() => offenQ.data ?? [], [offenQ.data]);
  const blockierteBelege = useMemo(() => blockiertQ.data ?? [], [blockiertQ.data]);
  // Outgoing-direction mirror (migration 0045). Outgoing invoices have no view of their own: there
  // are few of them and their coverage math is the same helper, so they stay client-side.
  //
  // status === "open" is required alongside the coverage check: a draft (not yet a real
  // invoice) or a voided (cancelled) outgoing invoice can still have amount_gross set and no
  // confirmed match, so coverage alone let it show up here as "open" money owed to us that isn't
  // real. useOpenOutgoingInvoicesInfinite (the manual-search picker's own query, see
  // match-panel/manual-search.tsx) already filters on status server-side for exactly this
  // reason; this client-side list now matches it.
  const offeneAusgangsrechnungen = useMemo(
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
  const alleBelegeRows = useMemo<OpenInvoiceRow[]>(() => {
    const rows: OpenInvoiceRow[] = [];
    const quelle = zeigeBlockiert ? blockierteBelege : offeneBelege;
    for (const b of quelle) {
      const issuerName =
        (b.supplier_id ? lieferantById.get(b.supplier_id)?.name : null) ?? b.issuer ?? "";
      const gesellschaft = b.company_id ? gesellschaftById.get(b.company_id) : undefined;
      rows.push({
        type: "incoming",
        id: b.id,
        companyId: b.company_id,
        supplierId: b.supplier_id,
        gegenpartei: issuerName || "—",
        nr: b.invoice_number,
        betrag: b.amount_gross,
        matched: b.matched_sum,
        datum: b.created_at,
        rechnungsdatum: b.document_date,
        faellig: b.due_date,
        skonto: discountOpportunity(b, heute),
        blocker: b.open_blocker,
        suchtext: suchtextFuer([
          issuerName,
          b.invoice_number,
          b.company_code,
          gesellschaft?.name,
          b.property_code,
          b.cost_category,
          b.amount_gross,
        ]),
      });
    }
    // The blocker list is an incoming-side concept only (it comes out of v_open_items), so the
    // outgoing half is skipped entirely while it is being shown rather than appearing unfiltered
    // beside rows that mean something else.
    if (!zeigeBlockiert) {
      for (const oi of offeneAusgangsrechnungen) {
        const customerName = oi.customers?.name ?? "";
        const gesellschaft = oi.company_id ? gesellschaftById.get(oi.company_id) : undefined;
        rows.push({
          type: "outgoing",
          id: oi.id,
          companyId: oi.company_id,
          supplierId: null,
          gegenpartei: customerName || "—",
          nr: oi.invoice_number,
          betrag: oi.amount_gross,
          matched: outgoingMatchedByInvoice.get(oi.id) ?? 0,
          datum: oi.created_at,
          rechnungsdatum: oi.invoice_date,
          faellig: oi.due_date,
          skonto: null,
          blocker: null,
          suchtext: suchtextFuer([
            customerName,
            oi.invoice_number,
            gesellschaft?.code,
            gesellschaft?.name,
            oi.amount_gross,
          ]),
        });
      }
    }
    return rows;
  }, [
    heute,
    zeigeBlockiert,
    blockierteBelege,
    offeneBelege,
    offeneAusgangsrechnungen,
    outgoingMatchedByInvoice,
    lieferantById,
    gesellschaftById,
  ]);

  const invoiceRange = useMemo(
    () =>
      overviewPeriodRange(periodInvoices.period, new Date(), {
        von: periodInvoices.von,
        bis: periodInvoices.bis,
      }),
    [periodInvoices],
  );
  const sucheBelege = useDebouncedValue(fGegenparteiBelege, SUCHE_DEBOUNCE_MS);
  const offenePostenRows = useMemo<OpenInvoiceRow[]>(() => {
    const begriff = normalisiereSuche(sucheBelege);
    const gefiltert = alleBelegeRows.filter((row) => {
      if (skontoParam === "closing" && row.skonto?.state !== "closing") return false;
      // Invoice date, falling back to the ingest date for rows the extraction never dated —
      // the same fallback sortDatum() uses, so filtering and sorting agree on which day a row is.
      const datum = (row.rechnungsdatum ?? row.datum)?.slice(0, 10);
      if (invoiceRange.von && (!datum || datum < invoiceRange.von)) return false;
      if (invoiceRange.bis && (!datum || datum > invoiceRange.bis)) return false;
      if (fFaellig !== "alle" && dueBucket(row.faellig, heute) !== fFaellig) return false;
      if (!zeigeBlockiert && fBelegeTyp !== "alle" && row.type !== fBelegeTyp) return false;
      if (fGesellschaftBelege === OHNE_GESELLSCHAFT) {
        if (row.companyId !== null) return false;
      } else if (
        fGesellschaftBelege !== ALLE_GESELLSCHAFTEN &&
        row.companyId !== fGesellschaftBelege
      ) {
        return false;
      }
      // Every term has to appear somewhere in the row, so "hansen 2024" narrows rather than widens.
      return begriff.every((teil) => row.suchtext.includes(teil));
    });
    return sortiereBelege(gefiltert, sortBelege, dirBelege);
  }, [
    alleBelegeRows,
    invoiceRange,
    skontoParam,
    zeigeBlockiert,
    fBelegeTyp,
    fFaellig,
    heute,
    fGesellschaftBelege,
    sucheBelege,
    sortBelege,
    dirBelege,
  ]);

  // Partially allocated transactions keep matching_status 'open' (migration 0024), so they arrive
  // here on their own and stay available for the receipts that still have to explain the rest.
  // Company filter applied client-side: the list is already fetched in full for pagination/count
  // purposes, and company_id is a real column so this is an exact filter, not a guess.
  // From the fixed vocabulary above, NOT from the data. Reading the distinct values meant asking
  // for every row's source column to learn that they all say the same thing. The screen already
  // has to know each source to give it an icon and a label, so the list lives in one place.
  const quelleOptionen = useMemo(
    () => [
      { value: ALLE_QUELLEN, label: t("offenePosten.fehlend.filter.alleQuellen") },
      ...QUELLEN.map((q) => ({
        value: q,
        label: t(`offenePosten.fehlend.quelle.${q}`, { defaultValue: q }),
      })),
    ],
    [t],
  );

  function offenerRest(txn: BankTransaction): number {
    const zugeordnet = (txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(txn.id) ?? 0;
    return Math.max(Math.abs(txn.amount) - zugeordnet, 0);
  }

  // Split on purpose. A type filter still has an empty state worth naming ("no open outgoing
  // invoices"); a search or a company filter does not. There the honest answer is "nothing matches
  // what you asked for", with a way back.
  const engFilterBelege =
    fGesellschaftBelege !== ALLE_GESELLSCHAFTEN || fGegenparteiBelege.trim() !== "";
  const filterAktivBelege =
    engFilterBelege ||
    fBelegeTyp !== "alle" ||
    fFaellig !== "alle" ||
    periodInvoices.period !== "alle";
  const filterAktivFehlend =
    fFehlendRichtung !== "alle" ||
    fGesellschaftFehlend !== ALLE_GESELLSCHAFTEN ||
    fQuelle !== ALLE_QUELLEN ||
    periodTransactions.period !== "alle" ||
    fGegenpartei.trim() !== "";
  // Counts only the two dropdown filters behind the popover, not the search box (already visible
  // and editable on the surface, so it needs no chip/badge of its own).
  const belegeFilterCount =
    (fBelegeTyp !== "alle" ? 1 : 0) +
    (fFaellig !== "alle" ? 1 : 0) +
    (fGesellschaftBelege !== ALLE_GESELLSCHAFTEN ? 1 : 0) +
    (periodInvoices.period !== "alle" ? 1 : 0) +
    (zeigeBlockiert ? 1 : 0);
  const fehlendFilterCount =
    (fFehlendRichtung !== "alle" ? 1 : 0) +
    (fGesellschaftFehlend !== ALLE_GESELLSCHAFTEN ? 1 : 0) +
    (periodTransactions.period !== "alle" ? 1 : 0) +
    (fQuelle !== ALLE_QUELLEN ? 1 : 0);

  const page = tab === "belege" ? pageBelege : pageFehlend;
  const setPage = tab === "belege" ? setPageBelege : setPageFehlend;
  const rows = tab === "fehlend" ? fehlendRows : offenePostenRows;
  // The payments tab is paged by the server, so its total is the count that came back with the
  // page, not the length of what is in memory.
  const total = tab === "fehlend" ? fehlendTotal : offenePostenRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp rather than reset: if the list shrinks under you (a link removes both sides), land on the
  // last real page instead of an empty one.
  const safePage = Math.min(page, totalPages);
  const von = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const bis = Math.min(safePage * pageSize, total);
  // The payments tab already holds exactly one page; only the invoice side still slices.
  const seite =
    tab === "fehlend" ? rows : rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const belegeSeite = tab === "belege" ? (seite as OpenInvoiceRow[]) : [];
  const fehlendSeite = tab === "fehlend" ? (seite as BankTransaction[]) : [];

  function sortiereNach(spalte: BelegeSort) {
    setPageBelege(1);
    if (sortBelege === spalte) {
      setDirBelege((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBelege(spalte);
    // Each column opens on the direction somebody actually wants from it first: the biggest amount,
    // the newest date, the most urgent item, A first for a name.
    setDirBelege(spalte === "gegenpartei" || spalte === "faellig" ? "asc" : "desc");
  }

  function sortiereFehlendNach(spalte: FehlendSort) {
    setPageFehlend(1);
    if (sortFehlend === spalte) {
      setDirFehlend((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortFehlend(spalte);
    setDirFehlend(spalte === "gegenkonto" ? "asc" : "desc");
  }

  function belegeFilterZuruecksetzen() {
    setFBelegeTyp("alle");
    setFFaellig("alle");
    setFGesellschaftBelege(ALLE_GESELLSCHAFTEN);
    setFGegenparteiBelege("");
    setPeriodInvoices({ period: "alle" });
    setZeigeBlockiert(false);
    setPageBelege(1);
  }

  function fehlendFilterZuruecksetzen() {
    setFFehlendRichtung("alle");
    setFGesellschaftFehlend(ALLE_GESELLSCHAFTEN);
    setFGegenpartei("");
    setPeriodTransactions({ period: "alle" });
    setPageFehlend(1);
  }

  const gesellschaftOptionen = [
    { value: ALLE_GESELLSCHAFTEN, label: t("offenePosten.fehlend.alleGesellschaften") },
    { value: OHNE_GESELLSCHAFT, label: t("offenePosten.ohneGesellschaft") },
    ...(gesellschaftenQ.data ?? []).map((g) => ({
      value: g.id,
      label: `${g.code} · ${g.name}`,
      keywords: g.name,
    })),
  ];

  /** Opens the row's target, unless the click already landed on a real link inside it. */
  function oeffneBeleg(row: OpenInvoiceRow, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a")) return;
    if (row.type === "incoming") {
      navigate({ to: "/eingangsrechnungen/$nr", params: { nr: row.id } });
    } else {
      // An outgoing invoice has no detail page in this Hub at all (source is always 'upload',
      // migration 0086), so its file is only reachable from the Ausgangsrechnungen list. The row
      // used to have no click handler whatsoever while looking exactly like its clickable
      // neighbours; it goes to the list instead.
      navigate({ to: "/ausgangsrechnungen" });
    }
  }

  function setMatchParam(next: string | undefined, replace: boolean) {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, match: next }),
      replace,
    });
  }

  function oeffneMatchPanelFuerBeleg(row: OpenInvoiceRow) {
    setMatchParam(matchParam({ kind: "invoice", id: row.id, type: row.type }), false);
  }

  const matchRowInList =
    offenesMatch?.kind === "invoice"
      ? (alleBelegeRows.find((r) => r.id === offenesMatch.id && r.type === offenesMatch.type) ??
        null)
      : null;
  const matchTxnInList =
    offenesMatch?.kind === "transaction"
      ? (fehlendRows.find((tx) => tx.id === offenesMatch.id) ?? null)
      : null;

  // A ?match= link stays valid once the row leaves this screen -- fully reconciled, blocked, or on
  // the other tab -- so a miss in the loaded list falls back to fetching that one record directly
  // instead of silently opening nothing.
  const fehlenderBelegId =
    offenesMatch?.kind === "invoice" && offenesMatch.type === "incoming" && !matchRowInList
      ? offenesMatch.id
      : "";
  const fehlendeAusgangsrechnungId =
    offenesMatch?.kind === "invoice" && offenesMatch.type === "outgoing" && !matchRowInList
      ? offenesMatch.id
      : "";
  const fehlendeTxnId =
    offenesMatch?.kind === "transaction" && !matchTxnInList ? offenesMatch.id : "";
  const belegFallbackQ = useBeleg(fehlenderBelegId);
  const ausgangsrechnungFallbackQ = useOutgoingInvoice(fehlendeAusgangsrechnungId);
  const txnFallbackQ = useBankTransaction(fehlendeTxnId);

  const matchTarget: MatchPanelTarget | null = (() => {
    if (!offenesMatch) return null;
    if (offenesMatch.kind === "transaction") {
      const txn = matchTxnInList ?? txnFallbackQ.data ?? null;
      return txn ? { kind: "transaction", txn } : null;
    }
    if (matchRowInList) {
      return {
        kind: "invoice",
        id: matchRowInList.id,
        type: matchRowInList.type,
        label: matchRowInList.gegenpartei,
        nr: matchRowInList.nr,
        amount: matchRowInList.betrag,
        documentDate: matchRowInList.rechnungsdatum,
        dueDate: matchRowInList.faellig,
      };
    }
    if (offenesMatch.type === "incoming") {
      const b = belegFallbackQ.data;
      if (!b) return null;
      const issuerName =
        (b.supplier_id ? lieferantById.get(b.supplier_id)?.name : null) ?? b.issuer ?? "";
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
    const oi = ausgangsrechnungFallbackQ.data;
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
          {t("offenePosten.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(tab === "fehlend" ? "offenePosten.subtitleFehlend" : "offenePosten.subtitle")}
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
              <TabButton active count={offenePostenRows.length} onClick={() => setTab("belege")}>
                {t("offenePosten.tab.belege")}
              </TabButton>
              <TabButton
                active={false}
                count={fehlendQ.isPending ? undefined : fehlendTotal}
                onClick={() => setTab("fehlend")}
              >
                {t("offenePosten.tab.fehlend")}
              </TabButton>
            </div>
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2"
              data-tour="reconcile-filters"
            >
              <Input
                value={fGegenparteiBelege}
                onChange={(e) => {
                  setFGegenparteiBelege(e.target.value);
                  setPageBelege(1);
                }}
                placeholder={t("offenePosten.belege.gegenparteiPlaceholder")}
                aria-label={t("offenePosten.belege.gegenparteiPlaceholder")}
                className="h-9 w-full shadow-none sm:w-96"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <FilterTriggerButton count={belegeFilterCount} />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[280px] overflow-hidden p-0 shadow-xl sm:w-[520px]"
                >
                  <div className="h-1 bg-primary" />
                  <div className="p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {t("offenePosten.filterButton")}
                      </span>
                      <div className="flex items-center gap-3">
                        {(filterAktivBelege || zeigeBlockiert) && (
                          <button
                            type="button"
                            onClick={belegeFilterZuruecksetzen}
                            className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            {t("offenePosten.filterZuruecksetzen")}
                          </button>
                        )}
                        <PopoverClose
                          aria-label={t("offenePosten.filterSchliessen")}
                          className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-4" />
                        </PopoverClose>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.belege.filter.label")}
                        </span>
                        <Combobox
                          value={fBelegeTyp}
                          onValueChange={(v) => {
                            setFBelegeTyp(v as PostenTyp);
                            setPageBelege(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            { value: "alle", label: t("offenePosten.belege.filter.alle") },
                            { value: "incoming", label: t("offenePosten.belege.filter.incoming") },
                            { value: "outgoing", label: t("offenePosten.belege.filter.outgoing") },
                          ]}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.belege.col.faelligAlter")}
                        </span>
                        <Combobox
                          value={fFaellig}
                          onValueChange={(v) => {
                            setFFaellig(v as DueBucket | "alle");
                            setPageBelege(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            { value: "alle", label: t("offenePosten.due.any") },
                            ...DUE_BUCKETS.map((b) => ({
                              value: b,
                              label: t(`offenePosten.due.${b}`),
                            })),
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("belege.list.filter.zeitraum")}
                        </span>
                        <PeriodPicker
                          value={periodInvoices}
                          onChange={(v) => {
                            setPeriodInvoices(v);
                            setPageBelege(1);
                          }}
                          className="h-9 w-full justify-between border border-input bg-background px-3 py-2 text-left text-sm font-normal text-foreground shadow-none hover:bg-background"
                          contentClassName="w-[var(--radix-popover-trigger-width)]"
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.fehlend.col.gesellschaft")}
                        </span>
                        <Combobox
                          value={fGesellschaftBelege}
                          onValueChange={(v) => {
                            setFGesellschaftBelege(v);
                            setPageBelege(1);
                          }}
                          className="w-full shadow-none"
                          options={gesellschaftOptionen}
                        />
                      </label>
                      {/* Receipts that can never leave this list on their own: no gross amount to
                        measure coverage against, a credit note, or paid privately. Kept reachable
                        as a filter toggle, not dropped: an exclusion nobody can see is
                        indistinguishable from a bug, the same rule the whitelisted transactions on
                        tab B already follow. */}
                      {blockierteBelege.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/50 p-2">
                          <Checkbox
                            checked={zeigeBlockiert}
                            onCheckedChange={(v) => {
                              setZeigeBlockiert(v === true);
                              setPageBelege(1);
                            }}
                          />
                          <span className="text-sm text-foreground">
                            {t("offenePosten.blocker.anzeigen", { count: blockierteBelege.length })}
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {belegeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {fBelegeTyp !== "alle" && (
                <FilterChip
                  label={t(
                    fBelegeTyp === "incoming"
                      ? "offenePosten.belege.filter.incoming"
                      : "offenePosten.belege.filter.outgoing",
                  )}
                  onClear={() => {
                    setFBelegeTyp("alle");
                    setPageBelege(1);
                  }}
                />
              )}
              {fGesellschaftBelege !== ALLE_GESELLSCHAFTEN && (
                <FilterChip
                  label={
                    gesellschaftOptionen.find((o) => o.value === fGesellschaftBelege)?.label ??
                    fGesellschaftBelege
                  }
                  onClear={() => {
                    setFGesellschaftBelege(ALLE_GESELLSCHAFTEN);
                    setPageBelege(1);
                  }}
                />
              )}
              {zeigeBlockiert && (
                <FilterChip
                  label={t("offenePosten.blocker.anzeigen", { count: blockierteBelege.length })}
                  onClear={() => {
                    setZeigeBlockiert(false);
                    setPageBelege(1);
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
                count={offenePostenRows.length}
                onClick={() => setTab("belege")}
              >
                {t("offenePosten.tab.belege")}
              </TabButton>
              <TabButton
                active
                count={fehlendQ.isPending ? undefined : fehlendTotal}
                onClick={() => setTab("fehlend")}
              >
                {t("offenePosten.tab.fehlend")}
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
                  value={fGegenpartei}
                  onChange={(e) => {
                    setFGegenpartei(e.target.value);
                    setPageFehlend(1);
                  }}
                  placeholder={t("offenePosten.fehlend.gegenparteiPlaceholder")}
                  aria-label={t("offenePosten.fehlend.gegenparteiPlaceholder")}
                  className="h-9 w-full shadow-none"
                />
                {fGegenpartei.trim() !== "" && fehlendQ.isFetching && (
                  <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterTriggerButton count={fehlendFilterCount} />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[280px] overflow-hidden p-0 shadow-xl sm:w-[520px]"
                >
                  <div className="h-1 bg-primary" />
                  <div className="p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {t("offenePosten.filterButton")}
                      </span>
                      <div className="flex items-center gap-3">
                        {filterAktivFehlend && (
                          <button
                            type="button"
                            onClick={fehlendFilterZuruecksetzen}
                            className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            {t("offenePosten.filterZuruecksetzen")}
                          </button>
                        )}
                        <PopoverClose
                          aria-label={t("offenePosten.filterSchliessen")}
                          className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-4" />
                        </PopoverClose>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.fehlend.col.richtung")}
                        </span>
                        <Combobox
                          value={fFehlendRichtung}
                          onValueChange={(v) => {
                            setFFehlendRichtung(v as "alle" | "eingehend" | "ausgehend");
                            setPageFehlend(1);
                          }}
                          className="w-full shadow-none"
                          options={[
                            {
                              value: "alle",
                              label: t("offenePosten.fehlend.filter.alleRichtungen"),
                            },
                            {
                              value: "eingehend",
                              label: t("offenePosten.fehlend.filter.eingehend"),
                            },
                            {
                              value: "ausgehend",
                              label: t("offenePosten.fehlend.filter.ausgehend"),
                            },
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("belege.list.filter.zeitraum")}
                        </span>
                        <PeriodPicker
                          value={periodTransactions}
                          onChange={(v) => {
                            setPeriodTransactions(v);
                            setPageFehlend(1);
                          }}
                          className="h-9 w-full justify-between border border-input bg-background px-3 py-2 text-left text-sm font-normal text-foreground shadow-none hover:bg-background"
                          contentClassName="w-[var(--radix-popover-trigger-width)]"
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.fehlend.col.quelle")}
                        </span>
                        <Combobox
                          value={fQuelle}
                          onValueChange={(v) => {
                            setFQuelle(v);
                            setPageFehlend(1);
                          }}
                          className="w-full shadow-none"
                          options={quelleOptionen}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("offenePosten.fehlend.col.gesellschaft")}
                        </span>
                        <Combobox
                          value={fGesellschaftFehlend}
                          onValueChange={(v) => {
                            setFGesellschaftFehlend(v);
                            setPageFehlend(1);
                          }}
                          className="w-full shadow-none"
                          options={gesellschaftOptionen}
                        />
                      </label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {fehlendFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {fFehlendRichtung !== "alle" && (
                <FilterChip
                  label={t(
                    fFehlendRichtung === "eingehend"
                      ? "offenePosten.fehlend.filter.eingehend"
                      : "offenePosten.fehlend.filter.ausgehend",
                  )}
                  onClear={() => {
                    setFFehlendRichtung("alle");
                    setPageFehlend(1);
                  }}
                />
              )}
              {fQuelle !== ALLE_QUELLEN && (
                <FilterChip
                  label={t(`offenePosten.fehlend.quelle.${fQuelle}`, { defaultValue: fQuelle })}
                  onClear={() => {
                    setFQuelle(ALLE_QUELLEN);
                    setPageFehlend(1);
                  }}
                />
              )}
              {fGesellschaftFehlend !== ALLE_GESELLSCHAFTEN && (
                <FilterChip
                  label={
                    gesellschaftOptionen.find((o) => o.value === fGesellschaftFehlend)?.label ??
                    fGesellschaftFehlend
                  }
                  onClear={() => {
                    setFGesellschaftFehlend(ALLE_GESELLSCHAFTEN);
                    setPageFehlend(1);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div data-tour="reconcile-list">
        {tab === "belege" ? (
          offenQ.isError ||
          blockiertQ.isError ||
          outgoingInvoicesQ.isError ||
          outgoingAllocationsQ.isError ? (
            <div className="mt-4">
              <ErrorState
                error={
                  offenQ.error ??
                  blockiertQ.error ??
                  outgoingInvoicesQ.error ??
                  outgoingAllocationsQ.error
                }
                onRetry={() => {
                  offenQ.refetch();
                  blockiertQ.refetch();
                  outgoingInvoicesQ.refetch();
                  outgoingAllocationsQ.refetch();
                }}
              />
            </div>
          ) : offenQ.isLoading ||
            blockiertQ.isLoading ||
            outgoingInvoicesQ.isLoading ||
            outgoingAllocationsQ.isLoading ? (
            <div className="mt-4">
              <TableSkeleton rows={6} cols={8} />
            </div>
          ) : offenePostenRows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t(
                  zeigeBlockiert
                    ? "offenePosten.blocker.emptyTitle"
                    : engFilterBelege
                      ? "offenePosten.belege.gefiltertEmptyTitle"
                      : fBelegeTyp === "outgoing"
                        ? "offenePosten.ausgangsrechnungen.emptyTitle"
                        : fBelegeTyp === "incoming"
                          ? "offenePosten.belege.emptyTitle"
                          : "offenePosten.emptyTitle",
                )}
                hint={t(
                  zeigeBlockiert
                    ? "offenePosten.blocker.emptyHint"
                    : engFilterBelege
                      ? "offenePosten.belege.gefiltertEmptyHint"
                      : fBelegeTyp === "outgoing"
                        ? "offenePosten.ausgangsrechnungen.emptyHint"
                        : fBelegeTyp === "incoming"
                          ? "offenePosten.belege.emptyHint"
                          : "offenePosten.emptyHint",
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
                        spalte="gegenpartei"
                        aktiv={sortBelege}
                        dir={dirBelege}
                        onSort={sortiereNach}
                      >
                        {t("offenePosten.col.gegenpartei")}
                      </SortHeader>
                      <TableHead>{t("offenePosten.belege.col.nr")}</TableHead>
                      <SortHeader
                        spalte="betrag"
                        aktiv={sortBelege}
                        dir={dirBelege}
                        onSort={sortiereNach}
                        className="text-right"
                      >
                        {t("offenePosten.belege.col.betrag")}
                      </SortHeader>
                      <SortHeader
                        spalte="rechnungsdatum"
                        aktiv={sortBelege}
                        dir={dirBelege}
                        onSort={sortiereNach}
                      >
                        {t("offenePosten.belege.col.rechnungsdatum")}
                      </SortHeader>
                      <SortHeader
                        spalte="faellig"
                        aktiv={sortBelege}
                        dir={dirBelege}
                        onSort={sortiereNach}
                      >
                        {t("offenePosten.belege.col.faelligAlter")}
                      </SortHeader>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {belegeSeite.map((row) => (
                      <TableRow
                        key={`${row.type}-${row.id}`}
                        className="cursor-pointer"
                        onClick={(e) => oeffneBeleg(row, e)}
                      >
                        <TableCell className="max-w-[180px] truncate text-sm font-medium text-foreground sm:max-w-[300px]">
                          <div className="flex items-center gap-2.5">
                            {row.blocker && <BlockerBadge blocker={row.blocker} />}
                            <GegenparteiLink row={row} />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.nr ?? "—"}
                        </TableCell>
                        {/* A part-paid invoice stays on this list, so the row has to say what is
                          still owed rather than just the original total. */}
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatEUR(row.betrag)}
                          {row.matched > 0.01 && (
                            <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                              {t("offenePosten.belege.restOffen", {
                                rest: formatEUR(
                                  Math.max(Math.abs(row.betrag ?? 0) - row.matched, 0),
                                ),
                                bezahlt: formatEUR(row.matched),
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {formatDate(row.rechnungsdatum)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          <FaelligZelle row={row} heute={heute} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {!row.blocker && (
                            <Button
                              size="sm"
                              variant="link"
                              className="h-7 gap-1 px-0 font-medium"
                              onClick={() => oeffneMatchPanelFuerBeleg(row)}
                            >
                              {t("offenePosten.belege.verknuepfen")}
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
                {belegeSeite.map((row) => (
                  <div
                    key={`${row.type}-${row.id}`}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={(e) => oeffneBeleg(row, e)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <TypBadge type={row.type} />
                        {row.blocker && <BlockerBadge blocker={row.blocker} />}
                      </div>
                      <GesellschaftChip code={gesellschaftById.get(row.companyId ?? "")?.code} />
                    </div>

                    <div className="mt-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          <GegenparteiLink row={row} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{row.nr ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                        {formatEUR(row.betrag)}
                        {row.matched > 0.01 && (
                          <span className="block text-[0.7rem] font-normal leading-tight text-amber-700">
                            {t("offenePosten.belege.restOffen", {
                              rest: formatEUR(Math.max(Math.abs(row.betrag ?? 0) - row.matched, 0)),
                              bezahlt: formatEUR(row.matched),
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="tabular-nums text-muted-foreground">
                        {formatDate(row.rechnungsdatum)}
                      </span>
                      <FaelligZelle row={row} heute={heute} />
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
                          onClick={() => oeffneMatchPanelFuerBeleg(row)}
                        >
                          {t("offenePosten.belege.verknuepfen")}
                          <ChevronRight />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        ) : fehlendQ.isError ? (
          <div className="mt-4">
            <ErrorState error={fehlendQ.error} onRetry={() => fehlendQ.refetch()} />
          </div>
        ) : fehlendQ.isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={6} cols={8} />
          </div>
        ) : fehlendRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t(
                filterAktivFehlend
                  ? "offenePosten.fehlend.gefiltertEmptyTitle"
                  : "offenePosten.fehlend.emptyTitle",
              )}
              hint={t(
                filterAktivFehlend
                  ? "offenePosten.fehlend.gefiltertEmptyHint"
                  : "offenePosten.fehlend.emptyHint",
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
                    <FehlendSortHeader
                      spalte="datum"
                      aktiv={sortFehlend}
                      dir={dirFehlend}
                      onSort={sortiereFehlendNach}
                    >
                      {t("offenePosten.fehlend.col.datum")}
                    </FehlendSortHeader>
                    <TableHead className="w-[110px]">
                      {t("offenePosten.fehlend.col.quelle")}
                    </TableHead>
                    <TableHead>{t("offenePosten.fehlend.col.gesellschaft")}</TableHead>
                    <FehlendSortHeader
                      spalte="gegenkonto"
                      aktiv={sortFehlend}
                      dir={dirFehlend}
                      onSort={sortiereFehlendNach}
                    >
                      {t("offenePosten.fehlend.col.gegenkonto")}
                    </FehlendSortHeader>
                    <TableHead>{t("offenePosten.fehlend.col.verwendungszweck")}</TableHead>
                    <FehlendSortHeader
                      spalte="betrag"
                      aktiv={sortFehlend}
                      dir={dirFehlend}
                      onSort={sortiereFehlendNach}
                      className="text-right"
                    >
                      {t("offenePosten.fehlend.col.betrag")}
                    </FehlendSortHeader>
                    <TableHead className="w-[64px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fehlendSeite.map((txn) => (
                    <TableRow
                      key={txn.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a")) return;
                        navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } });
                      }}
                    >
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatDate(txn.booking_date)}
                      </TableCell>
                      <TableCell>
                        <QuelleChip source={txn.source} />
                      </TableCell>
                      <TableCell>
                        <GesellschaftChip code={gesellschaftById.get(txn.company_id ?? "")?.code} />
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm font-medium text-foreground sm:max-w-[220px]">
                        {/* A real link, so the row is reachable by keyboard and openable in a new tab
                          The row's own onClick is a mouse convenience on top of it, not the only
                          way in. */}
                        <Link
                          to="/banktransaktionen/$id"
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
                            <KategorieZelle txn={txn} />
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
                            {t("offenePosten.fehlend.restOffen", {
                              rest: formatEUR(offenerRest(txn)),
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
                            {t("offenePosten.fehlend.belegFinden")}
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
              {fehlendSeite.map((txn) => {
                const allocated =
                  (txn.amount < 0 ? allocatedByTxn : outgoingAllocatedByTxn).get(txn.id) ?? 0;
                return (
                  <div
                    key={txn.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a")) return;
                      navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } });
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <QuelleChip source={txn.source} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(txn.booking_date)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          <Link
                            to="/banktransaktionen/$id"
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
                            {t("offenePosten.fehlend.restOffen", {
                              rest: formatEUR(Math.max(Math.abs(txn.amount) - allocated, 0)),
                              matched: formatEUR(allocated),
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <GesellschaftChip code={gesellschaftById.get(txn.company_id ?? "")?.code} />
                      {txn.amount < 0 && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <KategorieZelle txn={txn} />
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
                        {t("offenePosten.fehlend.belegFinden")}
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
          from={von}
          to={bis}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPageBelege(1);
            setPageFehlend(1);
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
function suchtextFuer(teile: (string | number | null | undefined)[]): string {
  const stuecke: string[] = [];
  for (const teil of teile) {
    if (teil == null || teil === "") continue;
    if (typeof teil === "number") {
      const roh = Math.abs(teil).toFixed(2);
      stuecke.push(roh, roh.replace(".", ","));
      continue;
    }
    stuecke.push(teil);
  }
  return stuecke.join(" ").toLowerCase();
}

/** Search terms, lower-cased, with the thousands separators a typed amount usually carries. */
function normalisiereSuche(eingabe: string): string[] {
  return eingabe
    .toLowerCase()
    .split(/\s+/)
    .map((teil) => teil.replace(/\.(?=\d{3}\b)/g, "").trim())
    .filter(Boolean);
}

function vergleicheText(a: string, b: string): number {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

/** Nulls sort last in BOTH directions. An empty cell is never the most urgent thing on the list. */
function vergleicheDatum(a: string | null, b: string | null, dir: SortDir): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function sortiereBelege(
  rows: OpenInvoiceRow[],
  spalte: BelegeSort,
  dir: SortDir,
): OpenInvoiceRow[] {
  const kopie = [...rows];
  kopie.sort((a, b) => {
    switch (spalte) {
      case "gegenpartei": {
        const v = vergleicheText(a.gegenpartei, b.gegenpartei);
        return dir === "asc" ? v : -v;
      }
      case "betrag": {
        // By what is STILL OPEN, not the original total. That is the figure the column shows for a
        // part-paid row and the one somebody sorting by size is after.
        const ra = Math.max(Math.abs(a.betrag ?? 0) - a.matched, 0);
        const rb = Math.max(Math.abs(b.betrag ?? 0) - b.matched, 0);
        return dir === "asc" ? ra - rb : rb - ra;
      }
      case "eingang":
        return vergleicheDatum(a.datum, b.datum, dir);
      case "rechnungsdatum":
        return vergleicheDatum(a.rechnungsdatum, b.rechnungsdatum, dir);
      case "faellig":
      default:
        // The same fallback the cell renders, so the order can never contradict what is on screen.
        return vergleicheDatum(dringlichkeitsDatum(a), dringlichkeitsDatum(b), dir);
    }
  });
  return kopie;
}

// ---- Row-level pieces ----

/** Why a receipt is on the "cannot be reconciled" list rather than the open one. */
function BlockerBadge({ blocker }: { blocker: OpenItemBlocker }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
      title={t(`offenePosten.blocker.hint.${blocker}`)}
    >
      {t(`offenePosten.blocker.label.${blocker}`)}
    </span>
  );
}

function TypBadge({ type }: { type: "incoming" | "outgoing" }) {
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
          ? "offenePosten.belege.filter.incoming"
          : "offenePosten.belege.filter.outgoing",
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
function GegenparteiLink({ row }: { row: OpenInvoiceRow }) {
  const { t } = useTranslation();
  const klasse =
    "rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (row.type === "incoming") {
    // A matched supplier opens the supplier record; a free-text issuer with no supplier row has
    // nowhere else to go, so it still opens the invoice, same as clicking anywhere else in the row.
    if (row.supplierId) {
      return (
        <Link to="/lieferanten/$id" params={{ id: row.supplierId }} className={klasse}>
          {row.gegenpartei}
        </Link>
      );
    }
    return (
      <Link to="/eingangsrechnungen/$nr" params={{ nr: row.id }} className={klasse}>
        {row.gegenpartei}
      </Link>
    );
  }
  // An outgoing invoice has no detail page in this Hub, so its file is only reachable from the
  // Ausgangsrechnungen list. Said out loud instead of leaving a row that looks like its neighbours
  // and does nothing when clicked.
  return (
    <Link to="/ausgangsrechnungen" className={klasse} title={t("offenePosten.belege.zurListe")}>
      {row.gegenpartei}
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
function FaelligZelle({ row, heute }: { row: OpenInvoiceRow; heute: string }) {
  const { t } = useTranslation();
  const d = dringlichkeit(row, heute);

  // A plain "overdue or not" cell, matching the mockup's binary Due column -- gated on a REAL due
  // date being past (d.ueberfaellig), not just "old" (d.stufe): a due-date-less receipt sitting
  // for months is a different claim than a missed contractual date, and showing "overdue" for both
  // would overclaim the one nobody actually promised. The real due date, days overdue, or how long
  // a due-date-less receipt has been open -- all still computed by dringlichkeit() and still
  // sortable via dringlichkeitsDatum -- surfaces on hover instead of cluttering the cell.
  const detail =
    d.tage == null
      ? undefined
      : row.faellig
        ? t(
            d.ueberfaellig
              ? "offenePosten.belege.ueberfaelligTage"
              : "offenePosten.belege.faelligAm",
            { count: d.tage, datum: formatDate(row.faellig) },
          )
        : t("offenePosten.belege.offenSeit", { count: d.tage });

  const skonto = row.skonto;
  const bucket = dueBucket(row.faellig, heute);
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
          {t(`offenePosten.due.short.${bucket}`)}
        </span>
      ) : (
        <span className="text-muted-foreground" title={detail}>
          —
        </span>
      )}
      {skonto && skonto.state !== "lapsed" && (
        <span
          className={cn(
            "text-[11px] font-medium whitespace-nowrap",
            skonto.state === "closing" ? "text-emerald-700" : "text-muted-foreground",
          )}
          title={t("offenePosten.skonto.title", {
            prozent: skonto.percent ?? 0,
            datum: formatDate(skonto.deadline),
          })}
        >
          {t("offenePosten.skonto.badge", {
            prozent: skonto.percent ?? 0,
            betrag: formatEUR(skonto.saving ?? 0),
          })}
        </span>
      )}
    </span>
  );
}

const KEIN_CATEGORY = "__none";

// Category of a transaction with no receipt (migration 0057): category_id/category_source are
// real, persisted columns now (auto-set by the categorize trigger, never overwriting a human
// value) — read straight off the already-loaded row, no extra query per cell. Always editable:
// the briefing's "learning system" asks for automatic categorization, not a suggestion a human has
// to separately act on, so the correction path has to be right here too.
function KategorieZelle({ txn }: { txn: BankTransaction }) {
  const { t } = useTranslation();
  const categoriesQ = useBwaCategories();
  // Memoized fallback: `?? []` alone mints a fresh array every render while categoriesQ.data is
  // still undefined, which would invalidate useCategoryOptions' own memo on every render too.
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const categoryOptions = useCategoryOptions(categories);
  const setCategory = useSetTransactionCategory();

  return (
    <div className="flex items-center gap-1.5">
      <Combobox
        value={txn.category_id ?? KEIN_CATEGORY}
        disabled={setCategory.isPending}
        onValueChange={(v) => {
          const categoryId = v === KEIN_CATEGORY ? null : v;
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
                      ? "offenePosten.fehlend.kategorieGesetzt"
                      : "offenePosten.fehlend.kategorieEntfernt",
                  ),
                ),
              onError: (e) =>
                toast.error(t("offenePosten.fehlend.kategorieFehler", { error: fehlerText(e) })),
            },
          );
        }}
        options={[
          { value: KEIN_CATEGORY, label: t("offenePosten.fehlend.kategorieOhne") },
          ...categoryOptions,
        ]}
        placeholder={t("offenePosten.fehlend.kategoriePlaceholder")}
        className="h-7 w-auto min-w-[150px] px-2 py-1 text-xs"
      />
      {txn.category_source === "rule" && (
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          title={t("offenePosten.fehlend.kategorieRegelHint")}
        >
          {t("offenePosten.fehlend.kategorieRegel")}
        </span>
      )}
    </div>
  );
}

/** A clickable column header. Mirrors the one on the Banktransaktionen list. */
function SortHeader({
  spalte,
  aktiv,
  dir,
  onSort,
  className,
  children,
}: {
  spalte: BelegeSort;
  aktiv: BelegeSort;
  dir: SortDir;
  onSort: (spalte: BelegeSort) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const istAktiv = aktiv === spalte;
  return (
    <TableHead
      className={className}
      aria-sort={istAktiv ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(spalte)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // The arrow sits to the RIGHT of the label in every column, including the right-aligned
          // ones. Mirroring the row for those put it on the left, so the same control changed sides
          // halfway across the header.
          className?.includes("text-right") && "w-full justify-end",
        )}
      >
        {children}
        <SortIcon aktiv={istAktiv} dir={dir} />
      </button>
    </TableHead>
  );
}

function FehlendSortHeader({
  spalte,
  aktiv,
  dir,
  onSort,
  className,
  children,
}: {
  spalte: FehlendSort;
  aktiv: FehlendSort;
  dir: SortDir;
  onSort: (spalte: FehlendSort) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const istAktiv = aktiv === spalte;
  return (
    <TableHead
      className={className}
      aria-sort={istAktiv ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(spalte)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // The arrow sits to the RIGHT of the label in every column, including the right-aligned
          // ones. Mirroring the row for those put it on the left, so the same control changed sides
          // halfway across the header.
          className?.includes("text-right") && "w-full justify-end",
        )}
      >
        {children}
        <SortIcon aktiv={istAktiv} dir={dir} />
      </button>
    </TableHead>
  );
}

function SortIcon({ aktiv, dir }: { aktiv: boolean; dir: SortDir }) {
  if (!aktiv) return <ArrowUpDown className="size-3.5 opacity-40" />;
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
      {t("offenePosten.filterButton")}
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
        aria-label={t("offenePosten.filterChipEntfernen")}
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

function QuelleChip({ source }: { source: string | null | undefined }) {
  const { t } = useTranslation();
  if (!source) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = QUELLE_ICON[source];
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {Icon && <Icon className="size-3 shrink-0" />}
      {t(`offenePosten.fehlend.quelle.${source}`, { defaultValue: source })}
    </span>
  );
}
