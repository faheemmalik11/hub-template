// Every table these functions name, spelled once.
//
// The app keeps the same list in src/lib/data/tables.ts; Edge Functions run on Deno and cannot
// import from src/, so the two are kept in step by hand and a rename touches both.
export const TABLE = {
  appUsers: "app_users",
  bankAccounts: "bank_accounts",
  bankConnections: "bank_connections",
  bankSyncLogs: "bank_sync_logs",
  bankTransactions: "bank_transactions",
  customers: "customers",
  documentFiles: "document_files",
  documentHistory: "document_history",
  documents: "documents",
  invoiceTransactionMatches: "invoice_transaction_matches",
  matchingSettings: "matching_settings",
  notificationChannels: "notification_channels",
  notificationDispatchLog: "notification_dispatch_log",
  notificationEvents: "notification_events",
  notificationSettings: "notification_settings",
  outgoingInvoiceTransactionMatches: "outgoing_invoice_transaction_matches",
  outgoingInvoices: "outgoing_invoices",
  paymentOrders: "payment_orders",
  pipelineRuns: "pipeline_runs",
  pleoAccounts: "pleo_accounts",
  pleoTags: "pleo_tags",
  rolePermissions: "role_permissions",
  supplierBankAccounts: "supplier_bank_accounts",
  supplierIbanHistory: "supplier_iban_history",
  suppliers: "suppliers",
  userPermissions: "user_permissions",
  vBankTransactionsList: "v_bank_transactions_list",
  vOpenItems: "v_open_items",
} as const;
