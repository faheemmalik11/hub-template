import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { EDGE_FUNCTION } from "@/config/edge-functions";
import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import {
  fetchAllRows,
  hasNextInfinitePage,
  invalidateMatchState,
  searchTokens,
  type InfinitePage,
} from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import {
  createBankAccount as createBankAccountFn,
  excludeBankAccount as excludeBankAccountFn,
  restoreBankAccount as restoreBankAccountFn,
  setBankAccountActive as setBankAccountActiveFn,
  updateBankAccount as updateBankAccountFn,
} from "@/lib/api/bank-accounts.functions";
import {
  createManualBankAccount as createManualBankAccountFn,
  importManualBankTransactions as importManualBankTransactionsFn,
  type CreateManualBankAccountConflict,
  type CreateManualBankAccountResult,
  type ImportManualTransactionsResult,
} from "@/lib/api/bank-manual-import.functions";
import type { NormalizedRow } from "@/lib/bank-import/types";
import type { BankAccountFields } from "@/lib/data/bank-account-fields";
import type {
  BankAccount,
  BankConnection,
  BankSyncLog,
  BankTransaction,
  OposCategory,
  PaymentOrder,
} from "@/lib/data/types";

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
  count: number;
  /** Sum of the signed amounts, so card spend is negative and a refund reduces it, exactly as on
   *  the statement. `signedAmount()` in _shared/pleo.ts negates Pleo's own positive "spent". */
  total: number;
  lastBooking: string | null;
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
      const count = async (table: string): Promise<number> => {
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
        count(TABLE.documentTransactionMatches),
        count(TABLE.outgoingInvoiceTransactionMatches),
        // document_files cascades off bank_transactions here (migration 0003) -- unlike the Immonetz
        // Hub, where no such FK exists. Attached receipt files really do go with the movements.
        count(TABLE.documentFiles),
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
  direction?: string;
  accountId?: string;
  transactionType?: string;
  /** Booking-date range, inclusive. Only the paginated list screen uses these. */
  bookingDateFromDate?: string;
  bookingDateToDate?: string;
  /** A company id, or null for "no company assigned". Undefined means every company. */
  companyId?: string | null;
  /** Provenance of the row ('banksapi', 'pleo', …). */
  source?: string;
  /**
   * Whether a DOCUMENT hangs off the transaction itself (invoice_files.transaction_id, migration
   * 0074) -- the Pleo card receipt, not a matched invoice. "mit" | "ohne"; undefined means both.
   */
  doc?: string;
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
  const { search, matchingStatus, direction, accountId, transactionType } = filter;
  const columns = filter.select ?? "*";
  const q = (search ?? "").trim();
  return useQuery({
    queryKey: [
      "bank_transactions",
      q,
      matchingStatus ?? "",
      direction ?? "",
      accountId ?? "",
      transactionType ?? "",
      columns,
    ],
    enabled: opts?.enabled ?? true,
    staleTime: STALE,
    placeholderData: keepPreviousData, // typing a search must not blank the table
    queryFn: async (): Promise<BankTransaction[]> => {
      // A plain number searches the amount -- fts only ever covers counterparty/reference/
      // booking-text, never the numeric amount, so a numeric-looking query goes to
      // amountQueryFilter instead of textSearch (which would find nothing).
      const amountFilter = q ? amountQueryFilter(q) : null;
      // fetchAllRows works around the platform's per-request row cap (see its own comment) — this
      // hook is Offene Posten's "unpaginated, whole open scope" source, so a silent partial result
      // here reads as a wrong total/count, exactly the discrepancy that surfaced this bug: this tab
      // showed "1000" while the properly-paginated Manual Link picker's exact count read "2039".
      const rows = await fetchAllRows<BankTransaction>((from, to, withCount) => {
        let query = sb
          .from(TABLE.bankTransactions)
          .select(columns, withCount ? { count: "exact" } : undefined);
        if (amountFilter) {
          query = query.or(amountFilter);
        } else if (q) {
          const tsq = prefixTsQuery(q);
          if (tsq) query = query.or(bankSearchFilter(q, tsq));
        }
        if (matchingStatus) query = query.eq("matching_status", matchingStatus);
        if (direction) query = query.eq("direction", direction);
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
  const raw = q
    .trim()
    .replace(/[(),.*:"\\]/g, " ")
    .trim();
  const terms = [`fts.fts(german).${tsq}`];
  if (raw) terms.push(`spender_name.ilike.*${raw}*`, `spender_email.ilike.*${raw}*`);
  return terms.join(",");
}

export function useBankTransactionsPage(
  filter: BankTransactionFilter & { page: number; pageSize: number },
) {
  const {
    search,
    matchingStatus,
    direction,
    accountId,
    transactionType,
    bookingDateFromDate,
    bookingDateToDate,
    companyId,
    source,
    doc,
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
      direction ?? "",
      accountId ?? "",
      transactionType ?? "",
      bookingDateFromDate ?? "",
      bookingDateToDate ?? "",
      companyId === undefined ? "" : (companyId ?? "__null"),
      source ?? "",
      doc ?? "",
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
      const documentEmbed =
        doc === "mit"
          ? `,${TABLE.documentFiles}!inner(id)`
          : doc === "ohne"
            ? `,${TABLE.documentFiles}(id)`
            : "";
      let query = sb.from(TABLE.bankTransactions).select(`*${documentEmbed}`, { count: "exact" });
      if (doc === "mit") query = query.is(`${TABLE.documentFiles}.deleted_at`, null);
      else if (doc === "ohne") query = query.is(TABLE.documentFiles, null);
      // Number typed -> amount search, anything else -> full text (see amountQueryFilter).
      const amountFilter = q ? amountQueryFilter(q) : null;
      if (amountFilter) query = query.or(amountFilter);
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
      if (direction) query = query.eq("direction", direction);
      if (accountId) query = query.eq("account_id", accountId);
      // "unbekannt" has to include NULL too: rows imported before the classifier existed carry
      // null until the next sync fills them, and to the user both mean the same thing, namely
      // that this movement has no type yet. Filtering on the literal alone would hide them.
      if (transactionType === "unbekannt") {
        query = query.or("transaction_type.is.null,transaction_type.eq.unbekannt");
      } else if (transactionType) {
        query = query.eq("transaction_type", transactionType);
      }
      if (bookingDateFromDate) query = query.gte("booking_date", bookingDateFromDate);
      if (bookingDateToDate) query = query.lte("booking_date", bookingDateToDate);
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
      const sortColumn = sort ?? "booking_date";
      const { data, error, count } = await query
        .order(sortColumn, { ascending: dir === "asc", nullsFirst: false })
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
      const documentSource = new Map<string, string | null>();
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
          if (!documentSource.has(d.transaction_id)) {
            documentSource.set(d.transaction_id, d.source);
          }
        }
      }

      return {
        rows: pageRows.map((r) => ({
          ...r,
          has_suggested_match: suggestedIds.has(r.id),
          has_document: documentSource.has(r.id),
          document_source: documentSource.get(r.id) ?? null,
        })),
        total: count ?? 0,
      };
    },
  });
}

export interface OpenBankTransactionsInfiniteFilter {
  search?: string;
  matchingStatus?: string;
  direction?: string;
  bookingDateFromDate?: string;
  bookingDateToDate?: string;
  valueDateFromDate?: string;
  valueDateToDate?: string;
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
    const [whole, decimals = ""] = negativeAllowed.split(",");
    euros = whole.replace(/\./g, "");
    cents = decimals;
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(negativeAllowed)) {
    // English grouping: 9,304 / 9,304.15
    const [whole, decimals = ""] = negativeAllowed.split(".");
    euros = whole.replace(/,/g, "");
    cents = decimals;
  } else if (/^\d+([.,]\d{1,2})?$/.test(negativeAllowed)) {
    // One separator and no grouping: it is the decimal one. 12.34 / 12,34 / 12
    const [whole, decimals = ""] = negativeAllowed.split(/[.,]/);
    euros = whole;
    cents = decimals;
  } else {
    return null; // "1.2.3", "abc", "4x" -> leave it to the text search
  }
  const value = Number(cents ? `${euros}.${cents}` : euros);
  if (!Number.isFinite(value)) return null;
  if (cents) {
    // A full amount was typed: match it exactly, in either direction.
    return value === 0 ? "amount.eq.0" : `amount.eq.${value},amount.eq.${-value}`;
  }
  // Euros only: every amount whose euro part is this number, in either direction.
  const upper = value + 1;
  return (
    `and(amount.gte.${value},amount.lt.${upper}),` + `and(amount.gt.${-upper},amount.lte.${-value})`
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
    direction,
    bookingDateFromDate,
    bookingDateToDate,
    valueDateFromDate,
    valueDateToDate,
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
      direction ?? "",
      bookingDateFromDate ?? "",
      bookingDateToDate ?? "",
      valueDateFromDate ?? "",
      valueDateToDate ?? "",
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
      const amountFilter = q ? amountQueryFilter(q) : null;

      let query = sb.from(TABLE.bankTransactions).select("*", { count: "exact" });
      if (amountFilter) {
        query = query.or(amountFilter);
      } else if (q) {
        for (const token of searchTokens(q)) {
          query = query.or(
            `counterparty_holder.ilike.%${token}%,payment_reference.ilike.%${token}%,booking_text.ilike.%${token}%`,
          );
        }
      }
      if (matchingStatus) query = query.eq("matching_status", matchingStatus);
      if (direction) query = query.eq("direction", direction);
      if (bookingDateFromDate) query = query.gte("booking_date", bookingDateFromDate);
      if (bookingDateToDate) query = query.lte("booking_date", bookingDateToDate);
      if (valueDateFromDate) query = query.gte("value_date", valueDateFromDate);
      if (valueDateToDate) query = query.lte("value_date", valueDateToDate);

      const column = sort === "name" ? "counterparty_holder" : sort === "amount" ? "amount" : sort;
      let ascending = dir === "asc";
      // "amount" sort means magnitude, not the raw signed value (a €500 debit should sort as
      // "bigger" than a €50 one, not smaller) — see manual-link-tab.tsx's compare() for the client
      // equivalent this replaces. Every row here shares one sign (this picker always sets richtung),
      // so flipping the raw order for a negative (ausgehend) set reproduces magnitude order exactly.
      if (sort === "amount" && direction === "ausgehend") ascending = !ascending;
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
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  refreshMs?: number;
}) {
  const { event, level, connectionId, fromDate, toDate, page, pageSize, refreshMs } = filter;
  return useQuery({
    queryKey: [
      "bank_sync_logs_page",
      event ?? "",
      level ?? "",
      connectionId ?? "",
      fromDate ?? "",
      toDate ?? "",
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
      if (fromDate) query = query.gte("created_at", new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) query = query.lte("created_at", new Date(`${toDate}T23:59:59.999`).toISOString());
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
  accounts: number;
  transactions: number;
  transactionsAssigned: number;
  activityLog: number;
}

export function useDisconnectPreview(connectionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bank_connections", "disconnect_preview", connectionId],
    enabled: enabled && !!connectionId,
    staleTime: 0,
    queryFn: async (): Promise<DisconnectPreview> => {
      const count = async (table: string): Promise<number> => {
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

      const [accounts, transactions, activityLog, incoming, outgoing] = await Promise.all([
        count(TABLE.bankAccounts),
        count(TABLE.bankTransactions),
        count(TABLE.bankSyncLogs),
        matchIds("invoice_transaction_matches"),
        matchIds("outgoing_invoice_transaction_matches"),
      ]);

      // Deduped across the two tables: one movement can be matched to an incoming and an outgoing
      // invoice, and counting it twice would overstate the figure.
      return {
        accounts,
        transactions,
        transactionsAssigned: new Set([...incoming, ...outgoing]).size,
        activityLog,
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
