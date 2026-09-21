import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeatureGate } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import {
  FILE_URL_STALE,
  fetchAllRows,
  hasNextInfinitePage,
  invalidateMatchState,
  requiredReason,
  type InfinitePage,
} from "@/data/shared";
import { getOutgoingInvoiceFileUrl } from "@/lib/api/outgoing-invoice-files.functions";
import { extractOutgoingInvoiceFields } from "@/lib/api/outgoing-invoice-extraction.functions";
import { createUploadedOutgoingInvoice } from "@/lib/api/outgoing-invoice-upload.functions";
import type { Customer, OutgoingInvoice, OutgoingVoucherStatus } from "@/lib/data/types";
import type { OutgoingInvoiceUploadMime } from "@/lib/api/outgoing-invoice-shared";
import { supabase } from "@/integrations/supabase/client";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

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
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.customers)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(reason),
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
  // The overview reads this, so it runs for a client who bills nobody and has the page switched off.
  const enabled = useFeatureGate(PERMISSIONS.pageOutgoingInvoices);
  return useQuery({
    queryKey: ["outgoing_invoices", filter ?? {}],
    staleTime: STALE,
    enabled,
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
  fromDate?: string;
  toDate?: string;
  createdAtFromDate?: string;
  createdAtToDate?: string;
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
    fromDate,
    toDate,
    createdAtFromDate,
    createdAtToDate,
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
      fromDate ?? "",
      toDate ?? "",
      createdAtFromDate ?? "",
      createdAtToDate ?? "",
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
      if (fromDate) query = query.gte("invoice_date", fromDate);
      if (toDate) query = query.lte("invoice_date", toDate);
      if (createdAtFromDate) query = query.gte("created_at", createdAtFromDate);
      // Inclusive of the whole end day — created_at is a timestamptz, a bare date bound would cut
      // off at midnight and silently drop everything from later that same day.
      if (createdAtToDate) query = query.lte("created_at", `${createdAtToDate}T23:59:59.999`);

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
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.outgoingInvoices)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(reason),
        })
        .eq("id", invoiceId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        invoiceId,
        "deletion",
        reason || "Ausgangsrechnung gelöscht",
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
    staleTime: FILE_URL_STALE,
    queryFn: () => getOutgoingInvoiceFileUrl({ data: { outgoingInvoiceId } }),
  });
}
