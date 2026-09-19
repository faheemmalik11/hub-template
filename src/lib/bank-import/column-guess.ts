import type { ColumnMapping, SingleTargetField } from "./types";

/** Lowercased, accent-folded keyword → target field. First match wins per header. */
const KEYWORDS: Array<{
  field: SingleTargetField | "amountDebit" | "amountCredit";
  keywords: string[];
}> = [
  { field: "booking_date", keywords: ["buchungstag", "buchungsdatum", "booking date", "datum"] },
  { field: "value_date", keywords: ["valuta", "wertstellung", "value date"] },
  { field: "amount", keywords: ["betrag", "amount", "umsatz"] },
  { field: "amountDebit", keywords: ["soll", "belastung", "debit", "ausgang"] },
  { field: "amountCredit", keywords: ["haben", "credit_note", "credit", "eingang"] },
  { field: "currency", keywords: ["währung", "waehrung", "currency"] },
  {
    field: "counterparty_holder",
    keywords: [
      "empfänger",
      "empfaenger",
      "auftraggeber",
      "zahlungspflichtiger",
      "name",
      "beguenstigter",
      "begünstigter",
    ],
  },
  { field: "counterparty_iban", keywords: ["iban"] },
  {
    field: "payment_reference",
    keywords: ["verwendungszweck", "referenz", "reference", "buchungstext", "purpose"],
  },
  {
    field: "booking_text",
    keywords: ["buchungsart", "text", "umsatzart", "vorgang", "description"],
  },
];

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss");
}

/**
 * Best-effort mapping guess from a file's header row. Always editable by the user afterwards —
 * this only pre-fills the mapping step, it never silently decides anything on its own.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const match = KEYWORDS.find(
      (k) => !claimed.has(k.field) && k.keywords.some((kw) => normalized.includes(kw)),
    );
    if (!match) continue;
    claimed.add(match.field);
    if (match.field === "amountDebit" || match.field === "amountCredit") {
      mapping[match.field] = header;
    } else {
      mapping[match.field] = header;
    }
  }

  // amount and amountDebit/amountCredit are mutually exclusive guesses — prefer the split pair
  // when both a single "amount"-like column and a debit/credit pair were found, since German
  // exports that have both usually mean the plain "Betrag" column is a running balance, not the
  // transaction amount.
  if (mapping.amountDebit || mapping.amountCredit) {
    delete mapping.amount;
  }

  return mapping;
}
