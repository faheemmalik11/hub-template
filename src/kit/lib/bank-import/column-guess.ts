import type { ColumnMapping, SingleTargetField } from "./types";

const KEYWORDS: Array<{
  field: SingleTargetField | "amountDebit" | "amountCredit";
  keywords: string[];
}> = [
  { field: "booking_date", keywords: ["buchungstag", "buchungsdatum", "booking date", "datum"] },
  { field: "value_date", keywords: ["valuta", "wertstellung", "value date"] },
  { field: "amount", keywords: ["betrag", "amount", "umsatz"] },
  { field: "amountDebit", keywords: ["soll", "belastung", "debit", "ausgang"] },
  { field: "amountCredit", keywords: ["haben", "gutschrift", "credit", "eingang"] },
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
    mapping[match.field] = header;
  }

  if (mapping.amountDebit || mapping.amountCredit) {
    delete mapping.amount;
  }

  return mapping;
}
