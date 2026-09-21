/**
 * Re-running the pipeline's checks after a person has corrected the data.
 *
 * Portable, and a deliberate port rather than a reinterpretation: every rule below is the same
 * rule `core/rules/packs/german_invoice/validation.py` and `pack.py` apply in the ingest pipeline
 * (book-keeping). A check that passes here has passed the pipeline's own test, not a
 * lookalike written from the field name.
 *
 * Nothing is stored. The result is computed on read, every time, from the invoice row as it stands
 * right now, and handed to the readers in place of the pipeline's map. Persisting it into a column
 * of its own was the obvious design and the wrong one: a stored verdict is a second source of
 * truth that goes stale the moment anything it depends on changes, which is the exact problem this
 * file exists to solve.
 *
 * The database is never written from here. `validation_detail` is what the extraction found, and
 * that is evidence: a correction must not be able to erase it.
 */
import type { Document } from "@/lib/data/types";

import {
  SOURCE_HUMAN,
  validationBasis,
  validationDetailWrite,
  type ValidationDetail,
  type ValidationDetailEntry,
} from "./checks";
import {
  IBAN_JOINING_WORDS,
  IBAN_SEPARATOR_PATTERN,
  RECHECK_RULES,
  SUM_TOLERANCE,
  type RecheckRule,
} from "./recheck-rules";

// ---- ISO 13616, ported from core/rules/iban_checksum.py ---------------------------------------

export const IBAN_CHARACTERS = /^[A-Z0-9]{15,34}$/;
const IBAN_SEPARATOR = `${IBAN_SEPARATOR_PATTERN}|\\b(?:${IBAN_JOINING_WORDS.join("|")})\\b`;

/** Split a raw extracted value into individual IBAN candidates. */
export function ibanCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(new RegExp(IBAN_SEPARATOR, "gi"))
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

/** ISO 13616 mod-97 for one candidate. BigInt because the expanded form runs past 2^53. */
export function ibanChecksumOk(candidate: string): boolean {
  const s = candidate.trim().toUpperCase().replace(/\s/g, "");
  if (!IBAN_CHARACTERS.test(s)) return false;
  if (!/^[A-Z]{2}[0-9]{2}/.test(s)) return false;
  const switched = s.slice(4) + s.slice(0, 4);
  let extended = "";
  for (const c of switched) {
    const value = parseInt(c, 36);
    if (Number.isNaN(value)) return false;
    extended += String(value);
  }
  return BigInt(extended) % 97n === 1n;
}

// ---- The checks -------------------------------------------------------------------------------

/** The pipeline's tri-state: true = ok, false = failed, null = the check does not apply. */
type Result = boolean | null;

function status(ok: Result): string {
  if (ok === null) return "not_applicable";
  return ok ? "ok" : "failed";
}

