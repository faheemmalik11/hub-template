// React-Query-Hooks gegen Supabase (Stufe 1 — nur Lesen).
// Die App läuft hinter dem Supabase-Login (AuthGate) → Nutzer ist `authenticated`,
// RLS erlaubt SELECT. Daten werden clientseitig via useQuery geladen.
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getActorDisplay, type ActorDisplay } from "@/lib/api/actor-display.functions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { notifyTargetPath, type NotificationTargetKind } from "@/lib/data/notification-target";
import type { BankAccountFields } from "@/lib/data/bank-account-fields";
import type { Channel, ChannelFolder, ChannelFolderRole, RunRequest } from "@/lib/data/types";
import { useAuth } from "@/lib/auth";
import { getFilingFolders, getMailboxFolders } from "@/lib/api/postfach-folders.functions";
import { getInvoiceFileUrl } from "@/lib/api/invoice-files.functions";
import { getTransactionFileUrls } from "@/lib/api/transaction-files.functions";
import { triggerDatevHandover } from "@/lib/api/datev-handover.functions";
import { datevBlockReason, type DatevAttachmentFile } from "@/lib/datev/attachment-rules";
import { extractOutgoingInvoiceFields } from "@/lib/api/outgoing-invoice-extraction.functions";
import { extractChartOfAccounts } from "@/lib/api/chart-of-accounts-extraction.functions";
import {
  askInvoiceQuestion,
  type AskInvoiceQuestionResult,
} from "@/lib/api/invoice-nl-ask.functions";
import { transcribeVoiceQuery } from "@/lib/api/voice-transcription.functions";
import type { VoiceRecordingMime } from "@/lib/api/voice-transcription-shared";
import { createUploadedInvoices } from "@/lib/api/invoice-upload.functions";
import { createUploadedOutgoingInvoice } from "@/lib/api/outgoing-invoice-upload.functions";
import { getOutgoingInvoiceFileUrl } from "@/lib/api/outgoing-invoice-files.functions";
import type { OutgoingInvoiceUploadMime } from "@/lib/api/outgoing-invoice-shared";
import {
  createEmployee as createEmployeeFn,
  updateEmployeeProfile as updateEmployeeProfileFn,
  resetEmployeePassword as resetEmployeePasswordFn,
} from "@/lib/api/employees.functions";
import {
  createManualBankAccount as createManualBankAccountFn,
  importManualBankTransactions as importManualBankTransactionsFn,
  type CreateManualBankAccountConflict,
  type CreateManualBankAccountResult,
  type ImportManualTransactionsResult,
} from "@/lib/api/bank-manual-import.functions";
import {
  createBankAccount as createBankAccountFn,
  updateBankAccount as updateBankAccountFn,
  excludeBankAccount as excludeBankAccountFn,
  restoreBankAccount as restoreBankAccountFn,
  setBankAccountActive as setBankAccountActiveFn,
} from "@/lib/api/bank-accounts.functions";
import type { NormalizedRow } from "@/lib/bank-import/types";
import {
  heuteLokal,
  APPROVAL_PHASE_STATUSES,
  compactIBAN,
  GESELLSCHAFT_OHNE,
  isPayableIBAN,
  OBJEKT_OHNE,
} from "@/lib/data/format";
import { OPOS_TERM_MIN_LENGTH } from "@/lib/data/opos";
import { belegNachgeprueft } from "@/features/invoice-detail/nachpruefung";
import type {
  BankAccount,
  BankConnection,
  BankSyncLog,
  BankTransaction,
  Beleg,
  BelegDatei,
  BelegeFacets,
  BelegeFilter,
  BelegeKpis,
  BelegeListeParams,
  BelegeSeite,
  BelegListeRow,
  BelegSortKey,
  BelegTransactionMatch,
  MatchingSettings,
  BelegVerlauf,
  Gesellschaft,
  Lieferant,
  InvoiceBankAccount,
  SupplierBankAccount,
  SupplierIbanHistory,
  SupplierAlias,
  SupplierDuplicateGroup,
  Objekt,
  PropertyCompany,
  VerarbeitungsLog,
  PipelineRun,
  PipelineHealth,
  Exclusion,
  FilenameSettings,
  OposCategory,
  OposWhitelistRule,
  OposWhitelistScope,
  AssignmentRule,
  RuleTarget,
  RulePreview,
  RuleBulkApplyResult,
  VatTreatment,
  VatSpecialCase,
  VatReserve,
  BwaCategory,
  BwaAccountMapping,
  RuleSuggestion,
  ManualBooking,
  ManualBookingExpanded,
  ApprovalArea,
  ChainPerson,
  ApprovalRule,
  DatevRoute,
  DatevDirection,
  DatevSendableDirection,
  DatevHandoverBatch,
  DatevReadyInvoice,
  DatevCompanyStatus,
  DatevOutgoingInvoice,
  Customer,
  OutgoingInvoice,
  OutgoingInvoiceTransactionMatch,
  OutgoingVoucherStatus,
  Employee,
  TrashRecord,
  PaymentOrder,
  WorkflowStatus,
  OpenItemRow,
} from "./types";
import { OPEN_ITEM_COLUMNS } from "./types";
import type { AppRole } from "@/lib/auth";
import { TABLE } from "@/config/tables";
import { STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, pflichtGrund } from "@/data/shared";
import { EDGE_FUNCTION } from "@/config/edge-functions";

// `companies` has carried deleted_at/deleted_by/delete_reason since early on, but nothing ever wrote
// or read them: there was no archive action anywhere in the app, and this hook returned archived rows
// as if they were live. Both halves are fixed together, since filtering without an archive action
// would be pointless and an archive action without filtering would do nothing visible.
//
// `includeArchived` exists for the list's "Archivierte anzeigen" toggle, which is also the only way
// to restore one. Everything else (pickers, dropdowns, the invoice screens) calls this with no
// argument and therefore never offers an archived company.
export function useGesellschaften(opts?: { includeArchived?: boolean }) {
  const includeArchived = opts?.includeArchived ?? false;
  return useQuery({
    queryKey: ["gesellschaften", { includeArchived }],
    staleTime: STALE,
    queryFn: async (): Promise<Gesellschaft[]> => {
      let query = supabase.from(TABLE.companies).select("*");
      if (!includeArchived) query = query.is("deleted_at", null);
      const { data, error } = await query.order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Gesellschaft[];
    },
  });
}

// Archive a company. Deliberately a soft delete, never a hard one: `companies.code` is referenced by
// string from invoices.company_code and entity_aliases.entity_code (neither is a foreign key, see the
// rename-cascade migration), so removing the row would strand exactly the references that migration
// exists to protect. Archiving keeps the row, the code and every reference intact, and is reversible.
export function useSoftDeleteGesellschaft(gesellschaftId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.companies)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
          updated_at: new Date().toISOString(),
        })
        .eq("id", gesellschaftId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", gesellschaftId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}

export function useRestoreGesellschaft(gesellschaftId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.companies)
        .update({
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", gesellschaftId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", gesellschaftId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}

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

export function useGesellschaft(id: string) {
  return useQuery({
    queryKey: ["gesellschaft", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Gesellschaft | null> => {
      const { data, error } = await supabase
        .from(TABLE.companies)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Gesellschaft) ?? null;
    },
  });
}

// Gesellschaft (Stammdaten) anlegen. Gibt die neue Zeile zurück.
export function useCreateGesellschaft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (werte: { code: string; name: string }): Promise<Gesellschaft> => {
      const { data, error } = await sb.from(TABLE.companies).insert(werte).select("*").single();
      if (error) throw error;
      return data as Gesellschaft;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gesellschaften"] }),
  });
}

// Gesellschaft-Stammdaten aktualisieren.
export function useUpdateGesellschaft(gesellschaftId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Gesellschaft>) => {
      // .select() so the write reports itself: companies is admin-only to update, and an update RLS
      // turns away simply matches no row and returns success.
      const { data, error } = await sb
        .from(TABLE.companies)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", gesellschaftId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Gesellschaften dürfen nur Administratoren ändern. Es wurde nichts gespeichert.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", gesellschaftId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}

// `objekte` (Migration 0004) is newer than the generated Database type, so it isn't known to the
// typed client — reads go through the untyped `sb` cast, like the writes.
export function useObjekte() {
  return useQuery({
    queryKey: ["objekte"],
    staleTime: STALE,
    queryFn: async (): Promise<Objekt[]> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Objekt[];
    },
  });
}

// Direct property <-> company assignment (migration 0083), replacing the business-line model.
// Untyped client (newer than the generated Database type), same pattern as `objekte`.
export function usePropertyCompanies() {
  return useQuery({
    queryKey: ["property_companies"],
    staleTime: STALE,
    queryFn: async (): Promise<PropertyCompany[]> => {
      // Soft-deleted links stay in the table as history but must not resolve a company.
      const { data, error } = await sb
        .from(TABLE.propertyCompanies)
        .select("*")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as PropertyCompany[];
    },
  });
}

/**
 * Replaces a property's company set in one call: reads the currently active links, inserts the
 * companies newly added, soft-deletes the ones removed. Soft-delete, never a hard delete — a past
 * link explains which company earlier receipts were booked to, so removing the row outright would
 * erase that explanation. There is deliberately no DELETE policy on the table (migration 0083).
 */
/** A property/company write error, said in the reader's words rather than as a constraint name. */
function zuordnungFehler(error: unknown): Error {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505" && e.message?.includes("cost_center")) {
    return new Error(
      "Diese Kostenstellen-Nummer ist bei dieser Gesellschaft schon einem anderen Objekt zugeordnet.",
    );
  }
  if (e.code === "23505") {
    return new Error("Diese Gesellschaft ist dem Objekt bereits zugeordnet.");
  }
  if (e.code === "42501") {
    return new Error("Kostenstellen-Nummern dürfen nur Administratoren ändern.");
  }
  return error instanceof Error ? error : new Error(String(e.message ?? error));
}

/**
 * Adds a company to a property, or changes one assignment, with its cost-centre number.
 *
 * One call for the assignment modal (components/objekte/zuordnung-dialog.tsx), which the property
 * page and the company page both open, for adding and for editing (17.09.2026).
 *
 * - No `linkId`: a new assignment row, carrying the number.
 * - Same property and company as the row: only the number changes.
 * - Another company or property: the new row is written first and the old one soft-deleted after, so a failure
 *   never leaves the property with neither. Soft-deleted, not rewritten in place, because a past
 *   link explains which company earlier receipts were booked to (same rule as
 *   useSetPropertyCompanies).
 *
 * The number is admin-only, enforced by a trigger (20260917140000, 20260917150000). Every write
 * reports itself, so an update nothing matched is an error rather than "gespeichert".
 */
export function useSavePropertyCompanyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      linkId: string | null;
      previousPropertyId: string | null;
      previousCompanyId: string | null;
      companyId: string;
      nummer: number | null;
      nummerGeaendert: boolean;
      actor: string | null;
    }) => {
      const now = new Date().toISOString();
      // The same row only when neither side moved. Moving either one is a new assignment.
      const sameRow =
        input.linkId &&
        input.previousCompanyId === input.companyId &&
        input.previousPropertyId === input.propertyId;

      if (sameRow) {
        if (!input.nummerGeaendert) return;
        const { data, error } = await sb
          .from(TABLE.propertyCompanies)
          .update({ cost_centre_number: input.nummer, updated_at: now })
          .eq("id", input.linkId)
          .select("id");
        if (error) throw zuordnungFehler(error);
        if (!data || data.length === 0) {
          throw new Error("Kostenstellen-Nummern dürfen nur Administratoren ändern.");
        }
        return;
      }

      const { error: insertError } = await sb.from(TABLE.propertyCompanies).insert({
        property_id: input.propertyId,
        company_id: input.companyId,
        // Only sent when set: a non-admin adds the company without a number, and the trigger
        // refuses a number arriving from them.
        ...(input.nummer != null ? { cost_centre_number: input.nummer } : {}),
      });
      if (insertError) throw zuordnungFehler(insertError);

      if (input.linkId) {
        const { data, error } = await sb
          .from(TABLE.propertyCompanies)
          .update({ deleted_at: now, deleted_by: input.actor, updated_at: now })
          .eq("id", input.linkId)
          .select("id");
        if (error) throw zuordnungFehler(error);
        if (!data || data.length === 0) {
          throw new Error("Die bisherige Zuordnung konnte nicht entfernt werden.");
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

/** Removes one company from a property. Soft-delete, for the same reason as above. */
export function useRemovePropertyCompanyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { linkId: string; actor: string | null }) => {
      const now = new Date().toISOString();
      const { data, error } = await sb
        .from(TABLE.propertyCompanies)
        .update({ deleted_at: now, deleted_by: input.actor, updated_at: now })
        .eq("id", input.linkId)
        .select("id");
      if (error) throw zuordnungFehler(error);
      if (!data || data.length === 0) {
        throw new Error("Die Zuordnung konnte nicht entfernt werden.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useSetPropertyCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      companyIds: string[];
      actor?: string | null;
    }) => {
      const { data: current, error: readError } = await sb
        .from(TABLE.propertyCompanies)
        .select("*")
        .eq("property_id", input.propertyId)
        .is("deleted_at", null);
      if (readError) throw readError;

      const currentRows = (current ?? []) as PropertyCompany[];
      const currentIds = new Set(currentRows.map((r) => r.company_id));
      const desiredIds = new Set(input.companyIds);

      const toAdd = input.companyIds.filter((id) => !currentIds.has(id));
      const toRemove = currentRows.filter((r) => !desiredIds.has(r.company_id));

      if (toAdd.length > 0) {
        const { error } = await sb
          .from(TABLE.propertyCompanies)
          .insert(toAdd.map((company_id) => ({ property_id: input.propertyId, company_id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await sb
          .from(TABLE.propertyCompanies)
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: input.actor ?? null,
            updated_at: new Date().toISOString(),
          })
          .in(
            "id",
            toRemove.map((r) => r.id),
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useObjekt(id: string) {
  return useQuery({
    queryKey: ["objekt", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Objekt | null> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as Objekt) ?? null;
    },
  });
}

// Objekt (Stammdaten) anlegen. Gibt die neue Zeile zurück.
export function useCreateObjekt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (werte: {
      code: string;
      name?: string | null;
      address?: string | null;
      vat_status?: string | null;
    }): Promise<Objekt> => {
      const { data, error } = await sb.from(TABLE.properties).insert(werte).select("*").single();
      if (error) throw error;
      return data as Objekt;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objekte"] }),
  });
}

/**
 * Archive a property: out of the everyday list, still there for its historical invoices.
 *
 * A reason is required, same as every other soft delete in the Hub, so the Papierkorb can say why
 * a row is there. `properties` was already in trash_eligible_tables() (migration 0062) and the
 * columns were already on the table, so restore worked from the trash before anything here could
 * archive in the first place.
 */
export function useArchiveObjekt(objektId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.properties)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
        })
        .eq("id", objektId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", objektId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useUnarchiveObjekt(objektId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.properties)
        .update({ deleted_at: null, deleted_by: null, delete_reason: null })
        .eq("id", objektId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", objektId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

// Objekt-Stammdaten aktualisieren.
export function useUpdateObjekt(objektId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Objekt>) => {
      const { error } = await sb
        .from(TABLE.properties)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", objektId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", objektId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

/**
 * Every supplier.
 *
 * Read as "the whole supplier table" all over the app — the list, the merge picker, the invoice
 * detail's issuer lookup — so it is paged through with fetchAllRows rather than left to the
 * platform's per-request row cap. At 117 rows that changes nothing today; at 1000+ a plain select
 * would silently return a prefix, and the symptom would be a supplier that exists but cannot be
 * found in a picker, which is very hard to recognise as truncation.
 *
 * The list screen still paginates and searches client-side over this result. That is a deliberate
 * limit rather than an oversight: moving it server-side means the duplicate panel, the totals join
 * and the sort all have to move with it, which is a larger change than this one.
 */
export function useLieferanten(opts?: { includeDeleted?: boolean }) {
  const includeDeleted = opts?.includeDeleted ?? false;
  return useQuery({
    queryKey: ["lieferanten", { includeDeleted }],
    staleTime: STALE,
    queryFn: async (): Promise<Lieferant[]> => {
      return fetchAllRows<Lieferant>((from, to, withCount) => {
        let query = supabase
          .from(TABLE.suppliers)
          .select("*", withCount ? { count: "exact" } : undefined);
        if (!includeDeleted) query = query.is("deleted_at", null);
        return query.order("name", { ascending: true }).range(from, to) as unknown as Promise<{
          data: Lieferant[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

export function useLieferant(id: string) {
  return useQuery({
    queryKey: ["lieferant", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Lieferant | null> => {
      const { data, error } = await supabase
        .from(TABLE.suppliers)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Lieferant) ?? null;
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
export interface InfinitePage<T> {
  rows: T[];
  total: number;
}

function hasNextInfinitePage<T>(allPages: InfinitePage<T>[]): boolean {
  const loaded = allPages.reduce((n, p) => n + p.rows.length, 0);
  const total = allPages[0]?.total ?? 0;
  return loaded < total;
}

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
const INVOICE_FILE_URL_STALE = 5 * 60_000; // shorter than STALE: the signed URL itself expires server-side too

export function useInvoiceFileUrl(
  belegId: string,
  opts: { downloadFilename?: string | null; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["invoice_file_url", belegId, opts.downloadFilename ?? null],
    enabled: (opts.enabled ?? true) && !!belegId,
    staleTime: INVOICE_FILE_URL_STALE,
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
    staleTime: INVOICE_FILE_URL_STALE, // the signed URLs expire server-side on the same clock
    placeholderData: keepPreviousData,
    queryFn: () => getTransactionFileUrls({ data: { transactionId } }),
  });
}

// Pipeline-Lauf-Heartbeat fürs Health-Panel (Briefing Betrieb/Monitoring: running / last run / errors).
// Liest pipeline_runs (Migration 0013 im Pipeline-Repo). refetchInterval hält die Anzeige live.
export function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipeline_health"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PipelineHealth> => {
      const { data, error } = await sb
        .from(TABLE.pipelineRuns)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const runs = (data ?? []) as PipelineRun[];
      const lastRun = runs[0] ?? null;
      const running = runs.some((r) => r.status === "running" && !r.finished_at);
      const errorCount = lastRun?.error_count ?? 0;
      return { lastRun, running, errorCount, runs };
    },
  });
}

// ----------------------------------------------------------------- "Jetzt ausfuehren" ---
// The pipeline runs from a schedule every two hours. A request row asks it to read one channel
// now instead, and the pipeline writes the outcome back on the same row. See the book-keeping
// repo, planning/docs/run-now-from-the-hub.md.

function stillOpen(requests: Record<string, RunRequest> | undefined): boolean {
  return Object.values(requests ?? {}).some(
    (request) => request.status === "pending" || request.status === "running",
  );
}

/**
 * Whether this client may ask for a run at all: run.run_now_enabled, saved with the client's other
 * settings in the admin panel. Read through run_now_enabled(), because the settings row also holds
 * encrypted credentials and this app may never select it. Upload is not governed by it: putting a
 * document in is the request, always.
 */
export function useRunNowEnabled() {
  return useQuery({
    queryKey: ["run_now_enabled"],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sb.rpc("run_now_enabled");
      if (!error) return Boolean(data);
      // A database that migration 0013 has not reached yet still keeps the switch in its own table.
      const legacy = await sb.from(TABLE.pipelineSettings).select("run_now_enabled").maybeSingle();
      // Neither there means a client the pipeline has not been set up for, which reads as off.
      if (legacy.error) return false;
      return Boolean(legacy.data?.run_now_enabled);
    },
  });
}

/** The newest request per channel, so each source card can show what its last press did. */
export function useRunRequests() {
  return useQuery({
    queryKey: ["pipeline_run_requests"],
    queryFn: async (): Promise<Record<string, RunRequest>> => {
      const { data, error } = await sb
        .from(TABLE.pipelineRunRequests)
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(20);
      // The table arrives with the pipeline's own migration. Until it is applied, no button
      // should appear and nothing should be shouted about it.
      if (error) return {};
      const newestPerChannel: Record<string, RunRequest> = {};
      for (const request of (data ?? []) as RunRequest[]) {
        newestPerChannel[request.channel] ??= request;
      }
      return newestPerChannel;
    },
    // Only while something is still open. A finished request never changes again, and an idle
    // Postfach screen must not poll a table nobody is writing to.
    refetchInterval: (query) => (stillOpen(query.state.data) ? 3_000 : false),
  });
}

/**
 * Ask for one channel to be read now: its usual folders, or the ones somebody picked (P3).
 * A second identical ask returns the request already waiting.
 */
export function useAskForARun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channel,
      folders,
    }: {
      channel: string;
      folders?: { id: string; name: string }[];
    }): Promise<RunRequest> => {
      // Folder arguments only when folders were picked. The ask_for_a_run from before migration
      // 0012 knows no such parameter, and PostgREST refuses a call naming one, so sending them on
      // every press would break the usual run on any client not yet migrated.
      const args: Record<string, unknown> = { wanted_channel: channel };
      if (folders && folders.length > 0) {
        args.wanted_folders = folders.map((folder) => folder.id);
        args.wanted_folder_names = folders.map((folder) => folder.name);
      }
      const { data, error } = await sb.rpc("ask_for_a_run", args);
      if (error) throw error;
      return data as RunRequest;
    },
    // Shows "Angefragt" at once, rather than up to three seconds later.
    onSuccess: (request) => {
      queryClient.setQueryData(
        ["pipeline_run_requests"],
        (before: Record<string, RunRequest> | undefined) => ({
          ...(before ?? {}),
          [request.channel]: request,
        }),
      );
    },
  });
}

// The old useVerarbeitungsLog() (flat `.limit(500)`, filtered in the browser) was removed when the
// Protokoll screen moved to server-side filtering + pagination — see useVerarbeitungsLogPage below.
// It is deliberately NOT kept as a convenience read: the 500 cap silently hid the oldest entries and
// skewed the status counts, and processing_log only grows.

// PostgREST's or= filter is comma/parenthesis delimited, and ilike treats % and _ as wildcards, so a
// raw search term could break the query or silently match everything. Escape the wildcards; the
// delimiters cannot be escaped at all and have to be dealt with by splitting (see searchTokens).
function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (m) => `\\${m}`).trim();
}

/**
 * Splits a search term into the tokens that can actually be sent to PostgREST.
 *
 * `,`, `(` and `)` are the `or=` filter's own delimiters and there is no escape for them, so they
 * cannot survive into a filter. The old code replaced them with spaces and kept ONE pattern, which
 * silently searched for a different string than the user typed: copying the subject
 * "Eon Stromrechnung 2024/25, 18513 Grammendorf" out of the table and pasting it into the search box
 * returned "0 Einträge" for a row that was visible on screen. Worse, a term made only of delimiters
 * collapsed to "" and the filter was dropped entirely — typing "(" returned the WHOLE table while the
 * box showed an active search.
 *
 * Splitting on those characters instead and requiring EVERY token to match keeps the user's intent:
 * each token becomes its own `or=` across subject/sender/reason, and chained `.or()` calls are ANDed
 * by PostgREST. The comma case above now finds its row again.
 *
 * Returns [] only when the term holds no searchable text at all, which callers must treat as
 * "matches nothing" rather than "no filter" — see `searchDropped` on the hooks below.
 */
export function searchTokens(term: string): string[] {
  return term
    .split(/[,()]/)
    .map((part) => escapeIlike(part))
    .filter((part) => part.length > 0);
}

/** True when the user typed something but none of it can be searched (e.g. "(" or ",,,"). */
export function searchWasDropped(term: string): boolean {
  return term.trim().length > 0 && searchTokens(term).length === 0;
}

/** Shared filter shape for the Protokoll screen's two reads, so they can never drift apart. */
export type VerarbeitungsLogFilter = {
  search?: string;
  status?: string;
  /** Inclusive ISO date bounds on processed_at. Both optional. */
  von?: string | null;
  bis?: string | null;
};

/**
 * Applies search, status and date filters identically to any processing_log query.
 *
 * Factored out because the list and the counts MUST filter the same way — when they did not, the
 * chips described a different set of rows than the table below them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLogFilter<T extends { or: any; eq: any; gte: any; lte: any }>(
  query: T,
  { search, status, von, bis }: VerarbeitungsLogFilter,
): T {
  // Every token must match, each across subject/sender/reason. Chained .or() calls are ANDed.
  for (const token of searchTokens(search ?? "")) {
    query = query.or(`subject.ilike.%${token}%,sender.ilike.%${token}%,reason.ilike.%${token}%`);
  }
  if (status) query = query.eq("status", status);
  // processed_at is a timestamp, so the upper bound has to cover the whole day.
  if (von) query = query.gte("processed_at", `${von}T00:00:00`);
  if (bis) query = query.lte("processed_at", `${bis}T23:59:59.999`);
  return query;
}

// Filtered + paginated processing log. Replaces the old useVerarbeitungsLog() for the Protokoll screen,
// which fetched a flat `.limit(500)` and filtered in the browser: no pagination, and once the log passes
// 500 rows that cap silently hides the oldest entries AND skews the status counts. processing_log grows
// by one row per processed mail forever, so it has to be paged on the server.
export function useVerarbeitungsLogPage(
  filter: VerarbeitungsLogFilter & { page: number; pageSize: number },
) {
  const { search, status, von, bis, page, pageSize } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: [
      "verarbeitungs_log_page",
      tokens.join("\u0000"),
      dropped,
      status ?? "",
      von ?? "",
      bis ?? "",
      page,
      pageSize,
    ],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: VerarbeitungsLog[]; total: number }> => {
      // The user typed only filter delimiters. Nothing can match that, and returning the unfiltered
      // table (which is what the old code did) is the one answer that is definitely wrong.
      if (dropped) return { rows: [], total: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const query = applyLogFilter(
        supabase.from(TABLE.processingLog).select("*", { count: "exact" }),
        { search, status, von, bis },
      );
      const { data, error, count } = await query
        // id breaks processed_at ties — an ingest run writes many rows within the same instant.
        .order("processed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as VerarbeitungsLog[], total: count ?? 0 };
    },
  });
}

/**
 * Per-status counts for the header chips, over the WHOLE log and deliberately ignoring the status
 * filter, so the chips keep working as toggles showing what is available.
 *
 * Paged through fetchAllRows rather than read in one request. The previous version did a bare
 * `select("status")` with no bound, which PostgREST silently truncates at its Max Rows setting — so
 * past that cap the chips quietly described only the newest 1000 rows. That was not hypothetical:
 * measured live on the this client database, the list reported 1170 entries via an exact count while the
 * chips summed to exactly 1000. Only `status` is selected, so even a large log is a couple of cheap
 * round trips.
 */
export function useVerarbeitungsLogStatusCounts(filter: VerarbeitungsLogFilter = {}) {
  const { search, von, bis } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: [
      "verarbeitungs_log_status_counts",
      tokens.join("\u0000"),
      dropped,
      von ?? "",
      bis ?? "",
    ],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, number>> => {
      if (dropped) return {};
      const rows = await fetchAllRows<{ status: string | null }>((from, to, withCount) =>
        applyLogFilter(
          supabase
            .from(TABLE.processingLog)
            .select("status", withCount ? { count: "exact" } : undefined),
          // The status filter is deliberately NOT passed: the chips must keep showing every status.
          { search, von, bis },
        )
          .order("processed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      );
      const counts: Record<string, number> = {};
      for (const r of rows) {
        if (r.status) counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      return counts;
    },
  });
}

/** One row of the generic change_history audit trail. */
export type ChangeHistoryEntry = {
  id: string;
  /** The timestamp column is `at`, NOT `created_at` — verified against the live payload. */
  at: string | null;
  actor: string | null;
  type: string | null;
  table_name: string | null;
  record_id: string | null;
  text: string | null;
  data: Record<string, unknown> | null;
};

/**
 * The app's change history, paged on the server.
 *
 * Audit issue #10: change_history holds role changes, restores, purges and deletions with their
 * reasons, is readable by every authenticated user, and had NO screen anywhere — the only place any
 * of it surfaced was per-record inside an invoice's own history. Anyone looking for "who changed
 * what" came to Protokoll first and found mail processing. This backs the screen's second tab.
 *
 * Paged and bounded from the start, deliberately: this is the same growing-forever shape that made
 * the status chips wrong (see useVerarbeitungsLogStatusCounts), so it is never read unbounded.
 */
export function useChangeHistoryPage(filter: { search?: string; page: number; pageSize: number }) {
  const { search, page, pageSize } = filter;
  const tokens = searchTokens(search ?? "");
  const dropped = searchWasDropped(search ?? "");
  return useQuery({
    queryKey: ["change_history_page", tokens.join("\u0000"), dropped, page, pageSize],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ChangeHistoryEntry[]; total: number }> => {
      if (dropped) return { rows: [], total: 0 };
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      // `sb` (the untyped cast), not `supabase`: change_history is not in the generated Database
      // type, same as every other write path in this file. See CLAUDE.md on the empty generated type.
      let query = sb.from(TABLE.changeHistory).select("*", { count: "exact" });
      for (const token of tokens) {
        query = query.or(
          `actor.ilike.%${token}%,type.ilike.%${token}%,table_name.ilike.%${token}%,text.ilike.%${token}%`,
        );
      }
      const { data, error, count } = await query
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ChangeHistoryEntry[], total: count ?? 0 };
    },
  });
}

export function useVerarbeitungsLogFuerBeleg(belegId: string) {
  return useQuery({
    queryKey: ["verarbeitungs_log", "beleg", belegId],
    enabled: !!belegId,
    staleTime: STALE,
    queryFn: async (): Promise<VerarbeitungsLog[]> => {
      const { data, error } = await supabase
        .from(TABLE.processingLog)
        .select("*")
        .eq("document_id", belegId)
        .order("processed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VerarbeitungsLog[];
    },
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

// Verlaufseintrag schreiben (Notiz, Statuswechsel, Änderung, Zuweisung, Löschung).
async function insertVerlauf(
  belegId: string,
  typ: string,
  text: string | null,
  daten: Record<string, unknown> | null = null,
) {
  const actor = await actorEmail();
  const { error } = await sb
    .from(TABLE.documentHistory)
    .insert({ document_id: belegId, type: typ, text, data: daten, actor });
  if (error) throw error;
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

/**
 * Keep supplier_bank_accounts in step with a write to `suppliers.iban`.
 *
 * The database does not enforce that the default account exists as a row -- the migration says so
 * explicitly and leaves it to the code -- so every path that sets `suppliers.iban` has to come
 * through here, or the table silently falls behind the column it is supposed to describe.
 *
 * Silent on a value that is not payable-shaped, and that is the point: `suppliers.iban` has always
 * accepted whatever the document reader printed, including fragments and two IBANs run together,
 * while supplier_bank_accounts refuses them. Throwing here would fail an otherwise valid supplier
 * edit over a field the Hub has never validated. The supplier keeps the raw text; the accounts
 * table keeps only what money can be sent to.
 */
async function mirrorIbanToBankAccount(
  supplierId: string,
  iban: unknown,
  bic?: unknown,
  bankName?: unknown,
): Promise<void> {
  const compact = compactIBAN(typeof iban === "string" ? iban : null);
  if (!isPayableIBAN(compact)) return;
  const actor = await actorEmail();
  const row: Record<string, unknown> = {
    supplier_id: supplierId,
    iban: compact,
    source: "human",
    is_active: true,
    // Typed by a person, so it is vouched for the moment it is saved. Left null it would arrive
    // wearing the amber "new IBAN" flag, which exists for accounts the PIPELINE read off a
    // document -- saying a supplier somebody just entered by hand needs checking against itself.
    confirmed_at: new Date().toISOString(),
    confirmed_by: actor,
    // This function only ever mirrors `suppliers.iban`, which IS the default account, so the flag
    // is set here rather than left to the database trigger. The trigger fires on UPDATE of
    // suppliers.iban only, and it fires BEFORE this row exists on both paths that matter: creating
    // a supplier is an INSERT, and an edit that changes the IBAN updates the supplier first.
    is_default: true,
    // Writing the default over a row hidden with a since-restored supplier must bring it back, or
    // the supplier keeps a default it cannot see.
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
    last_seen_at: new Date().toISOString(),
    created_by: actor,
  };
  if (typeof bic === "string" && bic) row.bic = bic;
  if (typeof bankName === "string" && bankName) row.bank_name = bankName;
  // Upsert, not insert: the same IBAN may already be on file as a deactivated account, and
  // supplier_bank_accounts_one_per_iban is not scoped to active rows.
  const { error } = await sb
    .from(TABLE.supplierBankAccounts)
    .upsert(row, { onConflict: "supplier_id,iban" });
  // Deliberately not rethrown. The supplier write has already succeeded; failing the mutation here
  // would tell the user their edit did not save when it did. The row is recoverable -- the next
  // edit, or the pipeline, writes it -- and the console keeps the reason.
  if (error) console.error("supplier_bank_accounts mirror failed", error);
}

// Lieferant (Kreditor) manuell anlegen. `normalized_name` stays pipeline-owned (single-source in
// Python), so it is not written here. Returns the new row.
export function useCreateLieferant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (werte: {
      name: string;
      address?: string | null;
      vat_id?: string | null;
      iban?: string | null;
      bic?: string | null;
      bank_name?: string | null;
      phone?: string | null;
      email?: string | null;
      contact_person?: string | null;
      /**
       * The accounts typed into the form. The one marked default is written onto the supplier row
       * as well, because `suppliers.iban` stays authoritative; the rest become plain account rows.
       */
      bankAccounts?: { iban: string; bic?: string | null; bank_name?: string | null }[];
    }): Promise<Lieferant> => {
      const { bankAccounts = [], ...supplierWerte } = werte;
      const { data, error } = await sb
        .from(TABLE.suppliers)
        .insert(supplierWerte)
        .select("*")
        .single();
      if (error) throw error;
      const lieferant = data as unknown as Lieferant;
      // The new supplier's IBAN has to exist as an account row too, or the default points at
      // nothing and the Bankverbindungen section opens empty on a supplier that plainly has one.
      // Skipped when the value is not payable-shaped: suppliers.iban accepts anything a reader
      // printed, supplier_bank_accounts does not, and a CHECK error here would lose the supplier
      // that was just created successfully.
      await mirrorIbanToBankAccount(
        lieferant.id,
        supplierWerte.iban,
        supplierWerte.bic,
        supplierWerte.bank_name,
      );
      // The additional accounts, written AFTER the default so the single-default trigger never has
      // to demote anything: each of these arrives with is_default left at its column default.
      const weitere = bankAccounts
        .map((k) => ({ ...k, iban: compactIBAN(k.iban) }))
        .filter((k) => isPayableIBAN(k.iban) && k.iban !== compactIBAN(supplierWerte.iban ?? null));
      if (weitere.length > 0) {
        const actor = await actorEmail();
        const { error: kontenError } = await sb.from(TABLE.supplierBankAccounts).upsert(
          weitere.map((k) => ({
            supplier_id: lieferant.id,
            iban: k.iban,
            bic: k.bic || null,
            bank_name: k.bank_name || null,
            source: "human",
            is_active: true,
            // Same reasoning as the default account above: a person typed these.
            confirmed_at: new Date().toISOString(),
            confirmed_by: actor,
            last_seen_at: new Date().toISOString(),
            created_by: actor,
          })),
          { onConflict: "supplier_id,iban" },
        );
        // Logged, not thrown: the supplier and its default account already exist, and failing the
        // mutation here would say the whole thing did not save when most of it did.
        if (kontenError) console.error("supplier_bank_accounts insert failed", kontenError);
      }
      return lieferant;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
    },
  });
}

// Lieferant-Stammdaten aktualisieren.
export function useUpdateLieferant(lieferantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Lieferant>) => {
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", lieferantId);
      if (error) throw error;
      // Editing the IBAN by hand is still a way to set the default, so it has to leave the same
      // trail as useSetDefaultSupplierIban would. Only when the field was actually part of this
      // edit -- a change to the phone number must not resurrect a deactivated account.
      if ("iban" in changes) {
        await mirrorIbanToBankAccount(lieferantId, changes.iban, changes.bic, changes.bank_name);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferant", lieferantId] });
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
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

// Lieferant löschen (Soft-Delete).
/**
 * Hide a supplier's bank accounts along with the supplier, or bring them back with it.
 *
 * Passing nulls is the restore: the same three columns cleared. `is_active` and `is_default` are
 * deliberately untouched either way, so a restored supplier comes back with exactly the accounts and
 * exactly the default it had when it was deleted.
 *
 * Not rethrown, same reasoning as mirrorIbanToBankAccount above: the supplier write has already
 * succeeded, and reporting a failure here would tell the user their delete did not happen when it
 * did. The supplier is hidden either way, so its accounts are unreachable in the UI regardless.
 */
async function softDeleteBankAccounts(
  supplierIds: string[],
  actor: string | null,
  grund: string | null,
  zeitpunkt: string | null,
): Promise<void> {
  if (supplierIds.length === 0) return;
  const { error } = await sb
    .from(TABLE.supplierBankAccounts)
    .update({ deleted_at: zeitpunkt, deleted_by: actor, delete_reason: grund })
    .in("supplier_id", supplierIds);
  if (error) console.error("supplier_bank_accounts soft delete failed", error);
}

// Lieferant löschen (Soft-Delete).
export function useSoftDeleteLieferant(lieferantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const jetzt = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({
          deleted_at: jetzt,
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
        })
        .eq("id", lieferantId);
      if (error) throw error;
      await softDeleteBankAccounts([lieferantId], actor, pflichtGrund(grund), jetzt);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

/**
 * Soft-delete or restore several suppliers at once.
 *
 * One statement rather than a loop of single updates: a partial failure halfway through a loop
 * leaves the selection in two different states with nothing saying where it stopped.
 *
 * Deliberately the only BULK action offered. Merging is not: it needs a surviving record chosen per
 * group, and "merge everything selected into one" is a different, lossier operation than what the
 * duplicates panel already does per group. Both of these are reversible; a bulk merge would not be.
 */
export function useBulkSetLieferantenGeloescht() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; loeschen: boolean; grund?: string }) => {
      if (args.ids.length === 0) return;
      const actor = await actorEmail();
      const zeitpunkt = args.loeschen ? new Date().toISOString() : null;
      const grund = args.loeschen ? pflichtGrund(args.grund) : null;
      const changes = args.loeschen
        ? { deleted_at: zeitpunkt, deleted_by: actor, delete_reason: grund }
        : { deleted_at: null, deleted_by: null, delete_reason: null };
      const { error } = await sb.from(TABLE.suppliers).update(changes).in("id", args.ids);
      if (error) throw error;
      // The accounts follow the suppliers, in both directions.
      await softDeleteBankAccounts(args.ids, args.loeschen ? actor : null, grund, zeitpunkt);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
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

/**
 * Bring a soft-deleted supplier back.
 *
 * Deleting was reversible in the data all along (`deleted_at` and friends) but not from anywhere in
 * the app: a supplier deleted by mistake could only be recovered in the database. The detail page
 * now offers this in place of its Delete button once the record is already deleted.
 *
 * `delete_reason` and `deleted_by` are cleared as well, so a later deletion cannot inherit the
 * reason from an earlier, undone one.
 */
export function useRestoreLieferant(lieferantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({ deleted_at: null, deleted_by: null, delete_reason: null })
        .eq("id", lieferantId);
      if (error) throw error;
      await softDeleteBankAccounts([lieferantId], null, null, null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["lieferant", lieferantId] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
    },
  });
}

// ---- Known spellings (entity_aliases, migrations 0003 / 0040 / 20260824110000) ----
//
// One table serves every kind of entity: 'gesellschaft' and 'objekt' are keyed by their CODE
// ('IMKO', 'DO-SUM'), 'lieferant' by the supplier's uuid. The pipeline reads the first two to map a
// name printed on a document to a canonical code; supplier aliases are the Hub's own record and are
// what merge_suppliers writes the merged-away name into.
//
// Since 20260824110000 an alias may name only ONE entity of its type, enforced by
// entity_aliases_one_owner_uniq on (entity_type, folded(alias)). That is why the add hook maps
// 23505 to a typed error instead of letting a raw Postgres message reach a German-only UI: the two
// unique indexes on this table mean two different things to the person typing.

export type EntityAliasType = "gesellschaft" | "objekt" | "lieferant";

export function useEntityAliases(entityType: EntityAliasType, entityCode: string) {
  return useQuery({
    queryKey: ["entity-aliases", entityType, entityCode],
    enabled: !!entityCode,
    staleTime: STALE,
    queryFn: async (): Promise<SupplierAlias[]> => {
      const { data, error } = await sb
        .from(TABLE.entityAliases)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_code", entityCode)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierAlias[];
    },
  });
}

export function useAddEntityAlias(entityType: EntityAliasType, entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alias: string) => {
      const actor = await actorEmail();
      const { error } = await sb.from(TABLE.entityAliases).insert({
        entity_type: entityType,
        entity_code: entityCode,
        alias: alias.trim(),
        created_by: actor,
      });
      if (!error) return;
      // Which index rejected it decides what the user should do about it, so the two are
      // distinguished here rather than both surfacing as "add failed".
      const detail = `${(error as { message?: string }).message ?? ""} ${
        (error as { details?: string }).details ?? ""
      }`;
      if ((error as { code?: string }).code === "23505") {
        // Another entity of this type already answers to this spelling. Nothing the caller can fix
        // by retrying -- somebody has to decide which entity keeps it.
        if (detail.includes("entity_aliases_one_owner_uniq")) throw new Error("ALIAS_CLAIMED");
        // This entity already has it, possibly as a deactivated row.
        throw new Error("ALIAS_EXISTS");
      }
      throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-aliases", entityType, entityCode] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
    },
  });
}

export function useDeactivateEntityAlias(entityType: EntityAliasType, entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await sb
        .from(TABLE.entityAliases)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-aliases", entityType, entityCode] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
    },
  });
}

