// Builds the client's uniform filename pattern for a Beleg (invoice/receipt):
//   YYYYMMDD COM[_VAT] Issuer Description [Amount] [Property]
//   e.g. "20260315 STAY_UST Sanitär Müller Sanitärinstallation 4.850,00 P-01.pdf"
// The receipt type (document_type) is deliberately never included — per the briefing it's
// implied by the folder the file lives in, not by its name. See docs/FILENAME_CONVENTION.md
// for the full spec and what this does/doesn't cover.

import type { Document, FilenameSettings } from "@/lib/data/types";

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

// Filesystem/URL-unsafe characters, per Appendix A8's DATEV-import transliteration rule.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g;

// The server's own download-filename validation rejects anything over 255 characters outright
// rather than truncating, and a verbose AI-extracted service_description (the one field here with
// no natural length limit) can push the joined name past that on its own. Capped here, at the
// source, so every caller gets a name that is always valid rather than each re-implementing it.
// The Immonetz Hub already had this; this Hub had no length cap at all.
const MAX_FILENAME_LENGTH = 255;

function transliterate(input: string): string {
  return input.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
}

function sanitizeSegment(input: string): string {
  return input.replace(UNSAFE_CHARS, "").trim();
}

function formatDateSegment(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const digits = isoDate.slice(0, 10).replaceAll("-", "");
  return digits.length === 8 ? digits : null;
}

function formatAmountSegment(amount: number | null): string | null {
  if (amount == null) return null;
  return amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "VAT-relevant" for the _VAT suffix: a positive VAT rate that isn't explicitly tax-exempt.
function isVatRelevant(doc: Document): boolean {
  return (doc.vat_rate ?? 0) > 0 && doc.vat_treatment !== "exempt";
}

function descriptionFor(
  doc: Document,
  source: FilenameSettings["description_source"],
): string | null {
  if (source === "service_description") return doc.service_description;
  if (source === "cost_category") return doc.cost_category;
  return null;
}

// Returns null when there isn't enough data yet (e.g. still awaiting AI extraction) to build a
// meaningful name, so callers can fall back to the original/uploaded filename instead.
export function buildSuggestedFilename(
  doc: Document,
  settings: FilenameSettings,
  extension = "pdf",
): string | null {
  const parts: string[] = [];

  const date = formatDateSegment(doc.document_date);
  if (date) parts.push(date);

  if (doc.company_code) {
    const vatSuffix =
      settings.include_vat_suffix && isVatRelevant(doc) ? `_${settings.vat_suffix}` : "";
    parts.push(`${doc.company_code}${vatSuffix}`);
  }

  if (doc.issuer) parts.push(sanitizeSegment(doc.issuer));

  const description = descriptionFor(doc, settings.description_source);
  if (description) parts.push(sanitizeSegment(description));

  if (settings.include_amount) {
    const amount = formatAmountSegment(doc.amount_gross);
    if (amount) parts.push(amount);
  }

  if (settings.include_property && doc.property_code) {
    parts.push(sanitizeSegment(doc.property_code));
  }

  if (parts.length === 0) return null;

  let name = parts.join(settings.separator);
  if (settings.transliterate_accents) name = transliterate(name);
  name = sanitizeSegment(name);

  // Truncate the NAME, never the extension — a cut-off ".pdf" breaks the download entirely,
  // whereas a shortened description is still a usable, human-readable filename.
  const maxNameLength = MAX_FILENAME_LENGTH - extension.length - 1; // -1 for the "."
  if (name.length > maxNameLength) {
    name = sanitizeSegment(name.slice(0, maxNameLength));
  }

  return `${name}.${extension}`;
}
