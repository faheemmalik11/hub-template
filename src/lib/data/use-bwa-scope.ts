// Shared BWA (Cost Analysis) scope computation — extracted from src/routes/auswertungen/index.tsx
// so the dashboard's Gross Profit tile and the Cost Analysis page itself compute the SAME number
// off the SAME logic, rather than two implementations that can silently drift. The client
// explicitly compares Gross Profit against his real DATEV BWA (see bwa-skeleton.ts's own header),
// so a dashboard shortcut that approximates this differently would be worse than showing nothing.
//
// Pure filtering/bucketing logic only, no rendering. src/routes/auswertungen/index.tsx still owns
// the drilldown UI (category -> item grouping) and the VAT/Offene-Posten KPIs, which are not part
// of what "gross profit" needs.

import { useMemo } from "react";

import { useTranslation } from "@/lib/i18n";
import {
  useDocumentsForCostAnalysis,
  type CostAnalysisDocument,
  useCostAnalysisCategories,
  useConfirmedAllocations,
  useConfirmedMatchAccounts,
  useConfirmedOutgoingAllocations,
  useCompanies,
  useManualBookings,
  useProperties,
  useOutgoingInvoices,
} from "@/data";
import { coveredAmount, isFullyCovered } from "@/lib/data/format";
import {
  computeCostAnalysisSkeleton,
  type CostAnalysisLineInput,
  type CostAnalysisSkeletonComputed,
} from "@/lib/data/bwa-skeleton";
import type {
  CostAnalysisCategory,
  OutgoingInvoice,
  OutgoingVoucherStatus,
} from "@/lib/data/types";

export type BookingBasis = "invoice_date" | "payment_date";

export function bookingBasisForCode(
  companyCode: string | null,
  basisByCode: Map<string, BookingBasis>,
): BookingBasis {
  if (!companyCode) return "payment_date";
  return basisByCode.get(companyCode) ?? "payment_date";
}

// The one date that decides which period an invoice falls into (Briefing Screen 10): invoice/
// service date for accrual-accounting companies, the actual bank-matched payment date for
// surplus-accounting ones (migration 0041). Null means "can't be bucketed under the active basis"
// (e.g. a payment-date company whose invoice, despite being fully matched, has no paid_at yet) —
// never silently defaulted to a different date.
export function bookingDateFor(
  b: CostAnalysisDocument,
  basisByCode: Map<string, BookingBasis>,
): string | null {
  const basis = bookingBasisForCode(b.company_code, basisByCode);
  if (basis === "invoice_date") return b.document_date ?? b.service_date ?? null;
  return b.paid_at ? b.paid_at.slice(0, 10) : null;
}

// Revenue mirror of bookingDateFor: invoice/service date for accrual companies (invoice_date is the
// outgoing equivalent of document_date), the confirmed bank match's date for payment-date companies.
// Outgoing invoices have no paid_at-equivalent field, so the match's own confirmed_at is used as the
// closest available proxy for "when we recognized the payment" (disclosed simplification).
export function outgoingBookingDateFor(
  oi: OutgoingInvoice,
  companyCodeById: Map<string, string>,
  basisByCode: Map<string, BookingBasis>,
  confirmedAtByInvoice: Map<string, string>,
): string | null {
  const code = companyCodeById.get(oi.company_id) ?? null;
  const basis = bookingBasisForCode(code, basisByCode);
  if (basis === "invoice_date") return oi.invoice_date ?? null;
  const confirmedAt = confirmedAtByInvoice.get(oi.id);
  return confirmedAt ? confirmedAt.slice(0, 10) : null;
}

// The COARSE category code a category (coarse or fine) rolls up to — what BWA_SKELETON's
// categoryCodes actually key on (fine tags share their parent's report_line, not their own code).
export function coarseCategoryCode(
  categoryId: string | null,
  categoriesById: Map<string, CostAnalysisCategory>,
): string | null {
  if (!categoryId) return null;
  const cat = categoriesById.get(categoryId);
  if (!cat) return null;
  if (!cat.parent_id) return cat.code;
  return categoriesById.get(cat.parent_id)?.code ?? cat.code;
}

