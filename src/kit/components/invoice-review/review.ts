import { InvoiceReviewFields, Validation } from "./pipeline-types";

export type ValidationGateKey =
  | "brutto_vorhanden"
  | "steller_vorhanden"
  | "datum_vorhanden"
  | "rechnungsnr_vorhanden"
  | "summe_ok"
  | "ust_satz_ok"
  | "iban_ok"
  | "datum_plausibel";

export const VALIDATION_GATES: ValidationGateKey[] = [
  "brutto_vorhanden",
  "steller_vorhanden",
  "datum_vorhanden",
  "rechnungsnr_vorhanden",
  "summe_ok",
  "ust_satz_ok",
  "iban_ok",
  "datum_plausibel",
];

export type ReviewReasonId =
  | "brutto_fehlt"
  | "steller_fehlt"
  | "summe_stimmt_nicht"
  | "ust_satz_ungueltig"
  | "iban_ungueltig"
  | "datum_zukunft"
  | "rechnungsnr_fehlt"
  | "datum_fehlt"
  | "iban_fehlt"
  | "empfaenger_fehlt"
  | "iban_mehrere"
  | "konfidenz_unter_schwelle"
  | "nicht_relevant"
  | "gesellschaft_fehlt"
  | "manuell_markiert"
  | "keine_ueberweisung_belegt"
  | "lastschrift_erkannt"
  | "ocr_ohne_sichtpruefung"
  | "keine_rechnung_bestaetigt"
  | "konfidenz_unter_sicherheitsgrenze"
  | "zahlungsnachweis_veraltet"
  | "nicht_lesbar"
  | "ausgeschlossen";

export interface ReviewCheck {
  field?: string;
  status?: string;
  severity?: string;
  message?: string;
  values?: Record<string, unknown>;
}

export const SEVERITY_INFORMATIONAL = "informational";
export const SEVERITY_ACTION_REQUIRED = "action_required";

export function reviewChecks(
  invoice: Pick<InvoiceReviewFields, "extracted">,
): ReviewCheck[] | null {
  const raw = (invoice.extracted as { review_checks?: unknown } | null)?.review_checks;
  return Array.isArray(raw) && raw.length > 0 ? (raw as ReviewCheck[]) : null;
}

export interface ValidationDetailEntry {
  field?: string;
  status?: string;
  values?: Record<string, unknown>;
  message?: string;
  source?: string;
  edited_at?: string;
  edited_by?: string | null;
}

export type ValidationDetail = Record<string, ValidationDetailEntry>;

export const VALIDATION_FIELD_REASON: Record<string, ReviewReasonId> = {
  gross_present: "brutto_fehlt",
  issuer_present: "steller_fehlt",
  sum_matches: "summe_stimmt_nicht",
  vat_rate_valid: "ust_satz_ungueltig",
  iban_checksum_valid: "iban_ungueltig",
  date_not_future: "datum_zukunft",
  invoice_number_present: "rechnungsnr_fehlt",
  date_present: "datum_fehlt",
  payable_iban_present: "iban_fehlt",
  recipient_present: "empfaenger_fehlt",
  iban_unambiguous: "iban_mehrere",
  relevance_ok: "nicht_relevant",
  assignment_resolved: "gesellschaft_fehlt",
  brutto_vorhanden: "brutto_fehlt",
  steller_vorhanden: "steller_fehlt",
  summe_ok: "summe_stimmt_nicht",
  ust_satz_ok: "ust_satz_ungueltig",
  iban_ok: "iban_ungueltig",
  datum_plausibel: "datum_zukunft",
  rechnungsnr_vorhanden: "rechnungsnr_fehlt",
  datum_vorhanden: "datum_fehlt",
  iban_vorhanden: "iban_fehlt",
  empfaenger_vorhanden: "empfaenger_fehlt",
};

