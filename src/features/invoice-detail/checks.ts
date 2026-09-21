/**
 * Reading the pipeline's validation back out: which checks failed, which passed, and why.
 *
 * Portable. This file is meant to be byte-identical across the hub repos -- it knows the shape of
 * `invoices.validation_detail` and the older places that map has lived, and nothing about any one
 * repo's screens. The per-repo parts are the i18n wording (`documents.validierung.*`) and the jump
 * targets in ./config.
 *
 * It used to live in `@/lib/data/format`, which is a per-repo file, so every hub carried its own
 * drifting copy of the status allow-list and the check vocabulary.
 */
import type { ReviewLine } from "@/kit/ui";
import { formatEUR } from "@/lib/data/format";
import type { Document, Validation } from "@/lib/data/types";

// ---- Validation gates (deterministic, written by the pipeline `validate()`) ----
// Ordered for the detail panel. Each gate is tri-state (true/false/null); `kleinbetrag`
// is context, not a pass/fail gate, so it is handled separately in the UI.
export type ValidationGateKey =
  | "brutto_vorhanden"
  | "steller_vorhanden"
  | "datum_vorhanden"
  | "rechnungsnr_vorhanden"
  | "summe_ok"
  | "ust_satz_ok"
  | "iban_ok"
  | "datum_plausibel";

// Ordered gate keys for the detail panel. Label + hint text live under the i18n key
// `documents.validierung.gate.<key>.{label,hint}`.
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

// Stable review-reason IDs (translated via i18n key `documents.validierung.grund.<id>`).
export type CheckReasonId =
  | "brutto_fehlt"
  | "steller_fehlt"
  | "summe_stimmt_nicht"
  | "ust_satz_ungueltig"
  | "iban_ungueltig"
  | "datum_zukunft"
  | "rechnungsnr_fehlt"
  | "datum_fehlt"
  // The two transfer gates. Hard-red in the pipeline for a long time, but with nothing in the
  // detail to show for it, so a red receipt could open a review card that listed no reason at all.
  | "iban_fehlt"
  | "empfaenger_fehlt"
  | "iban_mehrere"
  | "konfidenz_unter_schwelle"
  | "not_relevant"
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

// ---- Validation sources, newest first ----
//
// The pipeline now writes a per-check map, `extracted.validation_detail`, where every gate states
// its own status, the values it compared and a sentence about the outcome. That is strictly richer
// than the flat booleans it replaces: a flat `iban_ok: null` cannot say whether the IBAN was
// missing, unreadable or simply absent from a document that has none, and it cannot name the field
// the reader has to go and fix.
//
// Two older shapes stay readable, because a receipt ingested last month has whichever one was
// current then: `extracted.validation` and the top-level `invoices.validation` column. Order of
// preference is newest to oldest, and every consumer goes through the helpers below rather than
// reaching into one of the three itself.

export interface ReviewCheck {
  field?: string;
  status?: string;
  severity?: string;
  message?: string;
  values?: Record<string, unknown>;
}

export const SEVERITY_INFORMATIONAL = "informational";
// SEVERITY_ACTION_REQUIRED used to live here too. It named the same string the kit's own
// REVIEW_SEVERITY_ACTION_REQUIRED (@/kit/ui) now does, and nothing in this file ever
// compared against its own copy -- only the review card did, and that import now goes
// straight to the kit.

export function reviewChecks(doc: Pick<Document, "extracted">): ReviewCheck[] | null {
  const raw = (doc.extracted as { review_checks?: unknown } | null)?.review_checks;
  return Array.isArray(raw) && raw.length > 0 ? (raw as ReviewCheck[]) : null;
}

/** One entry of the per-check map. Every field is optional: it is pipeline output. */
export interface ValidationDetailEntry {
  field?: string;
  status?: string;
  values?: Record<string, unknown>;
  message?: string;
  // Only on entries ./nachpruefung produced by re-running a check against corrected data. The
  // pipeline never sets these, so their presence is what distinguishes a re-check from an
  // extraction result. In memory only: nothing writes them back to the database.
  source?: string;
  edited_at?: string;
  edited_by?: string | null;
}

export type ValidationDetail = Record<string, ValidationDetailEntry>;

