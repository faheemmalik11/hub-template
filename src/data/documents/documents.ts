import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { amountQueryFilter } from "@/data/bank";
import { STALE, actorEmail, sb } from "@/data/client";
import {
  FILE_URL_STALE,
  fetchAllRows,
  hasNextInfinitePage,
  insertVerlauf,
  pflichtGrund,
  searchTokens,
  type InfinitePage,
} from "@/data/shared";
import { belegNachgeprueft } from "@/features/invoice-detail/nachpruefung";
import { supabase } from "@/integrations/supabase/client";
import { getInvoiceFileUrl } from "@/lib/api/invoice-files.functions";
import {
  askInvoiceQuestion,
  type AskInvoiceQuestionResult,
} from "@/lib/api/invoice-nl-ask.functions";
import { createUploadedInvoices } from "@/lib/api/invoice-upload.functions";
import { getTransactionFileUrls } from "@/lib/api/transaction-files.functions";
import type { VoiceRecordingMime } from "@/lib/api/voice-transcription-shared";
import { transcribeVoiceQuery } from "@/lib/api/voice-transcription.functions";
import { GESELLSCHAFT_OHNE, OBJEKT_OHNE, heuteLokal } from "@/lib/data/format";
import { OPEN_ITEM_COLUMNS } from "@/lib/data/types";
import type {
  Beleg,
  BelegDatei,
  BelegeFacets,
  BelegeFilter,
  BelegeKpis,
  BelegeListeParams,
  BelegeSeite,
  BelegListeRow,
  BelegSortKey,
  BelegVerlauf,
  OpenItemRow,
} from "@/lib/data/types";

// Per-company invoice totals for the Gesellschaften list, aggregated by Postgres (view
// v_company_invoice_totals, migration 20260817170000).
//
// The list used to call useBelege() -- every invoice in the system -- purely to group them by
// company and keep two numbers per row. This transfers one row per company instead. The view's WHERE
// clause is an exact copy of useBelege()'s filter; if you change one, change the other, or the list
// and the detail page will quote different totals for the same company.
// ---- Master-data detail invoice lists (company / supplier / property) ----------------------
//
// These three pages all list "the invoices of one X". They used to do it the same wrong way:
// `select("*")` through fetchAllRows, i.e. EVERY matching invoice, every column, in parallel pages
// of 1000, on every page load.
//
// `select("*")` on `invoices` is not a convenience here, it is a payload disaster. The table
// carries `embedding` (a pgvector serialised as a JSON array of ~1500 numbers per row),
// `ocr_fulltext` (the entire OCR text of the document), `fts` (a tsvector) and the `extracted` /
// `validation` / `positions` jsonb blobs. None of it is rendered by any of these pages, and all of
// it travelled on every visit -- megabytes per company where kilobytes do.
//
// The columns below are what these lists actually read off a row. Keep them in step with the
// pages: a column added to a table cell and not to this list renders as undefined, not as an error.

/** What a company's and a supplier's invoice table render. */
const BELEG_ZEILE_SPALTEN =
  "id,invoice_number,issuer,supplier_id,company_code,property_code,document_date,amount_gross,status,payment_method";

/** The property page additionally shows a VAT badge, which needs the rate and the tax lines. */
const BELEG_ZEILE_SPALTEN_UST = `${BELEG_ZEILE_SPALTEN},vat_rate,tax`;

/**
 * The columns the page-level figures are computed from, and nothing else.
 *
 * The header total, the period picker's options, the direct-debit count, the unusual-amount
 * baseline and the foreign-property warning are all computed over the COMPLETE set, so they cannot
 * be derived from one page of rows. This is the minimum that set has to carry: five short scalar
 * columns, which is roughly 50 bytes a row against the many kilobytes a row `select("*")` moved.
 *
 * It is still O(rows). Moving it server-side needs an RPC that reproduces each page's matching rule
 * exactly (`invoices_kpis` will not do: it matches a company by CODE, where these pages match by id
 * with a code fallback, so its totals would disagree with the rows underneath). Until then this is
 * the cheap version of the same answer.
 */
const BELEG_AGGREGAT_SPALTEN =
  "id,document_date,amount_gross,company_code,property_code,payment_method";

export type BelegAggregatZeile = Pick<
  Beleg,
  | "id"
  | "document_date"
  | "amount_gross"
  // Carried for the property page, which compares each invoice's company against the companies the
  // property is actually assigned to. It has to be computed over the COMPLETE set, not one page,
  // so it belongs in this projection rather than in the row query. The company page ignores it;
  // one text column is cheaper than maintaining a second near-identical projection.
  | "company_code"
  | "property_code"
  | "payment_method"
>;

/** How many rows a detail page's invoice table fetches per scroll. */
export const BELEG_SEITEN_GROESSE = 50;

/**
 * The company-matching rule, written once.
 *
 * It mirrors the detail page exactly, including the guard added when a renamed and reused company
 * code leaked another legal entity's documents onto this page: an invoice counts if it is assigned
 * to this company by id, OR if it is assigned to nobody at all and carries this company's code. A
 * code match alone is never enough. The paged query and the aggregate query both call this, so the
 * total in the header cannot come to describe a different set than the rows below it.
 */
function gesellschaftBelegFilter(companyId: string, companyCode: string | null | undefined) {
  const codeTeil = companyCode ? `,and(company_id.is.null,company_code.eq.${companyCode})` : "";
  return `company_id.eq.${companyId}${codeTeil}`;
}

/**
 * One page of a company's invoices, fetched on demand.
 *
 * The date range is a SERVER filter, not a client one: picking a quarter in the period picker now
 * narrows the query rather than fetching everything and hiding most of it.
 */
export function useBelegeFuerGesellschaftSeiten(
  companyId: string,
  companyCode: string | null | undefined,
  range: { von?: string | null; bis?: string | null } = {},
  /**
   * Whether the company row has settled. Without it this fires once by id alone -- while the
   * company, and therefore its code, is still loading -- and then a second time with the code, two
   * round trips per page load for one answer. Same guard useBelegeByProperty carries.
   */
  bereit = true,
) {
  const von = range.von || null;
  const bis = range.bis || null;
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: ["belege-gesellschaft-seiten", companyId, companyCode ?? null, von, bis],
    enabled: !!companyId && bereit,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<Beleg>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<Beleg>> => {
      let query = supabase
        .from(TABLE.documents)
        .select(BELEG_ZEILE_SPALTEN, { count: "exact" })
        .is("deleted_at", null)
        .is("archived_at", null)
        .is("not_relevant_at", null)
        .neq("status", "split")
        .or(gesellschaftBelegFilter(companyId, companyCode));
      if (von) query = query.gte("document_date", von);
      if (bis) query = query.lte("document_date", bis);
      const from = pageParam * BELEG_SEITEN_GROESSE;
      const { data, error, count } = await query
        // A second, unique ordering key. `document_date` alone is not stable -- a company with
        // several invoices on the same date has no defined order between them, and Postgres is
        // free to return them differently per page, which duplicates and drops rows across a
        // range() boundary.
        .order("document_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + BELEG_SEITEN_GROESSE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Beleg[], total: count ?? 0 };
    },
  });
}

/** The narrow, complete set a company's page-level figures are computed from. */
export function useGesellschaftBelegAggregat(
  companyId: string,
  companyCode: string | null | undefined,
  /** See useBelegeFuerGesellschaftSeiten. */
  bereit = true,
) {
  return useQuery({
    queryKey: ["belege-gesellschaft-aggregat", companyId, companyCode ?? null],
    enabled: !!companyId && bereit,
    staleTime: STALE,
    queryFn: async (): Promise<BelegAggregatZeile[]> =>
      fetchAllRows<BelegAggregatZeile>(
        (from, to, withCount) =>
          supabase
            .from(TABLE.documents)
            .select(BELEG_AGGREGAT_SPALTEN, withCount ? { count: "exact" } : undefined)
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("not_relevant_at", null)
            .neq("status", "split")
            .or(gesellschaftBelegFilter(companyId, companyCode))
            // Same reason as the paged query: fetchAllRows issues parallel ranges, so without a
            // unique tie-breaker rows can repeat and go missing across a page boundary.
            .order("document_date", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to) as unknown as Promise<{
            data: BelegAggregatZeile[] | null;
            error: unknown;
            count?: number | null;
          }>,
      ),
  });
}

