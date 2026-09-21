import { ReviewBadgeLabels } from "../../components/invoice-review/ReviewBadge";
import { ReviewCardLabels } from "./ReviewCard";
import { WorkflowLadderLabels } from "./WorkflowLadder";
import { WorkflowHistoryLabels } from "./WorkflowHistoryList";
import { OutgoingInvoiceLabels } from "../../components/invoice-review/OutgoingInvoiceFlag";
import { ReviewLabels, ReviewReasonId } from "../../components/invoice-review/review";
import { HistoryLabels } from "./history";

export interface InvoiceDetailPageLabels {
  backToList: string;
  notFoundTitle: string;
  notFoundBody: (id: string) => string;
  noInvoiceNumber: string;
  tabOverview: string;
  tabApproval: string;
  tabPayment: string;
  tabDetails: string;
  tabHistory: string;
  edit: string;
  save: string;
  cancel: string;
  saving: string;
  saved: string;
  saveFailed: (error: string) => string;
  fieldIssuer: string;
  fieldInvoiceNumber: string;
  fieldOrderNumber: string;
  fieldDocumentDate: string;
  fieldDueDate: string;
  fieldServiceDate: string;
  fieldAmountNet: string;
  fieldVatRate: string;
  fieldVatAmount: string;
  fieldAmountGross: string;
  fieldCurrency: string;
  fieldCompany: string;
  fieldProperty: string;
  fieldCategory: string;
  fieldRecipientName: string;
  fieldCustomerNumber: string;
  fieldPaymentReference: string;
  fieldPaymentMethod: string;
  fieldTaxNote: string;
  fieldServiceDescription: string;
  unsavedTitle: string;
  unsavedBody: (fields: string) => string;
  unsavedDiscard: string;
  unsavedKeepEditing: string;
  addNotePlaceholder: string;
  addNoteButton: string;
  noteAdded: string;
  deleteButton: string;
  deleteDialogTitle: string;
  deleteDialogDescription: string;
  deleteReasonPlaceholder: string;
  deleteConfirm: string;
  deletedToast: string;
  archiveButton: string;
  unarchiveButton: string;
  archivedBanner: (date: string) => string;
  markPaid: string;
  markUnpaid: string;
  paidToast: string;
  payableAccount: string;
  noPayableAccount: string;
  approvalComment: string;
  approvalCommentPlaceholder: string;
  runAction: string;
  noActionsAvailable: string;
  openSupplier: string;
}

export interface InvoiceDetailLabels {
  review: ReviewBadgeLabels & ReviewCardLabels & ReviewLabels;
  workflowLadder: WorkflowLadderLabels;
  workflowHistory: WorkflowHistoryLabels;
  outgoing: OutgoingInvoiceLabels;
  history: HistoryLabels;
  page: InvoiceDetailPageLabels;
}

const DURATION_UNIT_WORD: Record<"minutes" | "hours" | "days", string> = {
  minutes: "minute",
  hours: "hour",
  days: "day",
};

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const REASON_TEXT = new Map<
  ReviewReasonId,
  (params: { confidence?: { found: number; required: number }; ibanCount?: number }) => string
>([
  ["brutto_fehlt", () => "The gross amount is missing."],
  ["steller_fehlt", () => "The issuer is missing."],
  ["summe_stimmt_nicht", () => "Net + VAT does not add up to the total."],
  ["ust_satz_ungueltig", () => "The VAT rate is not one of the active rates."],
  ["iban_ungueltig", () => "The IBAN's checksum does not check out."],
  ["datum_zukunft", () => "The document date is in the future."],
  ["rechnungsnr_fehlt", () => "The invoice number is missing."],
  ["datum_fehlt", () => "The document date is missing."],
  ["iban_fehlt", () => "No IBAN was found to pay this to."],
  ["empfaenger_fehlt", () => "The recipient name is missing."],
  ["iban_mehrere", (p) => `${p.ibanCount ?? "Several"} IBANs were found; which one is unclear.`],
  [
    "konfidenz_unter_schwelle",
    (p) =>
      p.confidence
        ? `Extraction confidence ${p.confidence.found}% is below the ${p.confidence.required}% required.`
        : "Extraction confidence is below the required threshold.",
  ],
  ["nicht_relevant", () => "This does not read as an invoice this pipeline handles."],
  ["gesellschaft_fehlt", () => "No company could be resolved for this invoice."],
  ["manuell_markiert", () => "Marked for review by hand."],
  ["keine_ueberweisung_belegt", () => "No transfer proof was found for this payment."],
  ["lastschrift_erkannt", () => "This looks like a direct debit, not a transfer."],
  ["ocr_ohne_sichtpruefung", () => "OCR text with no visual check yet."],
  ["keine_rechnung_bestaetigt", () => "Not yet confirmed as an invoice."],
  ["konfidenz_unter_sicherheitsgrenze", () => "Confidence is below the safety floor."],
  ["zahlungsnachweis_veraltet", () => "The payment proof is out of date."],
  ["nicht_lesbar", () => "The document could not be read."],
  ["ausgeschlossen", () => "Excluded by an exclusion rule."],
]);