// One line item feeding the P&L skeleton — a matched receipt, a manual booking, or a matched
// outgoing invoice (revenue, migration 0045), already resolved to its evaluation amount and
// category. A revenue item never has belegId/categoryId (outgoing invoices carry no fine
// category); it carries the LexOffice voucher instead, since there is no in-app detail page.
export interface CostAnalysisScopeItem {
  documentId?: string;
  manualBookingSourceId?: string;
  outgoingInvoiceId?: string;
  // null for source='upload' outgoing invoices (migration 20260806120000) — no LexOffice voucher
  // exists for those at all, distinct from "not an outgoing invoice at all" (undefined).
  lexofficeVoucherId?: string | null;
  lexofficeStatus?: OutgoingVoucherStatus;
  amount: number;
  categoryId: string | null;
  label: string;
  date: string | null;
}

// null = no filter on that dimension. `companyCodes` covers both a single company and the
// IMKO/IMGM combined-view sentinel the Cost Analysis page's own combobox offers — both just
// narrow to a set of codes, so the hook only needs to know the set, not the UI's own labels for it.
/**
 * Whether a figure is booked net or gross.
 *
 * Net is the standard and the default: VAT is a pass-through item and belongs in no evaluation
 * line, so 1.190 € gross counts as 1.000 €. The briefing asks for this to be SWITCHABLE rather
 * than hard-wired, because a company that cannot reclaim its input tax genuinely bears the gross
 * amount, and the VAT total is reported separately either way.
 *
 * Net already adds back the share of VAT that is NOT deductible (migration 0031's generated
 * columns resolve that per invoice), so "net" is not a blanket 19% haircut.
 */
export type CostAnalysisAmountBasis = "net" | "gross";

export interface CostAnalysisScopeFilter {
  companyCodes: string[] | null;
  propertyCode: string | null;
  categoryId: string | null;
  accountId: string | null;
  fromDate: string | null;
  toDate: string | null;
  /** Defaults to "net" when omitted, so every existing caller keeps the standard treatment. */
  basis?: CostAnalysisAmountBasis;
}

// The default, unfiltered scope — every company, every property/category/account, all time. This
// is deliberately what the Cost Analysis page itself shows before anyone touches a filter, so the
// dashboard tile that also uses this default is guaranteed to agree with a freshly opened Cost
// Analysis page, not an independently chosen "current year" or similar that the page doesn't
// default to.
export const COSTANALYSIS_SCOPE_ALL: CostAnalysisScopeFilter = {
  companyCodes: null,
  propertyCode: null,
  categoryId: null,
  accountId: null,
  fromDate: null,
  toDate: null,
};

export interface CostAnalysisScopeResult {
  isLoading: boolean;
  // Whether ANY query behind the figures failed. Without this a caller cannot tell a real 0,00 €
  // from "the request failed and the reducers ran over empty arrays", which is how the Overview tile
  // ended up stating a confident zero it had no basis for. See the exhaustive list at the bottom of
  // the hook — this deliberately covers every query, not just the cost side's four.
  isError: boolean;
  // The first failing query's error, and a retry that refetches every query behind the figures —
  // so a caller can render one honest ErrorState instead of picking one query to speak for all nine.
  error: unknown;
  refetch: () => void;
  documentItems: CostAnalysisScopeItem[];
  notBucketedCount: number;
  vatUnresolvedCount: number;
  /** Those same receipts, so the disclosure can list and open them. */
  vatUnresolvedItems: CostAnalysisScopeItem[];
  // EUR total of the VAT sitting on receipts whose deductibility is still unresolved, so the card can
  // account for its own headline instead of implying a 0/0 split (see the counter's own comment).
  vatUnresolvedAmount: number;
  // Matched receipts booked at GROSS because no net amount was extracted — the cost-side mirror of
  // revenueNetUnknownCount. Disclosed rather than silently absorbed.
  costNetUnknownCount: number;
  vatAmountTotal: number;
  vatDeductibleTotal: number;
  vatNondeductibleTotal: number;
  revenueItems: CostAnalysisScopeItem[];
  revenueNotBucketedCount: number;
  revenueExcludedByDimensionFilter: number;
  revenueNetUnknownCount: number;
  manualItems: CostAnalysisScopeItem[];
  manualExcludedByAccountFilter: number;
  // Distinct manual-booking months (YYYY-MM-DD), unaffected by the active filters — for building a
  // period picker that reflects all the data, not just the receipts.
  manualPeriods: string[];
  // True when a property or account filter dropped revenue that would otherwise have counted.
  // Outgoing invoices carry no property and no matched-account lookup, so those two filters remove
  // ALL revenue — which turns "Rohertrag" into a cost-only figure while it keeps its name. Callers
  // must not present gross profit as a gross profit while this is true.
  revenueSuppressedByFilter: boolean;
  combined: CostAnalysisScopeItem[];
  computed: CostAnalysisSkeletonComputed;
  rowByKey: Map<string, CostAnalysisSkeletonComputed["rows"][number]>;
  categoriesById: Map<string, CostAnalysisCategory>;
}