// Per-supplier invoice totals, aggregated by Postgres (view v_supplier_invoice_totals).
// Replaces grouping every invoice in the browser. See the migration for why the filter is an exact
// copy of useBelege()'s.
export function useLieferantBelegSummen() {
  return useQuery({
    queryKey: ["lieferant-beleg-summen"],
    staleTime: STALE,
    queryFn: async (): Promise<
      Map<string, { summe: number; anzahl: number; avgTage: number | null }>
    > => {
      const { data, error } = await sb
        .from(TABLE.vSupplierDocumentTotals)
        .select("supplier_id, document_count, document_total, avg_days_between");
      if (error) throw error;
      const map = new Map<string, { summe: number; anzahl: number; avgTage: number | null }>();
      for (const r of (data ?? []) as {
        supplier_id: string;
        document_count: number;
        document_total: number | string;
        avg_days_between: number | null;
      }[]) {
        map.set(r.supplier_id, {
          summe: Number(r.document_total ?? 0),
          anzahl: Number(r.document_count ?? 0),
          // Same rule as computeInvoiceFrequency(): null when there are fewer than two dated
          // invoices, which the view already encodes.
          avgTage: r.avg_days_between == null ? null : Number(r.avg_days_between),
        });
      }
      return map;
    },
  });
}

// Per-property invoice totals (view v_property_invoice_totals).
/**
 * The property-matching rule, written once.
 *
 * An invoice reaches a property either by the foreign key or by the free-standing `property_code`
 * the pipeline extracted before the key was set. Both still occur, so both count.
 *
 * It is a function, and shared, for the same reason the company one is: the paged query and the
 * aggregate query both call it, so the total in the heading cannot come to describe a different
 * set than the rows underneath it.
 *
 * The code is quoted so a code containing a PostgREST separator cannot break out of the or().
 */
function objektBelegFilter(propertyId: string | null, propertyCode: string) {
  const codeTeil = `property_code.eq."${propertyCode}"`;
  return propertyId ? `property_id.eq.${propertyId},${codeTeil}` : codeTeil;
}

/**
 * One page of a property's invoices, fetched on demand.
 *
 * Same shape and same reasoning as useBelegeFuerGesellschaftSeiten above: narrow columns, the date
 * range as a SERVER filter, and a unique tie-breaker in the ordering.
 */
export function useBelegeFuerObjektSeiten(
  propertyId: string | null,
  propertyCode: string,
  range: { von?: string | null; bis?: string | null } = {},
  /**
   * Whether the property lookup has settled. Without it this fires once by code alone -- while the
   * properties list is still loading, so `propertyId` is still null -- and then a second time with
   * the id, two round trips per page load for one answer.
   */
  bereit = true,
) {
  const von = range.von || null;
  const bis = range.bis || null;
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: ["belege-objekt-seiten", propertyId, propertyCode, von, bis],
    enabled: !!propertyCode && bereit,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<Beleg>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<Beleg>> => {
      let query = supabase
        .from(TABLE.documents)
        .select(BELEG_ZEILE_SPALTEN_UST, { count: "exact" })
        .is("deleted_at", null)
        .is("archived_at", null)
        .is("not_relevant_at", null)
        .neq("status", "split")
        .or(objektBelegFilter(propertyId, propertyCode));
      if (von) query = query.gte("document_date", von);
      if (bis) query = query.lte("document_date", bis);
      const from = pageParam * BELEG_SEITEN_GROESSE;
      const { data, error, count } = await query
        // A second, unique ordering key. `document_date` alone is not stable -- a property with
        // several invoices on the same date has no defined order between them, and Postgres is
        // free to return them differently per page, which duplicates and drops rows across a
        // range() boundary.
        .order("document_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + BELEG_SEITEN_GROESSE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Beleg[], total: count ?? 0 };
    },
  });
}

/** The narrow, complete set a property's page-level figures are computed from. */
export function useObjektBelegAggregat(
  propertyId: string | null,
  propertyCode: string,
  /** See useBelegeFuerObjektSeiten. */
  bereit = true,
) {
  return useQuery({
    queryKey: ["belege-objekt-aggregat", propertyId, propertyCode],
    enabled: !!propertyCode && bereit,
    staleTime: STALE,
    queryFn: async (): Promise<BelegAggregatZeile[]> =>
      fetchAllRows<BelegAggregatZeile>(
        (from, to, withCount) =>
          supabase
            .from(TABLE.documents)
            .select(BELEG_AGGREGAT_SPALTEN, withCount ? { count: "exact" } : undefined)
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("not_relevant_at", null)
            .neq("status", "split")
            .or(objektBelegFilter(propertyId, propertyCode))
            // Same reason as the paged query: fetchAllRows issues parallel ranges, so without a
            // unique tie-breaker rows can repeat and go missing across a page boundary.
            .order("document_date", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to) as unknown as Promise<{
            data: BelegAggregatZeile[] | null;
            error: unknown;
            count?: number | null;
          }>,
      ),
  });
}

export function useObjektBelegSummen() {
  return useQuery({
    queryKey: ["objekt-beleg-summen"],
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, { summe: number; anzahl: number }>> => {
      const { data, error } = await sb
        .from(TABLE.vPropertyDocumentTotals)
        .select("property_id, document_count, document_total");
      if (error) throw error;
      const map = new Map<string, { summe: number; anzahl: number }>();
      for (const r of (data ?? []) as {
        property_id: string;
        document_count: number;
        document_total: number | string;
      }[]) {
        map.set(r.property_id, {
          summe: Number(r.document_total ?? 0),
          anzahl: Number(r.document_count ?? 0),
        });
      }
      return map;
    },
  });
}

// Per-customer outgoing-invoice totals (view v_customer_invoice_totals).
//
// The view already applies both of this screen's rules, so the browser no longer re-derives them:
// cancellations and drafts are excluded from the money, and the overdue count is computed in
// Postgres against current_date.
export function useKundeRechnungSummen() {
  return useQuery({
    queryKey: ["kunde-rechnung-summen"],
    staleTime: STALE,
    queryFn: async (): Promise<
      Map<string, { summe: number; anzahl: number; ueberfaellig: number }>
    > => {
      const { data, error } = await sb
        .from(TABLE.vCustomerInvoiceTotals)
        .select("customer_id, invoice_count, invoice_total, overdue_count");
      if (error) throw error;
      const map = new Map<string, { summe: number; anzahl: number; ueberfaellig: number }>();
      for (const r of (data ?? []) as {
        customer_id: string;
        invoice_count: number;
        invoice_total: number | string;
        overdue_count: number;
      }[]) {
        map.set(r.customer_id, {
          summe: Number(r.invoice_total ?? 0),
          anzahl: Number(r.invoice_count ?? 0),
          ueberfaellig: Number(r.overdue_count ?? 0),
        });
      }
      return map;
    },
  });
}

export function useGesellschaftBelegSummen() {
  return useQuery({
    queryKey: ["gesellschaft-beleg-summen"],
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, { summe: number; anzahl: number }>> => {
      const { data, error } = await sb
        .from(TABLE.vCompanyDocumentTotals)
        .select("company_id, document_count, document_total");
      if (error) throw error;
      const map = new Map<string, { summe: number; anzahl: number }>();
      for (const row of (data ?? []) as {
        company_id: string;
        document_count: number;
        document_total: number | string;
      }[]) {
        map.set(row.company_id, {
          summe: Number(row.document_total ?? 0),
          anzahl: Number(row.document_count ?? 0),
        });
      }
      return map;
    },
  });
}

