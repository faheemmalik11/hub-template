export type OposCategory =
  | "salary"
  | "tax_prepayment"
  | "private_withdrawal"
  | "rebooking"
  | "loan_installment"
  | "fee_interest"
  | "atm_withdrawal"
  | "other";

export const OPOS_CATEGORIES: readonly OposCategory[] = [
  "salary",
  "tax_prepayment",
  "private_withdrawal",
  "rebooking",
  "loan_installment",
  "fee_interest",
  "atm_withdrawal",
  "other",
] as const;

export type OposScope = "reference" | "counterparty" | "iban" | "booking_text" | "any";

export const OPOS_SCOPES: readonly OposScope[] = [
  "reference",
  "counterparty",
  "iban",
  "booking_text",
  "any",
] as const;

export const OPOS_TERM_MIN_LENGTH = 3;

export function oposNorm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").trim();
}

const UMLAUT_PAIRS: readonly (readonly [RegExp, string])[] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/Ä/g, "Ae"],
  [/Ö/g, "Oe"],
  [/Ü/g, "Ue"],
  [/ß/g, "ss"],
];

export function asciiSpelling(term: string): string | null {
  const ascii = UMLAUT_PAIRS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    term,
  );
  return ascii === term ? null : ascii;
}

export function shadowingRule<
  T extends {
    id: string;
    term: string;
    scope: OposScope;
    is_active: boolean;
    created_at: string;
  },
>(rule: T, all: readonly T[]): T | null {
  const mine = oposNorm(rule.term);
  if (!mine || !rule.is_active) return null;

  const olderThan = (a: T, b: T) =>
    a.created_at !== b.created_at ? a.created_at < b.created_at : a.term < b.term;

  let winner: T | null = null;
  for (const other of all) {
    if (other.id === rule.id || !other.is_active) continue;
    if (other.scope !== rule.scope && other.scope !== "any") continue;
    const theirs = oposNorm(other.term);
    if (!theirs || !mine.includes(theirs)) continue;
    if (!olderThan(other, rule)) continue;
    if (!winner || olderThan(other, winner)) winner = other;
  }
  return winner;
}
