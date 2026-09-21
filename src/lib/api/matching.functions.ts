import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import type {
  MatchDocument,
  MatchCandidate,
  MatchDirection,
  MatchTransaction,
} from "@/lib/matching/score";
import { TABLE } from "@/config/tables";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const PAGE_SIZE = 1000;
const MAX_PAGES = 500;
const UPSERT_CHUNK = 500;

const INVOICE_COLUMNS =
  "id, amount_gross, document_date, due_date, invoice_number, customer_number, issuer, suppliers(iban)";
const OUTGOING_COLUMNS =
  "id, amount_gross, invoice_date, due_date, invoice_number, customers(name, customer_number)";
const TRANSACTION_COLUMNS =
  "id, amount, booking_date, payment_reference, counterparty_iban, counterparty_holder";

const RunMatchingSchema = z.object({
  direction: z.enum(["incoming", "outgoing", "both"]).default("both"),
  companyId: z.string().uuid().nullish(),
});

export interface MatchingDirectionResult {
  direction: MatchDirection;
  invoices: number;
  transactions: number;
  proposed: number;
  auto: number;
  candidate: number;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; hint?: string; code?: string };
    if (p.message || p.code) {
      return [p.message, p.details, p.hint, p.code && `[${p.code}]`].filter(Boolean).join(" | ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e ?? "unknown error");
}

async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => Promise<{
    data: unknown;
    error: unknown;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");

    const batch = (data ?? []) as T[];
    if (batch.length === 0) return rows;

    rows.push(...batch);
    from += batch.length;
  }

  throw new AppError("Pagination did not advance", 500, "PAGINATION_ERROR");
}

function scopedToCompany<Q extends { eq: (column: string, value: string) => Q }>(
  query: Q,
  companyId: string | null | undefined,
): Q {
  return companyId ? query.eq("company_id", companyId) : query;
}

function toIncomingDocument(row: Record<string, unknown>): MatchDocument {
  const supplier = row.suppliers as { iban?: string | null } | null;
  return {
    id: row.id as string,
    amount_gross: (row.amount_gross as number | null) ?? null,
    document_date: (row.document_date as string | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    invoice_number: (row.invoice_number as string | null) ?? null,
    customer_number: (row.customer_number as string | null) ?? null,
    issuer: (row.issuer as string | null) ?? null,
    supplier_iban: supplier?.iban ?? null,
  };
}

function toOutgoingDocument(row: Record<string, unknown>): MatchDocument {
  const customer = row.customers as {
    name?: string | null;
    customer_number?: string | null;
  } | null;
  return {
    id: row.id as string,
    amount_gross: (row.amount_gross as number | null) ?? null,
    document_date: (row.invoice_date as string | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    invoice_number: (row.invoice_number as string | null) ?? null,
    customer_number: customer?.customer_number ?? null,
    issuer: customer?.name ?? null,
    supplier_iban: null,
  };
}

function loadDocuments(db: Db, direction: MatchDirection, companyId: string | null | undefined) {
  if (direction === "incoming") {
    return fetchAllRows<Record<string, unknown>>((from, to) =>
      scopedToCompany(
        db.from(TABLE.vOpenItems).select(INVOICE_COLUMNS).eq("is_open", true),
        companyId,
      )
        .order("id")
        .range(from, to),
    ).then((rows) => rows.map(toIncomingDocument));
  }

  return fetchAllRows<Record<string, unknown>>((from, to) =>
    scopedToCompany(
      db.from(TABLE.outgoingInvoices).select(OUTGOING_COLUMNS).eq("status", "open"),
      companyId,
    )
      .order("id")
      .range(from, to),
  ).then((rows) => rows.map(toOutgoingDocument));
}

function loadTransactions(db: Db, direction: MatchDirection, companyId: string | null | undefined) {
  return fetchAllRows<MatchTransaction>((from, to) => {
    const base = db
      .from(TABLE.bankTransactions)
      .select(TRANSACTION_COLUMNS)
      .eq("matching_status", "open");
    const directed = direction === "incoming" ? base.lt("amount", 0) : base.gt("amount", 0);
    return scopedToCompany(directed, companyId).order("id").range(from, to);
  });
}

async function persistCandidates(
  db: Db,
  direction: MatchDirection,
  candidates: MatchCandidate[],
): Promise<void> {
  const table =
    direction === "incoming"
      ? TABLE.documentTransactionMatches
      : TABLE.outgoingInvoiceTransactionMatches;
  const invoiceKey = direction === "incoming" ? "document_id" : "outgoing_invoice_id";

  for (let i = 0; i < candidates.length; i += UPSERT_CHUNK) {
    const chunk = candidates.slice(i, i + UPSERT_CHUNK).map((c) => ({
      [invoiceKey]: c.document_id,
      transaction_id: c.transaction_id,
      status: c.status,
      score: c.score,
      match_reasons: c.match_reasons,
      amount_matched: c.amount_matched,
      matched_by: "system",
    }));

    const { error } = await db
      .from(table)
      .upsert(chunk, { onConflict: `${invoiceKey},transaction_id`, ignoreDuplicates: true });
    if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");
  }
}

async function matchDirection(
  db: Db,
  direction: MatchDirection,
  companyId: string | null | undefined,
): Promise<MatchingDirectionResult> {
  const { runMatching } = await import("@/lib/matching/score");

  const [documents, transactions] = await Promise.all([
    loadDocuments(db, direction, companyId),
    loadTransactions(db, direction, companyId),
  ]);

  const candidates = runMatching(documents, transactions, direction);
  await persistCandidates(db, direction, candidates);

  return {
    direction,
    invoices: documents.length,
    transactions: transactions.length,
    proposed: candidates.length,
    auto: candidates.filter((c) => c.status === "auto").length,
    candidate: candidates.filter((c) => c.status === "candidate").length,
  };
}

export const runTransactionMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(RunMatchingSchema)
  .handler(async ({ data, context }): Promise<{ results: MatchingDirectionResult[] }> => {
    const { direction, companyId } = data;

    if (companyId) {
      const { data: mayAccess, error } = await (context.supabase as Db).rpc("has_company_access", {
        p_company: companyId,
      });
      if (error) throw new AppError(errorMessage(error), 500, "ACCESS_CHECK_FAILED");
      if (mayAccess !== true) throw new AppError("No access to this company.", 403, "FORBIDDEN");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const directions: MatchDirection[] =
      direction === "both" ? ["incoming", "outgoing"] : [direction];

    const results: MatchingDirectionResult[] = [];
    for (const d of directions) {
      results.push(await matchDirection(db, d, companyId));
    }

    return { results };
  });