// Belege-Liste. Bei Suchbegriff Volltextsuche über die generierte `fts`-Spalte.
/**
 * The open items of the incoming side, decided by Postgres.
 *
 * WHY NOT useBelege(). This is the hook Offene Posten used to read, and it is `select *` over the
 * whole invoices table: 5,735 kB for 418 rows on the this Hub, of which 5,212 kB is the embedding
 * vector, the fts tsvector, the extracted JSONB and ocr_fulltext, none of which that screen
 * renders. It loaded the entire ledger, plus every confirmed match, so the browser could work out
 * one boolean per row.
 *
 * `v_open_items` (migration 20260819210000) supplies the boolean and the matched sum, and this hook
 * asks for the fifteen columns the screen actually shows. Openness itself cannot drift: the view is
 * built from payment_tolerance(), the same function the paid trigger uses and the same rule
 * isFullyCovered() mirrors in format.ts.
 *
 * Paged through fetchAllRows for the same reason useBelege is: the screen totals and counts the
 * whole open set, so a silently truncated response would read as a wrong figure rather than as an
 * error.
 */
export function useOffeneBelege() {
  return useQuery({
    queryKey: ["open_items", "open"],
    staleTime: STALE,
    queryFn: async (): Promise<OpenItemRow[]> =>
      fetchAllRows<OpenItemRow>((from, to, withCount) =>
        sb
          .from(TABLE.vOpenItems)
          .select(OPEN_ITEM_COLUMNS, withCount ? { count: "exact" } : undefined)
          .eq("is_open", true)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
  });
}

/**
 * The receipts that can never leave the open list on their own. See OpenItemBlocker.
 *
 * Fetched unconditionally rather than behind the screen's "show them" toggle, because the COUNT is
 * always on screen: an exclusion nobody can see is indistinguishable from a bug, which is the same
 * rule this screen already follows for whitelisted transactions. There are 13 such rows on the this client
 * Hub and 0 on Immonetz, so this costs nothing.
 */
export function useNichtAbgleichbareBelege() {
  return useQuery({
    queryKey: ["open_items", "blockiert"],
    staleTime: STALE,
    queryFn: async (): Promise<OpenItemRow[]> =>
      fetchAllRows<OpenItemRow>((from, to, withCount) =>
        sb
          .from(TABLE.vOpenItems)
          .select(OPEN_ITEM_COLUMNS, withCount ? { count: "exact" } : undefined)
          .not("open_blocker", "is", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
  });
}

/**
 * The invoices booked to ONE property, filtered by Postgres.
 *
 * The property detail page used to call useBelege() -- every invoice in the system -- and then keep
 * the handful matching this property. That is the last of the four master-data detail pages doing
 * so, and the one place the Objekte audit flagged as still unbounded after the list totals moved
 * into `v_property_invoice_totals`.
 *
 * The exclusions below are a deliberate, exact copy of the ones in that view (deleted / archived /
 * not-relevant / split-container). If they ever drift apart, this page's own subtotal would
 * disagree with the total the Objekte list shows for the same property, with nothing on either
 * screen to say which one is right.
 *
 * `property_code` is matched as well as `property_id` because a property the AI extracted but
 * nobody has created yet has no row to have an id -- that is exactly the case the "not in the
 * master data" notice on this page covers, and those invoices still have to be listed.
 */
export function useBelegeByProperty(
  propertyId: string | null,
  propertyCode: string,
  /**
   * Whether the property lookup has settled. Without it this fires once by code alone (while the
   * properties list is still loading, so `propertyId` is still null) and then a second time with
   * the id -- two round trips per page load for one answer.
   */
  bereit = true,
) {
  return useQuery({
    queryKey: ["belege", "byProperty", propertyId, propertyCode],
    staleTime: STALE,
    enabled: !!propertyCode && bereit,
    queryFn: async (): Promise<Beleg[]> => {
      // Quoted so a code containing a PostgREST separator cannot break out of the or() expression.
      const oder = propertyId
        ? `property_id.eq.${propertyId},property_code.eq."${propertyCode}"`
        : `property_code.eq."${propertyCode}"`;
      return fetchAllRows<Beleg>(
        (from, to, withCount) =>
          supabase
            .from(TABLE.documents)
            // Narrow, for the reason spelled out above BELEG_ZEILE_SPALTEN: `select("*")` here was
            // moving this property's entire OCR text and embedding vectors to render five columns.
            .select(BELEG_ZEILE_SPALTEN_UST, withCount ? { count: "exact" } : undefined)
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("not_relevant_at", null)
            .neq("status", "split")
            .or(oder)
            .order("document_date", { ascending: false })
            .range(from, to) as unknown as Promise<{
            data: Beleg[] | null;
            error: unknown;
            count?: number | null;
          }>,
      );
    },
  });
}

/** The invoice columns the BWA scope actually reads. Nothing else is fetched for it. */
export const BWA_BELEG_COLUMNS = [
  "id",
  "amount_gross",
  "amount_net",
  "category_id",
  "company_code",
  "document_date",
  "invoice_number",
  "issuer",
  "paid_at",
  "property_code",
  "service_date",
  "vat_amount",
  "vat_deductible_amount",
  "vat_deductible_pct",
  "vat_nondeductible_amount",
] as const;

export type BwaBeleg = Pick<Beleg, (typeof BWA_BELEG_COLUMNS)[number]>;

/**
 * The invoices the Cost Analysis reads, and only the columns it reads.
 *
 * WHY NOT useBelege(). Same reason Offene Posten stopped using it, measured on this Hub's own data:
 * `select *` over the invoices table is 6.401 kB for 532 rows, of which the fts tsvector (1.198 kB),
 * the extracted JSONB (1.347 kB) and ocr_fulltext (698 kB) are more than half, and the Cost Analysis
 * renders none of them. It reads sixteen scalar fields and downloads a hundred.
 *
 * The fts column is the clearest waste: it exists for server-side search and is read by nothing in
 * the client at all, on any screen.
 *
 * Same server-side gates as useBelege, deliberately duplicated rather than shared: a container row
 * of a split scan (status='split') is not an invoice, and an archived or not-relevant receipt
 * has been handed back. If those diverge, this screen's totals diverge from every other screen's.
 */
export function useBelegeForBwa() {
  return useQuery({
    queryKey: ["belege-bwa"],
    staleTime: STALE,
    queryFn: async (): Promise<BwaBeleg[]> =>
      fetchAllRows<BwaBeleg>(
        (from, to, withCount) =>
          supabase
            .from(TABLE.documents)
            .select(BWA_BELEG_COLUMNS.join(","), withCount ? { count: "exact" } : undefined)
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("not_relevant_at", null)
            .neq("status", "split")
            .order("created_at", { ascending: false })
            .range(from, to) as unknown as Promise<{
            data: BwaBeleg[] | null;
            error: unknown;
            count?: number | null;
          }>,
      ),
  });
}

export function useBelege(search?: string) {
  const q = (search ?? "").trim();
  return useQuery({
    queryKey: ["belege", q],
    staleTime: STALE,
    queryFn: async (): Promise<Beleg[]> => {
      // Container rows of a split multi-receipt scan (status='split', document_type='Sammelscan')
      // are NOT invoices — they hold the original of the scan for the audit trail while their children
      // carry the actual data (pipeline migrations 0009/0020). Without this they turn up as extra
      // entries with no issuer, no amount and no date — most visibly in Offene Posten, which reads
      // this hook. v_documents_list filters them server-side; this is the same rule for the direct read.
      // fetchAllRows works around the platform's per-request row cap (see its own comment) — this
      // hook is read everywhere as "the whole invoices table", so a silent partial result here would
      // be wrong on the dashboard, Auswertungen, and Offene Posten all at once, not just here.
      return fetchAllRows<Beleg>((from, to, withCount) => {
        let query = supabase
          .from(TABLE.documents)
          .select("*", withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null)
          // Archived receipts are wrongly ingested ones. They must not reach Offene Posten, which
          // reads this hook, or they would show up as permanently open items nobody can close.
          .is("archived_at", null)
          // Same for "nicht relevant": the reviewer has said this is not a receipt at all and handed
          // it back to the mailbox. Leaving it in would keep it in Offene Posten as an unpayable open
          // item, offer it in the bank-matching picker, and inflate the dashboard and Auswertungen
          // sums that read this hook. Archiving got this exclusion first; not-relevant needs the same.
          .is("not_relevant_at", null)
          .neq("status", "split");
        if (q) {
          query = query.textSearch("fts", q, { type: "websearch", config: "german" });
        }
        return query
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as Promise<{
          data: Beleg[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

/**
 * Re-run the pipeline's validation against the row's CURRENT data, before anyone sees it.
 *
 * Done here, at the read, rather than in each screen: the pipeline's per-check verdict is a
 * snapshot of what the document said at ingest, and by the time a row reaches a component a
 * company may have been assigned, an invoice number typed in, an amount corrected. Verifying at
 * the boundary means no caller can forget to, and no two screens can disagree about whether an
 * invoice still needs review.
 *
 * Nothing is written back. `belegNachgeprueft` returns a new object with `validation_detail`
 * replaced; the row in the database keeps the pipeline's own map, which is the record of what the
 * extraction actually found. See src/features/invoice-detail/nachpruefung.ts.
 *
 * The supplier's IBAN is fetched alongside, because the three transfer checks need the account the
 * invoice is actually paid to, and a reviewer who enters it on the supplier's screen has answered
 * exactly what those checks were asking. Only the suppliers these rows reference are read.
 */
async function nachgeprueft<T extends Beleg>(rows: T[]): Promise<T[]> {
  const ids = Array.from(new Set(rows.map((r) => r.supplier_id).filter((v): v is string => !!v)));
  let ibans = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data } = await supabase.from(TABLE.suppliers).select("id, iban").in("id", ids);
    ibans = new Map(
      ((data ?? []) as { id: string; iban: string | null }[]).map((l) => [l.id, l.iban]),
    );
  }
  return rows.map((r) =>
    belegNachgeprueft(r, { lieferantIban: ibans.get(r.supplier_id ?? "") ?? null }),
  );
}

// ---- Server-side list pagination (views v_documents_list/v_documents_review plus RPCs) ----

// The columns the list screen actually reads, and nothing else.
//
// `select("*")` fetched all 89 columns of the view, about 27 KB per row. The four heaviest are
// never looked at: `embedding` (the AI-search vector, 14 KB per row), `ocr_fulltext`, `fts` and
// `line_items`. A page of 50 rows was 1.3 MB and took about 2 seconds, on every page, filter and
// sort change. Narrowed to this list it is 300 KB and about 1 second.
//
// Everything a row helper touches has to stay, not only what the table paints. `extracted` and
// `validation` feed pruefGruende() and belegNachgeprueft(), `recipient_name` and `extracted` feed
// the outgoing-invoice badge, `supplier_id` is how nachgeprueft() looks up the supplier IBAN, and
// `amount_net`/`vat_amount` are compared by the re-check even though no column shows them.
//
// Columns used only to FILTER or SORT are deliberately absent: PostgREST applies `order` and the
// query filters server-side, so `property_code`, `archived_at` and `not_relevant_at` never have to
// travel. Add a column here the moment the screen starts reading one, or it arrives undefined.
const BELEGE_LISTE_SPALTEN = [
  "id",
  "issuer",
  "issuer_sort",
  "supplier_id",
  "company_code",
  // Both halves of the cost centre the list shows under the company: the property/company pairing
  // carries the number, Gemeinkosten resolves to the company's own. Neither is stored on the row.
  "property_code",
  "is_overhead",
  "invoice_number",
  "document_type",
  "cost_category",
  "amount_gross",
  "amount_net",
  "vat_amount",
  "vat_rate",
  "tax",
  "document_date",
  "due_date",
  "created_at",
  "status",
  "workflow_status",
  "review_score",
  "paid_at",
  "payment_method",
  "handed_over_at",
  "intake_channel",
  "confidence_score",
  "has_suggested_bank_match",
  "has_confirmed_bank_match",
  "recipient_name",
  "extracted",
  "validation",
].join(",");

// Which view a list read should come from.
//
// v_documents_review is v_documents_list plus three computed columns, and one of them is expensive:
// migration 20260909150000 hung invoice_review_state() off the view with CROSS JOIN LATERAL, and a
// lateral lives in the FROM clause, so Postgres runs it per row even for `select id`. Measured on
// live data, 50 rows and the same 29 columns: 3.7 s from v_invoices_review against 0.83 s from
// v_documents_list.
//
// Of those three columns the app reads exactly one, `search_text`, and only when there is a text
// search. So a read with no `q` takes the cheap view, and the expensive one is paid for only by
// the search that actually needs it. The condition below must stay identical to the one in
// applyBelegeFilter that touches search_text, or a search will query a column that is not there.
//
// Migration 20260910120000 makes the review columns prunable, after which both views cost the
// same for the column list this file asks for. This split is what makes the list fast before that
// migration is applied, and it stays correct afterwards.
function listenQuelle(
  f: BelegeFilter,
): typeof TABLE.vDocumentsList | typeof TABLE.vDocumentsReview {
  return f.q ? TABLE.vDocumentsReview : TABLE.vDocumentsList;
}

// Sort key → view column.
const SORT_COLUMN: Record<BelegSortKey, string> = {
  steller: "issuer_sort",
  gesellschaft: "company_code",
  objekt: "property_code",
  betrag: "amount_gross",
  beleg_datum: "document_date",
  faellig: "due_date",
  eingegangen_am: "created_at",
  status: "status",
  pruefung: "review_score",
};

// Apply the shared filters to a v_belege_list query builder (server-side).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyBelegeFilter(query: any, f: BelegeFilter) {
  // AI search result set (askInvoiceQuestion). An empty array must still narrow to zero rows —
  // see the `ids` field's own comment in types.ts.
  if (f.ids) query = f.ids.length > 0 ? query.in("id", f.ids) : query.is("id", null);
  if (f.q) {
    const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      const escaped = word.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.like("search_text", `%${escaped}%`);
    }
  }
  // GESELLSCHAFT_OHNE is not an ordinary code: it means "no company assigned", which the pipeline
  // writes as NULL and which the companies table also has a row for. Both have to match, or the
  // filter finds a handful of rows while the list plainly shows hundreds reading "ohne".
  if (f.gesellschaft === GESELLSCHAFT_OHNE)
    query = query.or(`company_code.is.null,company_code.eq.${GESELLSCHAFT_OHNE}`);
  else if (f.gesellschaft) query = query.eq("company_code", f.gesellschaft);
  // Same idea as GESELLSCHAFT_OHNE above: a filter for the rows that have nothing assigned, which
  // is the state most of this queue is actually in.
  if (f.objekt === OBJEKT_OHNE) query = query.is("property_code", null);
  else if (f.objekt) query = query.eq("property_code", f.objekt);
  if (f.status) query = query.eq("status", f.status);
  if (f.workflow) query = query.eq("workflow_status", f.workflow);
  if (f.belegart) query = query.eq("document_type", f.belegart);
  if (f.zahlung === "paid") query = query.not("paid_at", "is", null);
  else if (f.zahlung === "open") query = query.is("paid_at", null);
  if (f.paymentType === "direct_debit") query = query.eq("is_direct_debit", true);
  else if (f.paymentType === "transfer") query = query.eq("is_direct_debit", false);
  if (f.datev === "uebergeben") query = query.not("handed_over_at", "is", null);
  else if (f.datev === "open") query = query.is("handed_over_at", null);
  // Bank-reconciliation presence -- its own axis, separate from `zahlung`. `zahlung` says whether
  // the invoice is marked paid; this says whether a bank transaction has been matched to it, and
  // whether that match is still waiting on a human. 'suggestion' covers status kandidat AND auto:
  // both are undecided, which is the same reading the detail screens use.
  // The three values are a PARTITION: every invoice falls in exactly one. "suggestion" therefore
  // excludes rows that already have a confirmed match -- confirming one candidate leaves its
  // siblings at 'candidate', so without this an invoice appeared under both "Zuordnung offen" and
  // "Zugeordnet" and the three filtered counts did not sum to the unfiltered total.
  if (f.bankMatch === "suggestion")
    query = query.eq("has_suggested_bank_match", true).eq("has_confirmed_bank_match", false);
  else if (f.bankMatch === "matched") query = query.eq("has_confirmed_bank_match", true);
  // "Not matched" needs BOTH flags false, not just the absence of a confirmed one: an invoice with
  // an open suggestion has no confirmed match either, so checking only that would file it under
  // "nothing to do" when in fact it is the one waiting on a decision.
  else if (f.bankMatch === "open")
    query = query.eq("has_suggested_bank_match", false).eq("has_confirmed_bank_match", false);
  // Recognition traffic light — an axis of its own, not a `status` value. 'auffaellig' is the
  // review queue the briefing actually describes: yellow ("have it confirmed") and red ("to be
  // checked") are both cases where a human has to look, and they are useless as separate lists.
  if (f.ampel === "auffaellig") query = query.in("traffic_light", ["yellow", "red"]);
  else if (f.ampel) query = query.eq("traffic_light", f.ampel);
  // Archived receipts (migration 0025) leave the everyday list unless explicitly asked for.
  // The KPI/facet RPCs (invoices_kpis, invoices_facets, migration 0042) apply the same
  // `archived_at is null` / `not_relevant_at is null` exclusion server-side, so the tiles and the
  // list always agree.
  query = f.archiv === "nur" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  // "Nicht relevant" receipts are not receipts. They belong in neither the everyday list nor the
  // archive view, which is for wrongly ingested ones. The detail screen stays reachable by URL, so
  // the undo is still available; only the queue hides them.
  query = query.is("not_relevant_at", null);
  if (f.von) query = query.gte("document_date", f.von);
  if (f.bis) query = query.lte("document_date", f.bis);
  if (f.faelligUnbekannt) query = query.is("due_date", null);
  else {
    if (f.faelligVon) query = query.gte("due_date", f.faelligVon);
    if (f.faelligBis) query = query.lte("due_date", f.faelligBis);
  }
  return query;
}

// PostgREST answers a range starting past the end of the result set with PGRST103 ("Requested
// range not satisfiable") instead of an empty page. Worth catching rather than surfacing: it is a
// stale page number, not a broken query.
function isRangeNotSatisfiable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    e?.code === "PGRST103" || (e?.message ?? "").toLowerCase().includes("range not satisfiable")
  );
}

// Paginated, filtered, sorted invoice list from v_belege_list. Returns the page rows +
// the exact total count. Deterministic secondary sort (created_at desc, id asc) keeps
// rows from jumping between pages on tied primary values.
export function useBelegeListe(params: BelegeListeParams, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["belege-liste", params],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    placeholderData: keepPreviousData, // smooth page/filter transitions
    queryFn: async (): Promise<BelegeSeite> => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      // v_invoices_review was the name this app queried from migration 0025 to 0042, when it was
      // still a plain passthrough of v_invoices_list. Migration 20260909150000 gave it real work
      // to do per row, so the read now picks its view: see listenQuelle above. v_documents_list
      // itself selects `i.*` and so can never go stale/frozen on a new invoices column.
      let query = sb.from(listenQuelle(params)).select(BELEGE_LISTE_SPALTEN, { count: "exact" });
      query = applyBelegeFilter(query, params);
      query = query
        .order(SORT_COLUMN[params.sort], { ascending: params.dir === "asc", nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      const { data, error, count } = await query;
      if (!error) {
        return { rows: await nachgeprueft((data ?? []) as BelegListeRow[]), total: count ?? 0 };
      }
      // PostgREST refuses a range that starts past the end of the result set (PGRST103,
      // "Requested range not satisfiable") rather than returning an empty page. A bookmarked or
      // shared link to page 9 therefore turned into a full error screen the moment the result set
      // got smaller, and Retry re-sent the same impossible request. Ask what does exist and serve
      // the last real page instead; the caller corrects the URL from `angepassteSeite`.
      if (!isRangeNotSatisfiable(error)) throw error;
      let zaehler = sb.from(listenQuelle(params)).select("id", { count: "exact", head: true });
      zaehler = applyBelegeFilter(zaehler, params);
      const { count: gesamt, error: zaehlerFehler } = await zaehler;
      if (zaehlerFehler) throw zaehlerFehler;
      const total = gesamt ?? 0;
      const letzteSeite = Math.max(1, Math.ceil(total / params.pageSize));
      if (letzteSeite === params.page) throw error; // not a paging problem after all
      const letzteVon = (letzteSeite - 1) * params.pageSize;
      let nachschlag = sb
        .from(listenQuelle(params))
        .select(BELEGE_LISTE_SPALTEN, { count: "exact" });
      nachschlag = applyBelegeFilter(nachschlag, params);
      const { data: letzteZeilen, error: letzterFehler } = await nachschlag
        .order(SORT_COLUMN[params.sort], { ascending: params.dir === "asc", nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(letzteVon, letzteVon + params.pageSize - 1);
      if (letzterFehler) throw letzterFehler;
      return {
        rows: await nachgeprueft((letzteZeilen ?? []) as BelegListeRow[]),
        total,
        angepassteSeite: letzteSeite,
      };
    },
  });
}

// One page of an infinite-scroll list, carrying the exact total alongside it so the caller can
// show a real count (not just "how many are loaded so far") without a separate query.

export interface OpenBelegeInfiniteFilter {
  q?: string;
  /** document_date range */
  von?: string;
  bis?: string;
  /** created_at range — independent of document_date, both may be set at once */
  createdAtVon?: string;
  createdAtBis?: string;
  sort: BelegSortKey;
  dir: "asc" | "desc";
  pageSize: number;
}

// Server-driven picker list for the Link-Manually tab (Offene Posten, Briefing Screen 8): the
// same "open" invoices offene-posten's isFullyCovered gate would keep, expressed as a DB filter
// instead — paid_at is withdrawn/set by the same coverage-with-tolerance rule evaluated server-
// side (see format.ts's isFullyCovered comment), so `paid_at is null` IS "not yet fully matched".
// Infinite/paginated (not the single unpaginated useBelege) because this tab used to load every
// open invoice up front to let the client search/sort/scroll it, which was the actual source of
// the tab feeling slow — not the network round trip itself.
export function useOpenBelegeInfinite(
  filter: OpenBelegeInfiniteFilter,
  opts?: { enabled?: boolean },
) {
  const { q, von, bis, createdAtVon, createdAtBis, sort, dir, pageSize } = filter;
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: [
      "open-belege-infinite",
      q ?? "",
      von ?? "",
      bis ?? "",
      createdAtVon ?? "",
      createdAtBis ?? "",
      sort,
      dir,
      pageSize,
    ],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<BelegListeRow>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<BelegListeRow>> => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;
      let query = sb.from(TABLE.vDocumentsList).select(BELEGE_LISTE_SPALTEN, { count: "exact" });
      query = applyBelegeFilter(query, { zahlung: "open", von, bis });
      const suche = (q ?? "").trim();
      if (suche) {
        const betragFilter = amountQueryFilter(suche);
        if (betragFilter) {
          query = query.or(betragFilter.replaceAll("amount.", "amount_gross."));
        } else {
          for (const token of searchTokens(suche)) {
            query = query.or(`issuer.ilike.%${token}%,invoice_number.ilike.%${token}%`);
          }
        }
      }
      // THE SAME "open" AS TAB A, not a looser one. `zahlung: "open"` alone is just
      // `paid_at is null`, so this picker used to offer the three kinds of receipt that can never
      // be settled by a bank movement: no gross amount, a negative gross (a credit note), or
      // already paid privately. Its count then disagreed with the tab it sits next to (418 here
      // against 405 there). They are the open_blocker cases of v_open_items; see
      // migration 20260819210000. A row with no amount could not have been linked anyway: the
      // split amount comes out as 0 and the button stays disabled, so it was only ever noise in a
      // list somebody is scrolling to find one counterpart.
      query = query.gt("amount_gross", 0).or("already_paid.is.null,already_paid.eq.false");
      if (createdAtVon) query = query.gte("created_at", createdAtVon);
      // Inclusive of the whole end day — created_at is a timestamptz, so a bare date bound would
      // cut off at midnight and silently drop everything from later that same day.
      if (createdAtBis) query = query.lte("created_at", `${createdAtBis}T23:59:59.999`);
      const { data, error, count } = await query
        .order(SORT_COLUMN[sort], { ascending: dir === "asc", nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as BelegListeRow[], total: count ?? 0 };
    },
  });
}

// KPI aggregates via RPC (filter-aware; the caller passes filters WITHOUT status so the
// KPI cards keep acting as status toggles). Includes the gross-volume sum.
// PostgREST cannot resolve an RPC whose named arguments match no overload: it answers PGRST202,
// "Could not find the function public.invoices_kpis(...) in the schema cache". That is exactly what
// a database which has not run migration 20260815160000 replies when the three newer KPI filters
// are sent, and it is the one RPC error worth retrying instead of surfacing.
function isMissingRpcSignature(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "PGRST202" || (e?.message ?? "").includes("Could not find the function");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readKpiRow(data: any): Omit<BelegeKpis, "partial"> {
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(row?.total ?? 0),
    recognised: Number(row?.erkannt ?? 0),
    needs_review: Number(row?.zu_pruefen ?? 0),
    volumen: Number(row?.volumen ?? 0),
    // Only present since migration 20260815210000, and `partial` cannot stand in for its absence:
    // that migration changed the function's RETURN TYPE, not its signature, so PostgREST resolves
    // the call normally and the column is simply missing from the row. null means "this database
    // cannot answer that yet" and the page leaves the tile out, rather than printing a made-up
    // "Noch zu zahlen: 0,00 €" next to a volume that is plainly not zero.
    open: row && typeof row === "object" && "open" in row ? Number(row.offen ?? 0) : null,
  };
}

export interface QueueKpiRowData {
  key: string;
  count: number;
  amount: number;
}

export function useInvoiceQueueKpis() {
  return useQuery({
    queryKey: ["invoice-queue-kpis"],
    staleTime: STALE,
    queryFn: async (): Promise<QueueKpiRowData[]> => {
      const { data, error } = await sb.rpc("invoice_queue_kpis", { p_today: heuteLokal() });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return [];
        throw error;
      }
      return ((data ?? []) as { key: string; count: number; amount: number }[]).map((r) => ({
        key: r.key,
        count: Number(r.count ?? 0),
        amount: Number(r.amount ?? 0),
      }));
    },
  });
}

// KPI aggregates via RPC. Filter-aware: the caller passes every filter the list applies EXCEPT
// status, which stays out so the tiles keep working as status toggles. Includes the gross-volume
// sum.
export function useBelegeKpis(filter: Omit<BelegeFilter, "status">) {
  return useQuery({
    queryKey: ["belege-kpis", filter],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BelegeKpis> => {
      const args = {
        p_q: filter.q || null,
        p_gesellschaft: filter.gesellschaft || null,
        p_objekt: filter.objekt || null,
        p_belegart: filter.belegart || null,
        p_zahlung: filter.zahlung || null,
        p_von: filter.von || null,
        p_bis: filter.bis || null,
        p_datev: filter.datev || null,
        p_workflow: filter.workflow || null,
        // Keeps the KPI tiles in step with the list's bank-match filter (migration
        // 20260813180000). Without it the tiles reported unfiltered totals while the list narrowed.
        p_bank_match: filter.bankMatch || null,
      };
      // The three filters invoices_kpis learned in migration 20260815160000, kept apart so the
      // fallback below can drop exactly them. Until that migration ran, the RPC had no parameter
      // for an AI search's id set, for the traffic light or for the archive switch, so the tiles
      // counted a wider set than the rows underneath whenever one of them was on.
      const lateFilters = {
        p_ampel: filter.ampel || null,
        p_archiv: filter.archiv || null,
        p_ids: filter.ids ?? null,
        p_faellig_von: filter.faelligVon || null,
        p_faellig_bis: filter.faelligBis || null,
        p_faellig_unbekannt: filter.faelligUnbekannt ?? null,
        p_direct_debit:
          filter.paymentType === "direct_debit"
            ? true
            : filter.paymentType === "transfer"
              ? false
              : null,
      };
      const { data, error } = await sb.rpc("invoices_kpis", { ...args, ...lateFilters });
      if (!error) return { ...readKpiRow(data), partial: false };
      if (!isMissingRpcSignature(error)) throw error;
      // Old signature, so the tiles show numbers rather than an error on a database that is behind
      // on migrations. `partial` is what the page uses to admit which filters they leave out.
      const retry = await sb.rpc("invoices_kpis", args);
      if (retry.error) throw retry.error;
      return { ...readKpiRow(retry.data), partial: true };
    },
  });
}

// How many invoices in the CURRENT view have no company. Its own head-count query rather than a
// field on invoices_kpis: the tiles' RPC counts one filtered set, and this counts what a different
// company filter would return, which is not the same question. `head: true` means no rows travel,
// only the count.
export function useBelegeOhneGesellschaftCount(filter: BelegeFilter, opts?: { enabled?: boolean }) {
  const ohneFilter = { ...filter, gesellschaft: GESELLSCHAFT_OHNE };
  return useQuery({
    queryKey: ["belege-ohne-gesellschaft", ohneFilter],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    queryFn: async (): Promise<number> => {
      let query = sb.from(listenQuelle(ohneFilter)).select("id", { count: "exact", head: true });
      query = applyBelegeFilter(query, ohneFilter);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// Distinct filter-option lists over the whole non-deleted table (one cached RPC call).
export function useBelegeFacets() {
  return useQuery({
    queryKey: ["belege-facets"],
    staleTime: 5 * STALE,
    queryFn: async (): Promise<BelegeFacets> => {
      const { data, error } = await sb.rpc("invoices_facets");
      if (error) throw error;
      const f = (data ?? {}) as Partial<BelegeFacets>;
      return {
        objekt_codes: f.objekt_codes ?? [],
        belegarten: f.belegarten ?? [],
        months: f.months ?? [],
        years: f.years ?? [],
      };
    },
  });
}

// Kanban loads ALL matching rows up to a safety cap (no per-column lazy loading yet).
// `capped` is true when the filtered total exceeds the cap, so the board can warn the user.
/** Cards fetched per scroll step in a Kanban column. */
export const KANBAN_SEITE = 25;

/**
 * How many receipts each workflow column holds, for the whole filter and with no cap.
 *
 * One request rather than nine head-counts: it selects only `workflow_status`, so even a few
 * thousand receipts is a handful of kilobytes, and it gives every column header a truthful number
 * before a single card is fetched. That matters because the board used to count within a
 * 500-row page -- past 500 receipts the column headers were simply wrong, and a banner explained
 * that away instead of fixing it.
 *
 * It is also what keeps the request count down: only columns this reports as non-empty go on to
 * fetch cards.
 */
export function useBelegeKanbanCounts(filter: BelegeFilter, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["belege-kanban-counts", filter],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<string, number>> => {
      let query = sb.from(listenQuelle(filter)).select("workflow_status");
      query = applyBelegeFilter(query, filter);
      const { data, error } = await query;
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { workflow_status: string | null }[]) {
        // Same fallback the board itself uses, so a null status is counted in the column it is
        // actually rendered in rather than vanishing from the totals.
        const key = row.workflow_status ?? "received";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
  });
}

/**
 * One Kanban column, paged. The column body is the scroll container, so this is what makes it an
 * infinite list instead of a 500-row ceiling shared across all nine columns.
 *
 * Ordered newest first, with `id` as a tiebreaker: `created_at` is not unique in these tables
 * (a pipeline run inserts a batch in the same instant), and without a stable second key the same
 * receipt can appear on two pages while another never appears at all.
 */
export function useBelegeKanbanSpalte(
  filter: BelegeFilter,
  workflow: string,
  opts?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: ["belege-kanban-spalte", filter, workflow],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<BelegListeRow>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<BelegListeRow>> => {
      const from = pageParam * KANBAN_SEITE;
      let query = sb.from(listenQuelle(filter)).select(BELEGE_LISTE_SPALTEN, { count: "exact" });
      query = applyBelegeFilter(query, filter);
      query = query.eq("workflow_status", workflow);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + KANBAN_SEITE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as BelegListeRow[], total: count ?? 0 };
    },
  });
}

// AI natural-language search (askInvoiceQuestion). A mutation, not a query: it's an explicit
// per-question submit (an LLM round trip is too slow/costly to run on every keystroke), and its
// result (the matched ids) is fed back into BelegeFilter.ids to narrow the existing list/kanban
// queries above, rather than rendering its own result view.
export function useAskInvoiceQuestion() {
  return useMutation({
    mutationFn: async (args: { query: string }): Promise<AskInvoiceQuestionResult> =>
      askInvoiceQuestion({ data: args }),
  });
}

// Voice input for the AI search above — transcribes browser-recorded audio, returning plain text
// that the caller drops into the same aiQuery state the typed search box uses. See
// voice-search-button.tsx.
export function useTranscribeVoiceQuery() {
  return useMutation({
    mutationFn: (args: {
      mimeType: VoiceRecordingMime;
      audioBase64: string;
    }): Promise<{ text: string }> => transcribeVoiceQuery({ data: args }),
  });
}

export function useBeleg(id: string) {
  return useQuery({
    queryKey: ["beleg", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Beleg | null> => {
      const { data, error } = await supabase
        .from(TABLE.documents)
        .select("*")
        .eq("id", id)
        .is("deleted_at", null) // soft-deleted receipts stay hidden, even by direct URL
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return (await nachgeprueft([data as unknown as Beleg]))[0] ?? null;
    },
  });
}

// Original-Datei (bytea) eines Belegs. Wird nur im Detail geladen.
export function useBelegDatei(belegId: string) {
  return useQuery({
    queryKey: ["beleg_datei", belegId],
    enabled: !!belegId,
    staleTime: STALE,
    queryFn: async (): Promise<BelegDatei | null> => {
      // invoice_files ist seit Migration 0011 mehrzeilig je Beleg (role 'original' | 'xml' | …).
      // Für die Vorschau NUR das Original holen, sonst würde .maybeSingle() bei mehreren Zeilen werfen
      // bzw. versehentlich die XML statt des PDFs liefern.
      // `sb` (untyped): `role` fehlt im veralteten generierten Database-Typ (wie die übrigen
      // neueren Spalten/Tabellen im Projekt).
      const { data, error } = await sb
        .from(TABLE.documentFiles)
        .select("*")
        .eq("document_id", belegId)
        .eq("role", "original")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BelegDatei) ?? null;
    },
  });
}

// Short-lived Supabase Storage signed URLs for an invoice file (docs/FILE_STORAGE.md), minted
// server-side via src/lib/api/invoice-files.functions.ts. Only meaningful once the row has a
// storage_bucket/storage_path — callers gate `enabled` on that themselves (see document-preview.tsx).
// shorter than STALE: the signed URL itself expires server-side too

export function useInvoiceFileUrl(
  belegId: string,
  opts: { downloadFilename?: string | null; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["invoice_file_url", belegId, opts.downloadFilename ?? null],
    enabled: (opts.enabled ?? true) && !!belegId,
    staleTime: FILE_URL_STALE,
    placeholderData: keepPreviousData,
    queryFn: () =>
      getInvoiceFileUrl({
        data: { invoiceId: belegId, downloadFilename: opts.downloadFilename ?? undefined },
      }),
  });
}

// The documents hanging off a BANK TRANSACTION, with short-lived signed URLs, minted server-side
// via src/lib/api/transaction-files.functions.ts.
//
// These are the Pleo card receipts: `invoice_files` rows with a transaction_id and no document_id
// (migration 0074). The sync has been storing them since 2026-08 and nothing read them back, so a
// transaction that HAS its receipt still showed a reader nothing -- the dead end reported in the
// 09.09.2026 meeting. Returns a list: one entry can carry several receipts.
export function useTransactionDocuments(transactionId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["transaction_files", transactionId],
    enabled: (opts.enabled ?? true) && !!transactionId,
    staleTime: FILE_URL_STALE, // the signed URLs expire server-side on the same clock
    placeholderData: keepPreviousData,
    queryFn: () => getTransactionFileUrls({ data: { transactionId } }),
  });
}

