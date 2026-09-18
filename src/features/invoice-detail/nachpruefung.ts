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
import type { Beleg } from "@/lib/data/types";

import {
  QUELLE_MENSCH,
  validierungBasis,
  validierungDetailSchreiben,
  type ValidierungDetail,
  type ValidierungDetailEintrag,
} from "./pruefung";
import {
  IBAN_JOINING_WORDS,
  IBAN_SEPARATOR_PATTERN,
  RECHECK_RULES,
  SUM_TOLERANCE,
  type RecheckRule,
} from "./recheck-rules";

// ---- ISO 13616, ported from core/rules/iban_checksum.py ---------------------------------------

export const IBAN_ZEICHEN = /^[A-Z0-9]{15,34}$/;
const IBAN_TRENNER = `${IBAN_SEPARATOR_PATTERN}|\\b(?:${IBAN_JOINING_WORDS.join("|")})\\b`;

/** Split a raw extracted value into individual IBAN candidates. */
export function ibanKandidaten(roh: string | null | undefined): string[] {
  if (!roh) return [];
  return String(roh)
    .split(new RegExp(IBAN_TRENNER, "gi"))
    .map((teil) => (teil ?? "").trim())
    .filter(Boolean);
}

/** ISO 13616 mod-97 for one candidate. BigInt because the expanded form runs past 2^53. */
export function ibanPruefsummeOk(kandidat: string): boolean {
  const s = kandidat.trim().toUpperCase().replace(/\s/g, "");
  if (!IBAN_ZEICHEN.test(s)) return false;
  if (!/^[A-Z]{2}[0-9]{2}/.test(s)) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  let erweitert = "";
  for (const c of umgestellt) {
    const wert = parseInt(c, 36);
    if (Number.isNaN(wert)) return false;
    erweitert += String(wert);
  }
  return BigInt(erweitert) % 97n === 1n;
}

// ---- The checks -------------------------------------------------------------------------------

/** The pipeline's tri-state: true = ok, false = failed, null = the check does not apply. */
type Ergebnis = boolean | null;

function status(ok: Ergebnis): string {
  if (ok === null) return "not_applicable";
  return ok ? "ok" : "failed";
}

function zahl(v: unknown): number | null {
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
function galt(eintrag: ValidierungDetailEintrag | undefined): boolean {
  return (eintrag?.status ?? "").trim().toLowerCase() !== "not_applicable";
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
function ibanQuelle(beleg: Pick<Beleg, "extracted">, lieferantIban: string | null): string | null {
  const eigene = (lieferantIban ?? "").trim();
  if (eigene) return eigene;
  const ausDokument = beleg.extracted?.iban;
  return typeof ausDokument === "string" ? ausDokument : null;
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
function ergebnisse(
  beleg: Beleg,
  pipeline: ValidierungDetail,
  lieferantIban: string | null,
  heute: string,
): Record<string, Ergebnis> {
  const netto = zahl(beleg.amount_net);
  const ust = zahl(beleg.vat_amount);
  const brutto = zahl(beleg.amount_gross);
  // validate() compares against the subtotal BEFORE discounts where the document has one, falling
  // back to the gross. Same fallback here, so a receipt with a Skonto line is measured the way the
  // pipeline measured it rather than against a figure it never used.
  const zwischensumme = zahl(beleg.extracted?.zwischensumme_brutto) ?? brutto;

  const satz = zahl(beleg.vat_rate);
  // The tenant's active rates, taken from the pipeline's own entry. They live in the pipeline's
  // config, not in any column here, so its record of what it compared against is the only honest
  // source. No list, no re-check.
  const aktiveSaetze = (pipeline.vat_rate_valid?.values?.active_rates as unknown[] | undefined)
    ?.map(zahl)
    .filter((n): n is number => n != null);

  const kandidaten = ibanKandidaten(ibanQuelle(beleg, lieferantIban));
  const anzahl = kandidaten.length;

  const bewerte = (regel: RecheckRule): Ergebnis => {
    if (regel.gatedOnPipeline && !galt(pipeline[regel.field])) return null;
    switch (regel.kind) {
      case "gross_present":
        return brutto != null;
      case "text_present":
        return !!((beleg[regel.column as keyof Beleg] as string | null | undefined) ?? "").trim();
      case "date_present":
        return !!(beleg.document_date ?? "").trim();
      case "date_not_future":
        return beleg.document_date ? beleg.document_date.slice(0, 10) <= heute : null;
      case "sum_matches":
        return zwischensumme != null && netto != null && ust != null
          ? Math.abs(netto + ust - zwischensumme) <= SUM_TOLERANCE
          : null;
      case "vat_rate_valid":
        return satz == null || !aktiveSaetze?.length
          ? null
          : aktiveSaetze.includes(Math.round(satz));
      case "iban_checksum":
        return anzahl === 0 ? null : kandidaten.every(ibanPruefsummeOk);
      case "iban_present":
        return anzahl > 0;
      case "iban_unambiguous":
        return anzahl > 0 ? anzahl <= 1 : null;
      case "assignment_resolved":
        // catchall in pack.py: no company resolved from the recipient or the property.
        return !!(beleg.company_code ?? "").trim();
    }
  };

  return Object.fromEntries(RECHECK_RULES.map((regel) => [regel.field, bewerte(regel)]));
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
export function belegNachgeprueft<T extends Beleg>(
  beleg: T,
  opts: { lieferantIban?: string | null; actor?: string | null; jetzt?: string } = {},
): T {
  // Compared against the PIPELINE half, never against the merged view. Comparing against the
  // merged view would compare a correction with itself: it would always agree, so a correction
  // whose data has since been undone could never be dropped again.
  const basis = validierungBasis(beleg);
  // Nothing to compare against: a receipt ingested before the pipeline reported per-check results
  // at all. Re-running checks here would invent a verdict the pipeline never gave.
  if (!basis) return beleg;

  const jetzt = opts.jetzt ?? new Date().toISOString();
  const neu = ergebnisse(beleg, basis, opts.lieferantIban ?? null, jetzt.slice(0, 10));

  const korrekturen: ValidierungDetail = {};
  for (const [feld, ok] of Object.entries(neu)) {
    const original = basis[feld];
    // A check the pipeline never reported is not ours to add.
    if (!original) continue;
    const neuerStatus = status(ok);
    if (neuerStatus === (original.status ?? "").trim().toLowerCase()) continue;
    korrekturen[feld] = {
      ...original,
      status: neuerStatus,
      message: "Re-checked against the current data.",
      source: QUELLE_MENSCH,
      edited_at: jetzt,
      edited_by: opts.actor ?? null,
    };
  }
  return {
    ...beleg,
    validation_detail: validierungDetailSchreiben(basis, korrekturen) as Beleg["validation_detail"],
  };
}
