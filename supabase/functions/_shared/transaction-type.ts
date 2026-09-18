// Classify a bank movement into the transaction type reconciliation needs.
//
// Why this exists: BANKSapi only passes through the bank's own free-text `buchungstext`
// ("Lastschrift", "Gutschrift", frequently an empty string). That text is not a type -- it is
// unnormalized, bank-specific, and absent on most movements. Screen 7 of the functional
// briefing needs a stable type because each one is handled differently downstream: a transfer
// is pushed by hand and needs approval before it is paid, a credit card debit arrives as one
// lumped monthly charge that has to be split back into its purchases, and a direct debit was
// already pulled so it only needs the lighter check.
//
// Deliberately conservative: with no usable signal a movement stays 'unbekannt' rather than
// being guessed into a type. A wrong 'ueberweisung' would drop a movement into the payment
// approval queue that nobody ever needs to approve, which is worse than an honest blank.
//
// This is the single source of truth for the rules. The migration adding the column does no
// backfill; bank-sync calls this function for both new and unclassified rows.

export type TransactionType =
  "ueberweisung" | "lastschrift" | "kreditkarte" | "kartenzahlung" | "gutschrift" | "unbekannt";

// Fold umlauts and collapse punctuation to single spaces, so "SEPA-Überweisung" and
// "SEPA UEBERWEISUNG" both reduce to "sepa ueberweisung".
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

// German banks emit compound words ("Kreditkartenabrechnung"), so most signals need a
// substring test.
function hasPart(haystack: string, parts: readonly string[]): boolean {
  return parts.some((p) => haystack.includes(p));
}

// Short tokens ("visa", "elv", "pos") need a word boundary, otherwise they fire inside
// unrelated words.
function hasWord(haystack: string, words: readonly string[]): boolean {
  return words.some((w) => haystack === w || new RegExp(`(^| )${w}( |$)`).test(haystack));
}

// Product types that make the whole account a card account. BANKSapi sends these uppercase
// ("VISA"); normalize() lowercases them first.
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

// The collective charge that settles a card. Seen on the current account as the outgoing lump,
// and on the card account itself as the billing-cycle total ("SUMME WOCHENABRECHNUNG VISA").
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

// A single card or ATM movement.
const CARD_PAYMENT_PARTS = [
  "kartenzahlung",
  "kartenverfuegung",
  "girocard",
  "debitkarte",
  "bargeldauszahlung",
  "geldautomat",
] as const;
const CARD_PAYMENT_WORDS = ["elv", "ec cash", "pos", "ga auszahlung"] as const;

// Sparkasse/Volksbank style reference prefixes: "EC 68096654 1402152041..." is a card payment,
// "GA NR00001801 BLZ70040048..." an ATM withdrawal. These only carry meaning as the LEADING
// token -- "ec" and "ga" are far too short to look for anywhere in the string, and a reference
// like "Gartenbau Mueller" must not read as an ATM withdrawal.
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
  "uebertrag", // "Uebertrag auf Girokonto" -- a push between the client's own accounts
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

// Order matters. Card signals are checked before the direct-debit ones because a card payment
// booked via ELV is technically a direct debit, but the briefing wants it handled as a card
// movement. Credit comes last so an explicit debit signal wins over a reference that merely
// mentions interest.
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
  /** bank_accounts.product_type of the account the movement sits on. */
  productType?: string | null;
}

export function classifyTransactionType(input: ClassifyInput): TransactionType {
  // The bank's own booking text outranks the free-text reference: "Kapitalertragsteuer aus
  // Zinsen" is booked as a Lastschrift and must not read as a credit just because its
  // reference mentions interest.
  const fromText =
    classifyText(normalize(input.bookingText)) ?? classifyText(normalize(input.paymentReference));

  // A movement ON a card account is one individual card purchase, never the collective debit.
  // The briefing needs those two apart: the lump is what gets split, these are what it gets
  // split into.
  if (isCardAccount(input.productType)) {
    // Except the billing-cycle total, which appears on the card too ("SUMME WOCHENABRECHNUNG
    // VISA") and is the lump itself -- classifying it as just another card movement would make
    // the card's own total look like one of its purchases and double-count it.
    if (fromText === "kreditkarte") return "kreditkarte";
    // Otherwise the sign decides: money off the card is a purchase, money onto it is the payoff
    // or a merchant refund.
    return (input.amount ?? 0) > 0 ? "gutschrift" : "kartenzahlung";
  }

  return fromText ?? "unbekannt";
}