// ---- Verlauf / Notizen (beleg_verlauf) ----
export function useBelegVerlauf(belegId: string) {
  return useQuery({
    queryKey: ["beleg_verlauf", belegId],
    enabled: !!belegId,
    staleTime: STALE,
    queryFn: async (): Promise<BelegVerlauf[]> => {
      const { data, error } = await supabase
        .from(TABLE.documentHistory)
        .select("*")
        .eq("document_id", belegId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BelegVerlauf[];
    },
  });
}

// ---- Schreib-Mutations (Stufe 2) ----

// Beleg-Felder aktualisieren. `changes` = nur die geänderten Spalten.
// `protokoll` (optional) erzeugt zusätzlich einen Verlaufseintrag.
export function useUpdateBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      changes: Partial<Beleg>;
      protokoll?: { typ: string; text: string; daten?: Record<string, unknown> | null };
    }) => {
      // Postgres/PostgREST does NOT error when an UPDATE's RLS policy filters it down to zero
      // matching rows — it just quietly updates nothing (bit us live: 20260812141500's own
      // comment). .select("id") makes that failure mode visible instead of silent: an RLS gap
      // now throws here rather than reporting success while leaving the row untouched.
      /**
       * Re-run the validation and record the result, in the SAME statement as the edit.
       *
       * This hook is the Hub's one funnel for invoice FIELD edits (the other five invoice writes
       * in this file move workflow status, payment, DATEV and archiving, none of which touch a
       * column a check reads). So it is where a correction gets recorded, rather than in the one
       * screen that happens to have an edit form: an invoice fixed by a bulk assignment rule earns
       * the same record as one fixed by hand.
       *
       * Not a database trigger, which was the other option. A trigger would catch writers outside
       * the Hub too, but only by having the fourteen check rules and an IBAN mod-97 written a
       * second time in plpgsql, and two copies of a rule set drift. This keeps one implementation,
       * in TypeScript, shared with the screens. A write that bypasses this still displays
       * correctly, because the read path derives the same answer (see `nachgeprueft` above); what
       * it loses is the stored record of who corrected what, and `validateInvoice` in
       * src/lib/api/invoice-validation.functions.ts is the endpoint for repairing that.
       */
      const vollstaendig = { ...args.changes, updated_at: new Date().toISOString() } as Record<
        string,
        unknown
      >;
      const { data: aktuell } = await sb
        .from(TABLE.documents)
        .select("*")
        .eq("id", belegId)
        .maybeSingle();
      if (aktuell) {
        const zusammen = { ...(aktuell as Beleg), ...args.changes } as Beleg;
        let lieferantIban: string | null = null;
        if (zusammen.supplier_id) {
          const { data: lieferant } = await sb
            .from(TABLE.suppliers)
            .select("iban")
            .eq("id", zusammen.supplier_id)
            .maybeSingle();
          lieferantIban = (lieferant as { iban: string | null } | null)?.iban ?? null;
        }
        // Writes both halves back: the pipeline's own entries copied through untouched, the
        // corrections under `user_edits`. A row still carrying the older flat map is split by
        // this write, which is the same shape the backfill script produces.
        vollstaendig.validation_detail = belegNachgeprueft(zusammen, {
          lieferantIban,
        }).validation_detail;
      }
      // Postgres/PostgREST does NOT error when an UPDATE's RLS policy filters it down to zero
      // matching rows — it just quietly updates nothing. .select("id") makes that failure mode
      // visible instead of silent: an RLS gap now throws here rather than reporting success while
      // leaving the row untouched.
      const { data, error } = await sb
        .from(TABLE.documents)
        .update(vollstaendig)
        .eq("id", belegId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Update did not affect any row — likely blocked by a database permission (RLS).",
        );
      }
      if (args.protokoll) {
        await insertVerlauf(
          belegId,
          args.protokoll.typ,
          args.protokoll.text,
          args.protokoll.daten ?? null,
        );
      }
    },
    onSuccess: () => {
      // RETURNED, not fired and forgotten. React Query keeps a mutation pending until a promise
      // returned from onSuccess resolves, so every guard that reads `isPending` stays true until
      // the invoice has actually refetched.
      //
      // Without this the mutation reported success while `beleg` was still the pre-action object.
      // The workflow ladder is derived from it, so for the render or two before the refetch landed
      // it went on offering the action that had just run -- and a second click in that window fired
      // the identical move again and toasted twice. Clicking three times in a row hit it reliably.
      //
      // Only the single-invoice read is awaited. The list, the history and the resolved rule do not
      // decide what the ladder offers, and holding the button until a full list refetch settles
      // would make every approval feel slow for no extra safety.
      const frisch = qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
      // Editing the supplier, company, property or gross amount by hand can change which approval
      // rule wins, exactly as applying the assignment rules can.
      qc.invalidateQueries({ queryKey: ["approval_rule_resolved", belegId] });
      return frisch;
    },
  });
}

