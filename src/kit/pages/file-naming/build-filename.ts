// Builds the uniform filename pattern for an invoice:
//   YYYYMMDD COM[_VAT] Issuer Description [Amount] [Property]
// The document type is deliberately never included — it is implied by the destination folder.

import type { FileNamingSettingsInput, FilenamePreviewInvoice } from "../../adapters/file-naming";

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

// Filesystem/URL-unsafe characters, stripped from every segment and the joined name.
export const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/;

const UNSAFE_FILENAME_CHARS_GLOBAL = new RegExp(UNSAFE_FILENAME_CHARS.source, "g");

// Download-filename validation rejects anything over 255 characters, so the cap lives here.
const MAX_FILENAME_LENGTH = 255;

function transliterateUmlauts(input: string): string {
  return input.replace(/[äöüÄÖÜß]/g, (character) => UMLAUT_MAP[character] ?? character);
}

function sanitizeSegment(input: string): string {
  return input.replace(UNSAFE_FILENAME_CHARS_GLOBAL, "").trim();
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

// "VAT-relevant" for the VAT suffix: a positive VAT rate that is not explicitly tax-exempt.
function isVatRelevant(invoice: FilenamePreviewInvoice): boolean {
  return (invoice.vatRate ?? 0) > 0 && !invoice.vatExempt;
}

function descriptionFor(
  invoice: FilenamePreviewInvoice,
  source: FileNamingSettingsInput["descriptionSource"],
): string | null {
  if (source === "service_description") return invoice.serviceDescription;
  if (source === "cost_category") return invoice.costCategory;
  return null;
}

// Returns null when there is not enough data to build a meaningful name, so callers can
// fall back to the original filename instead.
export function buildSuggestedFilename(
  invoice: FilenamePreviewInvoice,
  settings: FileNamingSettingsInput,
  extension = "pdf",
): string | null {
  const parts: string[] = [];

  const date = formatDateSegment(invoice.documentDate);
  if (date) parts.push(date);

  if (invoice.companyCode) {
    const vatSuffix =
      settings.includeVatSuffix && isVatRelevant(invoice) ? `_${settings.vatSuffix}` : "";
    parts.push(`${invoice.companyCode}${vatSuffix}`);
  }

  if (invoice.issuer) parts.push(sanitizeSegment(invoice.issuer));

  const description = descriptionFor(invoice, settings.descriptionSource);
  if (description) parts.push(sanitizeSegment(description));

  if (settings.includeAmount) {
    const amount = formatAmountSegment(invoice.amountGross);
    if (amount) parts.push(amount);
  }

  if (settings.includeProperty && invoice.propertyCode) {
    parts.push(sanitizeSegment(invoice.propertyCode));
  }

  if (parts.length === 0) return null;

  let name = parts.join(settings.separator);
  if (settings.transliterateUmlauts) name = transliterateUmlauts(name);
  name = sanitizeSegment(name);

  // Truncate the name, never the extension — a cut-off ".pdf" breaks the download entirely.
  const maxNameLength = MAX_FILENAME_LENGTH - extension.length - 1;
  if (name.length > maxNameLength) {
    name = sanitizeSegment(name.slice(0, maxNameLength));
  }

  return `${name}.${extension}`;
}
