import { TABLE } from "@/config/tables";
import {
  approvalRules,
  assignmentRules,
  bankAccounts,
  bankTransactions,
  categories,
  companies,
  customers,
  incomingInvoices,
  manualBookings,
  outgoingInvoices,
  processingLog,
  properties,
  suppliers,
} from "./index";

/**
 * A stand-in for the database client, answering from `src/seed` instead of Postgres.
 *
 * WHAT IT IS NOT: a database. Filters, ordering and paging are accepted and ignored, so a screen
 * that asks for one company's invoices gets every fixture row. That is enough to look at a layout
 * and nowhere near enough to test a query, and pretending otherwise would be worse than the gap.
 *
 * Writes resolve as though they worked and change nothing, because a screen that errors on save
 * cannot be walked through, and a fixture that mutated would leave the next visit looking
 * different for no reason.
 */
const ROWS: Record<string, unknown[]> = {
  [TABLE.documents]: incomingInvoices,
  [TABLE.companies]: companies,
  [TABLE.properties]: properties,
  [TABLE.suppliers]: suppliers,
  [TABLE.customers]: customers,
  [TABLE.bankAccounts]: bankAccounts,
  [TABLE.bankTransactions]: bankTransactions,
  [TABLE.outgoingInvoices]: outgoingInvoices,
  [TABLE.manualBookings]: manualBookings,
  [TABLE.assignmentRules]: assignmentRules,
  [TABLE.approvalRules]: approvalRules,
  [TABLE.processingLog]: processingLog,
  [TABLE.categories]: categories,
};

type Answer = { data: unknown; error: null; count: number };

function builder(rows: unknown[]) {
  const answer: Answer = { data: rows, error: null, count: rows.length };

  // Every filter returns the same builder: accepted, recorded nowhere, applied to nothing.
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Answer) => unknown) => Promise.resolve(answer).then(resolve),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    csv: async () => ({ data: "", error: null }),
  };
  for (const name of [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "in",
    "like",
    "ilike",
    "not",
    "or",
    "filter",
    "order",
    "limit",
    "range",
    "returns",
    "overrideTypes",
    "abortSignal",
    "match",
    "contains",
    "textSearch",
    "throwOnError",
  ]) {
    chain[name] = () => chain;
  }
  for (const name of ["insert", "update", "upsert", "delete"]) {
    chain[name] = () => builder([]);
  }
  return chain;
}

export const seedClient = {
  from: (table: string) => builder(ROWS[table] ?? []),
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getUser: async () => ({ data: { user: { email: "owner@example.com" } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
};
