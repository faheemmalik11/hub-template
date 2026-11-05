/**
 * Sample data for every page, so a screen can be looked at without a client's database behind it.
 *
 * Never SQL, never written anywhere: these are values handed to the same adapters the real screens
 * use. Each is typed against the row type its page reads, so a column that changes shape breaks
 * the fixture rather than quietly rendering nothing. See README.md in this folder.
 */
export * from "./shared";

export { companies } from "./master-data/companies";
export {
  suppliers,
  supplierBankAccounts,
  documentBankAccounts,
  supplierIbanHistory,
} from "./master-data/suppliers";
export { properties, propertyCompanies } from "./master-data/properties";
export { customers } from "./master-data/customers";
export { categories, categoryAccountMapping } from "./master-data/categories";

export { incomingInvoices, documentFiles, documentHistory } from "./invoices/incoming";
export { outgoingInvoices, outgoingInvoiceFiles } from "./invoices/outgoing";
export { manualBookings } from "./invoices/manual-bookings";
export { filenameSettings } from "./invoices/filename-settings";
export {
  channels,
  channelFolders,
  pipelineRuns,
  pipelineRunRequests,
} from "./invoices/document-sources";

export { bankAccounts } from "./payments/bank-accounts";
export { bankConnections } from "./payments/bank-connections";
export { paymentOrders } from "./payments/payment-orders";
export { bankSyncLogs } from "./payments/sync-logs";
export { matchingSettings } from "./payments/matching-settings";
export { bankTransactions } from "./payments/bank-transactions";
export { documentTransactionMatches, outgoingInvoiceTransactionMatches } from "./payments/matches";

export { assignmentRules } from "./rules/assignment";
export { approvalRules } from "./rules/approval";
export { ingestExclusions } from "./rules/exclusions";
export { openItemWhitelistRules } from "./rules/opos-whitelist";

export { vatReserve } from "./taxes/vat-reserve";
export { handoverBatches, handoverRoutes } from "./taxes/handover";

export { costAnalysis } from "./reports/cost-analysis";

export { processingLog } from "./admin/processing-log";
export { team } from "./admin/team";
export { roles, rolePermissions, permissionCatalogue } from "./admin/roles";
export { changeHistory } from "./admin/change-history";
export {
  notificationChannels,
  notificationSettings,
  notificationEvents,
  notificationDispatchLog,
} from "./admin/notifications";

export { sampleOverviewAdapter, sampleFormatters } from "@/kit/widgets/overview/sample-adapter";