// Everything src/routes/auswertungen/index.tsx needs to compute its P&L skeleton (Gross Profit,
// Operating Gross Profit, etc.), parameterized by scope instead of hardcoded to that page's own
// filter state. Matched-and-fully-covered receipts/outgoing-invoices only ("no figure without a
// match", Briefing Screen 10), bucketed by each company's own booking-date basis (migration 0041).
export function useCostAnalysisScope(filter: CostAnalysisScopeFilter): CostAnalysisScopeResult {
  const { t } = useTranslation();
  const documentsQ = useDocumentsForCostAnalysis();
  const companiesQ = useCompanies();
  const propertiesQ = useProperties();
  const categoriesQ = useCostAnalysisCategories();
  const allocationsQ = useConfirmedAllocations();
  const matchAccountsQ = useConfirmedMatchAccounts();
  const outgoingInvoicesQ = useOutgoingInvoices();
  const outgoingAllocationsQ = useConfirmedOutgoingAllocations();

  const allDocuments = useMemo(() => documentsQ.data ?? [], [documentsQ.data]);
  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const allOutgoingInvoices = useMemo(() => outgoingInvoicesQ.data ?? [], [outgoingInvoicesQ.data]);

  const basisByCode = useMemo(
    () =>
      new Map<string, BookingBasis>(
        companies.map((g) => [g.code, g.booking_basis ?? "payment_date"]),
      ),
    [companies],
  );
  const companyCodeById = useMemo(() => new Map(companies.map((g) => [g.id, g.code])), [companies]);
  const categoriesById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );
  const propertiesByCode = useMemo(
    () => new Map((propertiesQ.data ?? []).map((o) => [o.code, o])),
    [propertiesQ.data],
  );
  const matchedByInvoice = useMemo(
    () => allocationsQ.data?.byInvoice ?? new Map<string, number>(),
    [allocationsQ.data],
  );
  const matchAccountsByInvoice = useMemo(
    () => matchAccountsQ.data ?? new Map<string, string[]>(),
    [matchAccountsQ.data],
  );
  const outgoingMatchedByInvoice = useMemo(
    () => outgoingAllocationsQ.data?.byInvoice ?? new Map<string, number>(),
    [outgoingAllocationsQ.data],
  );
  const outgoingConfirmedAtByInvoice = useMemo(
    () => outgoingAllocationsQ.data?.confirmedAtByInvoice ?? new Map<string, string>(),
    [outgoingAllocationsQ.data],
  );

  // Omitted means net, which is what every caller but the Cost Analysis screen wants.
  const basis: CostAnalysisAmountBasis = filter.basis ?? "net";

  const companyMatches = (code: string | null) =>
    filter.companyCodes == null ? true : !!code && filter.companyCodes.includes(code);

  const scoped = useMemo(() => {
    const documentItems: CostAnalysisScopeItem[] = [];
    let notBucketedCount = 0;
    let vatUnresolvedCount = 0;
    let vatUnresolvedAmount = 0;
    // The receipts themselves, so the disclosure can be acted on rather than only read. Ids only:
    // the item is built further down the same loop, and duplicating that construction here is how
    // the two would drift.
    const vatUnresolvedIds = new Set<string>();
    let vatAmountTotal = 0;
    let vatDeductibleTotal = 0;
    let vatNondeductibleTotal = 0;
    let costNetUnknownCount = 0;

    for (const b of allDocuments) {
      if (
        !isFullyCovered(
          b.amount_gross,
          coveredAmount(b.amount_gross, matchedByInvoice.get(b.id) ?? 0, !!b.paid_at),
        )
      ) {
        continue;
      }
      if (!companyMatches(b.company_code)) continue;
      if (filter.propertyCode != null && b.property_code !== filter.propertyCode) continue;
      if (filter.categoryId != null) {
        const cat = b.category_id ? categoriesById.get(b.category_id) : null;
        const coarseId = cat ? (cat.parent_id ?? cat.id) : null;
        if (coarseId !== filter.categoryId) continue;
      }
      if (
        filter.accountId != null &&
        !(matchAccountsByInvoice.get(b.id) ?? []).includes(filter.accountId)
      ) {
        continue;
      }

      const date = bookingDateFor(b, basisByCode);
      if (!date) {
        notBucketedCount++;
        continue;
      }
      if (filter.fromDate && date < filter.fromDate) continue;
      if (filter.toDate && date > filter.toDate) continue;

      // VAT is tracked as its own metric, independent of the P&L flow below (Briefing Screen 10:
      // "track VAT separately from costs") — every matched, in-scope receipt counts here, even a
      // NOT_PNL one, since VAT liability doesn't stop at that line's exclusion.
      vatAmountTotal += b.vat_amount ?? 0;
      if (b.vat_deductible_pct != null) {
        vatDeductibleTotal += b.vat_deductible_amount ?? 0;
        vatNondeductibleTotal += b.vat_nondeductible_amount ?? 0;
      } else if ((b.vat_amount ?? 0) !== 0) {
        // A receipt that shows VAT and has no explicit deductibility set counts as FULLY
        // deductible, which is the normal case and what the cost side already assumed: both
        // vat_deductible_amount and vat_nondeductible_amount are generated from
        // vat_deductible_pct, so a null pct makes them null, and the cost falls back to
        // net + 0. Flagging it as unresolved while booking it at net said two different things
        // about the same receipt, and it flagged the ordinary case rather than a problem.
        vatDeductibleTotal += b.vat_amount ?? 0;
      } else if (
        b.vat_amount == null &&
        b.amount_net != null &&
        b.amount_gross != null &&
        b.amount_gross !== b.amount_net
      ) {
        // The one case that genuinely cannot be resolved: gross and net differ, so there IS VAT,
        // but no amount was ever extracted for it. Nothing here can decide how much of it is
        // deductible, and the difference is real money.
        vatUnresolvedCount++;
        vatUnresolvedAmount += b.amount_gross - b.amount_net;
        vatUnresolvedIds.add(b.id);
      }

      // A matched receipt with no extracted net amount used to contribute (0 + 0) = 0,00 € to the
      // P&L — it passed the match gate, was counted as "in scope", and then silently booked nothing.
      // The revenue side already handled the mirror case by falling back to gross AND counting the
      // fallback; the cost side did neither. Same treatment now: fall back to gross, and count it so
      // the page can disclose how many figures rest on a gross-for-net substitution.
      const costNetKnown = b.amount_net != null;
      if (!costNetKnown) costNetUnknownCount++;

      documentItems.push({
        documentId: b.id,
        // Net by default, gross where VAT isn't deductible (Briefing Screen 10) — mechanically
        // just net + whatever share of the VAT is NOT reclaimable (migration 0031's generated
        // columns already resolve that share per invoice, including partial deductibility).
        // Gross mode books the invoice as billed. Net mode books net plus whatever share of the
        // VAT is not reclaimable, falling back to gross when no net was ever extracted.
        amount:
          basis === "gross"
            ? (b.amount_gross ?? 0)
            : costNetKnown
              ? (b.amount_net ?? 0) + (b.vat_nondeductible_amount ?? 0)
              : (b.amount_gross ?? 0),
        categoryId: b.category_id,
        label: b.issuer ?? b.invoice_number ?? "—",
        date,
      });
    }

    return {
      documentItems,
      notBucketedCount,
      vatUnresolvedCount,
      vatUnresolvedAmount,
      vatUnresolvedItems: documentItems.filter(
        (i) => i.documentId && vatUnresolvedIds.has(i.documentId),
      ),
      costNetUnknownCount,
      vatAmountTotal,
      vatDeductibleTotal,
      vatNondeductibleTotal,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allDocuments,
    matchedByInvoice,
    filter.companyCodes,
    filter.propertyCode,
    filter.categoryId,
    filter.accountId,
    filter.fromDate,
    filter.toDate,
    basisByCode,
    categoriesById,
    matchAccountsByInvoice,
    basis,
  ]);

  // The Revenue line's own coarse category id, so the category filter can recognize revenue items —
  // they carry no fine category of their own, only the fixed "REVENUE" code (bwa-skeleton.ts).
  const revenueCategoryId = useMemo(() => {
    for (const c of categoriesById.values()) {
      if (c.code === "REVENUE") return c.id;
    }
    return null;
  }, [categoriesById]);

  // Matched-and-in-scope outgoing invoices feeding the Revenue line (migration 0045) — the same
  // "no figure without a match" gate as the cost side, mirrored for the opposite direction. Two
  // filters this screen has for costs don't apply to outgoing invoices at all: property (no
  // property_code) and account (no confirmed-match-account lookup for this direction yet) — both
  // are treated the same way manual bookings already are under an active account filter: excluded
  // and the exclusion counted, never silently dropped.
  const scopedRevenue = useMemo(() => {
    const items: CostAnalysisScopeItem[] = [];
    let notBucketedCount = 0;
    let excludedByDimensionFilter = 0;
    let netUnknownCount = 0;

    for (const oi of allOutgoingInvoices) {
      if (
        !isFullyCovered(
          oi.amount_gross,
          coveredAmount(
            oi.amount_gross,
            outgoingMatchedByInvoice.get(oi.id) ?? 0,
            oi.status === "paidoff",
          ),
        )
      ) {
        continue;
      }

      const code = companyCodeById.get(oi.company_id) ?? null;
      if (!companyMatches(code)) continue;
      if (filter.propertyCode != null) {
        excludedByDimensionFilter++;
        continue;
      }
      if (filter.accountId != null) {
        excludedByDimensionFilter++;
        continue;
      }
      if (filter.categoryId != null && filter.categoryId !== revenueCategoryId) continue;

      const date = outgoingBookingDateFor(
        oi,
        companyCodeById,
        basisByCode,
        outgoingConfirmedAtByInvoice,
      );
      if (!date) {
        notBucketedCount++;
        continue;
      }
      if (filter.fromDate && date < filter.fromDate) continue;
      if (filter.toDate && date > filter.toDate) continue;

      // Net, same convention as costs: VAT collected on the customer's behalf is a liability, not
      // revenue (Briefing Screen 10's "VAT is a pass-through item" applied symmetrically here).
      const netKnown = oi.amount_net != null;
      if (!netKnown) netUnknownCount++;

      items.push({
        outgoingInvoiceId: oi.id,
        lexofficeVoucherId: oi.lexoffice_voucher_id,
        lexofficeStatus: oi.status,
        amount:
          basis === "gross" ? (oi.amount_gross ?? 0) : (oi.amount_net ?? oi.amount_gross ?? 0),
        categoryId: null,
        label: oi.customers?.name ?? oi.invoice_number ?? "—",
        date,
      });
    }

    return { items, notBucketedCount, excludedByDimensionFilter, netUnknownCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allOutgoingInvoices,
    outgoingMatchedByInvoice,
    filter.companyCodes,
    filter.propertyCode,
    filter.categoryId,
    filter.accountId,
    filter.fromDate,
    filter.toDate,
    companyCodeById,
    basisByCode,
    outgoingConfirmedAtByInvoice,
    revenueCategoryId,
    basis,
  ]);

  // Manual bookings (Screen 11) span the active period filter so nothing is cut off by an unrelated
  // date filter. With no period filter, that has to mean exactly what it says — no date
  // restriction — rather than silently narrowing to whatever date span the matched receipts happen
  // to cover. Bounded to a generous ~20-year span rather than truly unbounded, because a recurring
  // booking with no end date expands to one row per covered month server-side
  // (manual_bookings_expanded) — an unbounded range would blow that expansion up for no benefit.
  const currentYear = new Date().getFullYear();
  // ALWAYS the wide span, never narrowed to the active filter. Narrowing looked like an
  // optimisation but had two costs: the Cost Analysis period picker is built from the data it can
  // see, so a Hub whose P&L is entirely manual bookings offered no concrete months to pick at all;
  // and the prior-period comparison would have been handed a window its own fetch had excluded.
  // This span is what the unfiltered case already used, so it is not a new worst case — and one
  // stable range means every caller shares a single React Query key instead of refetching per
  // filter change.
  const { effFromDate, effToDate } = useMemo(
    () => ({ effFromDate: `${currentYear - 15}-01-01`, effToDate: `${currentYear + 5}-12-31` }),
    [currentYear],
  );
  const manualBookingsQ = useManualBookings(null, effFromDate, effToDate);

  // Every distinct month a manual booking falls in, unfiltered — the period picker is built from
  // this alongside the receipt/revenue dates, so a manual-booking-only Hub still gets real periods.
  const manualPeriods = useMemo(
    () => [...new Set((manualBookingsQ.data ?? []).map((m) => m.period))],
    [manualBookingsQ.data],
  );

  // Manual items add on equal footing next to receipts (Briefing Screen 11) — same filters, minus
  // the match gate (they never bypass it, they simply never need it: they aren't receipts) and
  // minus the account/IBAN dimension, which they don't carry at all.
  const manualScoped = useMemo(() => {
    const items: CostAnalysisScopeItem[] = [];
    let excludedByAccountFilter = 0;
    for (const m of manualBookingsQ.data ?? []) {
      const code = companyCodeById.get(m.company_id) ?? null;
      if (!companyMatches(code)) continue;

      if (filter.propertyCode != null) {
        const wantedId = propertiesByCode.get(filter.propertyCode)?.id ?? null;
        if (!wantedId || m.property_id !== wantedId) continue;
      }

      if (filter.categoryId != null) {
        const cat = categoriesById.get(m.category_id);
        const coarseId = cat ? (cat.parent_id ?? cat.id) : null;
        if (coarseId !== filter.categoryId) continue;
      }

      if (filter.accountId != null) {
        excludedByAccountFilter++;
        continue;
      }

      // The period filter has to be re-applied HERE, against the booking's own month, and not left
      // to the server RPC alone. manual_bookings_expanded() month-truncates both of its bounds
      // (`b.period between date_trunc('month', p_von) and date_trunc('month', p_bis)`), so a custom
      // sub-month range asks for 12 days and gets the whole month back: verified directly against the
      // RPC, manual_bookings_expanded(null, '2026-08-20', '2026-08-31') returns the 2026-08-01
      // booking. Receipts on the same screen are filtered to the exact day, so without this a custom
      // range mixed exact-date receipts with whole-month manual bookings in one P&L.
      if (filter.fromDate && m.period < filter.fromDate) continue;
      if (filter.toDate && m.period > filter.toDate) continue;

      items.push({
        manualBookingSourceId: m.source_id,
        amount: m.amount,
        categoryId: m.category_id,
        // Prefix the company code: the default view is ALL companies, and a manual booking with no
        // note fell back to a bare "Manuelle Buchung", so two of them in the same bucket rendered as
        // two identical rows with nothing to tell them apart.
        label: [code, m.note ?? t("reports.manuelleBuchung")].filter(Boolean).join(" · "),
        date: m.period,
      });
    }
    return { items, excludedByAccountFilter };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    manualBookingsQ.data,
    filter.companyCodes,
    filter.propertyCode,
    filter.categoryId,
    filter.accountId,
    // von/bis MUST be here: this memo windows manual bookings by date itself, and without these the
    // list is computed once and never re-filtered when only the period changes — a custom range
    // narrowed from 01.–31.08. to 20.–31.08. went on reporting the 01.08. booking. The
    // exhaustive-deps rule is disabled on this memo, so nothing else would have caught it.
    filter.fromDate,
    filter.toDate,
    companyCodeById,
    propertiesByCode,
    categoriesById,
    t,
  ]);

  const combined = useMemo(
    () => [...scoped.documentItems, ...manualScoped.items, ...scopedRevenue.items],
    [scoped.documentItems, manualScoped.items, scopedRevenue.items],
  );

  const computed = useMemo(() => {
    const input: CostAnalysisLineInput[] = combined.map((i) => ({
      // A revenue item has no fine category of its own — it always routes to the fixed "REVENUE"
      // code (bwa-skeleton.ts), never through the category lookup the other two sources use.
      categoryCode: i.outgoingInvoiceId
        ? "REVENUE"
        : coarseCategoryCode(i.categoryId, categoriesById),
      amount: i.amount,
      documentId: i.documentId,
      manualBookingSourceId: i.manualBookingSourceId,
    }));
    return computeCostAnalysisSkeleton(input);
  }, [combined, categoriesById]);

  const rowByKey = useMemo(() => new Map(computed.rows.map((r) => [r.key, r])), [computed.rows]);

  // EVERY query whose result feeds a figure below, not just the four the cost side happens to need.
  // This used to list belege/gesellschaften/categories/allocations only, which meant `isLoading` went
  // false while manual bookings, outgoing invoices and their allocations were still in flight — and a
  // caller gating on it rendered a complete, confident, WRONG P&L for as long as those took (measured
  // at ~3.5s against a local dev server: Rohertrag 0,00 € before, -135,00 € after, with no indicator
  // in between). `isError` had the same gap in the other direction: a failed revenue or manual-booking
  // query left the reducers running over an empty array and the page stating a total it had no basis
  // for. Both lists are now exhaustive; adding a query to this hook means adding it here too.
  const allQueries = [
    documentsQ,
    companiesQ,
    propertiesQ,
    categoriesQ,
    allocationsQ,
    matchAccountsQ,
    outgoingInvoicesQ,
    outgoingAllocationsQ,
    manualBookingsQ,
  ];
  const isLoading = allQueries.some((q) => q.isLoading);
  const isError = allQueries.some((q) => q.isError);
  const error = allQueries.find((q) => q.isError)?.error ?? null;
  const refetch = () => {
    for (const q of allQueries) void q.refetch();
  };

  return {
    isLoading,
    isError,
    error,
    refetch,
    documentItems: scoped.documentItems,
    notBucketedCount: scoped.notBucketedCount,
    vatUnresolvedCount: scoped.vatUnresolvedCount,
    vatUnresolvedItems: scoped.vatUnresolvedItems,
    vatUnresolvedAmount: scoped.vatUnresolvedAmount,
    costNetUnknownCount: scoped.costNetUnknownCount,
    vatAmountTotal: scoped.vatAmountTotal,
    vatDeductibleTotal: scoped.vatDeductibleTotal,
    vatNondeductibleTotal: scoped.vatNondeductibleTotal,
    revenueItems: scopedRevenue.items,
    revenueNotBucketedCount: scopedRevenue.notBucketedCount,
    revenueExcludedByDimensionFilter: scopedRevenue.excludedByDimensionFilter,
    revenueNetUnknownCount: scopedRevenue.netUnknownCount,
    manualItems: manualScoped.items,
    manualExcludedByAccountFilter: manualScoped.excludedByAccountFilter,
    manualPeriods,
    revenueSuppressedByFilter: scopedRevenue.excludedByDimensionFilter > 0,
    combined,
    computed,
    rowByKey,
    categoriesById,
  };
}
