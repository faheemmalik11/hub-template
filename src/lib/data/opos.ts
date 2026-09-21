// OPOS whitelist vocabulary — kept in one place because both the rules screen and the manual
// "no receipt expected" menu offer the same choices. The values MUST stay in sync with the CHECK
// constraints in the pipeline's migration 0018 (opos_whitelist_rules.category / .scope) and with the
// reason whitelist inside the opos_set_no_receipt() RPC.
import type { OposCategory, OposWhitelistScope } from "./types";

// Order = how they are offered in the UI. The first five are the briefing's named categories
// (Screen 10: "salaries, tax prepayments, private withdrawals, rebookings and loan installments");
// the last three cover what real German booking texts additionally contain.
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

// Which transaction field a rule's term is matched against.
export const OPOS_SCOPES: readonly OposWhitelistScope[] = [
  "reference",
  "counterparty",
  "iban",
  "booking_text",
  "any",
] as const;

// A term shorter than this is rejected before it can be saved. The match is a plain substring over
// normalised text, so "GA" hides most of a ledger and the screen offered no validation beyond
// "not empty" (docs/audit/opos-whitelist/opos-whitelist/ISSUES.md #6). Three characters is the
// shortest term in the seeded set ("GA NR" aside, which is five).
export const OPOS_TERM_MIN_LENGTH = 3;

// The same normalisation opos_norm() applies in the database: lowercase, collapse runs of
// whitespace, trim. Deliberately NOT folding umlauts, because opos_norm() does not either — that
// difference is the whole of issue #4 and is handled by offering both spellings, not by pretending
// here that the matcher is more forgiving than it is.
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

/**
 * The ASCII spelling of a term, or null when the term has no umlaut to transliterate.
 *
 * opos_norm() lowercases and collapses whitespace but does not fold umlauts or ß, so "Annuität" and
 * "Annuitaet" are two different terms and a rule for one catches none of the other. German bank
 * booking texts use both spellings, which is why the seeded set carries three hand-maintained pairs
 * (Annuitaet/Annuität, Übertrag/Uebertrag, Kontofuehrungsgebuehr/Kontoführungsgebühr). Nothing on
 * the screen said so, so every rule anyone added for an umlaut term silently covered half the cases
 * (issue #4).
 *
 * Folding umlauts inside opos_norm() would be the deeper fix, but that function belongs to the
 * pipeline's own migration set (0018 in book-keeping, formerly ai-mail-extraction) and is shared with the ingestion side,
 * so changing its matching semantics from a Hub migration would put the two copies out of step.
 * Offering the second spelling does the same job through data the pipeline already understands.
 */
export function asciiSpelling(term: string): string | null {
  const ascii = UMLAUT_PAIRS.reduce(
    (text, [muster, replacement]) => text.replace(muster, replacement),
    term,
  );
  return ascii === term ? null : ascii;
}

/**
 * The rule that will always be credited ahead of this one, or null.
 *
 * match_opos_whitelist() ends in `order by r.created_at, r.term limit 1`: a transaction is credited
 * to exactly ONE rule, the oldest that matches, and whitelist_rule_id records only that one. So a
 * Treffer count of 0 does not mean "this rule catches nothing" — it can equally mean "everything it
 * catches was already caught by an older rule". Acting on that 0 by deleting the rule is how
 * transactions come back into Offene Posten unannounced, and deleting the OLDER rule silently
 * re-credits its hits to this one. That is precisely the housekeeping the column invites (#2).
 *
 * The relation is decidable without reading any transaction: if an older rule's term is contained
 * in this one's and it reads the same field (or "any", which reads every field concatenated), then
 * every text this rule matches contains the older term too, so the older rule always wins.
 */
export function coveringRule<
  T extends {
    id: string;
    term: string;
    scope: OposWhitelistScope;
    is_active: boolean;
    created_at: string;
  },
>(rule: T, all: readonly T[]): T | null {
  const mine = oposNorm(rule.term);
  if (!mine || !rule.is_active) return null;

  // Same tie-break as the matcher's ORDER BY, so "which one wins" is answered the same way here.
  const older = (a: T, b: T) =>
    a.created_at !== b.created_at ? a.created_at < b.created_at : a.term < b.term;

  let winner: T | null = null;
  for (const other of all) {
    if (other.id === rule.id || !other.is_active) continue;
    if (other.scope !== rule.scope && other.scope !== "any") continue;
    const theirs = oposNorm(other.term);
    if (!theirs || !mine.includes(theirs)) continue;
    if (!older(other, rule)) continue;
    if (!winner || older(other, winner)) winner = other;
  }
  return winner;
}
