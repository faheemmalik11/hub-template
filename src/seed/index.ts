/**
 * Sample data for every page, so a screen can be looked at without a client's database behind it.
 *
 * Never SQL, never written anywhere: these are values handed to the same adapters the real screens
 * use. Each is typed against the row type its page reads, so a column that changes shape breaks
 * the fixture rather than quietly rendering nothing. See README.md in this folder.
 */
export * from "./shared";

export { companies } from "./master-data/companies";
export { suppliers } from "./master-data/suppliers";
export { properties, propertyCompanies } from "./master-data/properties";
export { customers } from "./master-data/customers";
export { categories } from "./master-data/categories";

export { incomingInvoices } from "./invoices/incoming";
export { outgoingInvoices } from "./invoices/outgoing";
export { manualBookings } from "./invoices/manual-bookings";

export { bankAccounts } from "./payments/bank-accounts";
export { bankTransactions } from "./payments/bank-transactions";

export { assignmentRules } from "./rules/assignment";
export { approvalRules } from "./rules/approval";

export { vatReserve } from "./taxes/vat-reserve";
export { handoverBatches } from "./taxes/handover";

export { costAnalysis } from "./reports/cost-analysis";

export { processingLog } from "./admin/processing-log";
export { team } from "./admin/team";

export { sampleOverviewAdapter, sampleFormatters } from "@/kit/widgets/overview/sample-adapter";