// Supplier-scoped wrappers, kept because the merge flow and the supplier detail page already read
// through these names. They are the generic hooks with entity_type pinned.
export function useSupplierAliases(supplierId: string) {
  return useEntityAliases("lieferant", supplierId);
}

export function useAddSupplierAlias(supplierId: string) {
  return useAddEntityAlias("lieferant", supplierId);
}

export function useDeactivateSupplierAlias(supplierId: string) {
  return useDeactivateEntityAlias("lieferant", supplierId);
}

export function useSupplierDuplicates() {
  return useQuery({
    queryKey: ["supplier-duplicates"],
    staleTime: STALE,
    queryFn: async (): Promise<SupplierDuplicateGroup[]> => {
      const { data, error } = await sb.from(TABLE.vSupplierDuplicates).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SupplierDuplicateGroup[];
    },
  });
}

export function useMergeSuppliers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { keepId: string; mergeId: string; reason?: string }) => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("merge_suppliers", {
        p_keep_id: input.keepId,
        p_merge_id: input.mergeId,
        p_merged_by: actor,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as Lieferant;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      // Prefix-match invalidation: the RPC carries the merged-away supplier's IBAN history and
      // records its name as an alias under the SURVIVING id, so both the survivor's own queries
      // and the list page's unscoped "__all" history query need to refetch, not just the two
      // suppliers involved.
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

// ---- Manual "no receipt expected" ----
// The escape hatch for the cases no rule covers. Both go through security-definer RPCs (migration
// 0018) rather than a direct UPDATE — bank_transactions is Hub-owned but select-only for the client,
// and the RPC also enforces "never un-reconcile a matched payment".

export function useSetNoReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { transactionId: string; reason: OposCategory }) => {
      const { error } = await sb.rpc("opos_set_no_receipt", {
        p_transaction_id: args.transactionId,
        p_reason: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

export function useClearNoReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await sb.rpc("opos_clear_no_receipt", { p_transaction_id: transactionId });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Count of outgoing transactions currently hidden as "no receipt expected". Shown next to the
// Fehlende-Belege tab: the briefing is explicit that excluded amounts must stay visible, never
// silently disappear.
export function useNoReceiptCount() {
  return useQuery({
    queryKey: ["no_receipt_count"],
    staleTime: STALE,
    queryFn: async (): Promise<number> => {
      const { count, error } = await sb
        .from(TABLE.bankTransactions)
        .select("id", { count: "exact", head: true })
        .eq("matching_status", "ignored")
        .eq("direction", "ausgehend");
      if (error) throw error;
      return count ?? 0;
    },
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

// ===========================================================================
// BANKSapi bank reconciliation (Phase 1, read-only)
// Reads follow the existing `as unknown as` pattern; writes use `sb`. Rows are
// populated by the bank-sync Edge Function — the app only reads them + writes
// matches and invokes the functions (no BANKSapi secrets in the browser).
// ===========================================================================

export function useBankConnections() {
  return useQuery({
    queryKey: ["bank_connections"],
    staleTime: STALE,
    queryFn: async (): Promise<BankConnection[]> => {
      const { data, error } = await sb
        .from(TABLE.bankConnections)
        // The live name of whoever connected it; connected_by_email is the fallback when that
        // account is gone.
        .select(
          `*, connected_by_user:${TABLE.appUsers}!bank_connections_connected_by_fkey(name, email)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BankConnection[];
    },
  });
}

/** Accounts in use. Removed ones (`excluded_at`) are filtered out here rather than at every call
 *  site -- this hook feeds the Bankkonten table, the transaction filters and the import pickers,
 *  and a removed account has to be gone from all of them. Use `useExcludedBankAccounts` for the
 *  one screen that deliberately shows them again. */
export function useBankAccounts() {
  return useQuery({
    queryKey: ["bank_accounts"],
    staleTime: STALE,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await sb
        .from(TABLE.bankAccounts)
        .select("*")
        .is("excluded_at", null)
        // Soft-deleted rows are archives, not accounts. bank-disconnect leaves one behind for every
        // account that still holds a transaction matched to an invoice: stripped of its IBAN and
        // its product id so a reconnect cannot find it. Listing those would put a nameless,
        // IBAN-less row of a bank nobody is connected to any more in the middle of the table.
        .is("deleted_at", null)
        .order("account_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });
}

/** The removed accounts, so an exclusion can be undone from the UI instead of only in SQL. */
/**
 * One person spending on a Pleo card, with what they have actually spent.
 *
 * WALLET entries are NOT in here, see PLEO_NICHT_MITARBEITER below.
 *
 * WHY THIS IS DERIVED AND NOT FETCHED. Pleo's public API has no cards endpoint: the documented
 * families are accounting entries, export, tags, tax codes, webhooks, employees and the app
 * marketplace, and `GET /v2/employees` returns id, company, name, email, code, job title and phone
 * with no card data on it at all. There is no way to ask Pleo which cards exist. What we do have is
 * the spender on every entry it delivers -- `spenderOf()` in pleo-sync writes `spender_name` and
 * `spender_email` onto every row (migrations 20260901190000 and 20260901200000) -- so the people
 * holding the cards are already in the database, together with what they spent.
 */
export interface PleoSpender {
  /** Stable grouping key: the lower-cased email, falling back to the name, "" when Pleo gave neither. */
  key: string;
  name: string | null;
  email: string | null;
  anzahl: number;
  /** Sum of the signed amounts, so card spend is negative and a refund reduces it, exactly as on
   *  the statement. `signedAmount()` in _shared/pleo.ts negates Pleo's own positive "spent". */
  summe: number;
  letzteBuchung: string | null;
}

/** One person with a Pleo account, as the `pleo-employees` function returns them. */
export interface PleoEmployee {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  code: string | null;
  jobTitle: string | null;
}

/**
 * Everyone with a Pleo account, read live from Pleo through the `pleo-employees` function.
 *
 * NOT from bank_transactions, which is where this list used to come from. A list derived from
 * movements can only ever contain people who have SPENT, so a colleague holding a card they have
 * never used is invisible in it. That is the one thing the mirror cannot answer, and the only
 * reason this makes a live call at all: everything about spend stays where pleo-sync already put
 * it, and asking Pleo for it again would only produce a second answer that disagrees between syncs.
 *
 * It does not return cards. Pleo's public API has no cards endpoint, so an employee row is the
 * closest thing to "who has a card", and it carries no card number, status or limit.
 *
 * Five minutes of cache rather than the usual sixty seconds: headcount changes at the pace of
 * hiring, and every refetch is a round trip out to Pleo rather than a query against our own
 * database.
 */
export function usePleoEmployees(enabled = true) {
  return useQuery({
    queryKey: ["pleo_employees"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PleoEmployee[]> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.expenseToolEmployees, {
        body: {},
      });
      if (error) {
        // The function answers with a JSON body naming the reason, and a 403 specifically means the
        // API key does not carry the `users:read` scope. supabase-js flattens every non-2xx into
        // "Edge Function returned a non-2xx status code", which would tell the reader nothing.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) throw new Error(String(body.error));
        }
        throw error;
      }
      return ((data ?? {}) as { employees?: PleoEmployee[] }).employees ?? [];
    },
  });
}

export function useExcludedBankAccounts() {
  return useQuery({
    queryKey: ["bank_accounts", "excluded"],
    staleTime: STALE,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await sb
        .from(TABLE.bankAccounts)
        .select("*")
        .not("excluded_at", "is", null)
        .order("excluded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });
}

export type BankAccountFormValues = BankAccountFields;

// Both go through server functions (src/lib/api/bank-accounts.functions.ts), not a direct
// sb.from(TABLE.bankAccounts) write — RLS on that table is SELECT-only (migration 0059), same
// reasoning as useCreateManualBankAccount below.
export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: BankAccountFormValues) => createBankAccountFn({ data: values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_accounts"] }),
  });
}

/** A company reassignment propagates onto the account's bank_transactions (trigger, migration
 *  0025), so this invalidates the full match/reporting state, not just bank_accounts. */
export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: BankAccountFormValues & { accountId: string }) =>
      updateBankAccountFn({ data: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      invalidateMatchState(qc);
    },
  });
}

/**
 * What removing this account would destroy, counted BEFORE anything is deleted.
 *
 * excludeBankAccount counts the collateral as it purges and returns the totals afterwards, so the
 * dialog could only describe it in prose ("samt ihrer Zuordnungen zu Belegen") with no numbers. For
 * the one irreversible action on the screen that is the wrong order: the figures that say how much
 * reconciliation work is about to be unpicked are exactly what somebody needs in order to decide.
 *
 * Counted through an embedded !inner filter rather than by fetching the transaction ids and
 * chunking them into `.in()` lists (what the server function has to do, since it also deletes):
 * head + exact count means one round trip per table and no rows over the wire.
 */
export function useBankAccountPurgePreview(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bank_accounts", "purge_preview", accountId],
    enabled: enabled && !!accountId,
    // Deliberately uncached across openings: the point is to state what is true right now.
    staleTime: 0,
    queryFn: async (): Promise<{ transactions: number; matches: number; files: number }> => {
      const zaehle = async (table: string): Promise<number> => {
        const { count, error } = await sb
          .from(table)
          .select(`transaction_id, ${TABLE.bankTransactions}!inner(account_id)`, {
            count: "exact",
            head: true,
          })
          .eq("bank_transactions.account_id", accountId);
        if (error) throw error;
        return count ?? 0;
      };
      const [transactions, matches, outgoing, files] = await Promise.all([
        (async () => {
          const { count, error } = await sb
            .from(TABLE.bankTransactions)
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId);
          if (error) throw error;
          return count ?? 0;
        })(),
        zaehle(TABLE.documentTransactionMatches),
        zaehle(TABLE.outgoingInvoiceTransactionMatches),
        // document_files cascades off bank_transactions here (migration 0003) -- unlike the Immonetz
        // Hub, where no such FK exists. Attached receipt files really do go with the movements.
        zaehle(TABLE.documentFiles),
      ]);
      return { transactions, matches: matches + outgoing, files };
    },
  });
}

/** Remove an account from the Hub for good: its movements are purged and bank-sync stops
 *  importing the product. Invalidates the whole match/reporting state, not just the account list
 *  -- deleted movements take their invoice matches with them (FK cascade). */
export function useExcludeBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { accountId: string; reason?: string | null }) =>
      excludeBankAccountFn({ data: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      invalidateMatchState(qc);
    },
  });
}

export function useRestoreBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => restoreBankAccountFn({ data: { accountId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      invalidateMatchState(qc);
    },
  });
}

/**
 * Switch a bank account off, or back on.
 *
 * Not a delete and not "Konto entfernen": the row and every movement already imported stay exactly
 * where they are, and bank-sync simply stops fetching NEW movements for it. Reversible.
 *
 * It is the only honest answer for a provider-fed account, because BANKSapi has no per-account
 * DELETE -- only "all accesses" or "one bank access" -- so a deleted account is upserted straight
 * back by the next hourly run.
 */
export function useSetBankAccountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { accountId: string; isActive: boolean }) =>
      setBankAccountActiveFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_accounts"] }),
  });
}

export interface BankTransactionFilter {
  search?: string;
  matchingStatus?: string;
  richtung?: string;
  accountId?: string;
  transactionType?: string;
  /** Booking-date range, inclusive. Only the paginated list screen uses these. */
  bookingDateVon?: string;
  bookingDateBis?: string;
  /** A company id, or null for "no company assigned". Undefined means every company. */
  companyId?: string | null;
  /** Provenance of the row ('banksapi', 'pleo', …). */
  source?: string;
  /**
   * Whether a DOCUMENT hangs off the transaction itself (invoice_files.transaction_id, migration
   * 0074) -- the Pleo card receipt, not a matched invoice. "mit" | "ohne"; undefined means both.
   */
  beleg?: string;
  sort?: BankTransactionSort;
  dir?: "asc" | "desc";
  /**
   * PostgREST select list, defaulting to every column.
   *
   * Offene Posten passes a narrow one. This hook is the unpaginated variant, so it holds the whole
   * open scope at once: 2,718 rows and 4,197 kB on the this Hub with `*`, most of it the fts
   * tsvector and columns that screen never renders. Narrowing the request is the only lever it has,
   * since it genuinely needs every row to total and count them.
   */
  select?: string;
}

/** Sortable columns on the Banktransaktionen list. */
export type BankTransactionSort = "booking_date" | "amount" | "counterparty_holder";

/**
 * "ama" must find "Amazon": user queries run against the fts column as word PREFIXES, not whole
 * lexemes, because nobody types the full word before expecting results. Each term is stripped to
 * letters/digits (tsquery syntax characters would otherwise be parsed) and suffixed with :*;
 * terms are ANDed like websearch does. Returns null when nothing searchable remains.
 */
function prefixTsQuery(q: string): string | null {
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export function useBankTransactions(
  filter: BankTransactionFilter = {},
  opts?: { enabled?: boolean },
) {
  const { search, matchingStatus, richtung, accountId, transactionType } = filter;
  const spalten = filter.select ?? "*";
  const q = (search ?? "").trim();
  return useQuery({
    queryKey: [
      "bank_transactions",
      q,
      matchingStatus ?? "",
      richtung ?? "",
      accountId ?? "",
      transactionType ?? "",
      spalten,
    ],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    placeholderData: keepPreviousData, // typing a search must not blank the table
    queryFn: async (): Promise<BankTransaction[]> => {
      // A plain number searches the amount -- fts only ever covers counterparty/reference/
      // booking-text, never the numeric amount, so a numeric-looking query goes to
      // amountQueryFilter instead of textSearch (which would find nothing).
      const betragFilter = q ? amountQueryFilter(q) : null;
      // fetchAllRows works around the platform's per-request row cap (see its own comment) — this
      // hook is Offene Posten's "unpaginated, whole open scope" source, so a silent partial result
      // here reads as a wrong total/count, exactly the discrepancy that surfaced this bug: this tab
      // showed "1000" while the properly-paginated Manual Link picker's exact count read "2039".
      const rows = await fetchAllRows<BankTransaction>((from, to, withCount) => {
        let query = sb
          .from(TABLE.bankTransactions)
          .select(spalten, withCount ? { count: "exact" } : undefined);
        if (betragFilter) {
          query = query.or(betragFilter);
        } else if (q) {
          const tsq = prefixTsQuery(q);
          if (tsq) query = query.or(bankSearchFilter(q, tsq));
        }
        if (matchingStatus) query = query.eq("matching_status", matchingStatus);
        if (richtung) query = query.eq("direction", richtung);
        if (accountId) query = query.eq("account_id", accountId);
        // See the paginated variant: "unbekannt" covers null as well.
        if (transactionType === "unbekannt") {
          query = query.or("transaction_type.is.null,transaction_type.eq.unbekannt");
        } else if (transactionType) {
          query = query.eq("transaction_type", transactionType);
        }
        return query
          .order("booking_date", { ascending: false })
          .range(from, to) as unknown as Promise<{
          data: BankTransaction[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
      // The amount match is a DB filter now (amountQueryFilter), not a post-fetch pass over the
      // whole open scope, so the rows arriving here are already the answer -- and this tab's
      // count and EUR total, which are computed from exactly these rows, agree with the
      // server-paginated screens instead of being narrowed afterwards.
      return rows;
    },
  });
}

// Server-side paginated variant for the Banktransaktionen screen. Kept SEPARATE from
// useBankTransactions above, which Offene Posten's "Offene Banktransaktionen" tab needs
// unpaginated (it counts and totals the whole open set). Mirrors useBelegeListe: exact count +
// range, so the browser never has to hold a full bank history — with 26 accounts over several
// years that is the difference between one page and tens of thousands of rows.
/**
 * The bank list's text search, widened to the person who spent the money.
 *
 * `bank_transactions.fts` is a generated tsvector over payment_reference, booking_text and
 * counterparty_holder only (migration 0003). On a Pleo card purchase none of those name the
 * employee -- the merchant is the counterparty -- so typing a colleague's name returned the few
 * rows that merely mentioned it in a payment reference and none of their actual card spend.
 * Measured: "Gonzalez" matched 6 rows where 70 exist.
 *
 * An `or` beside the tsvector rather than a wider generated column, which would need a migration
 * and a table rewrite. The two ilike terms are unindexed, but they run only when somebody types
 * and the search is already debounced.
 *
 * The term is stripped of the characters PostgREST's `or` grammar uses as syntax; leaving them in
 * turns a search for "Meier, Anna" into a filter list and a 400.
 */
function bankSearchFilter(q: string, tsq: string): string {
  const roh = q
    .trim()
    .replace(/[(),.*:"\\]/g, " ")
    .trim();
  const terms = [`fts.fts(german).${tsq}`];
  if (roh) terms.push(`spender_name.ilike.*${roh}*`, `spender_email.ilike.*${roh}*`);
  return terms.join(",");
}

export function useBankTransactionsPage(
  filter: BankTransactionFilter & { page: number; pageSize: number },
) {
  const {
    search,
    matchingStatus,
    richtung,
    accountId,
    transactionType,
    bookingDateVon,
    bookingDateBis,
    companyId,
    source,
    beleg,
    sort,
    dir,
    page,
    pageSize,
  } = filter;
  const q = (search ?? "").trim();
  return useQuery({
    queryKey: [
      "bank_transactions_page",
      q,
      matchingStatus ?? "",
      richtung ?? "",
      accountId ?? "",
      transactionType ?? "",
      bookingDateVon ?? "",
      bookingDateBis ?? "",
      companyId === undefined ? "" : (companyId ?? "__null"),
      source ?? "",
      beleg ?? "",
      sort ?? "",
      dir ?? "",
      page,
      pageSize,
    ],
    staleTime: STALE,
    placeholderData: keepPreviousData, // no flash of empty table while paging
    queryFn: async (): Promise<{ rows: BankTransaction[]; total: number }> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      // "Has a document of its own" is an EXISTS over invoice_files, expressed as a PostgREST
      // embed so the filter, the count and the paging all stay server-side. `!inner` keeps only
      // parents with a match; the plain embed plus `invoice_files=is.null` is the anti-join.
      // Verified against live data: 1975 with + 1033 without = 3008 total, so neither direction
      // silently drops or double-counts a row. The embed is dropped entirely when no document
      // filter is active, so the ordinary list pays nothing for it.
      const belegEmbed =
        beleg === "mit"
          ? `,${TABLE.documentFiles}!inner(id)`
          : beleg === "ohne"
            ? `,${TABLE.documentFiles}(id)`
            : "";
      let query = sb.from(TABLE.bankTransactions).select(`*${belegEmbed}`, { count: "exact" });
      if (beleg === "mit") query = query.is(`${TABLE.documentFiles}.deleted_at`, null);
      else if (beleg === "ohne") query = query.is(TABLE.documentFiles, null);
      // Number typed -> amount search, anything else -> full text (see amountQueryFilter).
      const betragFilter = q ? amountQueryFilter(q) : null;
      if (betragFilter) query = query.or(betragFilter);
      else if (q) {
        const tsq = prefixTsQuery(q);
        if (tsq) query = query.or(bankSearchFilter(q, tsq));
      }

      // "suggestion" is NOT a matching_status value -- the column only holds offen/zugeordnet/
      // ignoriert, and a transaction carrying an open suggestion is still plain 'open'. The
      // suggestion lives in invoice_transaction_matches, so it is resolved to a transaction-id set
      // first and applied with .in(). Cheap by construction: suggestions are a tiny fraction of the
      // transaction table (11 of 2,760 today), and this avoids rebuilding the list around a view.
      if (matchingStatus === "suggestion") {
        const { data: rows, error: mErr } = await sb
          .from(TABLE.documentTransactionMatches)
          .select("transaction_id")
          .in("status", ["candidate", "auto"]);
        if (mErr) throw mErr;
        const ids = [
          ...new Set((rows ?? []).map((r: { transaction_id: string }) => r.transaction_id)),
        ];
        // An empty array must narrow to nothing, not silently drop the filter.
        query = ids.length > 0 ? query.in("id", ids) : query.is("id", null);
      } else if (matchingStatus) {
        query = query.eq("matching_status", matchingStatus);
      }
      if (richtung) query = query.eq("direction", richtung);
      if (accountId) query = query.eq("account_id", accountId);
      // "unbekannt" has to include NULL too: rows imported before the classifier existed carry
      // null until the next sync fills them, and to the user both mean the same thing, namely
      // that this movement has no type yet. Filtering on the literal alone would hide them.
      if (transactionType === "unbekannt") {
        query = query.or("transaction_type.is.null,transaction_type.eq.unbekannt");
      } else if (transactionType) {
        query = query.eq("transaction_type", transactionType);
      }
      if (bookingDateVon) query = query.gte("booking_date", bookingDateVon);
      if (bookingDateBis) query = query.lte("booking_date", bookingDateBis);
      // Company and source are real columns, so Bank reconciliation's two dropdowns narrow the
      // query rather than the array afterwards. That is what lets this hook replace the
      // fetch-everything variant on that tab: filter, sort, count and page all happen server-side.
      if (companyId === null) query = query.is("company_id", null);
      else if (companyId) query = query.eq("company_id", companyId);
      if (source) query = query.eq("source", source);

      // Sorted server-side, so the order holds across all pages rather than only within the 25 rows
      // that happen to be on screen. `amount` sorts by the signed value: a mixed list has debits and
      // credits in it, and ordering by magnitude would need an expression PostgREST cannot express;
      // combine it with the Richtung filter to read one direction by size.
      const sortSpalte = sort ?? "booking_date";
      const { data, error, count } = await query
        .order(sortSpalte, { ascending: dir === "asc", nullsFirst: false })
        // Deterministic tiebreak: booking_date has many ties (a bank posts a whole day at once), and
        // without it Postgres may order tied rows differently per request, so the same transaction can
        // appear on two pages or on none.
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;

      // Attach "a suggestion is pending" per row. matching_status cannot express it -- it stays
      // 'open' while a candidate waits -- and the list selects from the base table, so it is
      // looked up for THIS PAGE's ids only (at most `pageSize` values, one small query) rather
      // than by rebuilding the list around a view.
      const pageRows = (data ?? []) as unknown as BankTransaction[];
      let suggestedIds = new Set<string>();
      if (pageRows.length > 0) {
        const { data: sug, error: sErr } = await sb
          .from(TABLE.documentTransactionMatches)
          .select("transaction_id")
          .in("status", ["candidate", "auto"])
          .in(
            "transaction_id",
            pageRows.map((r) => r.id),
          );
        if (sErr) throw sErr;
        suggestedIds = new Set(
          (sug ?? []).map((r: { transaction_id: string }) => r.transaction_id),
        );
      }

      // Same shape as the suggestion lookup above, and for the same reason: one small query for
      // THIS PAGE's ids rather than a view rebuild. `source` comes back with it so the row can say
      // WHERE the document came from -- "a receipt exists" and "an employee photographed it in
      // Pleo" are different degrees of evidence to a reviewer.
      const dokumentQuelle = new Map<string, string | null>();
      if (pageRows.length > 0) {
        const { data: docs, error: dErr } = await sb
          .from(TABLE.documentFiles)
          .select("transaction_id, source")
          .is("deleted_at", null)
          .in(
            "transaction_id",
            pageRows.map((r) => r.id),
          );
        if (dErr) throw dErr;
        for (const d of (docs ?? []) as { transaction_id: string; source: string | null }[]) {
          if (!dokumentQuelle.has(d.transaction_id)) {
            dokumentQuelle.set(d.transaction_id, d.source);
          }
        }
      }

      return {
        rows: pageRows.map((r) => ({
          ...r,
          has_suggested_match: suggestedIds.has(r.id),
          has_document: dokumentQuelle.has(r.id),
          document_source: dokumentQuelle.get(r.id) ?? null,
        })),
        total: count ?? 0,
      };
    },
  });
}

export interface OpenBankTransactionsInfiniteFilter {
  search?: string;
  matchingStatus?: string;
  richtung?: string;
  bookingDateVon?: string;
  bookingDateBis?: string;
  valueDateVon?: string;
  valueDateBis?: string;
  sort?: "booking_date" | "value_date" | "amount" | "name";
  dir?: "asc" | "desc";
  pageSize: number;
}

// A numeric query is an AMOUNT search, not a text search. The `fts` column covers counterparty,
// payment reference and booking text and never the amount, so typing the number that is right
// there in the Betrag column used to return "Keine Banktransaktionen" for a transaction on the
// very next line.
//
// Returns a PostgREST `or` filter (null when the query is not a number), so the match happens in
// the database: it survives range() paging and keeps the exact count, which the earlier in-memory
// version could not -- it had to fetch the whole scope and drop the count.
//
// Accepts what a person actually types, including the way the amount is rendered on screen:
// "9304,15", "9.304,15", "9304.15", "-9304", "9304,15 €". Both signs are matched, because a debit
// is stored negative and nobody types the minus. A query without decimals is a prefix of the euro
// amount rather than a whole value, so it matches the cent range above it: "9304" finds -9.304,15.
export function amountQueryFilter(q: string): string | null {
  const s = q.replace(/[€\s]/g, "");
  if (s === "" || s === "-") return null;
  const negativeAllowed = s.replace(/^-/, "");
  let euros: string;
  let cents = "";
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(negativeAllowed)) {
    // German grouping: 9.304 / 9.304,15
    const [ganz, dez = ""] = negativeAllowed.split(",");
    euros = ganz.replace(/\./g, "");
    cents = dez;
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(negativeAllowed)) {
    // English grouping: 9,304 / 9,304.15
    const [ganz, dez = ""] = negativeAllowed.split(".");
    euros = ganz.replace(/,/g, "");
    cents = dez;
  } else if (/^\d+([.,]\d{1,2})?$/.test(negativeAllowed)) {
    // One separator and no grouping: it is the decimal one. 12.34 / 12,34 / 12
    const [ganz, dez = ""] = negativeAllowed.split(/[.,]/);
    euros = ganz;
    cents = dez;
  } else {
    return null; // "1.2.3", "abc", "4x" -> leave it to the text search
  }
  const wert = Number(cents ? `${euros}.${cents}` : euros);
  if (!Number.isFinite(wert)) return null;
  if (cents) {
    // A full amount was typed: match it exactly, in either direction.
    return wert === 0 ? "amount.eq.0" : `amount.eq.${wert},amount.eq.${-wert}`;
  }
  // Euros only: every amount whose euro part is this number, in either direction.
  const obere = wert + 1;
  return (
    `and(amount.gte.${wert},amount.lt.${obere}),` + `and(amount.gt.${-obere},amount.lte.${-wert})`
  );
}

// Server-driven counterpart to useBankTransactionsPage, for the Link-Manually tab's transaction
// picker: adds independent booking/value-date ranges and a generic sort (the page-numbered variant
// only ever sorts by booking_date) on top of the same filters, accumulated across pages instead of
// replacing one page with the next — see useOpenBelegeInfinite's comment for why this tab needs
// server-side, incrementally-loaded rows rather than the single unpaginated useBankTransactions.
export function useOpenBankTransactionsInfinite(
  filter: OpenBankTransactionsInfiniteFilter,
  opts?: { enabled?: boolean },
) {
  const {
    search,
    matchingStatus,
    richtung,
    bookingDateVon,
    bookingDateBis,
    valueDateVon,
    valueDateBis,
    sort = "booking_date",
    dir = "desc",
    pageSize,
  } = filter;
  const q = (search ?? "").trim();
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: [
      "open-bank-transactions-infinite",
      q,
      matchingStatus ?? "",
      richtung ?? "",
      bookingDateVon ?? "",
      bookingDateBis ?? "",
      valueDateVon ?? "",
      valueDateBis ?? "",
      sort,
      dir,
      pageSize,
    ],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    initialPageParam: 0,
    getNextPageParam: (_lastPage: InfinitePage<BankTransaction>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<BankTransaction>> => {
      // A plain number searches the amount — fts only ever covers counterparty/reference/
      // booking-text. amountQueryFilter expresses the amount match as a DB filter, so this
      // branch no longer has to fetch the whole open+direction scope and page it in memory: it
      // ranges and counts exactly like the text branch.
      const betragFilter = q ? amountQueryFilter(q) : null;

      let query = sb.from(TABLE.bankTransactions).select("*", { count: "exact" });
      if (betragFilter) {
        query = query.or(betragFilter);
      } else if (q) {
        for (const token of searchTokens(q)) {
          query = query.or(
            `counterparty_holder.ilike.%${token}%,payment_reference.ilike.%${token}%,booking_text.ilike.%${token}%`,
          );
        }
      }
      if (matchingStatus) query = query.eq("matching_status", matchingStatus);
      if (richtung) query = query.eq("direction", richtung);
      if (bookingDateVon) query = query.gte("booking_date", bookingDateVon);
      if (bookingDateBis) query = query.lte("booking_date", bookingDateBis);
      if (valueDateVon) query = query.gte("value_date", valueDateVon);
      if (valueDateBis) query = query.lte("value_date", valueDateBis);

      const column = sort === "name" ? "counterparty_holder" : sort === "amount" ? "amount" : sort;
      let ascending = dir === "asc";
      // "amount" sort means magnitude, not the raw signed value (a €500 debit should sort as
      // "bigger" than a €50 one, not smaller) — see manual-link-tab.tsx's compare() for the client
      // equivalent this replaces. Every row here shares one sign (this picker always sets richtung),
      // so flipping the raw order for a negative (ausgehend) set reproduces magnitude order exactly.
      if (sort === "amount" && richtung === "ausgehend") ascending = !ascending;
      query = query
        .order(column, { ascending, nullsFirst: false })
        .order("id", { ascending: true });

      const from = pageParam * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as BankTransaction[], total: count ?? 0 };
    },
  });
}

export function useBankTransaction(id: string) {
  return useQuery({
    queryKey: ["bank_transaction", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<BankTransaction | null> => {
      const { data, error } = await sb
        .from(TABLE.bankTransactions)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BankTransaction) ?? null;
    },
  });
}

// Matches for one beleg, with the embedded bank transaction (for the detail card).
export function useBelegMatches(belegId: string) {
  return useQuery({
    queryKey: ["beleg_matches", belegId],
    enabled: !!belegId,
    staleTime: STALE,
    queryFn: async (): Promise<BelegTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.documentTransactionMatches)
        .select(`*, ${TABLE.bankTransactions}(*)`)
        .eq("document_id", belegId)
        .neq("status", "rejected")
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BelegTransactionMatch[];
    },
  });
}

// Matches for one transaction, with the embedded beleg (candidate list on txn detail).
export function useTransactionMatches(transactionId: string) {
  return useQuery({
    queryKey: ["transaction_matches", transactionId],
    enabled: !!transactionId,
    staleTime: STALE,
    queryFn: async (): Promise<BelegTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.documentTransactionMatches)
        .select(`*, ${TABLE.documents}(*)`)
        .eq("transaction_id", transactionId)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BelegTransactionMatch[];
    },
  });
}

// How much of an invoice and of a transaction is already spoken for by CONFIRMED links, so the
// linking screen can pre-fill a split amount and show what is still open on either side.
//
// Goes through the two SQL helpers from migration 0024 rather than summing in the browser, so the
// number the user sees is produced by the same expression the RPC and the paid trigger use.
// Deliberately NOT cached (staleTime 0): it is read to decide a money amount, and a stale
// remainder would pre-fill an over-allocation that the server then rejects.
export function useMatchAllocation(invoiceId: string | null, transactionId: string | null) {
  return useQuery({
    queryKey: ["match_allocation", invoiceId ?? "", transactionId ?? ""],
    enabled: !!invoiceId && !!transactionId,
    staleTime: 0,
    queryFn: async (): Promise<{ invoiceMatched: number; transactionAllocated: number }> => {
      const [inv, txn] = await Promise.all([
        sb.rpc("invoice_matched_sum", { p_invoice: invoiceId }),
        sb.rpc("transaction_allocated_sum", { p_transaction: transactionId }),
      ]);
      if (inv.error) throw inv.error;
      if (txn.error) throw txn.error;
      return {
        invoiceMatched: Number(inv.data ?? 0),
        transactionAllocated: Number(txn.data ?? 0),
      };
    },
  });
}

// `refreshMs` polls, because the health strip built on this makes a claim about the present.
// react-query wants `false` rather than 0 to mean "do not poll", or it refetches as fast as it can.
export function useBankSyncLogs(limit = 100, refreshMs?: number) {
  return useQuery({
    queryKey: ["bank_sync_logs", limit],
    staleTime: STALE,
    refetchInterval: refreshMs && refreshMs > 0 ? refreshMs : false,
    queryFn: async (): Promise<BankSyncLog[]> => {
      const { data, error } = await sb
        .from(TABLE.bankSyncLogs)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as BankSyncLog[];
    },
  });
}

// Filtered + paginated sync log, with optional auto-refresh. Kept separate from useBankSyncLogs
// (which the health/overview widgets use with a plain limit). refreshMs=0/undefined disables polling —
// react-query wants `false`, not 0, or it polls as fast as it can.
export function useBankSyncLogsPage(filter: {
  event?: string;
  level?: string;
  connectionId?: string;
  /** Inclusive date bounds (YYYY-MM-DD). The log is append-only and never pruned, so without a
   *  way to jump to a date the older entries are unreachable in practice: an hourly cron writes
   *  ~4 rows a run whether or not anything happened (201 runs / 804 rows on the Immonetz Hub, all
   *  counters zero), which buries the runs that did something behind pages of no-ops. */
  von?: string;
  bis?: string;
  page: number;
  pageSize: number;
  refreshMs?: number;
}) {
  const { event, level, connectionId, von, bis, page, pageSize, refreshMs } = filter;
  return useQuery({
    queryKey: [
      "bank_sync_logs_page",
      event ?? "",
      level ?? "",
      connectionId ?? "",
      von ?? "",
      bis ?? "",
      page,
      pageSize,
    ],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    refetchInterval: refreshMs && refreshMs > 0 ? refreshMs : false,
    queryFn: async (): Promise<{ rows: BankSyncLog[]; total: number }> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = sb.from(TABLE.bankSyncLogs).select("*", { count: "exact" });
      if (event) query = query.eq("event", event);
      if (level) query = query.eq("level", level);
      if (connectionId) query = query.eq("connection_id", connectionId);
      // The picker yields a LOCAL calendar date; created_at is timestamptz and a naive bound is
      // read as UTC. Sending the raw string therefore filtered by UTC days while the table renders
      // local ones -- at UTC+5 an upper bound of "18 Aug" still kept rows the screen labels 19 Aug.
      // Parsing without a Z gives local midnight, and toISOString converts it, so the bounds mean
      // the day the reader actually sees.
      if (von) query = query.gte("created_at", new Date(`${von}T00:00:00`).toISOString());
      if (bis) query = query.lte("created_at", new Date(`${bis}T23:59:59.999`).toISOString());
      const { data, error, count } = await query
        // id is a bigint sequence, so it breaks created_at ties deterministically — several log rows
        // routinely share a timestamp (a sync writes them in one burst).
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as BankSyncLog[], total: count ?? 0 };
    },
  });
}

// Distinct values for the sync-log filters. Read from the data rather than hard-coded, so an event or
// level that only appears once something goes wrong (e.g. level 'error') shows up in the filter by
// itself instead of being unfilterable.
export function useBankSyncLogFacets() {
  return useQuery({
    queryKey: ["bank_sync_log_facets"],
    staleTime: STALE,
    queryFn: async (): Promise<{ events: string[]; levels: string[] }> => {
      // One row back, computed in the database (migration bank_sync_log_facets). This used to
      // select `event, level` with a 5000-row cap and take the distinct values here, which is the
      // one place the sync log really did read the whole table -- thousands of rows on every open
      // of the dialog, and wrong past the cap: a level that only appears when something breaks
      // would drop out of the filter exactly once the log grew long enough to need it.
      const { data, error } = await sb.rpc("bank_sync_log_facets").maybeSingle();
      if (!error && data) {
        const row = data as { events: string[] | null; levels: string[] | null };
        return { events: (row.events ?? []).sort(), levels: (row.levels ?? []).sort() };
      }
      // The function may not be deployed yet on a given project, and a filter that throws would
      // take the whole panel with it. Falls back to the old read, capped, until it is.
      const fallback = await sb.from(TABLE.bankSyncLogs).select("event, level").limit(5000);
      if (fallback.error) throw fallback.error;
      const rows = (fallback.data ?? []) as { event: string | null; level: string | null }[];
      const uniq = (vals: (string | null)[]) =>
        [...new Set(vals.filter((v): v is string => !!v))].sort();
      return { events: uniq(rows.map((r) => r.event)), levels: uniq(rows.map((r) => r.level)) };
    },
  });
}

// Ids of belege that have a confirmed match — used to derive "open items".
// Confirmed allocation totals for BOTH sides, keyed by id.
//
// Replaces the old useConfirmedBelegIds, which returned the mere SET of invoices having any
// confirmed match. That set was used to drop invoices out of Open items, so linking 400 of a 1.000
// invoice made it vanish and the second installment could never be added. Under m:n the question is
// never "is there a match" but "how much is still open", so this returns the sums.
export function useConfirmedAllocations() {
  return useQuery({
    queryKey: ["confirmed_allocations"],
    staleTime: STALE,
    queryFn: async (): Promise<{
      byInvoice: Map<string, number>;
      byTransaction: Map<string, number>;
    }> => {
      // Paged, not a flat select. This is the highest-cardinality table in the app (one row per
      // invoice-to-transaction allocation, m:n) so it crosses the platform's per-request row cap
      // long before invoices or suppliers do — and a truncated response here does not look like an
      // error, it looks like invoices that are suddenly unmatched: they drop out of the Cost
      // Analysis P&L entirely and reappear as open items.
      const rows = await fetchAllRows<{
        document_id: string;
        transaction_id: string;
        amount_matched: number | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.documentTransactionMatches)
          .select(
            "document_id, transaction_id, amount_matched",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, number>();
      const byTransaction = new Map<string, number>();
      for (const r of rows) {
        const amount = Math.abs(r.amount_matched ?? 0);
        byInvoice.set(r.document_id, (byInvoice.get(r.document_id) ?? 0) + amount);
        byTransaction.set(r.transaction_id, (byTransaction.get(r.transaction_id) ?? 0) + amount);
      }
      return { byInvoice, byTransaction };
    },
  });
}

// Which of our own bank accounts a confirmed match actually paid through — used only by the Cost
// Analysis account/IBAN filter (Briefing Screen 10). Separate from useConfirmedAllocations() (a
// different return shape for a different purpose) rather than folded into it, so its existing
// consumer (offene-posten/index.tsx) is untouched. A single invoice can be paid across several
// accounts (m:n matching, migration 0024), hence account ids as an array, not a single value.
export function useConfirmedMatchAccounts() {
  return useQuery({
    queryKey: ["confirmed_match_accounts"],
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, string[]>> => {
      // Paged for the same reason as useConfirmedAllocations above — same table, same cap.
      const rows = await fetchAllRows<{
        document_id: string;
        bank_transactions: { account_id: string } | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.documentTransactionMatches)
          .select(
            `document_id, ${TABLE.bankTransactions}(account_id)`,
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, string[]>();
      for (const r of rows) {
        const accountId = r.bank_transactions?.account_id;
        if (!accountId) continue;
        const cur = byInvoice.get(r.document_id) ?? [];
        if (!cur.includes(accountId)) cur.push(accountId);
        byInvoice.set(r.document_id, cur);
      }
      return byInvoice;
    },
  });
}

// ---- Outgoing-invoice matching (migration 0045) -- mirrors the incoming-side hooks above for the
// opposite direction (outgoing invoice / revenue <-> incoming credit transaction). ----

export function useOutgoingInvoiceMatches(outgoingInvoiceId: string) {
  return useQuery({
    queryKey: ["outgoing_invoice_matches", outgoingInvoiceId],
    enabled: !!outgoingInvoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoiceTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .select(`*, ${TABLE.bankTransactions}(*)`)
        .eq("outgoing_invoice_id", outgoingInvoiceId)
        .neq("status", "rejected")
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OutgoingInvoiceTransactionMatch[];
    },
  });
}

// Matches for one transaction, with the embedded outgoing invoice (candidate list on a credit
// transaction's detail).
export function useOutgoingTransactionMatches(transactionId: string) {
  return useQuery({
    queryKey: ["outgoing_transaction_matches", transactionId],
    enabled: !!transactionId,
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoiceTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .select(`*, ${TABLE.outgoingInvoices}(*, ${TABLE.customers}(*))`)
        .eq("transaction_id", transactionId)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OutgoingInvoiceTransactionMatch[];
    },
  });
}

export function useOutgoingMatchAllocation(
  outgoingInvoiceId: string | null,
  transactionId: string | null,
) {
  return useQuery({
    queryKey: ["outgoing_match_allocation", outgoingInvoiceId ?? "", transactionId ?? ""],
    enabled: !!outgoingInvoiceId && !!transactionId,
    staleTime: 0,
    queryFn: async (): Promise<{ invoiceMatched: number; transactionAllocated: number }> => {
      const [inv, txn] = await Promise.all([
        sb.rpc("outgoing_invoice_matched_sum", { p_outgoing_invoice: outgoingInvoiceId }),
        sb.rpc("outgoing_transaction_allocated_sum", { p_transaction: transactionId }),
      ]);
      if (inv.error) throw inv.error;
      if (txn.error) throw txn.error;
      return {
        invoiceMatched: Number(inv.data ?? 0),
        transactionAllocated: Number(txn.data ?? 0),
      };
    },
  });
}

// Confirmed allocation totals for both sides, keyed by id -- the outgoing-direction mirror of
// useConfirmedAllocations(). Used by Open Items (unmatched outgoing invoices) and Kostenanalyse
// (matched outgoing invoices feeding the Revenue line).
export function useConfirmedOutgoingAllocations() {
  return useQuery({
    queryKey: ["confirmed_outgoing_allocations"],
    staleTime: STALE,
    queryFn: async (): Promise<{
      byInvoice: Map<string, number>;
      byTransaction: Map<string, number>;
      confirmedAtByInvoice: Map<string, string>;
    }> => {
      // Paged for the same reason as useConfirmedAllocations — a truncated response here silently
      // removes revenue from the Cost Analysis instead of failing.
      const rows = await fetchAllRows<{
        outgoing_invoice_id: string;
        transaction_id: string;
        amount_matched: number | null;
        confirmed_at: string | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.outgoingInvoiceTransactionMatches)
          .select(
            "outgoing_invoice_id, transaction_id, amount_matched, confirmed_at",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, number>();
      const byTransaction = new Map<string, number>();
      const confirmedAtByInvoice = new Map<string, string>();
      for (const r of rows) {
        const amount = Math.abs(r.amount_matched ?? 0);
        byInvoice.set(r.outgoing_invoice_id, (byInvoice.get(r.outgoing_invoice_id) ?? 0) + amount);
        byTransaction.set(r.transaction_id, (byTransaction.get(r.transaction_id) ?? 0) + amount);
        // Latest confirmation date -- used as the "payment date" proxy for payment_date-basis
        // companies on the Kostenanalyse revenue line (no separate paid-at field exists here).
        const existing = confirmedAtByInvoice.get(r.outgoing_invoice_id);
        if (r.confirmed_at && (!existing || r.confirmed_at > existing)) {
          confirmedAtByInvoice.set(r.outgoing_invoice_id, r.confirmed_at);
        }
      }
      return { byInvoice, byTransaction, confirmedAtByInvoice };
    },
  });
}

// Verlaufseintrag on the generic change_history log (table_name/record_id), used for entities that
// have no dedicated *_history table -- outgoing_invoices is one (migration 0039's own header:
// deliberately no history table, since there is no "delete an invoice" action to build locally).

// Confirm a match: mark it bestaetigt, mark the transaction zugeordnet, log to the beleg, and let
// the rule engine learn from it (migration 0030). Learning is best-effort: a confirmation must
// never fail because the learning step had a problem, so its error is swallowed after a console
// warning rather than surfaced to the user or thrown from the mutation.
/**
 * Close the side that keeps a remainder after a link, from wherever the link was made.
 *
 * Both entry points ask the same question in the same dialog, so they have to answer it the same
 * way. It used to live inline in useManualLink only, which meant confirming a suggestion from the
 * transaction detail screen showed the checkbox, took the reason, and then dropped both.
 */
async function closeSidesAfterLink(args: {
  belegId: string;
  transactionId: string;
  closeInvoice?: boolean;
  closeTransaction?: boolean;
  differenceReason?: string;
}) {
  // THE INVOICE SIDE. link_invoice_transaction only closes an invoice that counts as covered, and
  // that is within payment_tolerance (min(3% of gross, 150 EUR)). Writing paid_at is what actually
  // closes a larger shortfall.
  if (args.closeInvoice) {
    const { error: paidError } = await sb
      .from(TABLE.documents)
      .update({
        paid_at: new Date().toISOString(),
        paid_source: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.belegId)
      .is("paid_at", null);
    if (paidError) {
      console.error("closeInvoice failed", paidError);
    } else {
      // Persisted audit text stays German; the event is what the history renders from.
      await insertVerlauf(
        args.belegId,
        "change",
        `Als vollständig bezahlt markiert, Restbetrag abgeschrieben${
          args.differenceReason ? `. Grund: ${args.differenceReason}` : ""
        }`,
        {
          event: "remainder_written_off",
          ...(args.differenceReason
            ? { grund: args.differenceReason, kommentar: args.differenceReason }
            : {}),
        },
      );
    }
  }

  // After the link, never before: the RPC refuses a transaction with nothing left to allocate, and
  // stamping one that then failed to link would leave a payment marked spent on nothing.
  if (args.closeTransaction) {
    const { error: closeError } = await sb.rpc("set_transaction_fully_used", {
      p_transaction_id: args.transactionId,
      p_note: args.differenceReason ?? null,
    });
    // Not rethrown: the match itself succeeded and is the thing the user asked for. Reporting a
    // failure here would say the link did not happen when it did -- the remainder simply stays
    // open, which is the visible, correctable state.
    if (closeError) console.error("set_transaction_fully_used failed", closeError);
  }
}

export function useConfirmMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      belegId: string;
      differenceReason?: string;
      /** Needed only to close the payment side; the match row already knows its transaction. */
      transactionId?: string;
      closeInvoice?: boolean;
      closeTransaction?: boolean;
    }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "confirmed",
          difference_reason: args.differenceReason ?? null,
          confirmed_by: actor,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertVerlauf(
        args.belegId,
        // Its own type, like 'zuordnung_getrennt', so the Workflow-Verlauf shows it. Plain
        // 'booking' is not an approval type, so a confirmed match only ever appeared there when
        // it happened to cover the invoice in full and the DB trigger added a 'bezahlt' row on top.
        // A partial confirm left the workflow tab silent about a reconciliation that did happen.
        "zuordnung_bestaetigt",
        // Persisted audit text stays German. `event` is what the screen renders from, so the row
        // can be read in either language; the sentence remains the record.
        "Banktransaktion zugeordnet (bestätigt)",
        { event: "match_confirmed" },
      );
      if ((args.closeInvoice || args.closeTransaction) && args.transactionId) {
        await closeSidesAfterLink({
          belegId: args.belegId,
          transactionId: args.transactionId,
          closeInvoice: args.closeInvoice,
          closeTransaction: args.closeTransaction,
          differenceReason: args.differenceReason,
        });
      }
      const { error: learnError } = await sb.rpc("learn_assignment_rule_from_match", {
        p_match: args.matchId,
        p_actor: actor,
      });
      if (learnError) {
        console.warn("learn_assignment_rule_from_match failed (non-fatal):", learnError);
      }
    },
    onSuccess: () => {
      invalidateMatchState(qc);
      invalidateRuleState(qc);
    },
  });
}

// Reject a match: mark it abgelehnt, log to the beleg.
export function useRejectMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; belegId: string; grund?: string }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "rejected",
          rejected_by: actor,
          rejected_at: now,
          reject_reason: args.grund ?? null,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertVerlauf(args.belegId, "booking", "Transaktions-Zuordnung abgelehnt", {
        event: "match_rejected",
      });
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

export function useLinkInvoiceTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      belegId: string;
      transactionId: string;
      score?: number | null;
      reasons?: Record<string, unknown> | null;
      amount?: number | null;
      differenceReason?: string;
      /**
       * Close the side that keeps a remainder after this allocation.
       *
       * `closeInvoice` needs nothing extra: link_invoice_transaction already withdraws the
       * invoice's other candidates once it counts as covered, and `difference_reason` records why
       * the gap was accepted. `closeTransaction` does need a second call -- the transaction's
       * status is derived from allocated amounts by a trigger, so a remainder is recomputed back
       * to 'open' unless the row itself is stamped (migration 20260910190000).
       */
      closeInvoice?: boolean;
      closeTransaction?: boolean;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("link_invoice_transaction", {
        p_invoice_id: args.belegId,
        p_transaction_id: args.transactionId,
        p_score: args.score ?? null,
        p_reasons: args.reasons ?? null,
        p_amount: args.amount ?? null,
        p_difference_reason: args.differenceReason ?? null,
      });
      if (error) throw error;

      await closeSidesAfterLink({
        belegId: args.belegId,
        transactionId: args.transactionId,
        closeInvoice: args.closeInvoice,
        closeTransaction: args.closeTransaction,
        differenceReason: args.differenceReason,
      });
      return data as string;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/**
 * Close the remainder on one side of a match that is already made.
 *
 * The manual-match dialog can close either side AT THE MOMENT OF LINKING, but a link made any other
 * way leaves no route to it: an invoice uploaded from a transaction is linked by a trigger once
 * extraction reads the amount (migration 20260911190000), and if the two differ the remainder just
 * sits there with no dialog left to reopen.
 *
 * Both sides drop out of the open lists once closed, which is the point. An invoice is open while
 * `paid_at is null`; a transaction is open while `matching_status = 'open'`.
 */
export function useCloseInvoiceRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { belegId: string; reason: string }) => {
      // paid_source 'manual' marks it a human decision, so the bank-match trigger never withdraws
      // it when coverage changes. The `is null` guard keeps an existing paid date intact.
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          paid_at: new Date().toISOString(),
          paid_source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.belegId)
        .is("paid_at", null);
      if (error) throw error;
      // Persisted audit text stays German.
      // The German sentence stays as the persisted record, the event is what the history renders
      // from, so the row reads in whichever language the reader picked.
      await insertVerlauf(
        args.belegId,
        "change",
        `Als vollständig bezahlt markiert, Restbetrag abgeschrieben. Grund: ${args.reason}`,
        { event: "remainder_written_off", grund: args.reason, kommentar: args.reason },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/**
 * Take a write-off back.
 *
 * The payment side has had `clear_transaction_fully_used` since it was built; the invoice side had
 * nothing, so a remainder written off by mistake could only be undone by unlinking the match. The
 * workflow walks back with it: an invoice that is no longer paid cannot stand at 'bezahlt'.
 */
export function useReopenInvoiceRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { belegId: string }) => {
      const { data: beleg } = await sb
        .from(TABLE.documents)
        .select("workflow_status")
        .eq("id", args.belegId)
        .maybeSingle();
      const patch: Record<string, unknown> = {
        paid_at: null,
        paid_source: null,
        updated_at: new Date().toISOString(),
      };
      if (beleg?.workflow_status === "paid") patch.workflow_status = "in_review";
      const { error } = await sb.from(TABLE.documents).update(patch).eq("id", args.belegId);
      if (error) throw error;
      // Persisted audit text stays German; the event is what the history renders from.
      await insertVerlauf(
        args.belegId,
        "change",
        "Restabschreibung zurückgenommen, Rechnung wieder offen.",
        { event: "remainder_reopened" },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** The payment side. Needs the stamp, because its status is recomputed from allocated amounts. */
export function useCloseTransactionRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { transactionId: string; reason: string }) => {
      const { error } = await sb.rpc("set_transaction_fully_used", {
        p_transaction_id: args.transactionId,
        p_note: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** Undo it. The status goes back to whatever the amounts say, so the remainder reopens. */
export function useReopenTransactionRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await sb.rpc("clear_transaction_fully_used", {
        p_transaction_id: transactionId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Confirm an outgoing match: mark it bestaetigt, mark the transaction zugeordnet via the same DB
// trigger as the incoming side (migration 0045). No rule-learning step -- outgoing invoices have
// no category to learn a rule for.
export function useConfirmOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      outgoingInvoiceId: string;
      differenceReason?: string;
      /** The payment side only. An outgoing invoice has no paid_at of its own to write off. */
      transactionId?: string;
      closeTransaction?: boolean;
    }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "confirmed",
          difference_reason: args.differenceReason ?? null,
          confirmed_by: actor,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        "Banktransaktion zugeordnet (bestätigt)",
      );
      if (args.closeTransaction && args.transactionId) {
        await closeSidesAfterLink({
          belegId: args.outgoingInvoiceId,
          transactionId: args.transactionId,
          closeTransaction: true,
          differenceReason: args.differenceReason,
        });
      }
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Reject an outgoing match: mark it abgelehnt, log to the outgoing invoice.
// Undo a CONFIRMED match: the pair goes back to being a SUGGESTION, not a rejection.
//
// "Trennen" used to reuse the reject mutation, which parked the row in 'rejected'. The panel then
// showed it as rejected with no way to link it again, although the dialog promises both sides go
// back to being open -- reported from the live app. 'candidate' is exactly what the matcher writes
// for a proposal, so the row reappears with its score and its Zuordnen button, and
// sync_transaction_matching_status flips the transaction back to 'open' because it counts only
// 'confirmed' rows. The confirmation stamps are cleared with it; the history keeps the record of
// what happened.
export function useUnlinkMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      belegId: string;
      grund?: string;
      /**
       * Walk the invoice back out of 'bezahlt' as part of the unlink.
       *
       * Opt-in because the paid switch already does its own walk-back before calling this, and
       * two of them would write two correction rows for one decision. The unlink BUTTONS pass it;
       * callers that have already handled the status do not.
       */
      walkBack?: boolean;
      /** Who the change was made as, when somebody is standing in for another person. */
      handelndAls?: Record<string, unknown>;
    }) => {
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "candidate",
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          reject_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.matchId);
      if (error) throw error;

      const grund = args.grund?.trim();

      // THE INVOICE CANNOT STAY AT 'BEZAHLT' WITH NOTHING BEHIND IT. advance_workflow_on_payment()
      // fires on paid_at null -> non-null and has no reverse, so removing the payment used to leave
      // the invoice standing at Bezahlt in the chain. Same rule and same target as the paid switch.
      let zurueckgesetzt = false;
      if (args.walkBack) {
        const { data: beleg } = await sb
          .from(TABLE.documents)
          .select("workflow_status, paid_source")
          .eq("id", args.belegId)
          .maybeSingle();
        if (beleg?.workflow_status === "paid") {
          const patch: Record<string, unknown> = {
            workflow_status: "in_review",
            updated_at: new Date().toISOString(),
          };
          // IS ANYTHING STILL BEHIND THE PAID MARK? This used to withdraw only 'bank_match', on the
          // grounds that a human who ticked the paid switch said something an unlink should not
          // overrule. Writing off a remainder also stores 'manual' (there is a CHECK constraint on
          // the column, so it cannot have a value of its own), and that decision is ONLY about this
          // allocation: unlink it and the invoice was left paid on nothing, so re-matching it read
          // "Restbetrag abgeschrieben" about a write-off that no longer applied.
          //
          // So the test is what is left, not who wrote it. Another confirmed link still standing
          // means the paid mark keeps its basis and is untouched. 'banksapi_payment' is a payment
          // that actually left the account and stands on its own whatever the matching says.
          const { count: verbleibende } = await sb
            .from(TABLE.documentTransactionMatches)
            .select("id", { count: "exact", head: true })
            .eq("document_id", args.belegId)
            .eq("status", "confirmed")
            .neq("id", args.matchId);
          if ((verbleibende ?? 0) === 0 && beleg.paid_source !== "banksapi_payment") {
            patch.paid_at = null;
            patch.paid_source = null;
          }
          const { error: wfError } = await sb
            .from(TABLE.documents)
            .update(patch)
            .eq("id", args.belegId);
          if (wfError) throw wfError;
          zurueckgesetzt = true;
        }
      }

      // 'zuordnung_getrennt' when the status moved, so this lands in the Workflow-Verlauf (which
      // renders APPROVAL_VERLAUF_TYPES only) under its own name. Not 'correction': that reads as
      // "status manually corrected", and nobody corrected anything -- a payment came off and the
      // status followed it. Plain 'booking' when nothing moved.
      // Persisted audit text stays German (do not translate).
      await insertVerlauf(
        args.belegId,
        zurueckgesetzt ? "zuordnung_getrennt" : "booking",
        grund
          ? `Banktransaktions-Zuordnung getrennt: ${grund}`
          : "Banktransaktions-Zuordnung getrennt",
        {
          event: "match_unlinked",
          ...(zurueckgesetzt ? { von: "paid", nach: "in_review" } : {}),
          // Both keys: `kommentar` is what the workflow timeline reads first, `grund` is what the
          // unlink flow has always written and what older rows carry.
          ...(grund ? { grund, kommentar: grund } : {}),
          ...(args.handelndAls ?? {}),
        },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** Credit side of useUnlinkMatch (outgoing invoices, migration 0045/0058). */
export function useUnlinkOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; outgoingInvoiceId: string; grund?: string }) => {
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "candidate",
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          reject_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.matchId);
      if (error) throw error;
      const grund = args.grund?.trim();
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        grund ? `Transaktions-Zuordnung getrennt: ${grund}` : "Transaktions-Zuordnung getrennt",
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

export function useRejectOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; outgoingInvoiceId: string; grund?: string }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "rejected",
          rejected_by: actor,
          rejected_at: now,
          reject_reason: args.grund ?? null,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        "Transaktions-Zuordnung abgelehnt",
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Manually link one outgoing invoice to one (credit) transaction -- the outgoing-direction mirror
// of useLinkInvoiceTransaction, going through the same kind of atomic RPC (migration 0045) for the
// same reasons: confirm + withdraw stale suggestions on both sides + release an OPOS whitelist hide,
// all in one transaction. `amount` left undefined takes whatever is still open on both sides.
export function useLinkOutgoingInvoiceTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      outgoingInvoiceId: string;
      transactionId: string;
      score?: number | null;
      reasons?: Record<string, unknown> | null;
      amount?: number | null;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("link_outgoing_invoice_transaction", {
        p_outgoing_invoice_id: args.outgoingInvoiceId,
        p_transaction_id: args.transactionId,
        p_score: args.score ?? null,
        p_reasons: args.reasons ?? null,
        p_amount: args.amount ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    // The RPC already writes the change_history entry, so no insertChangeHistory here.
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Invoke the bank-sync Edge Function (mock mode until BANKSapi is live).
export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.bankSync, { body: {} });
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_connections"] });
      qc.invalidateQueries({ queryKey: ["bank_sync_logs"] });
      invalidateMatchState(qc);
    },
  });
}

/**
 * What disconnecting this bank would hide, counted before anything is touched.
 *
 * Feeds the confirmation dialog, which has to name the scope rather than describe it in the
 * abstract. Deliberately uncached: the point is to state what is true right now.
 *
 * `umsaetzeZugeordnet` is the subset that backs an invoice match. Nothing is destroyed, so those
 * matches survive and the invoices stay paid, but the movement behind them stops being readable in
 * the app until the bank is reconnected. That is worth saying out loud rather than discovering.
 */
export interface DisconnectPreview {
  konten: number;
  umsaetze: number;
  umsaetzeZugeordnet: number;
  protokoll: number;
}

export function useDisconnectPreview(connectionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bank_connections", "disconnect_preview", connectionId],
    enabled: enabled && !!connectionId,
    staleTime: 0,
    queryFn: async (): Promise<DisconnectPreview> => {
      const zaehle = async (table: string): Promise<number> => {
        const { count, error } = await sb
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("connection_id", connectionId);
        if (error) throw error;
        return count ?? 0;
      };

      const matchIds = async (table: string): Promise<string[]> => {
        const rows = await fetchAllRows<{ transaction_id: string }>(
          (from, to, withCount) =>
            sb
              .from(table)
              .select(
                `transaction_id, ${TABLE.bankTransactions}!inner(connection_id)`,
                withCount ? { count: "exact" } : undefined,
              )
              .eq("bank_transactions.connection_id", connectionId)
              .range(from, to) as unknown as Promise<{
              data: { transaction_id: string }[] | null;
              error: unknown;
              count?: number | null;
            }>,
        );
        return rows.map((r) => r.transaction_id);
      };

      const [konten, umsaetze, protokoll, eingang, ausgang] = await Promise.all([
        zaehle(TABLE.bankAccounts),
        zaehle(TABLE.bankTransactions),
        zaehle(TABLE.bankSyncLogs),
        matchIds("invoice_transaction_matches"),
        matchIds("outgoing_invoice_transaction_matches"),
      ]);

      // Deduped across the two tables: one movement can be matched to an incoming and an outgoing
      // invoice, and counting it twice would overstate the figure.
      return {
        konten,
        umsaetze,
        umsaetzeZugeordnet: new Set([...eingang, ...ausgang]).size,
        protokoll,
      };
    },
  });
}

/**
 * Detach a whole bank.
 *
 * Deletes the BANKSapi access, then soft-deletes the connection, its accounts, their transactions
 * and its sync log. Nothing leaves the database: the rows, their invoice matches and the paid marks
 * those matches justify are all kept, they simply stop being visible and stop being synced.
 *
 * Reconnecting the same bank needs nothing extra: bank-sync revives a soft-deleted account when the
 * bank delivers its IBAN again, so it returns with its company, its name and its on/off flag, the
 * new movements are inserted alongside, and the old transactions and log entries stay hidden.
 *
 * This is the only removal BANKSapi offers. There is no per-account DELETE, which is why a single
 * account is switched off locally instead.
 */
export interface DisconnectResult {
  bank?: string | null;
  accountsHidden?: number;
  transactionsHidden?: number;
  logsHidden?: number;
}

export function useDisconnectBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { connectionId: string }): Promise<DisconnectResult> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.bankDisconnect, {
        body: { connectionId: vars.connectionId },
      });
      // The function answers 403/500 with a JSON body naming the reason. supabase-js turns any
      // non-2xx into a flat "Edge Function returned a non-2xx status code", which tells the user
      // nothing, so the body is read back off the response before giving up on it.
      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) throw new Error(String(body.error));
        }
        throw error;
      }
      return (data ?? {}) as DisconnectResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_connections"] });
      qc.invalidateQueries({ queryKey: ["bank_sync_logs"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      invalidateMatchState(qc);
    },
  });
}

/** Shape returned by bank-connect. `mode` is "mock" when BANKSAPI_MODE=mock — no bank was touched. */
export interface BankConnectResult {
  webformUrl?: string;
  accessId?: string;
  mode?: string;
}

/**
 * Start a bank connection. Returns the BANKSapi web-form URL the ACCOUNT HOLDER opens.
 *
 * `customerIp` must be the account holder's public IPv4 — the banks require it as proof of genuine
 * human interaction. The function falls back to the caller's forwarded IP, which is correct only
 * when the holder is the one clicking; in a supervised session the operator passes it explicitly.
 */
export function useStartBankConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      // maxTransactions=all is hardcoded in the wrapper, so it is not a parameter here.
      body: { callbackUrl?: string; customerIp?: string } = {},
    ): Promise<BankConnectResult> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.bankConnect, { body });
      if (error) throw error;
      const result = (data ?? {}) as BankConnectResult & { error?: string };
      // The function returns 200 with an { error } body for configuration problems, so a failure
      // would otherwise look like success with no URL.
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_connections"] }),
  });
}

// ---- Payment initiation (docs/BANKSAPI_PAYMENT_INITIATION.md, migration 0081) ----

// Every payment attempt for one invoice, newest first -- the invoice detail page reads the first
// row for its current status; older rows (a failed attempt followed by a retry) stay visible as
// history.
export function usePaymentOrders(invoiceId: string) {
  return useQuery({
    queryKey: ["payment_orders", invoiceId],
    enabled: !!invoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<PaymentOrder[]> => {
      const { data, error } = await sb
        .from(TABLE.paymentOrders)
        .select("*")
        .eq("document_id", invoiceId)
        .order("initiated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentOrder[];
    },
  });
}

// Invoke the payment-initiate Edge Function ("Jetzt bezahlen"). The Edge Function does its own
// server-side role check (supervisor/admin/super_admin) -- this hook is not the security
// boundary, only the call site; see payment-initiate/index.ts.
export function useInitiatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      invoiceId: string;
      bankAccountId: string;
      idempotencyKey: string;
      /**
       * Which of the SUPPLIER's accounts receives the money, as an id into
       * supplier_bank_accounts. An id rather than an IBAN on purpose: the caller picks among that
       * supplier's accounts, it does not get to name a destination. payment-initiate re-checks
       * that the account still belongs to this invoice's supplier before paying it. Omitted, the
       * supplier's default account is used.
       */
      recipientAccountId?: string;
      /** Overrides the invoice total, for a part payment or a corrected sum. */
      amount?: number;
      callbackUrl?: string;
    }): Promise<{ paymentOrder: PaymentOrder; webformUrl?: string; reused?: boolean }> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.paymentInitiate, {
        body,
      });
      if (error) throw error;
      return data as { paymentOrder: PaymentOrder; webformUrl?: string; reused?: boolean };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_orders", variables.invoiceId] });
      qc.invalidateQueries({ queryKey: ["beleg", variables.invoiceId] });
    },
    // payment-initiate may have already written a 'failed' payment_orders row (its own catch
    // block updates the draft before re-throwing) even though the request itself errors out here
    // — without this, the status readout keeps showing stale/cached data until an unrelated
    // refetch happens to run.
    onError: (_err, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_orders", variables.invoiceId] });
    },
  });
}

// Abandon a stuck payment attempt (draft/pending_sca/authorized) via the payment-cancel Edge
// Function, so a fresh "Jetzt bezahlen" attempt becomes possible again -- otherwise a payment
// whose SCA webform never got opened (popup blocked) or got closed by mistake stays permanently
// unpayable via the UI (JetztBezahlenSection disables the button while any attempt is open).
export function useCancelPaymentOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      paymentOrderId: string;
      invoiceId: string;
    }): Promise<{ paymentOrder: PaymentOrder }> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.paymentCancel, {
        body: { paymentOrderId: body.paymentOrderId },
      });
      if (error) throw error;
      return data as { paymentOrder: PaymentOrder };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_orders", variables.invoiceId] });
    },
  });
}

// ---- Manual bank-transaction import (source='manual', migration 0071/0082) ----
// The third inflow, for bank accounts BANKSapi cannot reach (communication thread 4). Both calls
// go through the src/lib/api/bank-manual-import.functions.ts server functions, never a direct
// table write — bank_accounts and bank_transactions are SELECT-only for `authenticated` under RLS
// (migration 0059). The create-account call returns a discriminated result (not a thrown error)
// for the "IBAN already exists" case, since a custom Error subclass's prototype isn't guaranteed
// to survive the client/server serverFn boundary the way a plain returned object is.

/** Create a bank_accounts row for a manual-upload account, then select it as the upload target. */
export function useCreateManualBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      companyId: string;
      accountName: string;
      iban: string;
      bic?: string;
      bankName?: string;
    }): Promise<CreateManualBankAccountResult | CreateManualBankAccountConflict> =>
      createManualBankAccountFn({ data: body }),
    onSuccess: (result) => {
      if (result.ok) qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    },
  });
}

/** Upload already-normalized rows (parsed + column-mapped client-side) for one bank account. */
export function useManualBankImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      accountId: string;
      filename: string;
      rows: NormalizedRow[];
    }): Promise<ImportManualTransactionsResult> => importManualBankTransactionsFn({ data: body }),
    onSuccess: () => {
      invalidateMatchState(qc);
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_sync_logs"] });
      qc.invalidateQueries({ queryKey: ["bank_sync_logs_page"] });
      qc.invalidateQueries({ queryKey: ["bank_sync_log_facets"] });
    },
  });
}

// ---- Review & assign: rules, review decisions, mail settings (migration 0025) ----

// Everything a rule screen or a receipt needs invalidating after a rule changes: the rule list,
// every preview count (a new rule can steal receipts from an existing one, so its preview moves
// too), and the receipts plus their history, because applying a rule rewrites both.
function invalidateRuleState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["assignment_rules"] });
  qc.invalidateQueries({ queryKey: ["assignment_rule_preview"] });
  qc.invalidateQueries({ queryKey: ["resolved_rules"] });
  // Applying assignment rules rewrites supplier/company/property, which are the columns
  // resolve_approval_rule matches a chain on. So "Regeln anwenden" can change which approval rule
  // wins, and with it who may act and what the workflow bar offers. invalidateApprovalState covers
  // this when a RULE is edited; nothing covered it when the INVOICE moved under a different rule,
  // so the resolved chain stayed cached until a full reload.
  qc.invalidateQueries({ queryKey: ["approval_rule_resolved"] });
  qc.invalidateQueries({ queryKey: ["beleg"] });
  qc.invalidateQueries({ queryKey: ["belege"] });
  qc.invalidateQueries({ queryKey: ["belege-liste"] });
  qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
}

// Active rule catalogue (soft-deleted rules stay in the table for the audit trail but never show).
// Ordered the way resolution reads them, most specific first, so the list itself explains which
// rule would win.
export function useAssignmentRules() {
  return useQuery({
    queryKey: ["assignment_rules"],
    staleTime: STALE,
    queryFn: async (): Promise<AssignmentRule[]> => {
      const { data, error } = await sb
        .from(TABLE.assignmentRules)
        .select("*")
        .is("deleted_at", null)
        .order("target", { ascending: true })
        .order("specificity", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRule[];
    },
  });
}

// Fields a caller may set on a rule. `specificity` is a generated column and must never be sent.
export type AssignmentRuleInput = {
  target: RuleTarget;
  cost_category?: string | null;
  // Structured taxonomy reference (migration 0030). Set this from the category Combobox; when
  // present it is canonical and cost_category becomes a derived display value.
  category_id?: string | null;
  vat_rate?: number | null;
  vat_treatment?: VatTreatment | null;
  // Additive to vat_rate on the same rule row (migration 0031). Only meaningful when
  // target === "vat_rate".
  vat_deductible_pct?: number | null;
  vat_special_case?: VatSpecialCase | null;
  supplier_id?: string | null;
  property_id?: string | null;
  company_id?: string | null;
  reference_pattern?: string | null;
  note?: string | null;
  is_active?: boolean;
};

export function useCreateAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignmentRuleInput): Promise<AssignmentRule> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.assignmentRules)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

export function useUpdateAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<AssignmentRuleInput> }) => {
      const { error } = await sb
        .from(TABLE.assignmentRules)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Soft delete. A rule that shaped past assignments has to stay auditable, so this is an UPDATE
// and the DB has no delete policy for the table at all.
export function useSoftDeleteAssignmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; grund: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.assignmentRules)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(args.grund),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Retroactive impact of one rule ("this rule would change 47 old receipts"). staleTime 0: the
// count is a decision aid shown right before the user commits, so it must not come from cache.
export function useRulePreview(ruleId: string | null) {
  return useQuery({
    queryKey: ["assignment_rule_preview", ruleId],
    enabled: !!ruleId,
    staleTime: 0,
    queryFn: async (): Promise<RulePreview> => {
      const { data, error } = await sb.rpc("assignment_rule_preview", { p_rule: ruleId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        matches: Number(row?.matches ?? 0),
        would_change: Number(row?.would_change ?? 0),
      };
    },
  });
}

// Retroactive impact of a rule that does not exist yet, so the create/edit dialog can show it
// BEFORE committing. `excludeRule` must be set when re-previewing an existing rule, otherwise the
// rule counts as its own competitor and the preview reports zero changes.
//
// Disabled until the scope is non-empty and the value is set: an unscoped query would describe a
// rule the DB would refuse to store anyway.
export function useRulePreviewScope(input: AssignmentRuleInput | null, excludeRule?: string) {
  const scopeSet =
    !!input &&
    !!(input.supplier_id || input.property_id || input.company_id || input.reference_pattern);
  const valueSet =
    !!input &&
    (input.target === "cost_category"
      ? !!input.cost_category || !!input.category_id
      : input.vat_rate != null);
  return useQuery({
    queryKey: ["assignment_rule_preview", "scope", input, excludeRule ?? null],
    enabled: scopeSet && valueSet,
    staleTime: 0,
    queryFn: async (): Promise<RulePreview> => {
      const { data, error } = await sb.rpc("assignment_rule_preview_scope", {
        p_target: input!.target,
        p_cost_category: input!.cost_category ?? null,
        p_vat_rate: input!.vat_rate ?? null,
        p_supplier_id: input!.supplier_id ?? null,
        p_property_id: input!.property_id ?? null,
        p_company_id: input!.company_id ?? null,
        p_reference_pattern: input!.reference_pattern ?? null,
        p_exclude_rule: excludeRule ?? null,
        p_vat_treatment: input!.vat_treatment ?? null,
        p_category_id: input!.category_id ?? null,
        p_vat_deductible_pct: input!.vat_deductible_pct ?? null,
        p_vat_special_case: input!.vat_special_case ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        matches: Number(row?.matches ?? 0),
        would_change: Number(row?.would_change ?? 0),
      };
    },
  });
}

// Which rule currently wins for this receipt, per target. Used to show "a rule would set X" next
// to a field, including when the field is human-set and therefore protected — seeing the rule you
// are overriding is the point.
export function useResolvedRules(belegId: string | null) {
  return useQuery({
    queryKey: ["resolved_rules", belegId],
    enabled: !!belegId,
    staleTime: 0,
    queryFn: async (): Promise<Record<RuleTarget, string | null>> => {
      const [cat, vat] = await Promise.all([
        sb.rpc("resolve_assignment_rule", { p_invoice: belegId, p_target: "cost_category" }),
        sb.rpc("resolve_assignment_rule", { p_invoice: belegId, p_target: "vat_rate" }),
      ]);
      if (cat.error) throw cat.error;
      if (vat.error) throw vat.error;
      return {
        cost_category: (cat.data as string | null) ?? null,
        vat_rate: (vat.data as string | null) ?? null,
      };
    },
  });
}

// Every rule matching one receipt + target, most specific first (migration 0056) — not just the
// winner useResolvedRules() above returns. Lets the UI show "N rules matched, X wins" instead of
// silently applying one of several candidates (Briefing Screen 4: "a clear priority is needed").
export type RuleCandidate = { rule_id: string; specificity: number; is_winner: boolean };

export function useAssignmentRuleCandidates(belegId: string | null, target: RuleTarget) {
  return useQuery({
    queryKey: ["resolved_rule_candidates", belegId, target],
    enabled: !!belegId,
    staleTime: 0,
    queryFn: async (): Promise<RuleCandidate[]> => {
      const { data, error } = await sb.rpc("resolve_assignment_rule_candidates", {
        p_invoice: belegId,
        p_target: target,
      });
      if (error) throw error;
      return (data ?? []) as RuleCandidate[];
    },
  });
}

// Apply the winning rules to one receipt. The RPC skips human-set fields and writes its own
// invoice_history entry, so there is no insertVerlauf here. Returns what it changed and what it
// deliberately left alone, so the caller can report the difference instead of claiming success.
export interface RuleApplyResult {
  changed: { field: string; from: unknown; to: unknown; rule_id: string }[];
  skipped: { field: string; reason: string; rule_id: string }[];
}

export function useApplyAssignmentRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (belegId: string): Promise<RuleApplyResult> => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("apply_assignment_rules", {
        p_invoice: belegId,
        p_actor: actor,
      });
      if (error) throw error;
      const r = (data ?? {}) as Partial<RuleApplyResult>;
      return { changed: r.changed ?? [], skipped: r.skipped ?? [] };
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Make a rule's retroactive effect actually happen (migration 0029): walks every receipt in the
// rule's scope and applies it, the same way the per-receipt button does, so "this rule would
// change 47 old receipts" is something a person can act on rather than only read.
export function useApplyAssignmentRuleBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string): Promise<RuleBulkApplyResult> => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("apply_assignment_rule_bulk", {
        p_rule: ruleId,
        p_actor: actor,
      });
      if (error) throw error;
      return data as RuleBulkApplyResult;
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// ---- Category taxonomy, account mapping & rule suggestions (migration 0030) ----

function invalidateCategoryState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["bwa_categories"] });
  qc.invalidateQueries({ queryKey: ["bwa_account_mapping"] });
  qc.invalidateQueries({ queryKey: ["rule_suggestions"] });
  // A category's name/active state can change what the rule engine's preview counts show.
  invalidateRuleState(qc);
}

// The full taxonomy, both levels together (soft-deleted rows excluded). Small (~87 rows) and
// changed rarely, so one query backs every consumer: the Kategorien tab's tree, the Regeln tab's
// category Combobox, and the Vorschläge tab's per-row dropdown.
export function useBwaCategories() {
  return useQuery({
    queryKey: ["bwa_categories"],
    staleTime: STALE,
    queryFn: async (): Promise<BwaCategory[]> => {
      const { data, error } = await sb
        .from(TABLE.categories)
        .select("*")
        .is("deleted_at", null)
        // The user's own drag order (migration 0076) wins; name only breaks ties, so two rows
        // that were never dragged still come back in a stable, readable order.
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BwaCategory[];
    },
  });
}

export type BwaCategoryInput = {
  code: string;
  name: string;
  name_en: string;
  parent_id?: string | null;
  report_block: BwaCategory["report_block"];
  report_line: string;
  direction: BwaCategory["direction"];
  note?: string | null;
};

export function useCreateBwaCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BwaCategoryInput): Promise<BwaCategory> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.categories)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as BwaCategory;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

export function useUpdateBwaCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<BwaCategoryInput> }) => {
      const { error } = await sb
        .from(TABLE.categories)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// Soft delete only: "every category remains changeable and deletable at any time" (briefing), but
// a rule or receipt that already references this category must keep resolving its name.
export function useSoftDeleteBwaCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; grund: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.categories)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(args.grund),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

/**
 * Persist a drag-and-drop reorder. Takes the ids of ONE level (either the parents of a tab, or
 * the children of a single parent) in their new visual order, and rewrites sort_order to match.
 *
 * Renumbered from scratch in steps of 10 rather than patched: recomputing is one predictable
 * write per row and cannot leave two siblings sharing a position, which is what would make the
 * order jump around on the next render. Steps of 10 keep room to insert without renumbering.
 */
export function useReorderBwaCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const stamp = new Date().toISOString();
      // Sequential rather than parallel: a level holds at most a few dozen rows, and PostgREST
      // gives clearer errors than a burst of concurrent PATCHes if one row is rejected.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from(TABLE.categories)
          .update({ sort_order: (i + 1) * 10, updated_at: stamp })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// Category-to-account mapping for one fiscal year. DATEV rebuilds the chart of accounts every
// year, so the mapping is read one year at a time rather than as one global list.
export function useBwaAccountMapping(fiscalYear: number, companyId: string | null) {
  return useQuery({
    queryKey: ["bwa_account_mapping", fiscalYear, companyId],
    staleTime: STALE,
    enabled: !!companyId,
    queryFn: async (): Promise<BwaAccountMapping[]> => {
      const { data, error } = await sb
        .from(TABLE.categoryAccountMapping)
        .select("*")
        .eq("fiscal_year", fiscalYear)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("account", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BwaAccountMapping[];
    },
  });
}

export type BwaAccountMappingRow = { account: string; category_id: string; note?: string | null };

// Imports a parsed CSV (fiscal_year, account, category_id) as a batch upsert, scoped to one
// company. The caller is expected to have already shown a preview (which rows are new vs.
// changed vs. unchanged) — this mutation just commits it, matching the same preview-before-apply
// pattern already used for assignment rules.
export function useImportBwaAccountMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      fiscalYear: number;
      companyId: string;
      rows: BwaAccountMappingRow[];
    }) => {
      const actor = await actorEmail();
      const { error } = await sb.from(TABLE.categoryAccountMapping).upsert(
        args.rows.map((r) => ({
          fiscal_year: args.fiscalYear,
          account: r.account,
          company_id: args.companyId,
          category_id: r.category_id,
          note: r.note ?? null,
          created_by: actor,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "fiscal_year,account,company_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCategoryState(qc),
  });
}

// AI extraction for the "Mit KI importieren" flow: a tax advisor's chart-of-accounts file
// (CSV/Excel parsed to text client-side, or PDF/image sent as a file) comes back as rows the user
// still reviews in a preview before anything is written — the write itself reuses
// useImportBwaAccountMapping above, same mutation the manual import used to use.
export function useExtractChartOfAccounts() {
  return useMutation({
    mutationFn: (
      args:
        | {
            mode: "file";
            filename: string;
            mime: "application/pdf" | "image/jpeg" | "image/png";
            fileBase64: string;
          }
        | { mode: "text"; filename: string; textContent: string },
    ) => extractChartOfAccounts({ data: args }),
  });
}

// Bulk rule suggestions from existing receipts (Vorschläge tab): suppliers not yet covered by an
// active cost_category rule, grouped by their most common existing category.
export function useSuggestAssignmentRules() {
  return useQuery({
    queryKey: ["rule_suggestions"],
    staleTime: STALE,
    queryFn: async (): Promise<RuleSuggestion[]> => {
      const { data, error } = await sb.rpc("suggest_assignment_rules");
      if (error) throw error;
      return (data ?? []) as RuleSuggestion[];
    },
  });
}

// Confirms a batch of suggestions as real rules, one create per suggestion (each still goes
// through the same assignment_rules insert everything else uses, so a duplicate-scope conflict on
// one row surfaces clearly rather than silently skipping).
export function useBulkCreateAssignmentRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      inputs: AssignmentRuleInput[],
    ): Promise<{ created: number; failed: number; succeededSupplierIds: string[] }> => {
      const actor = await actorEmail();
      // Independent inserts, run in parallel rather than one-at-a-time — the results are matched
      // back to their own input by array position (allSettled preserves order), so the caller can
      // tell exactly which supplier's rule actually landed instead of only a total count.
      const results = await Promise.allSettled(
        inputs.map((input) =>
          sb.from(TABLE.assignmentRules).insert({ ...input, created_by: actor }),
        ),
      );
      let created = 0;
      let failed = 0;
      const succeededSupplierIds: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && !r.value.error) {
          created += 1;
          if (inputs[i].supplier_id) succeededSupplierIds.push(inputs[i].supplier_id!);
        } else {
          failed += 1;
        }
      });
      return { created, failed, succeededSupplierIds };
    },
    onSuccess: () => invalidateRuleState(qc),
  });
}

// Human sets or clears a bank transaction's category (offene-posten). bank_transactions has no
// direct UPDATE policy for authenticated (SELECT only, migration 0046), so this goes through the
// SECURITY DEFINER RPC opos_set_category, same shape as useSetNoReceipt/opos_set_no_receipt above.
// The category itself (rule-suggested or human-set) is read straight off BankTransaction.category_id
// — already resolved and persisted by the categorize trigger (migration 0057), no separate query.
export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { transactionId: string; categoryId: string | null }) => {
      const { error } = await sb.rpc("opos_set_category", {
        p_transaction_id: args.transactionId,
        p_category_id: args.categoryId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_transactions"] }),
  });
}

// ---- Manual booking (Briefing Screen 11; migration 0033) ----

function invalidateManualBookingState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["manual_bookings"] });
}

// Expanded rows in [von, bis] — a recurring booking already appears once per calendar month it
// covers (RPC manual_bookings_expanded), so the caller never expands it itself. companyId null
// means every company (migration 0034), e.g. Auswertungen's "Alle Gesellschaften" view.
export function useManualBookings(
  companyId: string | null,
  von: string | null,
  bis: string | null,
) {
  return useQuery({
    queryKey: ["manual_bookings", companyId, von, bis],
    enabled: !!von && !!bis,
    staleTime: STALE,
    queryFn: async (): Promise<ManualBookingExpanded[]> => {
      const { data, error } = await sb.rpc("manual_bookings_expanded", {
        p_company: companyId,
        p_von: von,
        p_bis: bis,
      });
      if (error) throw error;
      return (data ?? []) as ManualBookingExpanded[];
    },
  });
}

// All non-deleted template rows for one company, regardless of period — for the management list
// (editing/deleting a template itself, not one of its expanded monthly occurrences). null
// companyId means "all companies" (the page's own default, ALLE_GESELLSCHAFTEN), mirroring
// useManualBookings above — the Aktionen column needs a template row for every visible booking
// regardless of which company filter is active, not just when one company is picked.
export function useManualBookingTemplates(companyId: string | null) {
  return useQuery({
    queryKey: ["manual_bookings", "templates", companyId],
    staleTime: STALE,
    queryFn: async (): Promise<ManualBooking[]> => {
      // Paged. A recurring booking with no end date already expands to ~240 rows per template
      // under the Kostenanalyse's 20-year span, so a handful of templates crosses the platform's
      // per-request row cap — and a truncated response here does not look like an error, it looks
      // like bookings that quietly stopped existing.
      return await fetchAllRows<ManualBooking>((from, to, withCount) => {
        let q = sb
          .from(TABLE.manualBookings)
          .select("*", withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null);
        if (companyId) q = q.eq("company_id", companyId);
        return q.order("period", { ascending: false }).range(from, to);
      });
    },
  });
}

export type ManualBookingInput = {
  company_id: string;
  property_id?: string | null;
  category_id: string;
  period: string;
  amount: number;
  note?: string | null;
  is_recurring?: boolean;
  recurrence_until?: string | null;
};

export function useCreateManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualBookingInput): Promise<ManualBooking> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.manualBookings)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      // Audit trail. These figures land in the management P&L on equal footing with receipts, and
      // until now nothing recorded who put them there beyond created_by — an EDIT left no trace at
      // all. Same convention restore_record()/purge_record() already follow.
      const row = data as ManualBooking;
      await insertChangeHistory("manual_bookings", row.id, "created", null, { ...input });
      return row;
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}

export function useUpdateManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<ManualBookingInput> }) => {
      const actor = await actorEmail();
      // Read the row BEFORE writing, so the trail records what the value was and not just what it
      // became. An amount that feeds the P&L could previously be rewritten leaving only updated_at.
      const { data: vorher } = await sb
        .from(TABLE.manualBookings)
        .select("*")
        .eq("id", args.id)
        .maybeSingle();
      const { error } = await sb
        .from(TABLE.manualBookings)
        .update({ ...args.changes, updated_at: new Date().toISOString(), updated_by: actor })
        .eq("id", args.id);
      if (error) throw error;
      await insertChangeHistory("manual_bookings", args.id, "updated", null, {
        vorher: vorher ?? null,
        nachher: args.changes,
      });
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}

// Soft delete only, same convention as bwa_categories: "remains changeable and deletable at any
// time", but nothing already referencing this row (e.g. an audit trail) loses its history.
export function useSoftDeleteManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; grund: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.manualBookings)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(args.grund),
        })
        .eq("id", args.id);
      if (error) throw error;
      await insertChangeHistory("manual_bookings", args.id, "deleted", args.grund || null);
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}

// ---- Approval workflow (Briefing Screen 6; migration 0035) ----
//
// Approve/return-with-query/reject all reduce to the same shape (set workflow_status, log one
// invoice_history row) that `useUpdateBeleg` already provides — no separate mutation per action.
// The UI computes which `{ nextStatus, typ, text }` to pass via nextLegalActions in format.ts;
// the chain steps themselves are clicked on the workflow bar in eingangsrechnungen/$nr.tsx.

function invalidateApprovalState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["chain_people"] });
  qc.invalidateQueries({ queryKey: ["approval_rules"] });
  qc.invalidateQueries({ queryKey: ["approval_rule_resolved"] });
}

/**
 * The approval-chain directory: everybody who can be a step in a rule, be assigned a receipt, or
 * be named as somebody's deputy.
 *
 * Read through the `chain_people()` RPC rather than a plain select on app_users, because
 * app_users is admin-only and this list is named to EVERYONE: the invoice list's responsible
 * person, the overdue and deputy warnings, the assignment picker. Selecting app_users directly
 * would return an empty array for an ordinary user, which is not an error and would therefore
 * blank all of those without a word. See migration 20260901160200.
 *
 * Inactive people are INCLUDED. An approval_rules row keeps naming somebody after they are
 * deactivated (deactivating never rewrites rules), so filtering them out here would make "this
 * rule points at somebody who cannot act" look identical to "nobody is responsible" -- the exact
 * distinction the invoice screen's deactivated warning exists to draw. Callers that must not
 * OFFER somebody filter on `is_active` themselves.
 */
export function useChainPeople() {
  return useQuery({
    queryKey: ["chain_people"],
    staleTime: STALE,
    queryFn: async (): Promise<ChainPerson[]> => {
      const { data, error } = await sb.rpc("chain_people");
      if (error) throw error;
      return (data ?? []) as ChainPerson[];
    },
  });
}

/** The same directory keyed by id, for the many places that hold an id and need to print a name. */
export function useChainPeopleById(): Map<string, ChainPerson> {
  const peopleQ = useChainPeople();
  return useMemo(() => new Map((peopleQ.data ?? []).map((p) => [p.id, p])), [peopleQ.data]);
}

/**
 * The signed-in person, as a chain member.
 *
 * Replaces useActingAs()'s name lookup against the approvers table for every ordinary path. That
 * lookup resolved to null for anybody who had simply never been registered as an approver, which
 * silently removed their approval buttons, their nav badges and their attention panel with no
 * message anywhere -- a person created in Team & Rollen and given the approval permission still
 * saw nothing. There is no such state now: everybody with an account is in the directory.
 */
export function useMeInChain(): ChainPerson | null {
  const { appUserId } = useAuth();
  const peopleQ = useChainPeople();
  return useMemo(
    () => (appUserId ? ((peopleQ.data ?? []).find((p) => p.id === appUserId) ?? null) : null),
    [peopleQ.data, appUserId],
  );
}

/**
 * Thrown instead of the raw Postgrest error when a write trips `app_users_one_active_per_area`
 * ("at most one active owner per exact area", migration 20260901160000), so Team & Rollen can show
 * a translated, actionable message rather than a Postgres constraint-violation string. `area` is
 * always set when this is thrown, so callers can rely on it to build the message.
 */
export class AreaConflictError extends Error {
  constructor(public area: NonNullable<ChainPerson["area"]>) {
    super(`Somebody already covers area "${area}"`);
    this.name = "AreaConflictError";
  }
}

/**
 * The three chain properties, edited on Team & Rollen.
 *
 * Saved on the spot, like the permission checklist and unlike role/company access, which are
 * staged until the dialog's own Save. These are independent single values with no cross-field
 * consequence, so staging them would only add a way to lose them by closing the dialog.
 *
 * `pays` is deliberately NOT here. It fed one hint sentence on the invoice screen, it
 * is a property of a company or a rule rather than of a person, and the client asked for it to go;
 * the old value stays on the frozen approvers row. See migration 20260901160000's header.
 */
export function useUpdateChainPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      userId: string;
      changes: Partial<
        Pick<ChainPerson, "deputy_user_id" | "escalation_days" | "area" | "covers_all_areas">
      >;
    }) => {
      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.userId);
      if (error) {
        const e = error as { code?: string; message: string };
        if (
          e.code === "23505" &&
          e.message.includes("app_users_one_active_per_area") &&
          args.changes.area
        ) {
          throw new AreaConflictError(args.changes.area);
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidateApprovalState(qc);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// Every active chain-config rule, most specific first (matches how they're picked, so the admin
// list reads top-to-bottom in priority order).
export function useApprovalRules() {
  return useQuery({
    queryKey: ["approval_rules"],
    staleTime: STALE,
    queryFn: async (): Promise<ApprovalRule[]> => {
      const { data, error } = await sb
        .from(TABLE.approvalRules)
        .select("*")
        .is("deleted_at", null)
        .order("specificity", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalRule[];
    },
  });
}

export type ApprovalRuleInput = {
  supplier_id?: string | null;
  property_id?: string | null;
  company_id?: string | null;
  min_amount?: number;
  step_1_user_id: string;
  step_2_user_id?: string | null;
  // True = deliberately single-step (migration 0087) -- leave step_2_user_id at NULL instead of
  // falling back to the invoice's area-based department head. Ignored when step_2_user_id is set.
  skip_step_2?: boolean;
  note?: string | null;
  is_active?: boolean;
};

export function useCreateApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApprovalRuleInput): Promise<ApprovalRule> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.approvalRules)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as ApprovalRule;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

export function useUpdateApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<ApprovalRuleInput> }) => {
      const { error } = await sb
        .from(TABLE.approvalRules)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

// Soft delete only, same convention as bwa_categories/manual_bookings/assignment_rules: a rule
// that shaped a past approval stays auditable even once retired.
export function useSoftDeleteApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; grund: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.approvalRules)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(args.grund),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

// The winning chain for one invoice (RPC resolve_approval_rule, migration 0035). Null when no
// rule matches at all, which should not happen once every company has its seeded fallback row.
export function useResolveApprovalRule(invoiceId: string | null) {
  return useQuery({
    queryKey: ["approval_rule_resolved", invoiceId],
    enabled: !!invoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<ApprovalRule | null> => {
      const { data, error } = await sb.rpc("resolve_approval_rule", { p_invoice_id: invoiceId });
      if (error) throw error;
      // "No rule matched" arrives as a RECORD OF NULLS, not as null: the function returns
      // approval_rules%ROWTYPE, and PostgREST serialises an empty row as an object with every
      // column set to null. `?? null` never fires, so every caller received a truthy object whose
      // approvers were empty -- which read as "a rule applies and names nobody" and, in
      // nextLegalActions, refused every action on every invoice that matched no rule.
      const row = data as ApprovalRule | null;
      return row && row.id ? row : null;
    },
  });
}

/**
 * Invoices whose most recent return of `type` is addressed to this person.
 *
 * The target is read off the invoice_history row the return action itself wrote. Since migration
 * 20260901160500 the app writes `data.recipient_user_id`, a real account reference; rows written
 * before that carry only `data.returned_to`, a display name, so both are matched. The name half is
 * a legacy path and will go quiet on its own as old rows age out -- do not build anything new on
 * it, and note it is the half that broke silently whenever somebody was renamed.
 */
function useInvoicesReturnedByType(
  historyType: "query" | "rejection",
  workflowStatus: WorkflowStatus,
  queryName: string,
  myUserId: string | null,
  myName: string | null,
) {
  return useQuery({
    queryKey: ["belege", queryName, myUserId, myName],
    enabled: !!myUserId || !!myName,
    staleTime: STALE,
    queryFn: async (): Promise<Beleg[]> => {
      const { data: invoices, error } = await sb
        .from(TABLE.documents)
        .select("*")
        .eq("workflow_status", workflowStatus)
        .is("deleted_at", null);
      if (error) throw error;
      const ids = ((invoices ?? []) as Beleg[]).map((b) => b.id);
      if (ids.length === 0) return [];

      const { data: history, error: histError } = await sb
        .from(TABLE.documentHistory)
        .select("document_id, data, created_at")
        .eq("type", historyType)
        .in("document_id", ids)
        .order("created_at", { ascending: false });
      if (histError) throw histError;

      // First occurrence per invoice wins -- history is ordered newest first.
      type Ziel = { recipient_user_id?: string; returned_to?: string };
      const zielProBeleg = new Map<string, Ziel>();
      for (const row of history ?? []) {
        if (!zielProBeleg.has(row.document_id)) {
          zielProBeleg.set(row.document_id, (row.data as Ziel | null) ?? {});
        }
      }

      return (invoices as Beleg[]).filter((b) => {
        const ziel = zielProBeleg.get(b.id);
        if (!ziel) return false;
        if (ziel.recipient_user_id) return ziel.recipient_user_id === myUserId;
        return !!myName && (ziel.returned_to ?? "").toLowerCase() === myName.toLowerCase();
      });
    },
  });
}

// Invoices parked in 'query' with the query addressed to this person -- the in-app "returned
// to me" notification (no email/push, per the app's recompute-live philosophy).
export function useInvoicesReturnedToMe(myUserId: string | null, myName: string | null) {
  return useInvoicesReturnedByType("query", "query", "query_to_me", myUserId, myName);
}

/**
 * Invoices handed to this person explicitly, and still somewhere in the approval phase.
 *
 * The plainest "this is waiting on you" signal the app has: unlike the rule-resolved chain it is
 * set because a human said so, so it needs no resolution to read back. Matched on
 * `assigned_user_id` (migration 20260901160400); the old `assigned_to` name match is deliberately
 * NOT included, because it is exactly the thing that broke whenever somebody was renamed.
 *
 * Terminal and post-approval statuses are excluded: an assignment that survives onto a paid,
 * rejected or handed-over invoice is a record of who dealt with it, not an open task, and listing
 * those under "waiting on you" would mean the count never drops.
 *
 * `workflow_status` is filtered client-side rather than with `.in()` because the column is
 * nullable and a NULL there means 'received' everywhere else in this codebase (see
 * nextLegalActions, which defaults it) -- a server-side `.in()` drops NULL rows silently, which
 * would hide exactly the freshest assignments.
 */
export function useInvoicesAssignedToMe(myUserId: string | null) {
  return useQuery({
    queryKey: ["belege", "zugewiesen_an_mich", myUserId],
    enabled: !!myUserId,
    staleTime: STALE,
    queryFn: async (): Promise<Beleg[]> => {
      const { data, error } = await sb
        .from(TABLE.documents)
        .select("*")
        .eq("assigned_user_id", myUserId!)
        .is("deleted_at", null);
      if (error) throw error;
      return ((data ?? []) as Beleg[]).filter((b) =>
        APPROVAL_PHASE_STATUSES.includes((b.workflow_status ?? "received") as WorkflowStatus),
      );
    },
  });
}

/**
 * "Who is acting" (Briefing Screen 6). Everybody is themselves; the SUPER ADMIN alone can act on
 * somebody else's behalf.
 *
 * WHAT CHANGED AND WHY. This used to resolve the signed-in account by matching its display name
 * against the `approvers` table, with a localStorage override offered to anyone holding
 * `invoices.override_workflow` (which is every Admin). Two problems: an account that had simply
 * never been registered as an approver resolved to null, which removed its approval buttons and
 * nav badges without a word; and the override was written into invoice_history as `handelnd_als`,
 * an assertion about who acted that nothing server-side ever checked.
 *
 * THE INVERSION THAT MATTERS. The old code matched the login name FIRST and only fell back to the
 * override. That worked only because the super admin was deliberately kept OUT of the approvers
 * table. The directory is now the employee list, the super admin is in it, so a name-first rule
 * would make the picker silently do nothing. The explicit choice therefore wins.
 *
 * This grants nothing. Every write is still checked against the SIGNED-IN account by
 * enforce_invoice_write_permissions(), and the super admin holds the whole catalogue
 * unconditionally (migration 20260901160300), so the picker can never reach a step that account
 * could not already take. It is break-glass for pushing a stuck receipt through, not a way to
 * borrow a permission.
 */
const ACTING_AS_CHANGED_EVENT = "hub:acting-as-changed";

/** The picker's "(nobody)" choice. It has to be a stored VALUE, not an absent key: an empty
 *  override falls through to "me", so the super admin could otherwise never clear the picker. */
export const ACTING_AS_NONE = "__keine";

// Keyed by user id now, not by name. A new key rather than the old one, so a stale name left in a
// browser from before this change resolves to nothing instead of being silently ignored forever.
const ACTING_AS_STORAGE_KEY = "freigabe_acting_as_id";

export function useActingAs() {
  const { role } = useAuth();
  const me = useMeInChain();
  const peopleQ = useChainPeople();
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);
  // The owner/technical account, and only it. This used to be invoices.override_workflow, which
  // every Admin holds by default -- a real narrowing, and the point of the change.
  const darfHandelnAls = role === "super_admin";

  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setOverride(window.localStorage.getItem(ACTING_AS_STORAGE_KEY));
    sync();
    // The native "storage" event fires in OTHER tabs only, never the one that made the change, so
    // a same-tab broadcast keeps every instance (nav badge, invoice screen) in step without a
    // reload.
    window.addEventListener(ACTING_AS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTING_AS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const actingAs = useMemo(() => {
    // Anybody else is themselves, whatever is left in their localStorage.
    if (!darfHandelnAls) return me;
    if (override === ACTING_AS_NONE) return null;
    // An override naming somebody who has since been deleted falls back to being yourself, rather
    // than to nobody: silently having no buttons is the failure mode this whole change removes.
    if (override) return people.find((p) => p.id === override) ?? me;
    return me;
  }, [darfHandelnAls, me, people, override]);

  function chooseActingAs(userId: string) {
    window.localStorage.setItem(ACTING_AS_STORAGE_KEY, userId);
    setOverride(userId);
    window.dispatchEvent(new Event(ACTING_AS_CHANGED_EVENT));
  }

  return { actingAs, people, chooseActingAs, darfHandelnAls };
}

/**
 * What the person currently being ACTED AS may do.
 *
 * "Handelnd als X" has to mean the whole screen behaves as X, not just the approval buttons.
 * Reading the permissions from useAuth() instead meant a super admin previewing somebody with no
 * rights at all could still edit fields, release payments and correct statuses -- while the label
 * said otherwise, and while any write it produced would be recorded as that person's.
 *
 * ONE RULE, NO EXCEPTIONS: every permission-gated control on the invoice screen asks this. The way
 * back to your own authority is to pick "Super Admin" in the picker, which is one click away and
 * says so.
 *
 * THIS IS A PREVIEW, NOT A SANDBOX. The database still checks the SIGNED-IN account on every write
 * (enforce_invoice_write_permissions), so acting as somebody with fewer rights does not make the
 * writes safer -- it makes the screen honest. The reverse case is what matters and is covered: the
 * UI no longer offers a button whose history entry would claim somebody took a step they could not.
 *
 * While the employee list is loading the answer is NO rather than a fallback to the signed-in
 * account: a flash of buttons that should not be there is worse than a flash of none, because it
 * is clickable. Only the super admin can act as somebody else, and only an admin can read
 * useEmployees(), so the two gates line up.
 */
export function useActingCapabilities() {
  const { appUserId, can } = useAuth();
  const actingAsState = useActingAs();
  const { actingAs } = actingAsState;
  const employeesQ = useEmployees();

  const istFremdeIdentitaet = !!actingAs && !!appUserId && actingAs.id !== appUserId;
  const fremdeRechte = useMemo(
    () =>
      istFremdeIdentitaet
        ? ((employeesQ.data ?? []).find((e) => e.id === actingAs?.id)?.permissions ?? null)
        : null,
    [istFremdeIdentitaet, employeesQ.data, actingAs?.id],
  );
  const darfAlsPerson = useCallback(
    (key: string) => (istFremdeIdentitaet ? (fremdeRechte?.includes(key) ?? false) : can(key)),
    [istFremdeIdentitaet, fremdeRechte, can],
  );

  return { ...actingAsState, istFremdeIdentitaet, darfAlsPerson };
}

// ---- VAT deductibility & tax reserve (Briefing Screen 5; migration 0031) ----

// Per-company input-VAT summary. A recommendation only, never a booking — staleTime 0 since this
// is read right before a decision (how much to set aside), not cached list data.
export function useVatReserve(companyId: string | null, von?: string | null, bis?: string | null) {
  return useQuery({
    queryKey: ["vat_reserve", companyId, von ?? null, bis ?? null],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async (): Promise<VatReserve> => {
      const { data, error } = await sb.rpc("vat_reserve", {
        p_company: companyId,
        p_von: von ?? null,
        p_bis: bis ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        company_id: row?.company_id ?? companyId!,
        von: row?.von ?? null,
        bis: row?.bis ?? null,
        input_vat_total: Number(row?.input_vat_total ?? 0),
        input_vat_deductible: Number(row?.input_vat_deductible ?? 0),
        input_vat_nondeductible: Number(row?.input_vat_nondeductible ?? 0),
        input_vat_unresolved_count: Number(row?.input_vat_unresolved_count ?? 0),
        input_vat_unresolved_amount: Number(row?.input_vat_unresolved_amount ?? 0),
        output_vat: Number(row?.output_vat ?? 0),
        reserve: Number(row?.reserve ?? 0),
      };
    },
  });
}

/**
 * The same figure for several companies at once, for the "Alle Gesellschaften" breakdown.
 *
 * Deliberately N calls rather than one summed figure: each company owes VAT to its own Finanzamt
 * separately, so a single combined number would be meaningless. `vat_reserve` takes one company,
 * so the fan-out happens here.
 */
export function useVatReserveAll(companyIds: string[], von?: string | null, bis?: string | null) {
  // Sorted so the key is stable no matter what order the caller's company list arrives in.
  const ids = [...companyIds].sort();
  return useQuery({
    queryKey: ["vat_reserve_all", ids, von ?? null, bis ?? null],
    enabled: ids.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<VatReserve[]> => {
      return Promise.all(
        ids.map(async (companyId): Promise<VatReserve> => {
          const { data, error } = await sb.rpc("vat_reserve", {
            p_company: companyId,
            p_von: von ?? null,
            p_bis: bis ?? null,
          });
          if (error) throw error;
          const row = Array.isArray(data) ? data[0] : data;
          return {
            company_id: row?.company_id ?? companyId,
            von: row?.von ?? null,
            bis: row?.bis ?? null,
            input_vat_total: Number(row?.input_vat_total ?? 0),
            input_vat_deductible: Number(row?.input_vat_deductible ?? 0),
            input_vat_nondeductible: Number(row?.input_vat_nondeductible ?? 0),
            input_vat_unresolved_count: Number(row?.input_vat_unresolved_count ?? 0),
            input_vat_unresolved_amount: Number(row?.input_vat_unresolved_amount ?? 0),
            output_vat: Number(row?.output_vat ?? 0),
            reserve: Number(row?.reserve ?? 0),
          };
        }),
      );
    },
  });
}

// ---- Review decisions: not relevant, archive ----

// "Not relevant": the receipt drops out of processing and is handed back to the mailbox.
// The physical mail move (reset label / mark unread) is a write against the real mailbox and
// lives in the external Python pipeline, so this only records the decision. The pipeline stamps
// mailbox_reset_at once the mail is actually back, which is why the UI reports the return as
// pending rather than done.
// Marking "not relevant" overwrites workflow_status with 'not_relevant'. Whatever approval stage
// the receipt was actually at (rueckfrage, freigegeben_vorgesetzter, ...) has to survive that
// overwrite somewhere, or undoing the mark can only ever restore 'received' — silently demoting a
// receipt that had already been approved. Stored in the history entry's `data` rather than a new
// column: it is exactly the kind of "what was true before this change" fact the audit trail exists
// for, and it needs no migration.
export function useSetNotRelevant(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { data: vorher, error: leseFehler } = await supabase
        .from(TABLE.documents)
        .select("workflow_status")
        .eq("id", belegId)
        .maybeSingle();
      if (leseFehler) throw leseFehler;
      const vorherStatus = vorher?.workflow_status ?? "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: new Date().toISOString(),
          not_relevant_by: actor,
          not_relevant_note: grund || null,
          workflow_status: "not_relevant",
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate).
      await insertVerlauf(
        belegId,
        "not_relevant",
        grund ? `Als nicht relevant markiert: ${grund}` : "Als nicht relevant markiert",
        { previous_workflow_status: vorherStatus },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

// Undo the "not relevant" decision and put the receipt back into the review queue, at the stage it
// was actually at before — read from the most recent "not_relevant" history entry this mutation's
// counterpart wrote. An older entry from before this field existed has no previous_workflow_status;
// 'received' is the fallback there, matching the previous (blunter) behaviour for those only.
// Clears mailbox_reset_at too: the pipeline's handshake refers to a return that is no longer wanted,
// and leaving a stale timestamp would make a later, real return look already done.
export function useClearNotRelevant(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: letzte, error: leseFehler } = await supabase
        .from(TABLE.documentHistory)
        .select("data")
        .eq("document_id", belegId)
        .eq("type", "not_relevant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leseFehler) throw leseFehler;
      const wiederherstellenStatus =
        (letzte?.data as { previous_workflow_status?: string } | null)?.previous_workflow_status ??
        "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: null,
          not_relevant_by: null,
          not_relevant_note: null,
          mailbox_reset_at: null,
          workflow_status: wiederherstellenStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate). The restored status is recorded as
      // its raw workflow_status value here (not a display label — queries.ts is the data layer and
      // deliberately does not import label formatting from format.ts); the history UI already knows
      // how to render a workflow_status value via workflowLabelDe.
      await insertVerlauf(
        belegId,
        "not_relevant",
        `Markierung nicht relevant aufgehoben (Status: ${wiederherstellenStatus})`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

// Archive a wrongly ingested receipt. Never a delete: the row stays, keeps its history, and the
// warning note records what the responsible person has to do about it elsewhere.
export function useArchiveBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hinweis: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          archived_at: new Date().toISOString(),
          archived_by: actor,
          archive_note: hinweis || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      await insertVerlauf(
        belegId,
        "archived",
        hinweis ? `Archiviert mit Hinweis: ${hinweis}` : "Archiviert",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

export function useUnarchiveBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          archived_at: null,
          archived_by: null,
          archive_note: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      await insertVerlauf(belegId, "archived", "Aus dem Archiv zurückgeholt");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

// ---- The same review decisions, applied to a selection on the list screen ----
//
// The single-invoice hooks above bind their id when the hook is created, which a list cannot do:
// it has one hook and many rows. These take the id per call instead.
//
// One UPDATE and one history entry per invoice, never a single statement over a set of ids. The
// audit trail has to say what happened to each receipt on its own, and a reviewer reading one
// invoice must not have to know it was part of a batch to understand its history.
//
// They deliberately do not invalidate. A run of fifty rows would otherwise refetch the list fifty
// times; `refresh()` is called once when the whole run is over.
export function useBulkInvoiceActions() {
  const qc = useQueryClient();
  const { data: gesellschaften } = useGesellschaften();

  async function archive(belegId: string, hinweis: string | null) {
    const actor = await actorEmail();
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        archived_at: new Date().toISOString(),
        archived_by: actor,
        archive_note: hinweis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    // Persisted audit text stays German (do not translate).
    await insertVerlauf(
      belegId,
      "archived",
      hinweis ? `Archiviert mit Hinweis: ${hinweis}` : "Archiviert",
    );
  }

  async function markNotRelevant(belegId: string, grund: string | null) {
    const actor = await actorEmail();
    const { data: vorher, error: leseFehler } = await supabase
      .from(TABLE.documents)
      .select("workflow_status")
      .eq("id", belegId)
      .maybeSingle();
    if (leseFehler) throw leseFehler;
    const vorherStatus = vorher?.workflow_status ?? "received";

    const { error } = await sb
      .from(TABLE.documents)
      .update({
        not_relevant_at: new Date().toISOString(),
        not_relevant_by: actor,
        not_relevant_note: grund,
        workflow_status: "not_relevant",
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    await insertVerlauf(
      belegId,
      "not_relevant",
      grund ? `Als nicht relevant markiert: ${grund}` : "Als nicht relevant markiert",
      { previous_workflow_status: vorherStatus },
    );
  }

  // Same three columns the detail screen writes: the code, the foreign key that has to agree with
  // it, and the provenance stamp that keeps the rule engine from overwriting a human decision.
  async function assignCompany(belegId: string, gesellschaftId: string | null) {
    const gesellschaft = (gesellschaften ?? []).find((g) => g.id === gesellschaftId);
    if (!gesellschaft) throw new Error("Unbekannte Gesellschaft.");
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        company_code: gesellschaft.code,
        company_id: gesellschaft.id,
        company_assignment_source: "human",
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    await insertVerlauf(belegId, "booking", `Gesellschaft gesetzt: ${gesellschaft.code}`);
  }

  async function softDelete(belegId: string, grund: string | null) {
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
  }

  // Every read the list screen makes. Spelled out rather than prefixed: the kanban keys are
  // "belege-kanban-counts" and "belege-kanban-spalte", and a prefix of "belege-kanban" matches
  // neither of them.
  function refresh() {
    qc.invalidateQueries({ queryKey: ["belege"] });
    qc.invalidateQueries({ queryKey: ["belege-liste"] });
    qc.invalidateQueries({ queryKey: ["belege-kpis"] });
    qc.invalidateQueries({ queryKey: ["belege-facets"] });
    qc.invalidateQueries({ queryKey: ["belege-ohne-gesellschaft"] });
    qc.invalidateQueries({ queryKey: ["belege-kanban-counts"] });
    qc.invalidateQueries({ queryKey: ["belege-kanban-spalte"] });
    qc.invalidateQueries({ queryKey: ["invoice-queue-kpis"] });
    qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
  }

  return { archive, markNotRelevant, assignCompany, softDelete, refresh };
}

// ---- Mail and Drive settings: RETIRED ----
//
// mail_settings was the Hub's own copy of the document-source configuration, while the pipeline
// read `channels` + `channel_folders`. Two stores for one fact: changing a folder here saved
// successfully and changed nothing about what got ingested.
//
// The hooks that read and wrote it are gone. The table itself is left in place, with its rows: it
// is still the fallback for a tenant whose storage.channel_config resolves to `mail_settings`
// rather than `channels`, which this client's no longer does. See useChannels() below and
// docs/TABLE_NAMING_MIGRATION.md.

// ---- Postfach folder pickers (Briefing Screen 1: pick a real folder, don't type its id) ----
//
// Longer staleTime than the usual data queries: a mailbox's/app folder's structure changes rarely
// (a person creating a new folder is an occasional, deliberate act), and every open of the
// Postfach screen re-running a live Graph/Dropbox call would be a slow, easily-avoided round trip
// for data that is essentially static within a session.
const POSTFACH_FOLDERS_STALE = 5 * 60_000;

export function useActorDisplay(email: string | null) {
  return useQuery({
    queryKey: ["actor_display", email],
    staleTime: POSTFACH_FOLDERS_STALE,
    enabled: Boolean(email),
    queryFn: async (): Promise<ActorDisplay> =>
      getActorDisplay({ data: { email: email as string } }),
  });
}

/**
 * The document sources, as the pipeline and the admin panel hold them.
 *
 * One store, two editors. The panel provisions a channel and its credentials; the Hub edits which
 * folders it reads and where it files. Both read these tables, so a change in either shows in the
 * other. mail_settings was the Hub's separate copy of the same fact and is no longer read.
 */
export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    staleTime: STALE,
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await sb
        .from(TABLE.channels)
        .select(
          "key, kind, provider, enabled, provider_ref, settings, position, updated_by, updated_at",
        )
        .order("position")
        .order("key");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });
}

export function useChannelFolders() {
  return useQuery({
    queryKey: ["channel_folders"],
    staleTime: STALE,
    queryFn: async (): Promise<ChannelFolder[]> => {
      const { data, error } = await sb
        .from(TABLE.channelFolders)
        .select("channel_key, identity, role, external_id, display_name, well_known_name, position")
        .order("position");
      if (error) throw error;
      return (data ?? []) as ChannelFolder[];
    },
  });
}

/**
 * Change a channel's own settings: whether it runs, and the one address or path it points at.
 *
 * `settings` is merged, never replaced. The column is shared with the pipeline and the panel, and
 * it carries keys this screen knows nothing about (a bucket, a provider hint). Writing a whole
 * object would drop them.
 *
 * The write REPORTS ITSELF, the same reasoning as mail_settings before it: an RLS-blocked update
 * matches no rows and returns success, so without the returned row a person without
 * postfach.settings would click Speichern, see "gespeichert", and have changed nothing.
 */
export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      key: string;
      enabled?: boolean;
      settings?: Record<string, unknown>;
    }) => {
      const actor = await actorEmail();
      const patch: Record<string, unknown> = {
        updated_by: actor,
        updated_at: new Date().toISOString(),
      };
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      if (args.settings) {
        const { data: current, error: readError } = await sb
          .from(TABLE.channels)
          .select("settings")
          .eq("key", args.key)
          .maybeSingle();
        if (readError) throw readError;
        patch.settings = {
          ...(((current as { settings?: Record<string, unknown> } | null)?.settings ??
            {}) as Record<string, unknown>),
          ...args.settings,
        };
      }
      const { data, error } = await sb
        .from(TABLE.channels)
        .update(patch)
        .eq("key", args.key)
        .select("key");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Diese Einstellungen dürfen nur Administratoren ändern. Es wurde nichts gespeichert.",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

/**
 * Replace the folders bound to one channel in one role.
 *
 * A set difference, not an update: a folder that is still ticked keeps its row, and with it the
 * display name and the delta bookmark scoped to that row. Deleting and re-inserting everything
 * would throw both away and make the next run re-read every folder.
 *
 * `identity` is taken from the rows already there, because it is the account the bindings belong
 * to and only the connection knows it. 'app' is the fallback, which is what a tenant
 * authenticating as the application uses.
 */
export function useSaveChannelFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      channelKey: string;
      role: ChannelFolderRole;
      ids: string[];
      // The name the picker showed, so a binding made here reads as a name in the panel and in
      // the Hub's own fallback, the way one made in the panel already does.
      names?: Record<string, string>;
    }) => {
      const actor = await actorEmail();
      const { data: existingRows, error: readError } = await sb
        .from(TABLE.channelFolders)
        .select("external_id, identity")
        .eq("channel_key", args.channelKey)
        .eq("role", args.role);
      if (readError) throw readError;
      const existing = (existingRows ?? []) as Array<{ external_id: string; identity: string }>;
      const identity = existing[0]?.identity ?? "app";
      const have = new Set(existing.map((row) => row.external_id));
      const want = new Set(args.ids);

      const gone = [...have].filter((id) => !want.has(id));
      if (gone.length > 0) {
        const { error } = await sb
          .from(TABLE.channelFolders)
          .delete()
          .eq("channel_key", args.channelKey)
          .eq("role", args.role)
          .in("external_id", gone);
        if (error) throw error;
      }

      const added = args.ids.filter((id) => !have.has(id));
      if (added.length > 0) {
        const { error } = await sb.from(TABLE.channelFolders).insert(
          added.map((id) => ({
            channel_key: args.channelKey,
            identity,
            role: args.role,
            external_id: id,
            display_name: args.names?.[id] ?? null,
            position: args.ids.indexOf(id),
            added_at: new Date().toISOString(),
            added_by: actor,
          })),
        );
        if (error) throw error;
      }

      // Nothing added and nothing removed still has to report itself, or a person without
      // postfach.settings sees a silent success. A delete that matches no row is not an error.
      if (gone.length === 0 && added.length === 0) return;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["channel_folders"] });
    },
  });
}

export function useMailboxFolders(enabled = true) {
  return useQuery({
    queryKey: ["postfach_mailbox_folders"],
    staleTime: POSTFACH_FOLDERS_STALE,
    enabled,
    queryFn: () => getMailboxFolders(),
  });
}

export function useFilingFolders(enabled = true) {
  return useQuery({
    queryKey: ["postfach_filing_folders"],
    staleTime: POSTFACH_FOLDERS_STALE,
    enabled,
    queryFn: () => getFilingFolders(),
  });
}

// ---- DATEV handover (Briefing Screen 9; migration 0038) ----

// Never carries the real address — the DB grants `authenticated` SELECT on every datev_routes
// column except `address` (see the migration), so selecting "*" here still cannot return it.
export function useDatevRoutes() {
  return useQuery({
    queryKey: ["datev_routes"],
    staleTime: STALE,
    queryFn: async (): Promise<DatevRoute[]> => {
      const { data, error } = await sb
        .from(TABLE.handoverRoutes)
        .select("id, company_id, direction, is_enabled, note, updated_by, created_at, updated_at")
        .order("company_id");
      if (error) throw error;
      return (data ?? []) as DatevRoute[];
    },
  });
}

// Blind write: sets/replaces the address without ever reading a current value back into the UI
// (the DB would refuse a SELECT of it anyway).
//
// The old `sameForBothDirections` flag is gone. It wrote one address into both the 'incoming' and
// 'outgoing' rows in a single call, on the assumption that a company with a "combined" address just
// had the same value entered twice. That stopped being true: DATEV issues a distinct
// @uploadmail.datev.de address per document category, all three differ per company, and the admin
// screen now edits all three in one dialog anyway (useSaveDatevRoutes below), so copying one value
// across directions would only ever be a way to send documents to the wrong inbox.
export type DatevRouteInput = {
  company_id: string;
  direction: DatevDirection;
  address: string;
  is_enabled?: boolean;
  note?: string | null;
};

/**
 * One direction's worth of the combined per-company editor.
 *
 * `address` is undefined when the operator left that field blank, which is NOT the same as clearing
 * it: the stored value can never be read back to prefill the input (blind write, migration 0038),
 * so a blank field can only mean "leave whatever is there alone". Writing "" would replace a
 * working upload address with an empty string, which the column would happily accept.
 */
export type DatevRouteEntry = {
  direction: DatevDirection;
  /** Set only when the operator typed a new address for this direction. */
  address?: string;
  is_enabled: boolean;
  note: string | null;
  /** The existing row's id, when there is one. Required to change status without an address. */
  existingId?: string;
};

// Both writes go through security-definer RPCs (migration 0038's set_datev_route /
// update_datev_route_status), not a direct table upsert/update. Column-level grants alone cannot
// support the upsert `authenticated` needs here: Postgres's `INSERT ... ON CONFLICT DO UPDATE`
// additionally requires SELECT privilege internally to resolve the conflict target, which would
// mean granting the very SELECT on `address` this table exists to withhold. The RPC runs with the
// function owner's privileges regardless of caller, sidestepping that entirely.
export function useSetDatevRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DatevRouteInput) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("set_datev_route", {
        p_company_id: input.company_id,
        p_direction: input.direction,
        p_address: input.address,
        p_is_enabled: input.is_enabled ?? true,
        p_note: input.note ?? null,
        p_updated_by: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

/**
 * Saves every direction of one company's DATEV configuration in a single action.
 *
 * WHY THIS EXISTS RATHER THAN N CALLS FROM THE DIALOG. There are three addresses per company and
 * one Save button; looping in the component would fire three independent mutations, three toasts,
 * and three cache invalidations, and a failure on the second would leave the operator looking at a
 * half-saved company with no single thing to retry. One mutation, one result.
 *
 * WHICH RPC PER ENTRY, AND WHY IT MATTERS. `set_datev_route` always writes the address column, so
 * it is only safe to call for a direction the operator actually typed into. A direction whose field
 * was left blank but whose switch or note changed goes through `update_datev_route_status`, which
 * touches neither the address nor anything else. An entry with no typed address and no existing row
 * has nothing to write at all and is skipped -- otherwise saving the dialog would create empty
 * routes for the two directions the operator did not fill in.
 *
 * Sequential, not Promise.all: these are three writes to the same company and a deterministic order
 * makes a partial failure legible in the logs. Three round trips on an admin screen used a handful
 * of times is not worth the parallelism.
 */
export function useSaveDatevRoutes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; entries: DatevRouteEntry[] }) => {
      const actor = await actorEmail();
      for (const entry of args.entries) {
        const address = entry.address?.trim();
        if (address) {
          const { error } = await sb.rpc("set_datev_route", {
            p_company_id: args.company_id,
            p_direction: entry.direction,
            p_address: address,
            p_is_enabled: entry.is_enabled,
            p_note: entry.note,
            p_updated_by: actor,
          });
          if (error) throw error;
        } else if (entry.existingId) {
          const { error } = await sb.rpc("update_datev_route_status", {
            p_id: entry.existingId,
            p_is_enabled: entry.is_enabled,
            p_note: entry.note,
            p_updated_by: actor,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

// Both fields are required (not partial) on purpose: the RPC always sets both, so a caller that
// only means to flip is_enabled must still pass the current note along or it gets silently wiped.
export function useUpdateDatevRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      changes: { is_enabled: boolean; note: string | null };
    }) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("update_datev_route_status", {
        p_id: args.id,
        p_is_enabled: args.changes.is_enabled,
        p_note: args.changes.note,
        p_updated_by: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_routes"] }),
  });
}

/**
 * The whole handover queue, every company, in one pass.
 *
 * WHY ONE HOOK FOR ALL COMPANIES INSTEAD OF ONE PER CARD. The screen used to mount
 * `useDatevReadiness(company.id)` inside each company's card, so N companies meant N independent
 * queries each with its own loading state, and the page filled in raggedly. Worse, none of them
 * could answer a question the screen needed to ask across companies ("is anything anywhere waiting
 * to go out?"), so the page never had a total. This runs once and hands back a per-company map;
 * the preview dialog reads the SAME cached rows rather than re-fetching what the card already has,
 * which is why opening it is instant.
 *
 * "READY" IS PAID, NOT PAID-AND-RECONCILED. The original rule (briefing / migration 0038) also
 * required a confirmed bank match via `is_invoice_reconciled`, and that gate was removed on
 * 2026-09-01 at the client's instruction. It was not idle: measured against the live database that
 * day, 62 invoices were `bezahlt` and unsent and NONE passed it — 60 had no bank-match row at all
 * and the other 2 only unconfirmed suggestions — because marking an invoice paid advances its
 * workflow on its own while a bank match counts only once somebody confirms it. The gate made the
 * handover unusable in practice, so payment is now the whole test.
 *
 * WHAT THAT COSTS, stated so nobody has to rediscover it: an invoice marked paid in error is now
 * one click from an irreversible email to the tax advisor, with no bank record required to back the
 * claim that it was paid. `handed_over_at` is still the stop that prevents sending twice.
 *
 * The send function applies the SAME rule (`triggerDatevHandover`) — these two must never diverge,
 * or the screen promises receipts the send will not deliver.
 *
 * `blocked` is the other half of the prediction: a receipt that satisfies the rule but whose stored
 * original DATEV will not take. See `@/lib/datev/attachment-rules`.
 */
export function useDatevHandoverStatus() {
  return useQuery({
    queryKey: ["datev_handover_status"],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, DatevCompanyStatus>> => {
      const { data: candidates, error: candidatesError } = await sb
        .from(TABLE.documents)
        .select("id, company_id, issuer, invoice_number, document_date, amount_gross")
        .eq("workflow_status", "paid")
        .is("handed_over_at", null)
        .is("deleted_at", null)
        .order("document_date", { ascending: true });
      if (candidatesError) throw candidatesError;

      type Candidate = {
        id: string;
        company_id: string;
        issuer: string | null;
        invoice_number: string | null;
        document_date: string | null;
        amount_gross: number | null;
      };
      const rows = (candidates ?? []) as Candidate[];

      // Every paid candidate is a candidate. The per-invoice `is_invoice_reconciled` round trip that
      // used to filter this list is gone with the rule it enforced — which also means this query no
      // longer fires one RPC per invoice, so a queue of hundreds is a single request now.
      const eligible = rows;

      // One `original` file row per candidate, WITHOUT the `content` column: the bytes are the whole
      // invoice and fetching them to render a preview list would pull the entire queue's PDFs into
      // the browser to display six words per row. `storage_path` and `size_bytes` are what let the
      // rule judge presence and size without them — see `@/lib/datev/attachment-rules`.
      const files = new Map<
        string,
        {
          mime: string | null;
          filename: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }
      >();
      // Chunked because these ids go into the request URL — a queue of a few hundred receipts would
      // otherwise build a query string long enough for the gateway to reject outright.
      for (let i = 0; i < eligible.length; i += 100) {
        const ids = eligible.slice(i, i + 100).map((r) => r.id);
        const { data, error } = await sb
          .from(TABLE.documentFiles)
          .select("document_id, filename, mime, storage_path, size_bytes")
          .eq("role", "original")
          .in("document_id", ids);
        if (error) throw error;
        for (const f of (data ?? []) as {
          document_id: string;
          filename: string | null;
          mime: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }[]) {
          files.set(f.document_id, {
            mime: f.mime,
            filename: f.filename,
            storage_path: f.storage_path,
            size_bytes: f.size_bytes,
          });
        }
      }

      // Already handed over, per company. Counted from ids rather than N head-count queries: one
      // request instead of one per company, and the column is a uuid either way.
      const { data: done, error: doneError } = await sb
        .from(TABLE.documents)
        .select("company_id")
        .not("handed_over_at", "is", null)
        .is("deleted_at", null);
      if (doneError) throw doneError;

      const out: Record<string, DatevCompanyStatus> = {};
      const bucket = (companyId: string): DatevCompanyStatus =>
        (out[companyId] ??= { ready: [], blocked: [], handedOver: 0 });

      for (const row of eligible) {
        const blockReason = datevBlockReason(files.get(row.id) ?? null);
        const invoice: DatevReadyInvoice = { ...row, blockReason };
        const target = bucket(row.company_id);
        if (blockReason) target.blocked.push(invoice);
        else target.ready.push(invoice);
      }
      for (const row of (done ?? []) as { company_id: string }[]) {
        bucket(row.company_id).handedOver += 1;
      }
      return out;
    },
  });
}

/**
 * The outgoing invoices a DATEV handover would carry, per company.
 *
 * Same eligibility rule as the incoming side, minus the workflow status: not yet handed over, not
 * deleted. An outgoing invoice has no `workflow_status`; `status` mirrors LexOffice and
 * means something else entirely, so issuance is the whole test.
 *
 * BLOCKING IS PER INVOICE, exactly as it is for incoming. An outgoing invoice whose file is
 * missing blocks on its own and the rest still go. An earlier version of this screen refused the
 * whole direction because no outgoing files existed anywhere on this database, which was a
 * fleet-wide observation standing in for a per-row rule; the moment one invoice has a file, that
 * was wrong.
 *
 * NEEDS `supabase db push`. `handed_over_at` and `handover_batch_id` arrive on
 * `outgoing_invoices` with migration `20260901180000_outgoing_datev_handover_columns.sql`. Without
 * it this query's filter has no column to read and the request fails, which is the loud failure of
 * the two available: the alternative is dropping the filter and re-sending everything already sent.
 *
 * Read only while the send drawer is open (`enabled`), so it costs nothing on page load.
 */
/**
 * Handovers the mail provider accepted and the tax advisor never received.
 *
 * The one thing on this screen that nothing else can surface. A failed SEND is visible immediately
 * and leaves the receipts on the ready list; a BOUNCE happens minutes later, out of band, with the
 * batch already recorded as a success and its receipts already ticked off. DATEV has no return
 * channel, so without reading the non-delivery report nothing in the system would ever notice.
 *
 * Fleet-wide and unfiltered by company on purpose: a misdelivery is not something you go looking
 * for by first picking the company it happened to.
 *
 * Written by the pipeline's `datev_bounce` stage through `mark_datev_batch_bounced`, which also
 * puts the receipts back on the ready list. Until this tenant enables that stage the query is
 * correct and simply returns nothing.
 */
export function useOpenDatevBounces() {
  return useQuery({
    queryKey: ["datev_handover_batches", "open_bounces"],
    staleTime: STALE,
    queryFn: async (): Promise<DatevHandoverBatch[]> => {
      const { data, error } = await sb
        .from(TABLE.handoverBatches)
        .select("*")
        .eq("status", "bounced")
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DatevHandoverBatch[];
    },
  });
}

/** Clear one bounce off the screen. Company-scoped in the RPC, same as every other write here. */
export function useAcknowledgeDatevBounce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { batchId: string }) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("acknowledge_datev_batch", {
        p_batch_id: args.batchId,
        p_actor: actor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datev_handover_batches"] }),
  });
}

export function useDatevOutgoingCandidates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["datev_outgoing_candidates"],
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, DatevOutgoingInvoice[]>> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoices)
        .select(
          `id, company_id, invoice_number, invoice_date, amount_gross, ${TABLE.customers}(name)`,
        )
        .is("handed_over_at", null)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: true });
      if (error) throw error;

      type Row = {
        id: string;
        company_id: string;
        invoice_number: string | null;
        invoice_date: string | null;
        amount_gross: number | null;
        customers: { name: string | null } | null;
      };
      const rows = (data ?? []) as Row[];

      // Same two-store rule the incoming side uses, so "can this be attached?" has one answer in
      // the whole app. Without the `content` column, for the same reason as there.
      const files = new Map<string, DatevAttachmentFile>();
      const ids = rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data: fs, error: fErr } = await sb
          .from(TABLE.outgoingInvoiceFiles)
          .select("outgoing_invoice_id, filename, mime, storage_path, size_bytes")
          .in("outgoing_invoice_id", ids.slice(i, i + 100));
        if (fErr) throw fErr;
        for (const f of (fs ?? []) as {
          outgoing_invoice_id: string;
          filename: string | null;
          mime: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        }[]) {
          files.set(f.outgoing_invoice_id, {
            filename: f.filename,
            mime: f.mime,
            storage_path: f.storage_path,
            size_bytes: f.size_bytes,
          });
        }
      }

      const out: Record<string, DatevOutgoingInvoice[]> = {};
      for (const r of rows) {
        (out[r.company_id] ??= []).push({
          id: r.id,
          company_id: r.company_id,
          issuer: r.customers?.name ?? null,
          invoice_number: r.invoice_number,
          document_date: r.invoice_date,
          amount_gross: r.amount_gross,
          blockReason: datevBlockReason(files.get(r.id) ?? null),
        });
      }
      return out;
    },
  });
}

// Invoke the datev-handover Edge Function for one company (incoming direction only — see the
// migration's own scope notes). Manual trigger only, no cron: there is no return channel from
// DATEV, so an unattended bad send would just silently fail at the tax advisor's end.
export function useTriggerDatevHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      direction: DatevSendableDirection;
      /** Narrows the send to these receipts. Omit for everything eligible; see the server fn. */
      invoiceIds?: string[];
    }) => {
      return triggerDatevHandover({ data: args });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datev_handover_status"] });
      qc.invalidateQueries({ queryKey: ["datev_handover_batches"] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
    },
  });
}

/**
 * Send history. One row per email the handover produced, newest first.
 *
 * `companyId` is optional now. It was required, and the only screen that could have called it never
 * did — so the table that records every irreversible send to the tax advisor, including the
 * "email went out but recording it failed, do NOT resend" rows the send function writes for exactly
 * the case a human has to reconcile by hand, had no reader anywhere in the app. Passing nothing
 * returns the whole fleet's history, which is what the Verlauf tab shows.
 */
export function useDatevHandoverBatches(
  companyId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["datev_handover_batches", companyId ?? "__alle"],
    // `enabled` is separate from `companyId` on purpose. Omitting the id legitimately means "the
    // whole fleet", so a null id cannot double as "don't run" — which is exactly what a per-company
    // drawer needs while it is closed and has no company yet.
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    queryFn: async (): Promise<DatevHandoverBatch[]> => {
      let query = sb
        .from(TABLE.handoverBatches)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(companyId ? 20 : 100);
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DatevHandoverBatch[];
    },
  });
}

// ---- Outgoing invoices & customers (Briefing Screen 15; migration 0052) ----
// customers/outgoing_invoices postdate the generated Database type, so reads go through the
// untyped `sb` cast, same as `objekte`. LexOffice was removed entirely (migration 0086) —
// customers is now a plain local table, same write shape as `suppliers`.

export function useCustomers(companyId?: string) {
  return useQuery({
    queryKey: ["customers", companyId ?? null],
    staleTime: STALE,
    queryFn: async (): Promise<Customer[]> => {
      // Paged for the same reason useOutgoingInvoices is: an unranged request does not error past
      // the project's Max Rows cap, it silently truncates, so this list would just start omitting
      // customers once there are more than 1000 of them -- and the Kunden screen's per-customer
      // totals would be computed against a short list without anything looking wrong.
      return fetchAllRows<Customer>((from, to, withCount) => {
        let query = sb
          .from(TABLE.customers)
          .select("*", withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null);
        if (companyId) query = query.eq("company_id", companyId);
        return query.order("name", { ascending: true }).range(from, to);
      });
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customer", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await sb.from(TABLE.customers).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Customer) ?? null;
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      isCompany: boolean;
      name: string;
      contactPerson?: string | null;
      email?: string | null;
      phone?: string | null;
      addressStreet?: string | null;
      addressZip?: string | null;
      addressCity?: string | null;
      addressCountryCode?: string;
      vatId?: string | null;
    }): Promise<Customer> => {
      const { data, error } = await sb
        .from(TABLE.customers)
        .insert({
          company_id: args.companyId,
          is_company: args.isCompany,
          name: args.name,
          contact_person: args.contactPerson ?? null,
          email: args.email ?? null,
          phone: args.phone ?? null,
          address_street: args.addressStreet ?? null,
          address_zip: args.addressZip ?? null,
          address_city: args.addressCity ?? null,
          address_country_code: args.addressCountryCode ?? "DE",
          vat_id: args.vatId ?? null,
          source: "app",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// Stammdaten eines Kunden ändern.
//
// Purely local, unlike the sibling Immonetz Hub: that one mirrors its customers into LexOffice and
// therefore has to write there first (the invoice address is read from the LexOffice contact, so a
// local-only edit would look like it worked and change nothing). This Hub has no LexOffice
// integration at all, so the row here IS the master record and a direct update is correct.
//
// Until this existed there was no way to edit a customer anywhere in this app -- the detail page
// only said "Stammdaten sind hier nicht editierbar", and with no external system behind it that
// meant a typo in a customer's name or address could never be corrected.
export function useUpdateCustomer(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      name: string;
      contactPerson?: string | null;
      email?: string | null;
      phone?: string | null;
      addressStreet?: string | null;
      addressZip?: string | null;
      addressCity?: string | null;
      vatId?: string | null;
      customerNumber?: string | null;
    }) => {
      const { error } = await sb
        .from(TABLE.customers)
        .update({
          name: args.name,
          contact_person: args.contactPerson ?? null,
          email: args.email ?? null,
          phone: args.phone ?? null,
          address_street: args.addressStreet ?? null,
          address_zip: args.addressZip ?? null,
          address_city: args.addressCity ?? null,
          vat_id: args.vatId ?? null,
          customer_number: args.customerNumber ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
    },
  });
}

// Kunde löschen (Soft-Delete, lokal).
export function useSoftDeleteCustomer(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.customers)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
        })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
    },
  });
}

export interface OutgoingInvoiceFilter {
  companyId?: string;
  customerId?: string;
}

export function useOutgoingInvoices(filter?: OutgoingInvoiceFilter) {
  return useQuery({
    queryKey: ["outgoing_invoices", filter ?? {}],
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoice[]> => {
      // fetchAllRows works around the platform's per-request row cap — see its own comment, and
      // the identical fix on useBelege/useBankTransactions above for how this was found.
      return fetchAllRows<OutgoingInvoice>((from, to, withCount) => {
        let query = sb
          .from(TABLE.outgoingInvoices)
          .select(`*, ${TABLE.customers}(*)`, withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null);
        if (filter?.companyId) query = query.eq("company_id", filter.companyId);
        if (filter?.customerId) query = query.eq("customer_id", filter.customerId);
        return query
          .order("invoice_date", { ascending: false })
          .range(from, to) as unknown as Promise<{
          data: OutgoingInvoice[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

export interface OpenOutgoingInvoicesInfiniteFilter {
  q?: string;
  /** invoice_date range — the outgoing equivalent of document_date. */
  von?: string;
  bis?: string;
  createdAtVon?: string;
  createdAtBis?: string;
  sort?: "document_date" | "created_at" | "amount" | "name";
  dir?: "asc" | "desc";
  pageSize: number;
}

// Outgoing-invoice counterpart to useOpenBelegeInfinite, for the same Link-Manually picker in its
// "outgoing" direction (migration 0045). "Open" is status='open' — set/withdrawn by the
// same confirmed-bank-match coverage rule as belege.paid_at (docs/AUSGANGSRECHNUNGEN_UPLOAD.md), so
// it correctly excludes drafts and voided invoices too, not just fully-matched ones (the client-
// filtered version this replaces only checked coverage, so a draft could show up as "open" to link).
export function useOpenOutgoingInvoicesInfinite(
  filter: OpenOutgoingInvoicesInfiniteFilter,
  opts?: { enabled?: boolean },
) {
  const {
    q,
    von,
    bis,
    createdAtVon,
    createdAtBis,
    sort = "created_at",
    dir = "desc",
    pageSize,
  } = filter;
  const search = (q ?? "").trim();
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: [
      "open-outgoing-invoices-infinite",
      search,
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
    getNextPageParam: (_lastPage: InfinitePage<OutgoingInvoice>, allPages) =>
      hasNextInfinitePage(allPages) ? allPages.length : undefined,
    queryFn: async ({ pageParam }): Promise<InfinitePage<OutgoingInvoice>> => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      // outgoing_invoices has no fts column (unlike invoices/bank_transactions), and the customer
      // name lives on a joined table PostgREST can't OR against a base-table column in one filter —
      // so a search first resolves matching customer ids, then ORs those in alongside a direct
      // invoice_number match. One extra round trip, only when the user has actually typed a query.
      let customerIds: string[] | null = null;
      if (search) {
        const { data, error } = await sb
          .from(TABLE.customers)
          .select("id")
          .ilike("name", `%${search}%`);
        if (error) throw error;
        customerIds = (data ?? []).map((c: { id: string }) => c.id);
      }

      let query = sb
        .from(TABLE.outgoingInvoices)
        .select(`*, ${TABLE.customers}(*)`, { count: "exact" })
        .is("deleted_at", null)
        .eq("status", "open");
      if (search) {
        query =
          customerIds && customerIds.length > 0
            ? query.or(`invoice_number.ilike.%${search}%,customer_id.in.(${customerIds.join(",")})`)
            : query.ilike("invoice_number", `%${search}%`);
      }
      if (von) query = query.gte("invoice_date", von);
      if (bis) query = query.lte("invoice_date", bis);
      if (createdAtVon) query = query.gte("created_at", createdAtVon);
      // Inclusive of the whole end day — created_at is a timestamptz, a bare date bound would cut
      // off at midnight and silently drop everything from later that same day.
      if (createdAtBis) query = query.lte("created_at", `${createdAtBis}T23:59:59.999`);

      const ascending = dir === "asc";
      if (sort === "name") {
        // Sorting by an embedded resource's own column — supported directly via foreignTable,
        // not a raw column name on outgoing_invoices itself.
        query = query.order("name", { ascending, foreignTable: "customers", nullsFirst: false });
      } else {
        const column =
          sort === "document_date"
            ? "invoice_date"
            : sort === "amount"
              ? "amount_gross"
              : "created_at";
        query = query.order(column, { ascending, nullsFirst: false });
      }
      const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as OutgoingInvoice[], total: count ?? 0 };
    },
  });
}

export function useOutgoingInvoice(id: string) {
  return useQuery({
    queryKey: ["outgoing_invoice", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoice | null> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoices)
        .select(`*, ${TABLE.customers}(*)`)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as OutgoingInvoice) ?? null;
    },
  });
}

// Trash (Briefing Screen 18, §3.4): outgoing_invoices already has the deleted_at/deleted_by/
// delete_reason trio (migration 0046) and shows up in v_trash, but had no UI path to actually get
// there. change_history, not a dedicated history table, per the deliberate choice noted above
// insertChangeHistory().
export function useSoftDeleteOutgoingInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.outgoingInvoices)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: pflichtGrund(grund),
        })
        .eq("id", invoiceId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        invoiceId,
        "deletion",
        grund || "Ausgangsrechnung gelöscht",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outgoing_invoices"] });
      qc.invalidateQueries({ queryKey: ["outgoing_invoice", invoiceId] });
    },
  });
}

// --- Outgoing invoice upload (migration 0085) ---------------------------------------------
// LexOffice was removed entirely (migration 0086), so this is the only way an outgoing invoice
// actually gets created here: drop a PDF/image, extractOutgoingInvoiceFields reads it via OpenAI
// and proposes a company/customer match, the reviewer confirms an editable preview, then
// createUploadedOutgoingInvoice writes it. See src/routes/ausgangsrechnungen/hochladen.tsx.

// Read-only AI extraction — never writes to the DB. A plain mutation (not a query) since it's
// triggered once per file drop, not something to cache/refetch.
export function useExtractOutgoingInvoiceFields() {
  return useMutation({
    mutationFn: async (args: {
      filename: string;
      mime: OutgoingInvoiceUploadMime;
      fileBase64: string;
    }) => {
      return extractOutgoingInvoiceFields({ data: args });
    },
  });
}

export function useCreateUploadedOutgoingInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      customerId?: string | null;
      newCustomer?: { name: string; address?: string | null } | null;
      voucherNumber: string;
      voucherDate: string;
      dueDate?: string | null;
      amountNet?: number | null;
      amountGross: number;
      vatRate?: number | null;
      currency?: string;
      invoiceId: string;
      filename: string;
      mime: OutgoingInvoiceUploadMime;
      storagePath: string;
      sizeBytes: number;
      checksumSha256: string | null;
    }): Promise<OutgoingInvoice> => {
      return (await createUploadedOutgoingInvoice({ data: args })) as OutgoingInvoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outgoing_invoices"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

// Manual status override for an outgoing invoice, via the SECURITY DEFINER RPC (migration 0085) —
// not a direct table update, so the change is always logged to change_history atomically.
export function useSetUploadedOutgoingInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: OutgoingVoucherStatus }) => {
      const actor = await actorEmail();
      const { error } = await sb.rpc("set_uploaded_outgoing_invoice_status", {
        p_id: args.id,
        p_status: args.status,
        p_actor: actor,
      });
      if (error) throw error;
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["outgoing_invoices"] });
      qc.invalidateQueries({ queryKey: ["outgoing_invoice", args.id] });
    },
  });
}

// Short-lived signed URL for an uploaded outgoing invoice's stored file, minted server-side via
// src/lib/api/outgoing-invoice-files.functions.ts — mirrors useInvoiceFileUrl above. Lazy by
// default (enabled: false expected from the caller) so a page full of upload rows doesn't mint a
// signed URL for every row on render; the "view file" button triggers a manual refetch() instead.
export function useOutgoingInvoiceFileUrl(
  outgoingInvoiceId: string,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["outgoing_invoice_file_url", outgoingInvoiceId],
    enabled: (opts.enabled ?? true) && !!outgoingInvoiceId,
    staleTime: INVOICE_FILE_URL_STALE,
    queryFn: () => getOutgoingInvoiceFileUrl({ data: { outgoingInvoiceId } }),
  });
}

// ===========================================================================
// Team & Rollen (Briefing Screen 17, Appendix A7)
// ===========================================================================

// The three roles an admin may ASSIGN from the UI. 'super_admin' (the owner/technical account) is
// deliberately excluded: it is not assignable, and the DB refuses to grant it besides
// (guard_super_admin_row, migrations 20260813120000 + 20260813140000). It IS visible now -- Team & Rollen lists it
// pinned and highlighted so its name can be edited -- which reverses A7's original "invisible to
// the client entirely"; everything about it except the name stays read-only.
export type AssignableRole = Exclude<AppRole, "super_admin">;

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    staleTime: STALE,
    queryFn: async (): Promise<{ id: string; name: AppRole }[]> => {
      const { data, error } = await sb.from(TABLE.roles).select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: AppRole }[];
    },
  });
}

/**
 * What each role grants by default, keyed by role id.
 *
 * Read whole rather than per role: the Team screen renders a matrix, and `useEmployees` already
 * folds these into each person's effective set, so the two must come from the same fetch shape.
 */
export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await sb
        .from(TABLE.rolePermissions)
        .select("role_id, permission_key");
      if (error) throw error;
      const nach: Record<string, string[]> = {};
      for (const rp of (data ?? []) as { role_id: string; permission_key: string }[]) {
        (nach[rp.role_id] ??= []).push(rp.permission_key);
      }
      return nach;
    },
  });
}

/**
 * Grant or revoke a permission for a whole ROLE.
 *
 * Absence is the answer here -- `role_permissions` has no `granted` column, so a revoke is a
 * delete. Verified against the live policies: `role_permissions_write` is `for all` gated on
 * `is_admin()`, so both directions work for an admin and are refused for anyone else at the
 * database, not just in this UI.
 *
 * Logged, because it moves everyone holding that role who has no personal override -- the one
 * change in this system with blast radius beyond a single person.
 */
export function useSetRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roleId: string; roleName: string; key: string; value: boolean }) => {
      if (args.value) {
        const { error } = await sb
          .from(TABLE.rolePermissions)
          .upsert(
            { role_id: args.roleId, permission_key: args.key },
            { onConflict: "role_id,permission_key" },
          );
        if (error) throw error;
      } else {
        const { error } = await sb
          .from(TABLE.rolePermissions)
          .delete()
          .eq("role_id", args.roleId)
          .eq("permission_key", args.key);
        if (error) throw error;
      }
      await insertChangeHistory(
        "role_permissions",
        args.roleId,
        args.value ? "role_permission_granted" : "role_permission_revoked",
        `${args.roleName}: ${args.key} ${args.value ? "erteilt" : "entzogen"}`,
        { role: args.roleName, permission: args.key, granted: args.value },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      // Employee rows show EFFECTIVE permissions, which fold in these defaults: a role change moves
      // everyone without a personal override, so that list is stale the moment this succeeds.
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

interface EmployeeRow {
  id: string;
  email: string;
  name: string | null;
  role_id: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  deputy_user_id: string | null;
  escalation_days: number | null;
  area: ApprovalArea | null;
  covers_all_areas: boolean;
  roles: { name: AppRole } | null;
  user_company_access: { company_id: string; can_view: boolean; deleted_at: string | null }[];
  user_permissions: { permission_key: string; granted: boolean }[];
}

export interface PermissionRow {
  key: string;
  category: string;
  label_de: string;
  label_en: string;
  description_de: string | null;
  description_en: string | null;
  sort_order: number;
}

/**
 * The permission catalogue, straight from the table.
 *
 * Read rather than hardcoded so a key added by a project's own `permissions.seed.sql` shows up on
 * Team & Rollen without a front-end change -- which is the whole point of the catalogue being data.
 */
export function usePermissionCatalogue() {
  return useQuery({
    queryKey: ["permission-catalogue"],
    staleTime: STALE,
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await sb
        .from(TABLE.permissions)
        .select("key, category, label_de, label_en, description_de, description_en, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });
}

/** Effective permission set: a personal override wins, otherwise the role default. */
function effectivePermissions(
  overrides: { permission_key: string; granted: boolean }[],
  roleDefaults: Set<string>,
): string[] {
  const eigene = new Map(overrides.map((o) => [o.permission_key, o.granted]));
  const keys = new Set<string>([...roleDefaults, ...eigene.keys()]);
  return [...keys].filter((k) => eigene.get(k) ?? roleDefaults.has(k));
}

// Admin-only (RLS: app_users_admin_read).
// Returns EVERY employee, super_admin included, because Team & Rollen has to list and rename them.
// Super admin is deliberately NOT filtered here any more, so any consumer that must not offer it --
// the approval-rule pickers, where a super admin must never appear as a step or a deputy --
// filters on role_name itself. See freigabe-regeln/index.tsx and team/index.tsx for both of those.
export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    staleTime: STALE,
    queryFn: async (): Promise<Employee[]> => {
      const { data: rolePerms, error: rolePermsError } = await sb
        .from(TABLE.rolePermissions)
        .select("role_id, permission_key");
      if (rolePermsError) throw rolePermsError;
      const rolePermissions = new Map<string, Set<string>>();
      for (const rp of (rolePerms ?? []) as { role_id: string; permission_key: string }[]) {
        if (!rolePermissions.has(rp.role_id)) rolePermissions.set(rp.role_id, new Set());
        rolePermissions.get(rp.role_id)!.add(rp.permission_key);
      }
      const { data, error } = await sb
        .from(TABLE.appUsers)
        .select(
          "id, email, name, role_id, is_active, must_change_password, created_at, " +
            "deputy_user_id, escalation_days, area, covers_all_areas, " +
            "roles(name), user_company_access(company_id, can_view, deleted_at), " +
            "user_permissions(permission_key, granted)",
        )
        .order("email");
      if (error) throw error;
      return ((data ?? []) as EmployeeRow[]).map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role_id: row.role_id,
        role_name: (row.roles?.name ?? "assistant") as AppRole,
        is_active: row.is_active,
        must_change_password: row.must_change_password,
        created_at: row.created_at,
        allowed_company_ids: row.user_company_access
          .filter((g) => g.can_view && g.deleted_at === null)
          .map((g) => g.company_id),
        // Effective = the person's own override where one exists, otherwise their role's default.
        // The same rule current_permissions() applies server-side, so the switches on Team & Rollen
        // show what the database would actually decide. Nothing is forced by role here: an earlier
        // version rewrote an admin's value to true before the UI saw it, which meant their switch
        // could be turned off, written, and still read back as on.
        deputy_user_id: row.deputy_user_id,
        escalation_days: row.escalation_days,
        area: row.area,
        covers_all_areas: row.covers_all_areas,
        permissions: effectivePermissions(
          row.user_permissions ?? [],
          rolePermissions.get(row.role_id) ?? new Set<string>(),
        ),
      }));
    },
  });
}

function invalidateEmployeeState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["employees"] });
}

// Toggle one of the three itemized accounting capabilities (migration 20260812150000). Distinct
// from useUpdateEmployeeRole: role changes what screens someone can reach, this changes whether
// they're flagged as trusted for booking/approving/paying specifically.
export function useSetAccountingRight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; right: string; value: boolean }) => {
      // Written as an explicit row in BOTH directions. `granted: false` is a REVOKE of something the
      // role would otherwise grant -- deleting the row instead would silently fall back to the role
      // default, so an admin could never be denied a permission their role includes.
      const { error } = await sb.from(TABLE.userPermissions).upsert(
        {
          user_id: args.employeeId,
          permission_key: args.right,
          granted: args.value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,permission_key" },
      );
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.value ? "accounting_right_granted" : "accounting_right_revoked",
        `${args.right} ${args.value ? "erteilt" : "entzogen"}`,
        { right: args.right },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Creates a real Supabase Auth login (server-side, service role -- see
// src/lib/api/employees.functions.ts) plus the app_users/user_company_access rows. Returns a
// one-time temp password the admin hands to the new employee (must_change_password forces them
// to set their own on first login).
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      email: string;
      name: string;
      roleName: AssignableRole;
      companyIds: string[];
    }) => {
      return createEmployeeFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Delegates to the server function (updateEmployeeProfile) rather than writing app_users
// directly: renaming is a plain row edit, but the email is also the employee's login identity
// (matched against auth.jwt() by has_company_access()/current_role_name()), so it has to update
// the real Supabase Auth account in lockstep -- only server code holding the service-role key
// can do that. See employees.functions.ts for the full reasoning.
export function useUpdateEmployeeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; name: string; email: string }) => {
      return updateEmployeeProfileFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Delegates to the server function (resetEmployeePassword) -- setting a Supabase Auth password
// needs the service-role Admin API, same as createEmployee/updateEmployeeProfile. Returns a
// fresh one-time temp password the admin hands to the employee; must_change_password is flipped
// back to true server-side so it's forced to be replaced on next login (see auth-gate.tsx).
export function useResetEmployeePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string }) => {
      return resetEmployeePasswordFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

export function useUpdateEmployeeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; roleName: AssignableRole }) => {
      // Resolve the TARGET role's id from its name. This used to take a `roleId` argument, and
      // every caller passed the employee's CURRENT role_id -- so the update wrote the same value
      // back and the role never changed, while still writing a "Rolle geändert auf X"
      // change_history row and returning success. Role edits silently did nothing.
      const { data: role, error: roleError } = await sb
        .from(TABLE.roles)
        .select("id")
        .eq("name", args.roleName)
        .maybeSingle();
      if (roleError) throw roleError;
      if (!role) throw new Error(`Role ${args.roleName} not found`);

      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ role_id: (role as { id: string }).id, updated_at: new Date().toISOString() })
        .eq("id", args.employeeId);
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        "role_changed",
        `Rolle geändert auf ${args.roleName}`,
        { role_name: args.roleName },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Replaces the full grant set for an employee. Upsert-then-soft-delete, deliberately in that
// order: if the upsert of the new grants fails, the mutation throws with the employee's PRIOR
// grants still fully intact; only once the new grants are safely written do the old ones get
// revoked. The reverse order (revoke-then-upsert) has a real failure window in the middle where
// the employee would have zero grants recorded -- which has_company_access() reads as
// UNRESTRICTED ("no grants = everything"), i.e. a failed edit could silently widen a restricted
// employee's access instead of leaving them at their narrower prior state. An empty companyIds
// array is itself a deliberate, valid end state ("unrestricted"), just never one reached via a
// mid-mutation failure.
//
// Revoking is a soft-delete (deleted_at), not a row delete: user_company_access has admin
// select/insert/update RLS policies but deliberately no delete policy (migration 0059), so a
// plain .delete() call silently removes zero rows under RLS -- no error, no effect -- instead of
// failing loudly. has_company_access() already filters on deleted_at is null, so setting it is
// the real revoke.
export function useSetCompanyAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; companyIds: string[] }) => {
      if (args.companyIds.length > 0) {
        const { error: upsertError } = await sb.from(TABLE.userCompanyAccess).upsert(
          args.companyIds.map((companyId) => ({
            user_id: args.employeeId,
            company_id: companyId,
            can_view: true,
            deleted_at: null,
          })),
          { onConflict: "user_id,company_id" },
        );
        if (upsertError) throw upsertError;
      }
      const revokeQuery = sb
        .from(TABLE.userCompanyAccess)
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", args.employeeId)
        .is("deleted_at", null);
      const { error: revokeError } =
        args.companyIds.length > 0
          ? await revokeQuery.not("company_id", "in", `(${args.companyIds.join(",")})`)
          : await revokeQuery;
      if (revokeError) throw revokeError;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.companyIds.length > 0 ? "access_granted" : "access_revoked",
        args.companyIds.length > 0
          ? `Firmenzugriff gesetzt (${args.companyIds.length})`
          : "Firmenzugriff auf uneingeschränkt zurückgesetzt",
        { company_ids: args.companyIds },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

export function useSetEmployeeActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; isActive: boolean }) => {
      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ is_active: args.isActive, updated_at: new Date().toISOString() })
        .eq("id", args.employeeId);
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.isActive ? "user_reactivated" : "user_deactivated",
        args.isActive ? "Mitarbeiter reaktiviert" : "Mitarbeiter deaktiviert",
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// ===========================================================================
// Papierkorb (Briefing Screen 18)
// ===========================================================================

/**
 * The trash list.
 *
 * Paged through `fetchAllRows` rather than sent as one open-ended select. `v_trash` is a 14-way
 * UNION ALL over every soft-deletable table in the system, so it is the query in this file most
 * likely to cross the platform's per-request row cap first — and when an unbounded select crosses
 * it, PostgREST returns a silent prefix. Ordered newest-first, that prefix drops the OLDEST
 * deletions, which are exactly the ones somebody is looking for when they open this screen.
 * (docs/audit/papierkorb/trash/ISSUES.md #4)
 */
export function useTrash(tableFilter?: string) {
  return useQuery({
    queryKey: ["trash", tableFilter ?? "alle"],
    staleTime: STALE,
    queryFn: async (): Promise<TrashRecord[]> => {
      return fetchAllRows<TrashRecord>((from, to, withCount) => {
        let query = sb.from(TABLE.vTrash).select("*", withCount ? { count: "exact" } : undefined);
        if (tableFilter) query = query.eq("table_name", tableFilter);
        return query
          .order("deleted_at", { ascending: false })
          .range(from, to) as unknown as Promise<{
          data: TrashRecord[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

/**
 * The two table allow-lists, read from the database that enforces them.
 *
 * Migration 0049 made `trash_eligible_tables()` / `trash_purge_eligible_tables()` the single
 * source of truth for the RPCs and noted that the frontend's own copies "stay manually kept in
 * sync". They no longer do: the screen asks. A table added to the DB list now appears in the
 * filter without a frontend change, and a table that stops being purgeable grows its padlock on
 * its own. (docs/audit/papierkorb/trash/ISSUES.md #7)
 *
 * Long `staleTime`: these are `immutable` SQL functions returning a literal array.
 */
export function useTrashTables() {
  return useQuery({
    queryKey: ["trash-tables"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<{ eligible: string[]; purgeable: string[] }> => {
      const [eligible, purgeable] = await Promise.all([
        sb.rpc("trash_eligible_tables"),
        sb.rpc("trash_purge_eligible_tables"),
      ]);
      if (eligible.error) throw eligible.error;
      if (purgeable.error) throw purgeable.error;
      return {
        eligible: (eligible.data ?? []) as string[],
        purgeable: (purgeable.data ?? []) as string[],
      };
    },
  });
}

function invalidateTrashState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["trash"] });
  // A restore/purge can touch virtually any list screen (invoices, suppliers, customers, ...) --
  // broad invalidation here is the honest choice over silently stale lists elsewhere.
  qc.invalidateQueries({ queryKey: ["belege"] });
  qc.invalidateQueries({ queryKey: ["belege-liste"] });
  qc.invalidateQueries({ queryKey: ["lieferanten"] });
  qc.invalidateQueries({ queryKey: ["kunden"] });
  // "ausgangsrechnungen-liste" was never a real query key -- useOutgoingInvoices/useOutgoingInvoice
  // key on "outgoing_invoices"/"outgoing_invoice". Fixed here so a restore/purge touching
  // outgoing_invoices actually refreshes the list instead of silently no-opping.
  qc.invalidateQueries({ queryKey: ["outgoing_invoices"] });
  qc.invalidateQueries({ queryKey: ["outgoing_invoice"] });
  qc.invalidateQueries({ queryKey: ["gesellschaften"] });
  // A restored approver no longer changes anything the app reads -- the table is frozen
  // (migration 20260901160000) -- but approval_rules still shares the trash, so its list would
  // otherwise stay stale for the whole STALE window after a restore or purge.
  qc.invalidateQueries({ queryKey: ["approval_rules"] });
}

/**
 * Restore, with the reason the person gave for restoring.
 *
 * `restore_record` grew a third argument (`p_reason`) so the change-history entry says WHY a
 * record came back, not only that it did — restoring is the action with the wider blast radius of
 * the two on this screen (docs/audit/papierkorb/trash/ISSUES.md #5). The two-argument call is kept
 * as a fallback: PostgREST answers PGRST202 when no overload matches, which is exactly what a
 * database that has not had the migration applied yet will say. Without the fallback, deploying
 * the frontend ahead of the migration would break restore outright.
 */
export function useRestoreRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: string; id: string; reason?: string | null }) => {
      const reason = args.reason?.trim() || null;
      const withReason = await sb.rpc("restore_record", {
        p_table: args.table,
        p_id: args.id,
        p_reason: reason,
      });
      if (!withReason.error) return;
      const notFound =
        withReason.error.code === "PGRST202" ||
        /could not find the function/i.test(withReason.error.message ?? "");
      if (!notFound) throw withReason.error;
      const { error } = await sb.rpc("restore_record", { p_table: args.table, p_id: args.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrashState(qc),
  });
}

export function usePurgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: string; id: string }) => {
      const { error } = await sb.rpc("purge_record", { p_table: args.table, p_id: args.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrashState(qc),
  });
}
export interface OverviewInvoiceRow {
  status: string | null;
  amount_gross: number | null;
  // Carried so the overview can group by month without a second request. Still five narrow
  // columns rather than the whole row.
  document_date: string | null;
  // For the supplier ranking and the per-company volume panel. issuer is the free-text sender the
  // list screens show; company_code is the resolved company, null when unresolved. supplier_id
  // lets the ranking link to the supplier's own page rather than a text search.
  issuer: string | null;
  company_code: string | null;
  supplier_id: string | null;
  // For the processing card's per-channel breakdown (email / upload / drive / ...).
  intake_channel: string | null;
}

/**
 * The Overview's invoice figures, read narrow and scoped to the period on screen.
 *
 * `useBelege()` selects `*` across the WHOLE table and pages past the row cap, because the screens
 * that grew up on it need every column of every invoice. The Overview needs two columns of the rows
 * inside one date range, to produce three numbers. Reading it the wide way put the entire invoice
 * table through the browser on the first screen of the app, which is the page least able to afford
 * it. `useBelege` is untouched: Auswertungen still depends on its shape.
 *
 * Filtered on `document_date`, the same column the invoice list filters on, so a tile and the list
 * it links to cannot disagree. The exclusions mirror `useBelege` exactly (deleted, archived, not
 * relevant, and the container row of a split scan), because a figure here that counted rows that
 * screen refuses to show would be wrong in a way nobody could trace.
 */
export function useOverviewInvoices(von?: string | null, bis?: string | null) {
  return useQuery({
    queryKey: ["overview-invoices", von ?? "", bis ?? ""],
    staleTime: STALE,
    // A period change swaps the query key. Without this every card and chart on the overview
    // drops to zero for the round trip, then jumps back, which reads as the numbers fluctuating.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OverviewInvoiceRow[]> =>
      fetchAllRows<OverviewInvoiceRow>((from, to, withCount) => {
        let query = supabase
          .from(TABLE.documents)
          .select(
            "status, amount_gross, document_date, issuer, company_code, supplier_id, intake_channel",
            withCount ? { count: "exact" } : undefined,
          )
          .is("deleted_at", null)
          .is("archived_at", null)
          .is("not_relevant_at", null)
          .neq("status", "split");
        if (von) query = query.gte("document_date", von);
        if (bis) query = query.lte("document_date", bis);
        return query.range(from, to);
      }),
  });
}

export interface BankMatchingCounts {
  total: number;
  open: number;
  suggestion: number;
  matched: number;
  ignored: number;
}

export function useBankMatchingCounts() {
  return useQuery({
    queryKey: ["bank-matching-counts"],
    staleTime: STALE,
    queryFn: async (): Promise<BankMatchingCounts> => {
      const head = { count: "exact" as const, head: true };
      const [gesamtQ, offenQ, vorschlagQ, zugeordnetQ, ignoriertQ] = await Promise.all([
        sb.from(TABLE.bankTransactions).select("id", head),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "open"),
        sb.from(TABLE.vBankTransactionsList).select("id", head).eq("has_suggested_match", true),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "matched"),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "ignored"),
      ]);
      for (const q of [gesamtQ, offenQ, vorschlagQ, zugeordnetQ, ignoriertQ]) {
        if (q.error) throw q.error;
      }
      return {
        total: gesamtQ.count ?? 0,
        open: Math.max((offenQ.count ?? 0) - (vorschlagQ.count ?? 0), 0),
        suggestion: vorschlagQ.count ?? 0,
        matched: zugeordnetQ.count ?? 0,
        ignored: ignoriertQ.count ?? 0,
      };
    },
  });
}

/**
 * The header bell's own figures (docs/NOTIFICATIONS.md phase 1): what is NEW since this user
 * last opened the bell, plus the standing to-do counts the dropdown lists. Head counts only.
 *
 * "New" is bounded to the last 7 days when the user has never opened the bell (or the migration
 * adding notifications_seen_at is not applied yet): an unbounded count would greet a new user
 * with the size of the whole table, which reads as a bug, not as news.
 */
export interface NotificationCounts {
  seenAt: string | null;
  neueBelege: number;
  zuPruefen: number;
  faellig: number;
}

export function useNotificationCounts(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-counts", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificationCounts> => {
      let seenAt: string | null = null;
      const seenQ = await sb
        .from(TABLE.appUsers)
        .select("notifications_seen_at")
        .eq("id", appUserId)
        .maybeSingle();
      // 42703: the column does not exist yet (migration not applied). Degrade to the 7 day
      // window instead of failing the whole bell.
      if (!seenQ.error) seenAt = seenQ.data?.notifications_seen_at ?? null;
      else if (seenQ.error.code !== "42703") throw seenQ.error;

      const seit = seenAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      const heute = heuteLokal();
      const head = { count: "exact" as const, head: true };
      const [neueQ, pruefQ, faelligQ] = await Promise.all([
        sb
          .from(TABLE.documents)
          .select("id", head)
          .is("deleted_at", null)
          .is("archived_at", null)
          .is("not_relevant_at", null)
          .neq("status", "split")
          .gt("created_at", seit),
        sb
          .from(TABLE.documents)
          .select("id", head)
          .is("deleted_at", null)
          .is("archived_at", null)
          .is("not_relevant_at", null)
          .eq("status", "needs_review"),
        // Strictly past, mirroring the Offene-Posten screen's overdue rule, so the bell row
        // and the filtered list it links to show the same number.
        sb
          .from(TABLE.vOpenItems)
          .select("id", head)
          .eq("is_open", true)
          .not("due_date", "is", null)
          .lt("due_date", heute),
      ]);
      for (const q of [neueQ, pruefQ, faelligQ]) {
        if (q.error) throw q.error;
      }
      return {
        seenAt,
        neueBelege: neueQ.count ?? 0,
        zuPruefen: pruefQ.count ?? 0,
        faellig: faelligQ.count ?? 0,
      };
    },
  });
}

/**
 * Stamps "the user has looked at the bell" via the narrow self-service RPC (migration
 * 20260827090000), the same pattern as clear_must_change_password: app_users writes stay
 * admin-only, this opens exactly one timestamp. A missing RPC (migration not applied) is
 * swallowed: the bell then simply keeps its 7 day window.
 */
export function useMarkNotificationsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("mark_notifications_seen");
      if (error && error.code !== "PGRST202" && error.code !== "42883") throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-counts"] });
    },
  });
}

// The bell's and the settings screen's shared vocabulary. Adding a type here makes it appear
// in the bell (default on) and as a toggle on /benachrichtigungen; an explicit false in
// notification_settings.bell_events hides it.
export const NOTIFICATION_EVENT_TYPES = [
  "neu",
  "assigned",
  "query",
  "rejected",
  "zuPruefen",
  "faellig",
  "suggestions",
  "fehler",
  "ping",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationSettings {
  bell_events: Record<string, boolean>;
  /** Per bell row the count last acknowledged by clicking through; synced across devices. */
  bell_ack: Record<string, number>;
  digest_enabled: boolean;
  /** "HH:MM" (Postgres time comes back as "HH:MM:SS"; normalized on read). */
  digest_time: string;
  digest_channel: "team" | "personal";
  digest_events: Record<string, boolean>;
  timezone: string;
}

const NOTIFICATION_SETTINGS_DEFAULTS: NotificationSettings = {
  bell_events: {},
  bell_ack: {},
  digest_enabled: false,
  digest_time: "08:00",
  digest_channel: "team",
  digest_events: {},
  timezone: "Europe/Berlin",
};

export function useNotificationSettings(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-settings", appUserId],
    enabled: !!appUserId,
    staleTime: STALE,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await sb
        .from(TABLE.notificationSettings)
        .select(
          "bell_events, bell_ack, digest_enabled, digest_time, digest_channel, digest_events, timezone",
        )
        .eq("user_id", appUserId)
        .maybeSingle();
      // Missing table (migration not applied) or no row yet: the defaults ARE the settings.
      if (error) {
        if (error.code === "42P01") return NOTIFICATION_SETTINGS_DEFAULTS;
        throw error;
      }
      if (!data) return NOTIFICATION_SETTINGS_DEFAULTS;
      const row = data as unknown as NotificationSettings;
      return {
        ...NOTIFICATION_SETTINGS_DEFAULTS,
        ...row,
        digest_time: (row.digest_time ?? "08:00").slice(0, 5),
        bell_events: row.bell_events ?? {},
        bell_ack: row.bell_ack ?? {},
        digest_events: row.digest_events ?? {},
      };
    },
  });
}

export function useSaveNotificationSettings(appUserId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<NotificationSettings>) => {
      if (!appUserId) throw new Error("no app user");
      const { error } = await sb
        .from(TABLE.notificationSettings)
        .upsert(
          { user_id: appUserId, ...changes, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
  });
}

export interface NotificationChannel {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Admin only by RLS; non-admins simply get zero rows back, which the settings screen never
 *  shows them anyway. */
export function useNotificationChannels() {
  return useQuery({
    queryKey: ["notification-channels"],
    staleTime: STALE,
    queryFn: async (): Promise<NotificationChannel[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationChannels)
        .select("key, enabled, config")
        .order("key");
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as NotificationChannel[];
    },
  });
}

export function useSaveNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: NotificationChannel) => {
      const { error } = await sb
        .from(TABLE.notificationChannels)
        .upsert({ ...channel, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-channels"] });
    },
  });
}

export function useChannelSecretPresent(channel: string) {
  return useQuery({
    queryKey: ["channel-secret-present", channel],
    staleTime: STALE,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sb.rpc("channel_secret_present", { p_channel: channel });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return false;
        throw error;
      }
      return data === true;
    },
  });
}

export function useSaveChannelSecret(channel: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (secret: string | null) => {
      const { error } = await sb.rpc("set_channel_secret", {
        p_channel: channel,
        p_secret: secret,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-secret-present", channel] });
      qc.invalidateQueries({ queryKey: ["notification-channels"] });
    },
  });
}

export interface SlackDirectory {
  channels: { id: string; name: string }[];
  members: { id: string; label: string }[];
  /** `slackUserId` is the stored link: an id, "" for never DM, or null to match by email.
   *  `autoMatch` is what the email lookup would resolve to right now. */
  people: { id: string; name: string; slackUserId: string | null; autoMatch: string | null }[];
  channelError?: string;
  peopleError?: string;
}

export function useSetUserSlackId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; slackId: string | null }) => {
      const { error } = await sb.rpc("set_user_slack_id", {
        p_user: args.userId,
        p_slack_id: args.slackId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slack-directory"] });
    },
  });
}

/** Channels and people, read live from Slack. Enabled only once a token is stored, so it never
 *  fires on a Hub that has not connected Slack. */
export function useSlackDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ["slack-directory"],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<SlackDirectory> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.notifyDispatch, {
        body: { mode: "directory" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return {
        ...data,
        channels: data?.channels ?? [],
        members: data?.members ?? [],
        people: data?.people ?? [],
      };
    },
  });
}

export interface PingEvent {
  id: number;
  payload: {
    document_id?: string;
    /** Set instead of document_id when the ping is about a bank transaction. */
    transaction_id?: string;
    note?: string;
    from_name?: string;
  };
  created_at: string;
}

/** Pings addressed to this user, newest first. RLS scopes the select to the recipient. */
export function usePingsForMe(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-events", "pings", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PingEvent[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select("id, payload, created_at")
        .eq("recipient_user_id", appUserId)
        .eq("type", "ping")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as PingEvent[];
    },
  });
}

export interface SentPingEvent extends PingEvent {
  recipient: { name: string | null } | null;
}

export function useSentPings(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-events", "pings-sent", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<SentPingEvent[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select(
          `id, payload, created_at, recipient:${TABLE.appUsers}!notification_events_recipient_user_id_fkey(name)`,
        )
        .eq("created_by", appUserId)
        .eq("type", "ping")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === "42P01" || error.code === "42703") return [];
        throw error;
      }
      return (data ?? []) as SentPingEvent[];
    },
  });
}

/**
 * Ask one colleague to look at one record.
 *
 * Takes a kind and an id rather than a column per record type (migration 20260911100000), so a
 * supplier, a customer or a screen added next year needs nothing here. The path is worked out on
 * this side because routes live here, not in SQL.
 */
export function useSendPing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      recipientUserId: string;
      targetKind?: NotificationTargetKind;
      targetId?: string;
      /** Overrides the path derived from kind and id. For a screen with no record behind it. */
      targetPath?: string;
      note?: string;
    }) => {
      const path =
        args.targetPath ??
        (args.targetKind && args.targetId
          ? notifyTargetPath(args.targetKind, args.targetId)
          : null);
      const { data, error } = await sb.rpc("send_notification", {
        p_recipient: args.recipientUserId,
        p_note: args.note ?? null,
        p_target_kind: args.targetKind ?? null,
        p_target_id: args.targetId ?? null,
        p_target_path: path,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-events"] });
      qc.invalidateQueries({ queryKey: ["record-notifications"] });
    },
  });
}

/** One notification addressed to the signed-in user about a record they are looking at. */
export interface RecordNotification {
  id: number;
  note: string | null;
  fromName: string | null;
  createdAt: string;
}

/**
 * What this user still has to read about THIS record.
 *
 * The bell already lists everything they were sent, but it lists it away from the thing it is
 * about: they click through, land on a transaction, and the sentence explaining why they are here
 * is back on the previous screen. This is the same data, asked the other way round.
 *
 * Unacknowledged only, and acknowledgement is per row (migration 20260911100000). It cannot ride
 * on the bell's single seen-timestamp: opening the bell would silence a note on a record they
 * never opened, and dismissing one note would silence every other notification they have.
 */
export function useRecordNotifications(target: {
  kind?: NotificationTargetKind;
  id?: string | null;
}) {
  const { appUserId } = useAuth();
  const key = target.id ?? null;
  const kind = target.kind ?? null;
  return useQuery({
    queryKey: ["record-notifications", kind, key, appUserId],
    enabled: Boolean(key && kind && appUserId),
    queryFn: async (): Promise<RecordNotification[]> => {
      // Matched on the new target shape OR the two legacy columns, because rows written before
      // 20260911100000 are not backfilled: the history is a log, and rewriting what it said is
      // worse than reading both shapes. `or` takes a flat list, so the legacy arm is only added
      // for the two kinds that ever had a column of their own.
      const legacy =
        kind === "invoice"
          ? `,payload->>document_id.eq.${key}`
          : kind === "transaction"
            ? `,payload->>transaction_id.eq.${key}`
            : "";
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select(
          `id, payload, created_at, sender:${TABLE.appUsers}!notification_events_created_by_fkey(name)`,
        )
        .eq("recipient_user_id", appUserId)
        // AND NOT FROM YOU. `send_notification` refuses a recipient equal to the sender, but the
        // guard lives in the RPC and the table is older than it: rows written before it, and any
        // row written directly, can still be addressed to their own author. Reading those back is
        // what put "Faheem Malik asked you to look at this" on Faheem Malik's screen. Filtered
        // here rather than deleted, because the history is a log.
        .neq("created_by", appUserId)
        .is("acknowledged_at", null)
        .or(`and(payload->target->>kind.eq.${kind},payload->target->>id.eq.${key})${legacy}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const sender = row.sender as { name?: string | null } | null;
        return {
          id: Number(row.id),
          note: (payload.note as string | null) ?? null,
          // The join is the live name; payload.from_name is what it was when sent. Prefer the
          // live one so a rename does not leave an old name on screen, fall back for a deleted
          // account.
          fromName: sender?.name ?? (payload.from_name as string | null) ?? null,
          createdAt: String(row.created_at),
        };
      });
    },
  });
}

/** An invoice uploaded from this transaction, on its way through extraction. */
export interface TransactionUpload {
  id: string;
  filename: string | null;
  amountGross: number | null;
  createdAt: string;
  /** True once extraction has run, whatever it found. */
  extracted: boolean;
}

/**
 * Invoices uploaded from THIS transaction.
 *
 * Shown while the link does not exist yet. Extraction is asynchronous and up to two hours behind
 * the upload (migration 20260911190000), and for that whole window the transaction otherwise looks
 * exactly as it did before, so the next person uploads the same document again.
 *
 * Confirmed matches are excluded: once the link is made, the matching panel shows it and a second
 * notice about the same document would be noise.
 */
export function useTransactionUploads(transactionId: string | null | undefined) {
  return useQuery({
    queryKey: ["transaction-uploads", transactionId],
    enabled: Boolean(transactionId),
    queryFn: async (): Promise<TransactionUpload[]> => {
      const { data, error } = await sb
        .from(TABLE.documents)
        .select(
          `id, issuer, amount_gross, created_at, extracted, ${TABLE.documentTransactionMatches}(status)`,
        )
        .eq("uploaded_for_transaction_id", transactionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .filter((row) => {
          const matches = (row.invoice_transaction_matches ?? []) as { status?: string }[];
          return !matches.some((m) => m.status === "confirmed");
        })
        .map((row) => ({
          id: String(row.id),
          filename: (row.issuer as string | null) ?? null,
          amountGross: (row.amount_gross as number | null) ?? null,
          createdAt: String(row.created_at),
          extracted: row.extracted != null,
        }));
    },
    // Extraction lands out of band, so the page has to look again rather than wait for a write.
    refetchInterval: 60_000,
  });
}

/** Dismissing the banner is a write, not local state: otherwise it greets them again next visit. */
export function useAcknowledgeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: number) => {
      const { error } = await sb.rpc("acknowledge_notification", { p_event_id: eventId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["record-notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-events"] });
    },
  });
}

/** The settings screen's "send test" button: asks the dispatcher to post one test message
 *  through a channel. Admin-gated inside the function itself. */
export function useSendTestNotification() {
  return useMutation({
    mutationFn: async (channel: string) => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.notifyDispatch, {
        body: { mode: "test", channel },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
    },
  });
}

export interface DispatchRun {
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  digests: number;
  errors: string[];
}

/** The dispatcher's newest run, for the settings screen's health line. Admin-read by RLS;
 *  everyone else (and a Hub whose migration lags) just gets null. */
export function useLastDispatchRun() {
  return useQuery({
    queryKey: ["notification-dispatch-log", "last"],
    staleTime: 60_000,
    queryFn: async (): Promise<DispatchRun | null> => {
      const { data, error } = await sb
        .from(TABLE.notificationDispatchLog)
        .select("started_at, finished_at, ok, digests, errors")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (error.code === "42P01") return null;
        throw error;
      }
      return (data as DispatchRun | null) ?? null;
    },
  });
}

// Rejected invoices whose rejection is addressed to this person. Same shape as
// useInvoicesReturnedToMe -- see useInvoicesReturnedByType for how the target is resolved.
export function useInvoicesRejectedToMe(myUserId: string | null, myName: string | null) {
  return useInvoicesReturnedByType("rejection", "rejected", "abgelehnt_an_mich", myUserId, myName);
}