// Notiz hinzufügen.
export function useAddNotiz(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      await insertVerlauf(belegId, "note", text);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] }),
  });
}

// Beleg löschen (Soft-Delete, revisionssicher) — setzt deleted_at + Verlauf.
export function useSoftDeleteBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
        })
        .eq("id", belegId);
      if (error) throw error;
      await insertVerlauf(belegId, "deletion", grund || "Beleg gelöscht");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
    },
  });
}

// Upload (#11): Beleg-Stub + Originaldatei anlegen. Die KI-Extraktion macht
// danach die Python-Pipeline (eingangskanal='upload', extracted IS NULL).
// The file bytes are already in Storage by the time this runs (src/features/file-upload):
// the browser uploads straight to the bucket and hands the resulting path over here, so nothing
// large ever passes through PostgREST. `invoiceId` is minted client-side because it forms part of
// the storage path, the same shape the outgoing upload uses.
export interface UploadInput {
  invoiceId: string;
  filename: string;
  mime: string;
  size: number;
  storageBucket: string;
  storagePath: string;
  checksumSha256: string | null;
}

export function useCreateUploadBelege() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      files: UploadInput[];
      /** Set when the upload started on a bank transaction that has no document. */
      forTransactionId?: string | null;
    }): Promise<string[]> => {
      return (await createUploadedInvoices({
        data: {
          forTransactionId: args.forTransactionId ?? null,
          files: args.files.map((f) => ({
            invoiceId: f.invoiceId,
            filename: f.filename,
            mime: f.mime,
            sizeBytes: f.size,
            storageBucket: f.storageBucket,
            storagePath: f.storagePath,
            checksumSha256: f.checksumSha256,
          })),
        },
      })) as string[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["belege"] });
      // The transaction screens show whether a document is on its way.
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["transaction-uploads"] });
    },
  });
}

