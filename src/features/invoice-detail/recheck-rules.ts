/**
 * The single source of truth for the re-check rules.
 *
 * Two consumers, and ONLY these two, must stay in lockstep:
 *   1. nachpruefung.ts executes these rules in TypeScript for the badge and the detail card.
 *   2. scripts/generate-review-recheck-sql.ts renders the SAME rules into the SQL function the
 *      review view columns use, so a database filter and a rendered badge can never disagree.
 * Change a rule here and regenerate the SQL migration; never edit the SQL by hand.
 */

/** validate() tolerance for net + VAT against the subtotal, in euro. */
export const SUM_TOLERANCE = 0.02;

/** Punctuation or a run of whitespace splitting two IBANs inside one extracted value. */
export const IBAN_SEPARATOR_PATTERN = "[;,/|]|\\s{2,}";

/** Words this pack's documents put between two IBANs (`iban_joining_words` in Thresholds). */
export const IBAN_JOINING_WORDS = ["und"];

export type RecheckKind =
  | "gross_present"
  | "text_present"
  | "date_present"
  | "date_not_future"
  | "sum_matches"
  | "vat_rate_valid"
  | "iban_checksum"
  | "iban_present"
  | "iban_unambiguous"
  | "assignment_resolved";

export interface RecheckRule {
  field: string;
  kind: RecheckKind;
  column?: "issuer" | "invoice_number" | "recipient_name";
  gatedOnPipeline: boolean;
}

export const RECHECK_RULES: RecheckRule[] = [
  { field: "iban_checksum_valid", kind: "iban_checksum", gatedOnPipeline: false },
  { field: "payable_iban_present", kind: "iban_present", gatedOnPipeline: true },
  { field: "iban_unambiguous", kind: "iban_unambiguous", gatedOnPipeline: true },
  { field: "gross_present", kind: "gross_present", gatedOnPipeline: false },
  { field: "issuer_present", kind: "text_present", column: "issuer", gatedOnPipeline: false },
  { field: "date_present", kind: "date_present", gatedOnPipeline: false },
  {
    field: "invoice_number_present",
    kind: "text_present",
    column: "invoice_number",
    gatedOnPipeline: false,
  },
  { field: "sum_matches", kind: "sum_matches", gatedOnPipeline: false },
  { field: "vat_rate_valid", kind: "vat_rate_valid", gatedOnPipeline: false },
  { field: "date_not_future", kind: "date_not_future", gatedOnPipeline: false },
  {
    field: "recipient_present",
    kind: "text_present",
    column: "recipient_name",
    gatedOnPipeline: true,
  },
  { field: "assignment_resolved", kind: "assignment_resolved", gatedOnPipeline: false },
];
