/**
 * PROJECT CONFIG — the permission keys this Hub uses.
 *
 * PORTABILITY. Everything else in the permission system is generic: the tables, the
 * `current_permissions()`/`has_permission()` functions and their RLS policies are created by
 * `supabase/migrations/…_permissions_model.sql` and carry no project-specific keys. The catalogue
 * itself lives in two places that a new project replaces wholesale, and nowhere else:
 *
 *   1. this file — the keys the TypeScript refers to;
 *   2. `supabase/permissions.seed.sql` — the same keys with their labels and role defaults.
 *
 * The two are kept in step by `PERMISSION_KEYS` below being the literal list the seed inserts. No
 * other file in `src/` should contain a permission string; import from here so a rename is one
 * edit and a missing key is a type error rather than a silently-false check.
 */

export const PERMISSIONS = {
  // What a person may DO. The first ten are the area capabilities the database's own policies ask
  // for by name, listed at the top of supabase/schema/0010_access.sql.
  usersRead: "users.read",
  documentsRead: "documents.read",
  documentsWrite: "documents.write",
  masterDataRead: "master_data.read",
  masterDataWrite: "master_data.write",
  bankRead: "bank.read",
  bankWrite: "bank.write",
  paymentsWrite: "payments.write",
  rulesWrite: "rules.write",
  settingsManage: "settings.manage",

  // The approval chain, which needs its own steps rather than one "may edit".
  invoicesApprove: "invoices.approve",
  invoicesApproveFinal: "invoices.approve_final",
  invoicesOverrideWorkflow: "invoices.override_workflow",

  // Which screens exist. A page key is also a feature switch: a client that does not use a page
  // turns it off, and nobody sees it whatever their role says.
  pageOverview: "page.overview",
  pageProfile: "page.profile",
  pageIncomingInvoices: "page.incoming_invoices",
  pageOutgoingInvoices: "page.outgoing_invoices",
  pageManualBookings: "page.manual_bookings",
  pageFileNaming: "page.file_naming",
  pageDocumentSources: "page.document_sources",
  pageOpenItems: "page.open_items",
  pageBankTransactions: "page.bank_transactions",
  pageBankAccounts: "page.bank_accounts",
  pageOpenItemWhitelist: "page.open_item_whitelist",
  pageBankSettings: "page.bank_settings",
  pageSuppliers: "page.suppliers",
  pageCustomers: "page.customers",
  pageCompanies: "page.companies",
  pageProperties: "page.properties",
  pageCategories: "page.categories",
  pageAssignmentRules: "page.assignment_rules",
  pageApprovalRules: "page.approval_rules",
  pageExclusionRules: "page.exclusion_rules",
  pageVatRules: "page.vat_rules",
  pageTaxReserve: "page.tax_reserve",
  pageHandover: "page.handover",
  pageReports: "page.reports",
  pageTeam: "page.team",
  pageOnboarding: "page.onboarding",
  pageNotifications: "page.notifications",
  pageActivityLog: "page.activity_log",
  pageTrash: "page.trash",
  pageBankConnections: "page.bank_connections",

  // Menu groups. Switching one off takes its pages with it.
  moduleOverview: "module.overview",
  moduleInvoices: "module.invoices",
  modulePayments: "module.payments",
  moduleMasterData: "module.master_data",
  moduleRules: "module.rules",
  moduleTaxes: "module.taxes",
  moduleReports: "module.reports",
  moduleAdmin: "module.admin",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);
