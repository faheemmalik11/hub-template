// The repo-specific half of the invoice detail page; everything else in this folder is byte-identical across Hubs (see PORTING.md).
import type { ApprovalActionId } from "@/lib/data/format";
import type { WorkflowStatus } from "@/lib/data/types";

export const CHAIN_ACTION_IDS: ApprovalActionId[] = [
  "send_for_review",
  "approve",
  "final_approve",
  "complete",
];

// 'paid' and 'handed_over' are stamped by DB triggers, never by a person picking the step, so those circles stay inert.
export const AUTO_STEPS: WorkflowStatus[] = ["paid", "handed_over"];

// Every status except 'not_relevant', which has its own dedicated flow that also touches the mailbox return flags.
export const CORRECTABLE_STATUSES: WorkflowStatus[] = [
  "received",
  "in_review",
  "query",
  "approved_first",
  "approved_final",
  "paid",
  "handed_over",
  "closed",
  "rejected",
];

// The approval-workflow invoice_history types (migration 0035) live in their own section on the
// Approval tab, not mixed into the general History tab — kept as one list so both places filter
// on exactly the same set.
export const APPROVAL_HISTORY_TYPES = [
  "approval_first",
  "approval_final",
  "query",
  "rejection",
  "already_approved",
  "skipped",
  "correction",
  // Both belong in the workflow timeline (status moved, or reconciliation happened) but are not "manually corrected".
  "zuordnung_getrennt",
  "zuordnung_bestaetigt",
  "paid",
  "payment_failed",
  "handed_over",
  "closed",
];

// Recovers the action id for history rows written before it was stored as data, by regenerating and matching the German label text.
export const LEGACY_ACTION_IDS: ApprovalActionId[] = [
  "send_for_review",
  "approve",
  "final_approve",
  "complete",
  "return_with_query",
  "reject",
];

/** Where each action lands. Only for legacy rows; live ones carry `nach` from the action itself. */
export const ACTION_TARGETSTATUS: Partial<Record<ApprovalActionId, string>> = {
  send_for_review: "in_review",
  approve: "approved_first",
  final_approve: "approved_final",
  return_with_query: "query",
  reject: "rejected",
  complete: "closed",
};

// The workflow bar's "done" palette. The default across the hubs is Immonetz's brand green,
// oklch(0.55 0.052 196), spelled out literally here because this Hub's own brand is a warm brown.
// Immonetz itself writes plain `brand` classes in its copy (its brand IS this green, and the
// token tracks any future rebrand); every other repo carries the literal value so the bar reads
// identically across the product family.
export const LADDER_THEME = {
  /** Fill + border of a reached circle (and the current one, which is also reached). */
  circle: "border-[oklch(0.55_0.052_196)] bg-[oklch(0.55_0.052_196)]",
  /** The extra outline around the circle the invoice is sitting on. */
  currentRing: "ring-2 ring-[oklch(0.55_0.052_196)]/30 ring-offset-2 ring-offset-card",
  /** A connector segment that has been walked. */
  line: "border-[oklch(0.55_0.052_196)]",
};

// A check with no entry here renders as plain text in the review card rather than as a button that goes nowhere.
export const MATCHING_ANCHOR = "payment-matching";
export const TRANSFER_ANCHOR = "payment-transfer";
export const AMOUNTS_ANCHOR = "overview-amounts";
export const INVOICEDATA_ANCHOR = "overview-invoice-data";
export const PARTICIPANTS_ANCHOR = "overview-participants";
export const SUPPLIER_ANCHOR = "supplier-master-data";
// The company/property/document-type confirmation card, not the Zuordnung section below it: that
// section hides its company field whenever this card is showing (InvoiceDetailPage's
// `needsConfirmation` branch), so a "company missing" check has to land here, where the field
// actually is.
export const CONFIRMATION_ANCHOR = "confirmation-card";

export const FIELD_JUMPTARGET: Record<string, { tab: string; anchor: string }> = {
  // The `validation_detail` column's check names. Same destinations as the German keys below.
  gross_present: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  sum_matches: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  vat_rate_valid: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  invoice_number_present: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  date_present: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  date_not_future: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  issuer_present: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
  recipient_present: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
  assignment_resolved: { tab: "uebersicht", anchor: CONFIRMATION_ANCHOR },
  iban_checksum_valid: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
  iban_unambiguous: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
  payable_iban_present: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
  brutto_vorhanden: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  summe_ok: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  ust_satz_ok: { tab: "uebersicht", anchor: AMOUNTS_ANCHOR },
  rechnungsnr_vorhanden: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  datum_vorhanden: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  datum_plausibel: { tab: "uebersicht", anchor: INVOICEDATA_ANCHOR },
  steller_vorhanden: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
  empfaenger_name: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
  assignment: { tab: "uebersicht", anchor: CONFIRMATION_ANCHOR },
  iban_ok: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
  iban_anzahl: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
};

// The header's review chip scrolls here and flashes it.
export const REVIEW_ANCHOR = "review-box";

// How many notes the header card shows before "see all" sends the reader to the History tab.
export const HEADER_NOTE_COUNT = 3;

// The header's "see all notes" link scrolls here and flashes it.
export const NOTES_ANCHOR = "notes-history";

// The workflow history row for the currently open query -- always the newest row while one is
// open, since nothing can happen to the invoice after a query until it is answered.
export const QUERY_ANCHOR = "open-query";