/**
 * The invoices issued by ONE supplier, filtered by Postgres.
 *
 * The supplier detail page called useBelege() -- every invoice in the system -- and kept the ones
 * matching this supplier, the same pattern already removed from the property detail page. Exclusions
 * are an exact copy of `v_supplier_invoice_totals`, so this page's own subtotal cannot disagree with
 * the total the Lieferanten list shows for the same supplier.
 */
/**
 * One page of a supplier's invoices, fetched on demand.
 *
 * Same shape and same reasoning as useBelegeFuerGesellschaftSeiten above: narrow columns, the
 * period as a server filter, and a stable secondary sort key so a range() boundary cannot
 * duplicate or drop rows.
 */
export function useBelegeBySupplierSeiten(
  supplierId: string,
  range: { von?: string | null; bis?: string | null } = {},
) {
  const von = range.von || null;
  const bis = range.bis || null;
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: ["belege-lieferant-seiten", supplierId, von, bis],
    enabled: !!supplierId,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<Beleg>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<Beleg>> => {
      let query = supabase
        .from(TABLE.documents)
        .select(BELEG_ZEILE_SPALTEN, { count: "exact" })
        .is("deleted_at", null)
        .is("archived_at", null)
        .is("not_relevant_at", null)
        .neq("status", "split")
        .eq("supplier_id", supplierId);
      if (von) query = query.gte("document_date", von);
      if (bis) query = query.lte("document_date", bis);
      const from = pageParam * BELEG_SEITEN_GROESSE;
      const { data, error, count } = await query
        .order("document_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + BELEG_SEITEN_GROESSE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Beleg[], total: count ?? 0 };
    },
  });
}

