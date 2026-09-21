import { TABLE } from "@/config/tables";
import {
  approvalRules,
  assignmentRules,
  bankAccounts,
  bankTransactions,
  categories,
  companies,
  customers,
  handoverBatches,
  incomingInvoices,
  manualBookings,
  outgoingInvoices,
  processingLog,
  properties,
  propertyCompanies,
  suppliers,
  team,
} from "./index";
import { permissions } from "./admin/permissions";

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
const unpaid = incomingInvoices.filter((one) => !(one as { paid_at?: string | null }).paid_at);

const ROWS: Record<string, unknown[]> = {
  [TABLE.documents]: incomingInvoices,
  [TABLE.companies]: companies,
  [TABLE.properties]: properties,
  [TABLE.propertyCompanies]: propertyCompanies,
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
  [TABLE.handoverBatches]: handoverBatches,
  [TABLE.appUsers]: team,

  // Every list reads a view, never the table underneath it, so a fixture reachable only by table
  // name shows an empty screen with data sitting right there.
  [TABLE.vDocumentsList]: incomingInvoices,
  [TABLE.vDocumentsReview]: incomingInvoices,
  [TABLE.vDocumentsSearch]: incomingInvoices,
  [TABLE.vBankTransactionsList]: bankTransactions,
  [TABLE.vOpenItems]: unpaid,

  // Empty on purpose: nothing deleted, no duplicate suppliers, and a totals view answered with
  // invented sums would disagree with the rows the same screen lists underneath it.
  [TABLE.vTrash]: [],
  [TABLE.vSupplierDuplicates]: [],
  [TABLE.vCompanyDocumentTotals]: [],
  [TABLE.vPropertyDocumentTotals]: [],
  [TABLE.vSupplierDocumentTotals]: [],
  [TABLE.vCustomerInvoiceTotals]: [],
};

const sum = (rows: unknown[]) =>
  rows.reduce(
    (total: number, one) => total + Number((one as { amount_gross?: number }).amount_gross ?? 0),
    0,
  );

const field = (one: unknown, name: string) => (one as Record<string, unknown>)[name];

const queueKpis = [
  {
    key: "needs_action",
    rows: incomingInvoices.filter((o) => field(o, "status") === "needs_review"),
  },
  { key: "missing_assignment", rows: incomingInvoices.filter((o) => !field(o, "company_code")) },
  {
    key: "ready_for_payment",
    rows: unpaid.filter((o) => String(field(o, "workflow_status") ?? "").startsWith("approved")),
  },
  {
    key: "pay_now",
    rows: unpaid.filter((o) => String(field(o, "due_date") ?? "") <= "2026-09-21"),
  },
  { key: "completed", rows: incomingInvoices.filter((o) => field(o, "paid_at")) },
].map(({ key, rows }) => ({ key, count: rows.length, amount: sum(rows) }));

const distinct = (name: string) => [
  ...new Set(incomingInvoices.map((one) => field(one, name)).filter(Boolean)),
];

/**
 * The reads a screen cannot draw itself without. A write RPC stays absent and answers null, the
 * way every other write here resolves as though it worked and changed nothing.
 */
const ANSWERS: Record<string, unknown> = {
  current_permissions: permissions,
  run_now_enabled: false,
  invoice_queue_kpis: queueKpis,
  invoices_kpis: {
    total: incomingInvoices.length,
    recognised: incomingInvoices.filter((one) => field(one, "status") === "recognised").length,
    zu_pruefen: incomingInvoices.filter((one) => field(one, "status") === "needs_review").length,
    volume: sum(incomingInvoices),
    open: sum(unpaid),
  },
  invoices_facets: {
    objekt_codes: distinct("property_code"),
    documentTypes: distinct("document_type"),
    months: [
      ...new Set(incomingInvoices.map((one) => String(field(one, "document_date")).slice(0, 7))),
    ],
    years: [
      ...new Set(
        incomingInvoices.map((one) => Number(String(field(one, "document_date")).slice(0, 4))),
      ),
    ],
  },
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
  rpc: async (name: string) => ({ data: ANSWERS[name] ?? null, error: null }),
  auth: {
    getUser: async () => ({ data: { user: { email: "owner@example.com" } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
};