export const REVIEW_CHECK_REASON: Record<string, ReviewReasonId> = {
  extraction_confidence: "konfidenz_unter_schwelle",
  relevance: "nicht_relevant",
  document_readable: "nicht_lesbar",
  exclusion: "ausgeschlossen",
  brutto_vorhanden: "brutto_fehlt",
  steller_vorhanden: "steller_fehlt",
  summe_ok: "summe_stimmt_nicht",
  ust_satz_ok: "ust_satz_ungueltig",
  iban_ok: "iban_ungueltig",
  datum_plausibel: "datum_zukunft",
  rechnungsnr_vorhanden: "rechnungsnr_fehlt",
  datum_vorhanden: "datum_fehlt",
  empfaenger_name: "empfaenger_fehlt",
  assignment: "gesellschaft_fehlt",
  safety_invariant_1: "keine_ueberweisung_belegt",
  safety_invariant_2: "lastschrift_erkannt",
  safety_invariant_3: "ocr_ohne_sichtpruefung",
  safety_invariant_4a: "keine_rechnung_bestaetigt",
  safety_invariant_4b: "konfidenz_unter_sicherheitsgrenze",
  safety_invariant_5: "zahlungsnachweis_veraltet",
  forced_review: "manuell_markiert",
};

function reasonForReviewCheck(check: ReviewCheck): ReviewReasonId | null {
  if (check.field === "iban_anzahl") {
    return Number(check.values?.iban_count ?? 0) > 1 ? "iban_mehrere" : "iban_fehlt";
  }
  return REVIEW_CHECK_REASON[check.field ?? ""] ?? null;
}

function reviewCheckCounts(check: ReviewCheck): boolean {
  return (check.severity ?? "").trim().toLowerCase() !== SEVERITY_INFORMATIONAL;
}

const VALIDATION_MODIFIER = new Set(["kleinbetrag", "is_small_amount"]);

function detailFailed(entry: ValidationDetailEntry | undefined): boolean {
  const s = (entry?.status ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "ok" && s !== "not_applicable" && s !== "skipped";
}

function usableDetail(raw: unknown): ValidationDetail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const detail = raw as ValidationDetail;
  return Object.keys(detail).length > 0 ? detail : null;
}

export const SOURCE_HUMAN = "human";

export function isManuallyCorrected(entry: ValidationDetailEntry | undefined): boolean {
  return entry?.source === SOURCE_HUMAN;
}

const KEY_PIPELINE = "bookkeeping_edits";
const KEY_CORRECTION = "user_edits";

function half(raw: unknown, name: string): ValidationDetail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return usableDetail((raw as Record<string, unknown>)[name]);
}

function isSplit(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return KEY_PIPELINE in (raw as Record<string, unknown>);
}

function rawDetail(invoice: Pick<InvoiceReviewFields, "extracted" | "validation_detail">): unknown {
  if (invoice.validation_detail && Object.keys(invoice.validation_detail).length > 0) {
    return invoice.validation_detail;
  }
  return (invoice.extracted as { validation_detail?: unknown } | null)?.validation_detail;
}

export function validationBase(
  invoice: Pick<InvoiceReviewFields, "extracted" | "validation_detail">,
): ValidationDetail | null {
  const raw = rawDetail(invoice);
  return isSplit(raw) ? half(raw, KEY_PIPELINE) : usableDetail(raw);
}

export function validationCorrections(
  invoice: Pick<InvoiceReviewFields, "extracted" | "validation_detail">,
): ValidationDetail | null {
  return half(rawDetail(invoice), KEY_CORRECTION);
}

export function validationDetail(
  invoice: Pick<InvoiceReviewFields, "extracted" | "validation_detail">,
): ValidationDetail | null {
  const base = validationBase(invoice);
  const corrections = validationCorrections(invoice);
  if (!corrections) return base;
  return { ...(base ?? {}), ...corrections };
}

export function writeValidationDetail(
  base: ValidationDetail | null,
  corrections: ValidationDetail | null,
): Record<string, unknown> {
  return {
    [KEY_PIPELINE]: base ?? {},
    [KEY_CORRECTION]: corrections ?? {},
  };
}