function number(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Whether a check applied at all when the pipeline ran it.
 *
 * Read back off the pipeline's own entry rather than re-derived. Three of these checks are gated
 * on `payable` (does this document require a transfer) and on Kleinbetrag, which the pipeline
 * decides from markers on the document -- payment terms, direct-debit wording, a "bereits bezahlt"
 * stamp. None of that is in a column here, so re-deriving it would be a guess. `not_applicable`
 * already IS the pipeline's answer to "did this apply", and it does not change when somebody
 * corrects a field.
 */
function applied(entry: ValidationDetailEntry | undefined): boolean {
  return (entry?.status ?? "").trim().toLowerCase() !== "not_applicable";
}

/**
 * The IBAN the checks run against, after a correction.
 *
 * The pipeline reads the IBANs it found ON THE DOCUMENT (`extracted.iban`). A reviewer who types
 * the account into the supplier record has answered the question the check was asking -- there is
 * now an account to pay to, and its checksum is verifiable -- so the supplier's IBAN wins when it
 * is set. This is the one place where a correction changes what the check looks at rather than
 * only re-running it, and it is what "if the IBAN gets added in the supplier tab it should also
 * get corrected" asks for.
 */
function ibanSource(doc: Pick<Document, "extracted">, supplierIban: string | null): string | null {
  const own = (supplierIban ?? "").trim();
  if (own) return own;
  const ausDocument = doc.extracted?.iban;
  return typeof ausDocument === "string" ? ausDocument : null;
}

/**
 * Every check this app can re-run, with the pipeline's own rule.
 *
 * Absent from the list, deliberately:
 *   relevance_ok         a judgement about the document, not a field. Nothing a reviewer types
 *                        into this screen answers "is this an invoice worth processing", so it
 *                        stays the pipeline's call until the document is ingested again.
 *   is_small_amount      a modifier, never shown as a finding and never corrected.
 */
function results(
  doc: Document,
  pipeline: ValidationDetail,
  supplierIban: string | null,
  today: string,
): Record<string, Result> {
  const net = number(doc.amount_net);
  const vat = number(doc.vat_amount);
  const gross = number(doc.amount_gross);
  // validate() compares against the subtotal BEFORE discounts where the document has one, falling
  // back to the gross. Same fallback here, so a receipt with a Skonto line is measured the way the
  // pipeline measured it rather than against a figure it never used.
  const subtotal = number(doc.extracted?.zwischensumme_brutto) ?? gross;

  const rate = number(doc.vat_rate);
  // The tenant's active rates, taken from the pipeline's own entry. They live in the pipeline's
  // config, not in any column here, so its record of what it compared against is the only honest
  // source. No list, no re-check.
  const activeRates = (pipeline.vat_rate_valid?.values?.active_rates as unknown[] | undefined)
    ?.map(number)
    .filter((n): n is number => n != null);

  const candidates = ibanCandidates(ibanSource(doc, supplierIban));
  const count = candidates.length;

  const score = (rule: RecheckRule): Result => {
    if (rule.gatedOnPipeline && !applied(pipeline[rule.field])) return null;
    switch (rule.kind) {
      case "gross_present":
        return gross != null;
      case "text_present":
        return !!((doc[rule.column as keyof Document] as string | null | undefined) ?? "").trim();
      case "date_present":
        return !!(doc.document_date ?? "").trim();
      case "date_not_future":
        return doc.document_date ? doc.document_date.slice(0, 10) <= today : null;
      case "sum_matches":
        return subtotal != null && net != null && vat != null
          ? Math.abs(net + vat - subtotal) <= SUM_TOLERANCE
          : null;
      case "vat_rate_valid":
        return rate == null || !activeRates?.length ? null : activeRates.includes(Math.round(rate));
      case "iban_checksum":
        return count === 0 ? null : candidates.every(ibanChecksumOk);
      case "iban_present":
        return count > 0;
      case "iban_unambiguous":
        return count > 0 ? count <= 1 : null;
      case "assignment_resolved":
        // catchall in pack.py: no company resolved from the recipient or the property.
        return !!(doc.company_code ?? "").trim();
    }
  };

  return Object.fromEntries(RECHECK_RULES.map((rule) => [rule.field, score(rule)]));
}

/**
 * The invoice as the checks see it NOW: the pipeline's per-check map with every re-runnable check
 * replaced by its result against the invoice's current data.
 *
 * This is what every reader should be handed, never the raw row. The pipeline's verdict is a
 * snapshot of what the document said at ingest; by the time somebody is looking at the screen a
 * company may have been assigned, an invoice number typed in, an amount corrected. A card still
 * reporting "no company could be resolved" beside a visibly assigned company is not reporting a
 * problem, it is reporting its own staleness.
 *
 * Returns a NEW object with `validation_detail` replaced. Nothing is written anywhere: the row in
 * the database keeps the pipeline's own map, which is the record of what the extraction found.
 * Idempotent, so calling it twice is harmless.
 *
 * Pure and dependency-free on purpose: the same call works in a component, in a loop over a list
 * page, and in a server function.
 *
 * `lieferantIban` is the supplier's account, which the three transfer checks need. Pass null when
 * the supplier has none; the checks then read the IBANs the pipeline found on the document.
 */
export function documentRechecked<T extends Document>(
  doc: T,
  opts: { supplierIban?: string | null; actor?: string | null; now?: string } = {},
): T {
  // Compared against the PIPELINE half, never against the merged view. Comparing against the
  // merged view would compare a correction with itself: it would always agree, so a correction
  // whose data has since been undone could never be dropped again.
  const basis = validationBasis(doc);
  // Nothing to compare against: a receipt ingested before the pipeline reported per-check results
  // at all. Re-running checks here would invent a verdict the pipeline never gave.
  if (!basis) return doc;

  const now = opts.now ?? new Date().toISOString();
  const after = results(doc, basis, opts.supplierIban ?? null, now.slice(0, 10));

  const corrections: ValidationDetail = {};
  for (const [field, ok] of Object.entries(after)) {
    const original = basis[field];
    // A check the pipeline never reported is not ours to add.
    if (!original) continue;
    const newerStatus = status(ok);
    if (newerStatus === (original.status ?? "").trim().toLowerCase()) continue;
    corrections[field] = {
      ...original,
      status: newerStatus,
      message: "Re-checked against the current data.",
      source: SOURCE_HUMAN,
      edited_at: now,
      edited_by: opts.actor ?? null,
    };
  }
  return {
    ...doc,
    validation_detail: validationDetailWrite(basis, corrections) as Document["validation_detail"],
  };
}