export const englishInvoiceDetailLabels: InvoiceDetailLabels = {
  review: {
    none: "Reviewed",
    duplicate: "Duplicate",
    excluded: "Excluded",
    alreadyPaid: "Already paid",
    needed: "Needs review",
    title: "Needs review",
    checks: (count) => pluralize(count, "check"),
    choose: "Choose",
    fix: "Fix",
    gateLabel: () => undefined,
    gateHint: (field) => field,
    reasonText: (id, params) => REASON_TEXT.get(id)!(params),
    sumComparison: (expected, found) => `Expected ${expected}, document says ${found}.`,
    formatMoney: (value) => value.toFixed(2),
  },
  workflowLadder: {
    navAriaLabel: "Workflow stage",
    stepLabel: (step) => step,
  },
  workflowHistory: {
    emptyText: "No history yet.",
    actorSystem: "System",
    actingAs: (name) => `acting as ${name}`,
    reason: "Reason",
    arrivedLabel: "Arrived",
    formatDateTime: (iso) => iso,
    durationShort: (value, unit) => pluralize(value, DURATION_UNIT_WORD[unit]),
  },
  outgoing: {
    banner: (issuer, recipient) => `Outgoing invoice: from ${issuer} to ${recipient}.`,
    bannerShort: "Outgoing",
    unknownIssuer: "unknown issuer",
    unknownRecipient: "unknown recipient",
  },
  history: {
    typeLabel: (type) => type,
    stateLabel: (targetStatus) => targetStatus,
    corrected: "Manually corrected",
    queryAdditional: "Sent back with a query",
  },
  page: {
    backToList: "Back to invoices",
    notFoundTitle: "Invoice not found",
    notFoundBody: (id) => `No invoice matches "${id}".`,
    noInvoiceNumber: "No invoice number",
    tabOverview: "Overview",
    tabApproval: "Approval",
    tabPayment: "Payment",
    tabDetails: "Details",
    tabHistory: "History",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: (error) => `Save failed: ${error}`,
    fieldIssuer: "Issuer",
    fieldInvoiceNumber: "Invoice number",
    fieldOrderNumber: "Order number",
    fieldDocumentDate: "Document date",
    fieldDueDate: "Due date",
    fieldServiceDate: "Service date",
    fieldAmountNet: "Net amount",
    fieldVatRate: "VAT rate",
    fieldVatAmount: "VAT amount",
    fieldAmountGross: "Gross amount",
    fieldCurrency: "Currency",
    fieldCompany: "Company",
    fieldProperty: "Property",
    fieldCategory: "Category",
    fieldRecipientName: "Recipient",
    fieldCustomerNumber: "Customer number",
    fieldPaymentReference: "Payment reference",
    fieldPaymentMethod: "Payment method",
    fieldTaxNote: "Tax note",
    fieldServiceDescription: "Service description",
    unsavedTitle: "Unsaved changes",
    unsavedBody: (fields) => `You have unsaved changes to: ${fields}. Discard them?`,
    unsavedDiscard: "Discard",
    unsavedKeepEditing: "Keep editing",
    addNotePlaceholder: "Add a note…",
    addNoteButton: "Add note",
    noteAdded: "Note added.",
    deleteButton: "Delete",
    deleteDialogTitle: "Delete this invoice?",
    deleteDialogDescription: "This moves the invoice to trash. It can be restored later.",
    deleteReasonPlaceholder: "Reason (optional)",
    deleteConfirm: "Delete",
    deletedToast: "Invoice deleted.",
    archiveButton: "Archive",
    unarchiveButton: "Restore from archive",
    archivedBanner: (date) => `Archived on ${date}.`,
    markPaid: "Mark as paid",
    markUnpaid: "Mark as unpaid",
    paidToast: "Payment status updated.",
    payableAccount: "Payable account",
    noPayableAccount: "No payable account on file.",
    approvalComment: "Comment",
    approvalCommentPlaceholder: "Add a comment (optional)…",
    runAction: "Confirm",
    noActionsAvailable: "No approval action is available right now.",
    openSupplier: "View supplier",
  },
};
