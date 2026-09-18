/**
 * Reading the pipeline's validation back out: which checks failed, which passed, and why.
 *
 * Portable. This file is meant to be byte-identical across the hub repos -- it knows the shape of
 * `invoices.validation_detail` and the older places that map has lived, and nothing about any one
 * repo's screens. The per-repo parts are the i18n wording (`belege.validierung.*`) and the jump
 * targets in ./config.
 *
 * It used to live in `@/lib/data/format`, which is a per-repo file, so every hub carried its own
 * drifting copy of the status allow-list and the check vocabulary.
 */
import type { ReviewLine } from "@hub-kit/core/ui";
import { formatEUR } from "@/lib/data/format";
import type { Beleg, Validierung } from "@/lib/data/types";

// ---- Validation gates (deterministic, written by the pipeline `validate()`) ----
// Ordered for the detail panel. Each gate is tri-state (true/false/null); `kleinbetrag`
// is context, not a pass/fail gate, so it is handled separately in the UI.
export type ValidierungGateKey =
  | "brutto_vorhanden"
  | "steller_vorhanden"
  | "datum_vorhanden"
  | "rechnungsnr_vorhanden"
  | "summe_ok"
  | "ust_satz_ok"
  | "iban_ok"
  | "datum_plausibel";

// Ordered gate keys for the detail panel. Label + hint text live under the i18n key
// `belege.validierung.gate.<key>.{label,hint}`.
export const VALIDIERUNG_GATES: ValidierungGateKey[] = [
  "brutto_vorhanden",
  "steller_vorhanden",
  "datum_vorhanden",
  "rechnungsnr_vorhanden",
  "summe_ok",
  "ust_satz_ok",
  "iban_ok",
  "datum_plausibel",
];

// Stable review-reason IDs (translated via i18n key `belege.validierung.grund.<id>`).
export type PruefGrundId =
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
// REVIEW_SEVERITY_ACTION_REQUIRED (@hub-kit/core/ui) now does, and nothing in this file ever
// compared against its own copy -- only the review card did, and that import now goes
// straight to the kit.

export function reviewChecks(beleg: Pick<Beleg, "extracted">): ReviewCheck[] | null {
  const roh = (beleg.extracted as { review_checks?: unknown } | null)?.review_checks;
  return Array.isArray(roh) && roh.length > 0 ? (roh as ReviewCheck[]) : null;
}

