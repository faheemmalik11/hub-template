/**
 * THE REPO-SPECIFIC HALF OF THE INVOICE DETAIL PAGE.
 *
 * Everything in src/features/invoice-detail/ except this file is meant to be byte-identical
 * across the hubs (this Hub, Immonetz, ...). Porting the page to another repo is: copy the
 * folder, then rewrite THIS file for that repo's chain — see PORTING.md. If you find yourself
 * editing another file in this folder for one repo only, the thing you are changing probably
 * belongs in here as config instead.
 */
import type { ApprovalActionId } from "@/lib/data/format";
import type { WorkflowStatus } from "@/lib/data/types";

// Only the plain chain steps get a circle on the workflow bar. `skip_step` and
// `mark_already_approved` used to land on 'approved_final' as well and were kept out of
// the bar for that reason; they are gone now (see nextLegalActions), so a manager approves by
// clicking the step itself. 'complete' is here too: closing off a DATEV-handed invoice is a step
// a person takes, so it gets a circle like the approvals do.
export const CHAIN_ACTION_IDS: ApprovalActionId[] = [
  "send_for_review",
  "approve",
  "final_approve",
  "complete",
];

// 'bezahlt' and everything after it are stamped by DB triggers (migrations 0036/0038) when a
// payment or a DATEV handover is confirmed, never by a person picking the step. Those circles
// stay inert, and nothing draws an arrow at them. Named rather than "everything from 'bezahlt'
// onwards": 'closed' sits in that tail and is NOT trigger-driven.
export const AUTO_STEPS: WorkflowStatus[] = ["paid", "handed_over"];

// Manual correction targets (see runCorrection above): every status except 'not_relevant',
// which has its own dedicated flow (useSetNotRelevant/useClearNotRelevant) that also touches the
// mailbox return flags — setting the raw column here directly would desync those.
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
// Freigabe tab, not mixed into the general Verlauf tab — kept as one list so both places filter
// on exactly the same set.
export const APPROVAL_HISTORY_TYPES = [
  "approval_first",
  "approval_final",
  "query",
  "rejection",
  "already_approved",
  "skipped",
  "correction",
  // Unlinking a bank match walks the invoice back out of Bezahlt. It belongs in the workflow
  // timeline because the status really did move, but it is NOT "manually corrected": nobody
  // touched the status, a payment was removed and the status followed.
  "zuordnung_getrennt",
  // A confirmed bank match. The reconciliation is a step in the invoice's life even when it
  // does not move the status, so the chip belongs on the same timeline as the rest of it.
  "zuordnung_bestaetigt",
  "paid",
  "payment_failed",
  "handed_over",
  "closed",
];

/**
 * Reading the German back out of a history row written before the move/action was stored as data.
 *
 * `invoice_history.text` is German on purpose -- it is the audit record -- and every row written
 * before those data fields existed has nothing BUT that German sentence, which is why an English
 * UI still shows "Zur Prüfung geben" and "Manuell korrigiert: ... → ...". The German labels are
 * generated from a fixed table (approvalActionLabelDe / workflowLabelDe), so they can be generated
 * again here and matched against, recovering the id the row never stored. A backfill migration
 * would be the tidier fix; this needs no migration and leaves the stored audit text untouched.
 *
 * Anything that does not match is returned as-is: an unrecognised sentence is somebody's typed
 * comment or a row from a version this table does not describe, and printing it beats dropping it.
 */
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

// ---- Review card: where a failed check sends the reader --------------------------------------
//
// Per repo, because the destinations are: the ids below are the sections of THIS repo's detail
// page. A check with no entry here renders as plain text in the review card rather than as a
// button that goes nowhere.

export const MATCHING_ANCHOR = "zahlung-abgleich";
export const TRANSFER_ANCHOR = "zahlung-ueberweisung";
export const AMOUNTS_ANCHOR = "uebersicht-betraege";
export const INVOICEDATA_ANCHOR = "uebersicht-rechnungsdaten";
export const PARTICIPANTS_ANCHOR = "uebersicht-beteiligte";
export const SUPPLIER_ANCHOR = "lieferant-stammdaten";

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
  assignment_resolved: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
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
  assignment: { tab: "uebersicht", anchor: PARTICIPANTS_ANCHOR },
  iban_ok: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
  iban_anzahl: { tab: "lieferant", anchor: SUPPLIER_ANCHOR },
};

// The header's review chip scrolls here and flashes it.
export const REVIEW_ANCHOR = "review-box";

// How many notes the header card shows before "see all" sends the reader to the History tab.
export const HEADER_NOTE_COUNT = 3;

// The header's "see all notes" link scrolls here and flashes it.
export const NOTES_ANCHOR = "notizen-verlauf";

// The workflow history row for the currently open query -- always the newest row while one is
// open, since nothing can happen to the invoice after a query until it is answered.
export const QUERY_ANCHOR = "offene-rueckfrage";
