export type TransactionType =
  "ueberweisung" | "lastschrift" | "kreditkarte" | "kartenzahlung" | "gutschrift" | "unbekannt";

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasPart(haystack: string, parts: readonly string[]): boolean {
  return parts.some((p) => haystack.includes(p));
}

function hasWord(haystack: string, words: readonly string[]): boolean {
  return words.some((w) => haystack === w || new RegExp(`(^| )${w}( |$)`).test(haystack));
}

const CARD_ACCOUNT_PARTS = ["kreditkarte", "kreditkarten"] as const;
const CARD_ACCOUNT_WORDS = [
  "visa",
  "mastercard",
  "eurocard",
  "amex",
  "american express",
  "maestro",
  "creditcard",
  "credit card",
] as const;

const CARD_SETTLEMENT_PARTS = [
  "kreditkarte",
  "kreditkarten",
  "kartenabrechnung",
  "kartenumsaetze",
  "wochenabrechnung",
  "monatsabrechnung",
] as const;
const CARD_SETTLEMENT_WORDS = [
  "visa",
  "mastercard",
  "eurocard",
  "amex",
  "american express",
] as const;

const CARD_PAYMENT_PARTS = [
  "kartenzahlung",
  "kartenverfuegung",
  "girocard",
  "debitkarte",
  "bargeldauszahlung",
  "geldautomat",
] as const;
const CARD_PAYMENT_WORDS = ["elv", "ec cash", "pos", "ga auszahlung"] as const;

const CARD_REF_PREFIXES = ["ec", "ga"] as const;

const DEBIT_PARTS = [
  "lastschrift",
  "einzugsermaechtigung",
  "abbuchung",
  "basisls",
  "firmenls",
] as const;

const TRANSFER_PARTS = [
  "ueberweisung",
  "ueberw",
  "uebertrag",
  "dauerauftrag",
  "umbuchung",
  "echtzeitzahlung",
] as const;
const TRANSFER_WORDS = ["sepa ct", "lohn", "gehalt", "sammler"] as const;

const CREDIT_PARTS = [
  "gutschrift",
  "zinsen",
  "erstattung",
  "rueckzahlung",
  "einzahlung",
  "storno",
] as const;

function isCardAccount(productType: string | null | undefined): boolean {
  const p = normalize(productType);
  return !!p && (hasPart(p, CARD_ACCOUNT_PARTS) || hasWord(p, CARD_ACCOUNT_WORDS));
}

function classifyText(text: string): TransactionType | null {
  if (!text) return null;
  if (hasPart(text, CARD_SETTLEMENT_PARTS) || hasWord(text, CARD_SETTLEMENT_WORDS)) {
    return "kreditkarte";
  }
  if (
    hasPart(text, CARD_PAYMENT_PARTS) ||
    hasWord(text, CARD_PAYMENT_WORDS) ||
    (CARD_REF_PREFIXES as readonly string[]).includes(text.split(" ")[0])
  ) {
    return "kartenzahlung";
  }
  if (hasPart(text, DEBIT_PARTS)) return "lastschrift";
  if (hasPart(text, TRANSFER_PARTS) || hasWord(text, TRANSFER_WORDS)) return "ueberweisung";
  if (hasPart(text, CREDIT_PARTS)) return "gutschrift";
  return null;
}

export interface ClassifyInput {
  bookingText?: string | null;
  paymentReference?: string | null;
  amount?: number | null;
  productType?: string | null;
}

export function classifyTransactionType(input: ClassifyInput): TransactionType {
  const fromText =
    classifyText(normalize(input.bookingText)) ?? classifyText(normalize(input.paymentReference));
  if (isCardAccount(input.productType)) {
    if (fromText === "kreditkarte") return "kreditkarte";
    return (input.amount ?? 0) > 0 ? "gutschrift" : "kartenzahlung";
  }
  return fromText ?? "unbekannt";
}