export function validationFlat(
  invoice: Pick<InvoiceReviewFields, "extracted" | "validation">,
): Validation {
  const fromExtracted = (invoice.extracted as { validation?: unknown } | null)?.validation;
  if (fromExtracted && typeof fromExtracted === "object") return fromExtracted as Validation;
  return (invoice.validation ?? {}) as Validation;
}

export interface ReviewReason {
  id: ReviewReasonId | null;
  field: string;
  severity?: string;
  message?: string;
  values?: Record<string, unknown>;
}

export function reviewReasonsDetail(
  invoice: Pick<InvoiceReviewFields, "validation" | "extracted" | "validation_detail">,
): ReviewReason[] {
  const detail = validationDetail(invoice);
  if (detail) {
    const known = Object.keys(VALIDATION_FIELD_REASON);
    const fields = [...known, ...Object.keys(detail).filter((f) => !known.includes(f))];
    const out: ReviewReason[] = [];
    for (const field of fields) {
      if (VALIDATION_MODIFIER.has(field)) continue;
      const entry = detail[field];
      if (!detailFailed(entry)) continue;
      out.push({
        id: VALIDATION_FIELD_REASON[field] ?? null,
        field,
        message: entry?.message?.trim() || undefined,
        values: entry?.values,
      });
    }
    return out;
  }

  const checks = reviewChecks(invoice);
  if (checks) {
    return checks
      .filter((c) => reviewCheckCounts(c) && detailFailed(c))
      .map((c) => ({
        id: reasonForReviewCheck(c),
        field: c.field ?? "",
        severity: c.severity,
        message: c.message?.trim() || undefined,
        values: c.values,
      }));
  }

  const flat = validationFlat(invoice);
  const reasons: ReviewReason[] = [];
  const smallAmount = flat.kleinbetrag === true;
  const push = (field: string) => reasons.push({ id: VALIDATION_FIELD_REASON[field], field });

  if (flat.brutto_vorhanden === false) push("brutto_vorhanden");
  if (flat.steller_vorhanden === false) push("steller_vorhanden");
  if (flat.summe_ok === false) push("summe_ok");
  if (flat.ust_satz_ok === false) push("ust_satz_ok");
  if (flat.iban_ok === false) push("iban_ok");
  if (flat.datum_plausibel === false) push("datum_plausibel");
  if (!smallAmount && flat.rechnungsnr_vorhanden === false) push("rechnungsnr_vorhanden");
  if (!smallAmount && flat.datum_vorhanden === false) push("datum_vorhanden");

  return reasons;
}

export function reviewReasonNumbers(
  reason: ReviewReason,
): { expected: number; found: number } | null {
  if (reason.field !== "summe_ok") return null;
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const expected = num(reason.values?.expected);
  const found = num(reason.values?.found);
  if (expected == null || found == null) return null;
  return { expected, found };
}

export interface ReviewSummary {
  reasons: ReviewReason[];
  passed: { field: string; id: ReviewReasonId | null }[];
}

function detailPassed(status: string | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "ok";
}

export function buildReviewSummary(
  invoice: Pick<InvoiceReviewFields, "validation" | "extracted" | "validation_detail">,
): ReviewSummary {
  const reasons = reviewReasonsDetail(invoice);
  const detail = validationDetail(invoice);
  if (detail) {
    const known = Object.keys(VALIDATION_FIELD_REASON);
    const fields = [...known, ...Object.keys(detail).filter((f) => !known.includes(f))];
    const passed = fields
      .filter((f) => !VALIDATION_MODIFIER.has(f) && detailPassed(detail[f]?.status))
      .map((f) => ({ field: f, id: VALIDATION_FIELD_REASON[f] ?? null }));
    return { reasons, passed };
  }
  const checks = reviewChecks(invoice);
  if (checks) {
    const passed = checks
      .filter((c) => reviewCheckCounts(c) && detailPassed(c.status))
      .map((c) => ({ field: c.field ?? "", id: reasonForReviewCheck(c) }));
    return { reasons, passed };
  }
  const flat = validationFlat(invoice);
  const passed = VALIDATION_GATES.filter((gate) => flat[gate] === true).map((gate) => ({
    field: gate as string,
    id: VALIDATION_FIELD_REASON[gate] ?? null,
  }));
  return { reasons, passed };
}