/** The narrow, complete set a supplier's page-level figures are computed from. */
export function useLieferantBelegAggregat(supplierId: string) {
  return useQuery({
    queryKey: ["belege-lieferant-aggregat", supplierId],
    staleTime: STALE,
    enabled: !!supplierId,
    queryFn: async (): Promise<BelegAggregatZeile[]> =>
      fetchAllRows<BelegAggregatZeile>(
        (from, to, withCount) =>
          supabase
            .from(TABLE.documents)
            .select(BELEG_AGGREGAT_SPALTEN, withCount ? { count: "exact" } : undefined)
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("not_relevant_at", null)
            .neq("status", "split")
            .eq("supplier_id", supplierId)
            .order("document_date", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to) as unknown as Promise<{
            data: BelegAggregatZeile[] | null;
            error: unknown;
            count?: number | null;
          }>,
      ),
  });
}

// ---- bytea → Vorschau ----
// PostgREST liefert bytea als Hex-String "\\x2550...". In echte Bytes wandeln.
export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// MIME ermitteln: octet-stream auf Dateiendung zurückführen, damit PDFs/Bilder
// korrekt im Browser angezeigt werden.
export function resolveMime(datei: Pick<BelegDatei, "mime" | "filename">): string {
  const mime = datei.mime ?? "";
  if (mime && mime !== "application/octet-stream") return mime;
  const name = (datei.filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".xml")) return "application/xml";
  return mime || "application/octet-stream";
}
