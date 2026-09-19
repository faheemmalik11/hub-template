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
  approvalRules: "approval_rules",
  approvers: "approvers",
  appUsers: "app_users",
  assignmentRules: "assignment_rules",
  assistantUsage: "assistant_usage",
  bankAccounts: "bank_accounts",
  bankConnections: "bank_connections",
  bankProviders: "bank_providers",
  bankSyncLogs: "bank_sync_logs",
  bankTransactions: "bank_transactions",
  categories: "categories",
  categoryAccountMapping: "category_account_mapping",
  categoryAliases: "category_aliases",
  changeHistory: "change_history",
  channelFolders: "channel_folders",
  channels: "channels",
  channelState: "channel_state",
  companies: "companies",
  credentialReads: "credential_reads",
  credentials: "credentials",
  customers: "customers",
  documentBankAccounts: "document_bank_accounts",
  documentFiles: "document_files",
  documentHistory: "document_history",
  documentLineItems: "document_line_items",
  documents: "documents",
  documentTaxes: "document_taxes",
  documentTransactionMatches: "document_transaction_matches",
  entityAliases: "entity_aliases",
  featureSettings: "feature_settings",
  filenameSettings: "filename_settings",
  filingPlacements: "filing_placements",
  handoverBatches: "handover_batches",
  handoverRoutes: "handover_routes",
  importedItems: "imported_items",
  ingestExclusions: "ingest_exclusions",
  manualBookings: "manual_bookings",
  matchingSettings: "matching_settings",
  notificationChannels: "notification_channels",
  notificationDispatchLog: "notification_dispatch_log",
  notificationEvents: "notification_events",
  notificationSettings: "notification_settings",
  notificationTargetKinds: "notification_target_kinds",
  openItemWhitelistRules: "open_item_whitelist_rules",
  outgoingInvoiceFiles: "outgoing_invoice_files",
  outgoingInvoices: "outgoing_invoices",
  outgoingInvoiceTransactionMatches: "outgoing_invoice_transaction_matches",
  paymentOrders: "payment_orders",
  permissions: "permissions",
  pipelineRunRequests: "pipeline_run_requests",
  pipelineRuns: "pipeline_runs",
  pipelineSettings: "pipeline_settings",
  processingLog: "processing_log",
  properties: "properties",
  propertyCompanies: "property_companies",
  readCursors: "read_cursors",
  reviewConfidenceBands: "review_confidence_bands",
  reviewScoreRules: "review_score_rules",
  rolePermissions: "role_permissions",
  roles: "roles",
  supplierBankAccounts: "supplier_bank_accounts",
  supplierIbanHistory: "supplier_iban_history",
  suppliers: "suppliers",
  tenantSettings: "tenant_settings",
  tenantSettingsHistory: "tenant_settings_history",
  tourProgress: "tour_progress",
  userCompanyAccess: "user_company_access",
  userPermissions: "user_permissions",
  vatRates: "vat_rates",
  vBankTransactionsList: "v_bank_transactions_list",
  vCompanyDocumentTotals: "v_company_document_totals",
  vCustomerInvoiceTotals: "v_customer_invoice_totals",
  vDocumentsList: "v_documents_list",
  vDocumentsReview: "v_documents_review",
  vDocumentsSearch: "v_documents_search",
  vOpenItems: "v_open_items",
  vPropertyDocumentTotals: "v_property_document_totals",
  vSupplierDocumentTotals: "v_supplier_document_totals",
  vSupplierDuplicates: "v_supplier_duplicates",
  vTrash: "v_trash",
} as const;

export type TableName = (typeof TABLE)[keyof typeof TABLE];