export function reviewReasonConfidence(
  reason: ReviewReason,
): { found: number; required: number } | null {
  if (reason.field !== "extraction_confidence") return null;
  const share = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const found = share(reason.values?.found);
  const required = share(reason.values?.required);
  if (found == null || required == null) return null;
  return { found, required };
}

export function reviewReasonIbanCount(reason: ReviewReason): number | null {
  if (reason.field !== "iban_anzahl") return null;
  const n = Number(reason.values?.iban_count ?? 0);
  return Number.isFinite(n) && n > 1 ? n : null;
}

export function reviewReasonIds(
  invoice: Pick<InvoiceReviewFields, "validation" | "extracted" | "validation_detail">,
): ReviewReasonId[] {
  return reviewReasonsDetail(invoice)
    .map((r) => r.id)
    .filter((id): id is ReviewReasonId => id != null);
}

export function reviewScore(
  invoice: Pick<InvoiceReviewFields, "validation" | "status" | "extracted" | "validation_detail">,
): number {
  let score = reviewReasonIds(invoice).length * 10;
  if (invoice.status === "zu_pruefen") score += 5;
  const confidence = invoice.extracted?.konfidenz;
  if (confidence) {
    const values = Object.values(confidence).filter((n): n is number => typeof n === "number");
    if (values.length > 0) {
      const min = Math.min(...values);
      if (min < 0.8) score += 3;
      else if (min < 0.95) score += 1;
    }
  }
  return score;
}

export function withoutEmDash(text: string): string {
  return text
    .replace(/\s*[—–]\s*$/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

export interface ReviewLine {
  field: string;
  title?: string;
  text: string;
  numbers?: string;
  severity?: string;
  jumpTo?: { tab: string; anchor: string };
}

export interface ReviewLabels {
  gateLabel: (field: string) => string | undefined;
  gateHint: (field: string) => string;
  reasonText: (
    id: ReviewReasonId,
    params: { confidence?: { found: number; required: number }; ibanCount?: number },
  ) => string;
  sumComparison: (expected: string, found: string) => string;
  formatMoney: (value: number) => string;
}

export function reviewLines(
  reasons: ReviewReason[],
  labels: ReviewLabels,
  jumpTargets: Record<string, { tab: string; anchor: string }>,
): ReviewLine[] {
  return reasons.map((r) => {
    const confidence = reviewReasonConfidence(r);
    const ibanCount = reviewReasonIbanCount(r);
    const numbers = reviewReasonNumbers(r);
    const label = labels.gateLabel(r.field);
    return {
      field: r.field,
      title: label || undefined,
      text:
        r.field === "relevance_ok" && r.message
          ? withoutEmDash(r.message)
          : r.id
            ? labels.reasonText(r.id, {
                confidence: confidence ?? undefined,
                ibanCount: ibanCount ?? undefined,
              })
            : r.message
              ? withoutEmDash(r.message)
              : labels.gateHint(r.field),
      numbers: numbers
        ? labels.sumComparison(
            labels.formatMoney(numbers.expected),
            labels.formatMoney(numbers.found),
          )
        : undefined,
      severity: r.severity,
      jumpTo: jumpTargets[r.field],
    };
  });
}

export function reviewCheckLabelDe(
  field: string,
  labelDe: (field: string) => string | undefined,
): string {
  return labelDe(field) ?? field;
}

export function hasNoReviewChecks(
  invoice: Pick<InvoiceReviewFields, "validation" | "extracted" | "validation_detail">,
): boolean {
  const summary = buildReviewSummary(invoice);
  return summary.reasons.length === 0 && summary.passed.length === 0;
}