/** Which check field produces which reason id. Also the render order of the review list. */
export const VALIDATION_FIELD_REASON: Record<string, CheckReasonId> = {
  // The `validation_detail` column names its checks in English. They are the same eight gates the
  // German keys below describe, plus the transfer and assignment ones, and they come first because
  // this is the vocabulary the pipeline writes today. The German keys stay for the receipts that
  // were ingested while `extracted.validation` was the only home.
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
  relevance_ok: "not_relevant",
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

export const REVIEW_CHECK_REASON: Record<string, CheckReasonId> = {
  extraction_confidence: "konfidenz_unter_schwelle",
  relevance: "not_relevant",
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

function reasonForReviewCheck(check: ReviewCheck): CheckReasonId | null {
  if (check.field === "iban_anzahl") {
    return Number(check.values?.iban_count ?? 0) > 1 ? "iban_mehrere" : "iban_fehlt";
  }
  return REVIEW_CHECK_REASON[check.field ?? ""] ?? null;
}

function reviewCheckIsCountable(check: ReviewCheck): boolean {
  return (check.severity ?? "").trim().toLowerCase() !== SEVERITY_INFORMATIONAL;
}

// Not a check: it only relaxes the §14 completeness gates below (≤ 250 €). Reporting it as a
// review reason would tell the reader to go and fix the fact that the invoice is small.
// `is_small_amount` is the column's name for the same thing, and it is the one entry whose
// "failed" is not a problem: it reports that the invoice is NOT a small amount, so the full §14
// checks apply. Listing it would tell the reader to go and fix the invoice for being large.
export const VALIDATION_MODIFIER = new Set(["kleinbetrag", "is_small_amount"]);

/**
 * Whether one detail entry counts as a problem.
 *
 * Allow-list rather than deny-list: 'ok' passed, 'not_applicable'/'skipped' never ran, and
 * ANYTHING else is a problem. The pipeline is free to add 'failed', 'warn', 'error' or a status
 * nobody has thought of yet, and a new gate will surface rather than be silently swallowed, which
 * is the failure mode that matters here.
 */
function detailFailed(entry: ValidationDetailEntry | undefined): boolean {
  const s = (entry?.status ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "ok" && s !== "not_applicable" && s !== "skipped";
}

/** A per-check map that actually carries checks. An empty object is treated as absent. */
function usableDetail(raw: unknown): ValidationDetail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const detail = raw as ValidationDetail;
  return Object.keys(detail).length > 0 ? detail : null;
}

/** Provenance on an entry the Hub re-checked. Absent on everything the pipeline wrote. */
export const SOURCE_HUMAN = "human";

/** Whether this entry is a correction somebody made here, rather than the pipeline's own result. */
export function isManualCorrected(entry: ValidationDetailEntry | undefined): boolean {
  return entry?.source === SOURCE_HUMAN;
}

/**
 * `validation_detail` has two named halves.
 *
 *   { "bookkeeping_edits": { <check>: entry, ... },   what the extraction found
 *     "user_edits":        { <check>: entry, ... } }  what re-checking corrected data found
 *
 * The pipeline owns its half and writes only that. The Hub owns the other and writes only that.
 * Neither can destroy the other's record, which is the whole reason for the split: the extraction
 * result is evidence of what the document said, and a correction must not be able to erase it.
 *
 * Older rows are FLAT -- the checks sit at the top level, with no halves at all -- because that is
 * the shape the pipeline wrote before the split, and it is still the shape inside
 * `extracted.validation_detail` for anything ingested before the column existed. A flat map is
 * read as the pipeline half, so nothing has to be migrated for a receipt to keep rendering.
 */
const KEY_PIPELINE = "bookkeeping_edits";
const KEY_CORRECTION = "user_edits";

function half(raw: unknown, name: string): ValidationDetail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return usableDetail((raw as Record<string, unknown>)[name]);
}

/** Whether this map is the split shape rather than the older flat one. */
function isSplit(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return KEY_PIPELINE in (raw as Record<string, unknown>);
}

function rawDetail(doc: Pick<Document, "extracted" | "validation_detail">): unknown {
  // The column is where the pipeline writes it now (migration 0007); the copy inside the extracted
  // blob came first and is what every receipt ingested before that carries. Newest home first.
  if (doc.validation_detail && Object.keys(doc.validation_detail).length > 0) {
    return doc.validation_detail;
  }
  return (doc.extracted as { validation_detail?: unknown } | null)?.validation_detail;
}

/**
 * The checks as the PIPELINE reported them. Never includes a correction.
 *
 * This is what the re-check compares against, so that re-running it is idempotent and a correction
 * that no longer holds disappears instead of being compared against itself.
 */
export function validationBasis(
  doc: Pick<Document, "extracted" | "validation_detail">,
): ValidationDetail | null {
  const raw = rawDetail(doc);
  return isSplit(raw) ? half(raw, KEY_PIPELINE) : usableDetail(raw);
}

/** The corrections half: checks re-run against data a person has since fixed. */
export function validationCorrections(
  doc: Pick<Document, "extracted" | "validation_detail">,
): ValidationDetail | null {
  return half(rawDetail(doc), KEY_CORRECTION);
}

/**
 * The per-check map every reader should use: the pipeline's half with the corrections over it.
 *
 * Null on a receipt that has neither, which is one ingested before the pipeline reported per-check
 * results at all.
 */
export function validationDetail(
  doc: Pick<Document, "extracted" | "validation_detail">,
): ValidationDetail | null {
  const basis = validationBasis(doc);
  const corrections = validationCorrections(doc);
  if (!corrections) return basis;
  return { ...(basis ?? {}), ...corrections };
}

/** Build the column value back up from its two halves. The only writer of this shape. */
export function validationDetailWrite(
  basis: ValidationDetail | null,
  corrections: ValidationDetail | null,
): Record<string, unknown> {
  return {
    [KEY_PIPELINE]: basis ?? {},
    [KEY_CORRECTION]: corrections ?? {},
  };
}

/** The flat boolean gates: `extracted.validation` first, then the `invoices.validation` column. */
export function validationFlat(doc: Pick<Document, "extracted" | "validation">): Validation {
  const ausExtracted = (doc.extracted as { validation?: unknown } | null)?.validation;
  if (ausExtracted && typeof ausExtracted === "object") return ausExtracted as Validation;
  return (doc.validation ?? {}) as Validation;
}

/**
 * One failed check, with the field that failed it.
 *
 * `id` is null for a gate the pipeline reports that this app has no wording for yet. Those are
 * kept rather than dropped: a check added upstream should show up as "this field put the receipt
 * in review" using the pipeline's own sentence, not vanish until someone adds a translation.
 */
export interface CheckReason {
  id: CheckReasonId | null;
  field: string;
  severity?: string;
  message?: string;
  // What the check compared. A mismatch is far easier to act on with the two numbers next to it
  // than with the sentence alone, and only the pipeline knows them.
  values?: Record<string, unknown>;
}

/**
 * Reconstructs WHY a beleg is in review, per field.
 *
 * Prefers `validation_detail`; falls back to the flat booleans, which mirror the pipeline's
 * `validate()` gate logic exactly (ingest_week.py). Empty when nothing deterministic explains it
 * (e.g. manually set to zu_pruefen).
 */
export function checkReasonsDetail(
  doc: Pick<Document, "validation" | "extracted" | "validation_detail">,
): CheckReason[] {
  // The per-check map is read FIRST, ahead of the older `review_checks` array. It is the source
  // the pipeline maintains, it names the failing field, and the review card is built on exactly
  // this and nothing else. Where both exist they describe the same run, so preferring the array
  // only meant the card rendered the older account of it.
  const detail = validationDetail(doc);
  if (detail) {
    // No Kleinbetrag relaxation here, deliberately. The per-check map states each check's OWN
    // status, so a gate the pipeline means to waive is written 'not_applicable' or 'skipped' and
    // passes on that alone. Re-deriving a waiver from `is_small_amount` on top of that let one
    // check silently suppress another: an invoice of -270,44 EUR came through as "small amount,
    // lighter checks apply" (the threshold was compared against the negative number), and a
    // genuinely missing invoice number disappeared from the card because of it. What the map says
    // failed, the card shows. The flat-boolean fallback further down keeps its own relaxation --
    // there the gates cannot say "waived", so somebody has to apply the rule.
    const known = Object.keys(VALIDATION_FIELD_REASON);
    // Known gates in their canonical order first, then anything the pipeline has added since.
    const fields = [...known, ...Object.keys(detail).filter((f) => !known.includes(f))];
    const out: CheckReason[] = [];
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

  const checks = reviewChecks(doc);
  if (checks) {
    return checks
      .filter((c) => reviewCheckIsCountable(c) && detailFailed(c))
      .map((c) => ({
        id: reasonForReviewCheck(c),
        field: c.field ?? "",
        severity: c.severity,
        message: c.message?.trim() || undefined,
        values: c.values,
      }));
  }

  const v = validationFlat(doc);
  const reasons: CheckReason[] = [];
  const smallAmount = v.smallAmount === true;
  const push = (field: string) => reasons.push({ id: VALIDATION_FIELD_REASON[field], field });

  // 1) required fields
  if (v.brutto_vorhanden === false) push("brutto_vorhanden");
  if (v.steller_vorhanden === false) push("steller_vorhanden");
  // 2) sum consistency (only evaluated when all three amounts are present)
  if (v.summe_ok === false) push("summe_ok");
  // 3) deterministic validity gates (false = present but invalid)
  if (v.ust_satz_ok === false) push("ust_satz_ok");
  if (v.iban_ok === false) push("iban_ok");
  if (v.datum_plausibel === false) push("datum_plausibel");
  // 4) §14 completeness for full invoices, relaxed for Kleinbetrag (≤ 250 €)
  if (!smallAmount && v.rechnungsnr_vorhanden === false) push("rechnungsnr_vorhanden");
  if (!smallAmount && v.datum_vorhanden === false) push("datum_vorhanden");

  return reasons;
}

/**
 * The two figures behind a failed total, as a pair of formatted amounts.
 *
 * Only for `summe_ok`: it is the one gate whose message is much weaker than its numbers ("the
 * total does not add up" against "expected 173,78 EUR, the document says 100,00 EUR"). Null when
 * the pipeline sent no usable pair, which is every other check.
 */
export function checkReasonPay(reason: CheckReason): { expected: string; found: string } | null {
  if (reason.field !== "summe_ok") return null;
  const asNumber = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const expected = asNumber(reason.values?.expected);
  const found = asNumber(reason.values?.found);
  if (expected == null || found == null) return null;
  return { expected: formatEUR(expected), found: formatEUR(found) };
}

export interface CheckCard {
  reasons: CheckReason[];
  passed: { field: string; id: CheckReasonId | null }[];
}

/**
 * A check that ran and PASSED.
 *
 * Deliberately narrower than `!detailFehlgeschlagen`: 'not_applicable' and 'skipped' mean the
 * check never ran, and listing "IBAN gültig ✓" among the passed checks of a document that carries
 * no IBAN claims a verdict the pipeline never reached.
 */
function detailPassed(status: string | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "ok";
}

/**
 * Every check the pipeline reported, split into the ones that failed and the ones that passed.
 *
 * The card renders exactly this and nothing else -- it does not re-derive a verdict of its own
 * from the traffic light or the confidence score. `bestanden` is what fills the collapsed
 * "N other checks passed" line, and it comes from `validation_detail` as well as from the older
 * `review_checks` array; before this it came only from the array, so a receipt carrying the
 * per-check map showed its failures and silently dropped everything that had passed.
 */
export function checkCard(
  doc: Pick<Document, "validation" | "extracted" | "validation_detail">,
): CheckCard {
  const reasons = checkReasonsDetail(doc);
  const detail = validationDetail(doc);
  if (detail) {
    // Same order as the review list: the known gates in their canonical order, then whatever the
    // pipeline has added since, so the two halves of the card read consistently.
    const known = Object.keys(VALIDATION_FIELD_REASON);
    const fields = [...known, ...Object.keys(detail).filter((f) => !known.includes(f))];
    const passed = fields
      .filter((f) => !VALIDATION_MODIFIER.has(f) && detailPassed(detail[f]?.status))
      .map((f) => ({ field: f, id: VALIDATION_FIELD_REASON[f] ?? null }));
    return { reasons, passed };
  }
  const checks = reviewChecks(doc);
  if (checks) {
    const passed = checks
      .filter((c) => reviewCheckIsCountable(c) && detailPassed(c.status))
      .map((c) => ({ field: c.field ?? "", id: reasonForReviewCheck(c) }));
    return { reasons, passed };
  }
  // The flat booleans, and this tier is not optional. pruefGruendeDetail() reads all THREE
  // sources; this read only the first two and handed back an empty pass list for the third, which
  // is worse than it sounds: the card hides itself when nothing failed AND nothing passed, so a
  // receipt whose validation lives only in the flat gates -- everything ingested before the
  // pipeline emitted a per-check map -- disappeared from the card entirely the moment it was
  // clean. Nothing wrong with it read as no validation at all.
  //
  // `=== true` rather than `!== false`: an absent gate never ran, and a gate relaxed for a
  // Kleinbetrag is false-but-forgiven, not passed. Neither belongs in a list of checks that held.
  const flat = validationFlat(doc);
  const passed = VALIDATION_GATES.filter((gate) => flat[gate] === true).map((gate) => ({
    field: gate as string,
    id: VALIDATION_FIELD_REASON[gate] ?? null,
  }));
  return { reasons, passed };
}

export function checkReasonConfidence(
  reason: CheckReason,
): { found: number; needed: number } | null {
  if (reason.field !== "extraction_confidence") return null;
  const share = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const found = share(reason.values?.found);
  const needed = share(reason.values?.required);
  if (found == null || needed == null) return null;
  return { found, needed };
}

export function checkReasonIbanCount(reason: CheckReason): number | null {
  if (reason.field !== "iban_anzahl") return null;
  const n = Number(reason.values?.iban_count ?? 0);
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Reason ids only. Kept for the badge counts, which never needed the field. */
export function checkReasons(
  doc: Pick<Document, "validation" | "extracted" | "validation_detail">,
): CheckReasonId[] {
  return checkReasonsDetail(doc)
    .map((g) => g.id)
    .filter((id): id is CheckReasonId => id != null);
}

// Review-priority score: higher = needs attention sooner. Counts deterministic issues
// and adds weight for low field confidence, so the worst rows sort to the top. Here rather than
// in format.ts because it is a reading of the same checks, and leaving it behind would have made
// format.ts import this file while this file imports format.ts.
export function checkScore(
  doc: Pick<Document, "validation" | "status" | "extracted" | "validation_detail">,
): number {
  let score = checkReasons(doc).length * 10;
  if (doc.status === "needs_review") score += 5;
  const confidence = doc.extracted?.confidence;
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

/**
 * Pipeline text, with the dashes taken out.
 *
 * The ingest pipeline writes its reasons with em dashes ("outgoing invoice (own company is the
 * issuer) — not this pipeline's job"). Nothing this product shows a reader uses a dash as
 * punctuation, so the ones that arrive from outside are turned into the comma or full stop they
 * stand in for rather than being passed through. Not applied to our own strings: those are written
 * that way already.
 */
export function withoutDash(text: string): string {
  return text
    .replace(/\s*[—–]\s*$/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

/**
 * The failed checks as readable lines, derived once and used by everything that shows them.
 *
 * The review card used to translate the raw reasons itself, so the header chip and its tooltip,
 * showing the same reasons, would have printed the raw check keys. `sprungziele` comes from the
 * host repo's ./config, because only that repo knows which of its tabs holds which field.
 */
export function checkReasonsDisplay(
  reasons: CheckReason[],
  t: (key: string, opts?: Record<string, unknown>) => string,
  jumpTargets: Record<string, { tab: string; anchor: string }>,
): ReviewLine[] {
  return reasons.map((g) => {
    const confidence = checkReasonConfidence(g);
    const ibanCount = checkReasonIbanCount(g);
    const pay = checkReasonPay(g);
    const label = t(`documents.validierung.gate.${g.field}.label`, { defaultValue: "" });
    const jumpTarget = jumpTargets[g.field];
    return {
      field: g.field,
      title: label || undefined,
      /**
       * Our German wording for a known gate, except for relevance_ok, where the pipeline's own
       * sentence wins.
       *
       * relevance_ok is not one check, it is six: a document typed as something other than an
       * invoice, a non-EUR currency, an outgoing invoice, a negative gross on a document that is
       * not a credit note, a confidence below the relevance floor, or an unparseable AI response
       * (relevance_check in the ingest pipeline). One canned sentence cannot describe all six, and
       * ours -- "does not read as an invoice this pipeline handles" -- is only true of the first.
       * The pipeline writes which one it actually was into `message`, so that is what gets shown.
       */
      text:
        g.field === "relevance_ok" && g.message
          ? withoutDash(g.message)
          : g.id
            ? t(`documents.validierung.grund.${g.id}`, {
                ...(confidence ?? {}),
                ...(ibanCount != null ? { count: ibanCount } : {}),
              })
            : g.message
              ? withoutDash(g.message)
              : t(`documents.validierung.gate.${g.field}.hint`, { defaultValue: g.field }),
      figures: pay ? t("documents.validierung.summeVergleich", pay) : undefined,
      severity: g.severity,
      target: jumpTarget ? { tab: jumpTarget.tab, anchor: jumpTarget.anchor } : undefined,
    };
  });
}

/**
 * A check's German name, for the persisted history.
 *
 * `tDe`, not the reader's language: an audit entry is written once and read by whoever opens it
 * later, so it stays German like every other line in `invoice_history`. Falls back to the raw key
 * for a check this app has no wording for, which is honest and searchable.
 */
export function checkLabelDe(
  field: string,
  tDe: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return tDe(`documents.validierung.gate.${field}.label`, { defaultValue: field });
}

/**
 * Whether the pipeline reported NO checks for this receipt, passed or failed.
 *
 * Not the same as "everything passed": a receipt nobody ran checks against has a failed-check
 * count of zero for the same reason an unopened envelope has no complaints in it. The review chip
 * needs the difference, or it puts "no review needed" on a document that was never looked at.
 */
export function withoutChecks(
  doc: Pick<Document, "validation" | "extracted" | "validation_detail">,
): boolean {
  const card = checkCard(doc);
  return card.reasons.length === 0 && card.passed.length === 0;
}
