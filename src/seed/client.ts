import { TABLE } from "@/config/tables";
import {
  approvalRules,
  assignmentRules,
  bankAccounts,
  bankConnections,
  bankSyncLogs,
  bankTransactions,
  categories,
  categoryAccountMapping,
  changeHistory,
  channelFolders,
  channels,
  companies,
  customers,
  handoverRoutes,
  documentBankAccounts,
  documentFiles,
  documentHistory,
  documentTransactionMatches,
  filenameSettings,
  handoverBatches,
  incomingInvoices,
  ingestExclusions,
  manualBookings,
  matchingSettings,
  notificationChannels,
  notificationDispatchLog,
  notificationEvents,
  notificationSettings,
  openItemWhitelistRules,
  paymentOrders,
  outgoingInvoices,
  outgoingInvoiceFiles,
  outgoingInvoiceTransactionMatches,
  permissionCatalogue,
  pipelineRunRequests,
  pipelineRuns,
  processingLog,
  properties,
  propertyCompanies,
  rolePermissions,
  roles,
  supplierBankAccounts,
  supplierIbanHistory,
  suppliers,
  team,
  vatReserve,
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
  [TABLE.supplierBankAccounts]: supplierBankAccounts,
  [TABLE.documentBankAccounts]: documentBankAccounts,
  [TABLE.supplierIbanHistory]: supplierIbanHistory,
  [TABLE.customers]: customers,
  [TABLE.bankAccounts]: bankAccounts,
  [TABLE.bankConnections]: bankConnections,
  [TABLE.bankSyncLogs]: bankSyncLogs,
  [TABLE.paymentOrders]: paymentOrders,
  [TABLE.bankTransactions]: bankTransactions,
  [TABLE.handoverRoutes]: handoverRoutes,
  [TABLE.categoryAccountMapping]: categoryAccountMapping,
  [TABLE.matchingSettings]: matchingSettings,
  [TABLE.outgoingInvoices]: outgoingInvoices,
  [TABLE.outgoingInvoiceFiles]: outgoingInvoiceFiles,
  [TABLE.documentTransactionMatches]: documentTransactionMatches,
  [TABLE.documentFiles]: documentFiles,
  [TABLE.documentHistory]: documentHistory,
  [TABLE.outgoingInvoiceTransactionMatches]: outgoingInvoiceTransactionMatches,
  [TABLE.manualBookings]: manualBookings,
  [TABLE.filenameSettings]: filenameSettings,
  [TABLE.channels]: channels,
  [TABLE.channelFolders]: channelFolders,
  [TABLE.pipelineRuns]: pipelineRuns,
  [TABLE.pipelineRunRequests]: pipelineRunRequests,
  [TABLE.assignmentRules]: assignmentRules,
  [TABLE.approvalRules]: approvalRules,
  [TABLE.ingestExclusions]: ingestExclusions,
  [TABLE.openItemWhitelistRules]: openItemWhitelistRules,
  [TABLE.processingLog]: processingLog,
  [TABLE.changeHistory]: changeHistory,
  [TABLE.notificationChannels]: notificationChannels,
  [TABLE.notificationSettings]: notificationSettings,
  [TABLE.notificationEvents]: notificationEvents,
  [TABLE.notificationDispatchLog]: notificationDispatchLog,
  [TABLE.categories]: categories,
  [TABLE.handoverBatches]: handoverBatches,
  [TABLE.appUsers]: team,
  [TABLE.roles]: roles,
  [TABLE.rolePermissions]: rolePermissions,
  [TABLE.permissions]: permissionCatalogue,
  [TABLE.userPermissions]: [],

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
  vat_reserve: vatReserve,
  channel_secret_present: false,
  bank_sync_log_facets: {
    events: [...new Set(bankSyncLogs.map((l) => l.event))].sort(),
    levels: [...new Set(bankSyncLogs.map((l) => l.level))].sort(),
  },
  chain_people: team.map((member) => ({
    id: member.id,
    name: member.name,
    role_name: member.role,
    is_active: member.is_active,
    escalation_days: member.escalation_days,
    deputy_user_id: member.deputy_user_id,
    area: member.area,
  })),
  manual_bookings_expanded: manualBookings
    .filter((b) => !b.deleted_at)
    .map((b) => ({
      source_id: b.id,
      company_id: b.company_id,
      property_id: b.property_id,
      category_id: b.category_id,
      period: b.period,
      amount: b.amount,
      note: b.note,
      is_recurring: b.is_recurring,
    })),
  trash_eligible_tables: [
    "documents",
    "suppliers",
    "customers",
    "companies",
    "properties",
    "assignment_rules",
  ],
  trash_purge_eligible_tables: ["assignment_rules"],
  my_profile: [
    { id: team[0].id, name: team[0].name, email: team[0].email, picture_url: team[0].picture_url },
  ],
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

type SeedSession = { user: { email: string; user_metadata: { name?: string } } };

let session: SeedSession | null = null;
let authListener: ((event: string, session: SeedSession | null) => void) | null = null;

/**
 * Any email on the seed team, any password: the same "a fixed answer regardless of the filter"
 * rule this whole client follows, applied to credentials instead of a query. An unknown email
 * fails the same way a wrong password would on the real screen, so the error path is also real.
 */
export const seedAuth = {
  getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (callback: (event: string, session: SeedSession | null) => void) => {
    authListener = callback;
    return { data: { subscription: { unsubscribe: () => (authListener = null) } } };
  },
  signInWithPassword: async ({ email }: { email: string; password: string }) => {
    const match = team.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) return { error: { message: "Invalid login credentials" } };
    session = { user: { email: match.email, user_metadata: { name: match.name } } };
    authListener?.("SIGNED_IN", session);
    return { error: null };
  },
  signOut: async () => {
    session = null;
    authListener?.("SIGNED_OUT", null);
    return { error: null };
  },
  updateUser: async () => ({ error: null }),
};

export const seedClient = {
  from: (table: string) => builder(ROWS[table] ?? []),
  rpc: (name: string) => {
    const value = ANSWERS[name] ?? null;
    const first = Array.isArray(value) ? (value[0] ?? null) : value;
    return {
      then: (resolve: (v: Answer) => unknown) =>
        Promise.resolve({ data: value, error: null, count: 0 }).then(resolve),
      single: async () => ({ data: first, error: null }),
      maybeSingle: async () => ({ data: first, error: null }),
    };
  },
  auth: seedAuth,
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async () => ({ data: null, error: null }),
      upload: async () => ({ data: null, error: null }),
      remove: async () => ({ data: null, error: null }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://example.invalid/storage/${bucket}/${path}` },
      }),
    }),
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
};