/** One entry of the per-check map. Every field is optional: it is pipeline output. */
export interface ValidierungDetailEintrag {
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

export type ValidierungDetail = Record<string, ValidierungDetailEintrag>;

/** Which check field produces which reason id. Also the render order of the review list. */
export const VALIDIERUNG_FELD_GRUND: Record<string, PruefGrundId> = {
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

export const REVIEW_CHECK_GRUND: Record<string, PruefGrundId> = {
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

function grundFuerReviewCheck(check: ReviewCheck): PruefGrundId | null {
  if (check.field === "iban_anzahl") {
    return Number(check.values?.iban_count ?? 0) > 1 ? "iban_mehrere" : "iban_fehlt";
  }
  return REVIEW_CHECK_GRUND[check.field ?? ""] ?? null;
}

function reviewCheckIstZaehlbar(check: ReviewCheck): boolean {
  return (check.severity ?? "").trim().toLowerCase() !== SEVERITY_INFORMATIONAL;
}

// Not a check: it only relaxes the §14 completeness gates below (≤ 250 €). Reporting it as a
// review reason would tell the reader to go and fix the fact that the invoice is small.
// `is_small_amount` is the column's name for the same thing, and it is the one entry whose
// "failed" is not a problem: it reports that the invoice is NOT a small amount, so the full §14
// checks apply. Listing it would tell the reader to go and fix the invoice for being large.
export const VALIDIERUNG_MODIFIER = new Set(["kleinbetrag", "is_small_amount"]);

/**
 * Whether one detail entry counts as a problem.
 *
 * Allow-list rather than deny-list: 'ok' passed, 'not_applicable'/'skipped' never ran, and
 * ANYTHING else is a problem. The pipeline is free to add 'failed', 'warn', 'error' or a status
 * nobody has thought of yet, and a new gate will surface rather than be silently swallowed, which
 * is the failure mode that matters here.
 */
function detailFehlgeschlagen(eintrag: ValidierungDetailEintrag | undefined): boolean {
  const s = (eintrag?.status ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "ok" && s !== "not_applicable" && s !== "skipped";
}

/** A per-check map that actually carries checks. An empty object is treated as absent. */
function brauchbaresDetail(roh: unknown): ValidierungDetail | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const detail = roh as ValidierungDetail;
  return Object.keys(detail).length > 0 ? detail : null;
}

/** Provenance on an entry the Hub re-checked. Absent on everything the pipeline wrote. */
export const QUELLE_MENSCH = "human";

/** Whether this entry is a correction somebody made here, rather than the pipeline's own result. */
export function istManuellKorrigiert(eintrag: ValidierungDetailEintrag | undefined): boolean {
  return eintrag?.source === QUELLE_MENSCH;
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
const SCHLUESSEL_PIPELINE = "bookkeeping_edits";
const SCHLUESSEL_KORREKTUR = "user_edits";

function halbe(roh: unknown, name: string): ValidierungDetail | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  return brauchbaresDetail((roh as Record<string, unknown>)[name]);
}

/** Whether this map is the split shape rather than the older flat one. */
function istGeteilt(roh: unknown): boolean {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return false;
  return SCHLUESSEL_PIPELINE in (roh as Record<string, unknown>);
}

function rohesDetail(beleg: Pick<Beleg, "extracted" | "validation_detail">): unknown {
  // The column is where the pipeline writes it now (migration 0007); the copy inside the extracted
  // blob came first and is what every receipt ingested before that carries. Newest home first.
  if (beleg.validation_detail && Object.keys(beleg.validation_detail).length > 0) {
    return beleg.validation_detail;
  }
  return (beleg.extracted as { validation_detail?: unknown } | null)?.validation_detail;
}

/**
 * The checks as the PIPELINE reported them. Never includes a correction.
 *
 * This is what the re-check compares against, so that re-running it is idempotent and a correction
 * that no longer holds disappears instead of being compared against itself.
 */
export function validierungBasis(
  beleg: Pick<Beleg, "extracted" | "validation_detail">,
): ValidierungDetail | null {
  const roh = rohesDetail(beleg);
  return istGeteilt(roh) ? halbe(roh, SCHLUESSEL_PIPELINE) : brauchbaresDetail(roh);
}

/** The corrections half: checks re-run against data a person has since fixed. */
export function validierungKorrekturen(
  beleg: Pick<Beleg, "extracted" | "validation_detail">,
): ValidierungDetail | null {
  return halbe(rohesDetail(beleg), SCHLUESSEL_KORREKTUR);
}

/**
 * The per-check map every reader should use: the pipeline's half with the corrections over it.
 *
 * Null on a receipt that has neither, which is one ingested before the pipeline reported per-check
 * results at all.
 */
export function validierungDetail(
  beleg: Pick<Beleg, "extracted" | "validation_detail">,
): ValidierungDetail | null {
  const basis = validierungBasis(beleg);
  const korrekturen = validierungKorrekturen(beleg);
  if (!korrekturen) return basis;
  return { ...(basis ?? {}), ...korrekturen };
}

/** Build the column value back up from its two halves. The only writer of this shape. */
export function validierungDetailSchreiben(
  basis: ValidierungDetail | null,
  korrekturen: ValidierungDetail | null,
): Record<string, unknown> {
  return {
    [SCHLUESSEL_PIPELINE]: basis ?? {},
    [SCHLUESSEL_KORREKTUR]: korrekturen ?? {},
  };
}

/** The flat boolean gates: `extracted.validation` first, then the `invoices.validation` column. */
export function validierungFlach(beleg: Pick<Beleg, "extracted" | "validation">): Validierung {
  const ausExtracted = (beleg.extracted as { validation?: unknown } | null)?.validation;
  if (ausExtracted && typeof ausExtracted === "object") return ausExtracted as Validierung;
  return (beleg.validation ?? {}) as Validierung;
}

/**
 * One failed check, with the field that failed it.
 *
 * `id` is null for a gate the pipeline reports that this app has no wording for yet. Those are
 * kept rather than dropped: a check added upstream should show up as "this field put the receipt
 * in review" using the pipeline's own sentence, not vanish until someone adds a translation.
 */
export interface PruefGrund {
  id: PruefGrundId | null;
  feld: string;
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
export function pruefGruendeDetail(
  beleg: Pick<Beleg, "validation" | "extracted" | "validation_detail">,
): PruefGrund[] {
  // The per-check map is read FIRST, ahead of the older `review_checks` array. It is the source
  // the pipeline maintains, it names the failing field, and the review card is built on exactly
  // this and nothing else. Where both exist they describe the same run, so preferring the array
  // only meant the card rendered the older account of it.
  const detail = validierungDetail(beleg);
  if (detail) {
    // No Kleinbetrag relaxation here, deliberately. The per-check map states each check's OWN
    // status, so a gate the pipeline means to waive is written 'not_applicable' or 'skipped' and
    // passes on that alone. Re-deriving a waiver from `is_small_amount` on top of that let one
    // check silently suppress another: an invoice of -270,44 EUR came through as "small amount,
    // lighter checks apply" (the threshold was compared against the negative number), and a
    // genuinely missing invoice number disappeared from the card because of it. What the map says
    // failed, the card shows. The flat-boolean fallback further down keeps its own relaxation --
    // there the gates cannot say "waived", so somebody has to apply the rule.
    const bekannt = Object.keys(VALIDIERUNG_FELD_GRUND);
    // Known gates in their canonical order first, then anything the pipeline has added since.
    const felder = [...bekannt, ...Object.keys(detail).filter((f) => !bekannt.includes(f))];
    const out: PruefGrund[] = [];
    for (const feld of felder) {
      if (VALIDIERUNG_MODIFIER.has(feld)) continue;
      const eintrag = detail[feld];
      if (!detailFehlgeschlagen(eintrag)) continue;
      out.push({
        id: VALIDIERUNG_FELD_GRUND[feld] ?? null,
        feld,
        message: eintrag?.message?.trim() || undefined,
        values: eintrag?.values,
      });
    }
    return out;
  }

  const checks = reviewChecks(beleg);
  if (checks) {
    return checks
      .filter((c) => reviewCheckIstZaehlbar(c) && detailFehlgeschlagen(c))
      .map((c) => ({
        id: grundFuerReviewCheck(c),
        feld: c.field ?? "",
        severity: c.severity,
        message: c.message?.trim() || undefined,
        values: c.values,
      }));
  }

  const v = validierungFlach(beleg);
  const gruende: PruefGrund[] = [];
  const kleinbetrag = v.kleinbetrag === true;
  const push = (feld: string) => gruende.push({ id: VALIDIERUNG_FELD_GRUND[feld], feld });

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
  if (!kleinbetrag && v.rechnungsnr_vorhanden === false) push("rechnungsnr_vorhanden");
  if (!kleinbetrag && v.datum_vorhanden === false) push("datum_vorhanden");

  return gruende;
}

/**
 * The two figures behind a failed total, as a pair of formatted amounts.
 *
 * Only for `summe_ok`: it is the one gate whose message is much weaker than its numbers ("the
 * total does not add up" against "expected 173,78 EUR, the document says 100,00 EUR"). Null when
 * the pipeline sent no usable pair, which is every other check.
 */
export function pruefGrundZahlen(grund: PruefGrund): { erwartet: string; gefunden: string } | null {
  if (grund.feld !== "summe_ok") return null;
  const zahl = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const erwartet = zahl(grund.values?.expected);
  const gefunden = zahl(grund.values?.found);
  if (erwartet == null || gefunden == null) return null;
  return { erwartet: formatEUR(erwartet), gefunden: formatEUR(gefunden) };
}

export interface PruefKarte {
  gruende: PruefGrund[];
  bestanden: { feld: string; id: PruefGrundId | null }[];
}

/**
 * A check that ran and PASSED.
 *
 * Deliberately narrower than `!detailFehlgeschlagen`: 'not_applicable' and 'skipped' mean the
 * check never ran, and listing "IBAN gültig ✓" among the passed checks of a document that carries
 * no IBAN claims a verdict the pipeline never reached.
 */
function detailBestanden(status: string | undefined): boolean {
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
export function pruefKarte(
  beleg: Pick<Beleg, "validation" | "extracted" | "validation_detail">,
): PruefKarte {
  const gruende = pruefGruendeDetail(beleg);
  const detail = validierungDetail(beleg);
  if (detail) {
    // Same order as the review list: the known gates in their canonical order, then whatever the
    // pipeline has added since, so the two halves of the card read consistently.
    const bekannt = Object.keys(VALIDIERUNG_FELD_GRUND);
    const felder = [...bekannt, ...Object.keys(detail).filter((f) => !bekannt.includes(f))];
    const bestanden = felder
      .filter((f) => !VALIDIERUNG_MODIFIER.has(f) && detailBestanden(detail[f]?.status))
      .map((f) => ({ feld: f, id: VALIDIERUNG_FELD_GRUND[f] ?? null }));
    return { gruende, bestanden };
  }
  const checks = reviewChecks(beleg);
  if (checks) {
    const bestanden = checks
      .filter((c) => reviewCheckIstZaehlbar(c) && detailBestanden(c.status))
      .map((c) => ({ feld: c.field ?? "", id: grundFuerReviewCheck(c) }));
    return { gruende, bestanden };
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
  const flach = validierungFlach(beleg);
  const bestanden = VALIDIERUNG_GATES.filter((gate) => flach[gate] === true).map((gate) => ({
    feld: gate as string,
    id: VALIDIERUNG_FELD_GRUND[gate] ?? null,
  }));
  return { gruende, bestanden };
}

export function pruefGrundKonfidenz(
  grund: PruefGrund,
): { gefunden: number; noetig: number } | null {
  if (grund.feld !== "extraction_confidence") return null;
  const anteil = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const gefunden = anteil(grund.values?.found);
  const noetig = anteil(grund.values?.required);
  if (gefunden == null || noetig == null) return null;
  return { gefunden, noetig };
}

export function pruefGrundIbanAnzahl(grund: PruefGrund): number | null {
  if (grund.feld !== "iban_anzahl") return null;
  const n = Number(grund.values?.iban_count ?? 0);
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Reason ids only. Kept for the badge counts, which never needed the field. */
export function pruefGruende(
  beleg: Pick<Beleg, "validation" | "extracted" | "validation_detail">,
): PruefGrundId[] {
  return pruefGruendeDetail(beleg)
    .map((g) => g.id)
    .filter((id): id is PruefGrundId => id != null);
}

// Review-priority score: higher = needs attention sooner. Counts deterministic issues
// and adds weight for low field confidence, so the worst rows sort to the top. Here rather than
// in format.ts because it is a reading of the same checks, and leaving it behind would have made
// format.ts import this file while this file imports format.ts.
export function pruefScore(
  beleg: Pick<Beleg, "validation" | "status" | "extracted" | "validation_detail">,
): number {
  let score = pruefGruende(beleg).length * 10;
  if (beleg.status === "zu_pruefen") score += 5;
  const konf = beleg.extracted?.konfidenz;
  if (konf) {
    const werte = Object.values(konf).filter((n): n is number => typeof n === "number");
    if (werte.length > 0) {
      const min = Math.min(...werte);
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
export function ohneGedankenstrich(text: string): string {
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
export function pruefGruendeAnzeige(
  gruende: PruefGrund[],
  t: (key: string, opts?: Record<string, unknown>) => string,
  sprungziele: Record<string, { tab: string; anker: string }>,
): ReviewLine[] {
  return gruende.map((g) => {
    const konfidenz = pruefGrundKonfidenz(g);
    const ibanAnzahl = pruefGrundIbanAnzahl(g);
    const zahlen = pruefGrundZahlen(g);
    const label = t(`belege.validierung.gate.${g.feld}.label`, { defaultValue: "" });
    const sprungziel = sprungziele[g.feld];
    return {
      field: g.feld,
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
        g.feld === "relevance_ok" && g.message
          ? ohneGedankenstrich(g.message)
          : g.id
            ? t(`belege.validierung.grund.${g.id}`, {
                ...(konfidenz ?? {}),
                ...(ibanAnzahl != null ? { count: ibanAnzahl } : {}),
              })
            : g.message
              ? ohneGedankenstrich(g.message)
              : t(`belege.validierung.gate.${g.feld}.hint`, { defaultValue: g.feld }),
      figures: zahlen ? t("belege.validierung.summeVergleich", zahlen) : undefined,
      severity: g.severity,
      target: sprungziel ? { tab: sprungziel.tab, anchor: sprungziel.anker } : undefined,
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
export function pruefungLabelDe(
  feld: string,
  tDe: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return tDe(`belege.validierung.gate.${feld}.label`, { defaultValue: feld });
}

/**
 * Whether the pipeline reported NO checks for this receipt, passed or failed.
 *
 * Not the same as "everything passed": a receipt nobody ran checks against has a failed-check
 * count of zero for the same reason an unopened envelope has no complaints in it. The review chip
 * needs the difference, or it puts "no review needed" on a document that was never looked at.
 */
export function ohnePruefungen(
  beleg: Pick<Beleg, "validation" | "extracted" | "validation_detail">,
): boolean {
  const karte = pruefKarte(beleg);
  return karte.gruende.length === 0 && karte.bestanden.length === 0;
}
