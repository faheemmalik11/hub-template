/**
 * Every Supabase table and view this app names, spelled once.
 *
 * A table renamed in the database is one edit here rather than a search through every query, and
 * a name that no longer exists fails to compile instead of failing at runtime.
 *
 * The bookkeeping rename is DONE: both sides agree again, so `documents: "documents"` reads and
 * sends the same word. While it was in flight the key held the new name and the value the old one,
 * which is what reduced the whole app-side cutover to ten values in this file and its Deno twin.
 * See docs/TABLE_NAMING_MIGRATION.md.
 *
 * Values generated from the live schema (pg_tables + pg_views in `public`). Refresh them from the
 * database, not from the repo: supabase/schema.sql is a German-era snapshot and the migrations
 * here do not create the tables the ingestion pipeline owns.
 *
 * The Deno twin is supabase/functions/_shared/tables.ts and a rename touches both.
 */
export const TABLE = {
  aiSearchUsage: "ai_search_usage",
  appUsers: "app_users",
  approvalRules: "approval_rules",
  approvers: "approvers",
  assignmentRules: "assignment_rules",
  bankAccounts: "bank_accounts",
  bankConnections: "bank_connections",
  bankProviders: "bank_providers",
  bankSyncLogs: "bank_sync_logs",
  bankTransactions: "bank_transactions",
  bwaAccountMapping: "bwa_account_mapping",
  categories: "categories",
  categoryAliases: "category_aliases",
  changeHistory: "change_history",
  channelFolders: "channel_folders",
  channelState: "channel_state",
  channels: "channels",
  companies: "companies",
  credentialReads: "credential_reads",
  credentials: "credentials",
  customers: "customers",
  datevHandoverBatches: "datev_handover_batches",
  datevRoutes: "datev_routes",
  documentBankAccounts: "document_bank_accounts",
  documentFiles: "document_files",
  documentHistory: "document_history",
  documentLineItems: "document_line_items",
  documentTaxes: "document_taxes",
  documents: "documents",
  entityAliases: "entity_aliases",
  filenameSettings: "filename_settings",
  filingPlacements: "filing_placements",
  importedItems: "imported_items",
  ingestExclusions: "ingest_exclusions",
  invoiceTransactionMatches: "invoice_transaction_matches",
  mailSettings: "mail_settings",
  manualBookings: "manual_bookings",
  matchingSettings: "matching_settings",
  notificationChannels: "notification_channels",
  notificationDispatchLog: "notification_dispatch_log",
  notificationEvents: "notification_events",
  notificationSettings: "notification_settings",
  notificationTargetKinds: "notification_target_kinds",
  oposWhitelistRules: "opos_whitelist_rules",
  outgoingInvoiceFiles: "outgoing_invoice_files",
  outgoingInvoiceTransactionMatches: "outgoing_invoice_transaction_matches",
  outgoingInvoices: "outgoing_invoices",
  packageMigrations: "package_migrations",
  paymentOrders: "payment_orders",
  permissions: "permissions",
  pipelineRunRequests: "pipeline_run_requests",
  pipelineRuns: "pipeline_runs",
  pipelineSettings: "pipeline_settings",
  pleoAccounts: "pleo_accounts",
  pleoTags: "pleo_tags",
  processingLog: "processing_log",
  properties: "properties",
  propertyCompanies: "property_companies",
  readCursors: "read_cursors",
  rolePermissions: "role_permissions",
  roles: "roles",
  schemaMigrations: "schema_migrations",
  supplierBankAccounts: "supplier_bank_accounts",
  supplierIbanHistory: "supplier_iban_history",
  suppliers: "suppliers",
  tenantSettings: "tenant_settings",
  tenantSettingsHistory: "tenant_settings_history",
  tourProgress: "tour_progress",
  userCompanyAccess: "user_company_access",
  userPermissions: "user_permissions",
  vBankTransactionsList: "v_bank_transactions_list",
  vCompanyInvoiceTotals: "v_company_invoice_totals",
  vCustomerInvoiceTotals: "v_customer_invoice_totals",
  vInvoicesList: "v_invoices_list",
  vInvoicesReview: "v_invoices_review",
  vInvoicesSearch: "v_invoices_search",
  vOpenItems: "v_open_items",
  vPropertyInvoiceTotals: "v_property_invoice_totals",
  vSupplierDuplicates: "v_supplier_duplicates",
  vSupplierInvoiceTotals: "v_supplier_invoice_totals",
  vTrash: "v_trash",
  vTrashBase: "v_trash_base",
  vatRates: "vat_rates",
} as const;

export type TableName = (typeof TABLE)[keyof typeof TABLE];
