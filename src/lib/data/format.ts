// Formatierungs- und Ableitungs-Helfer für die echten Belege (Stufe 1 — Lesen).
//
// i18n note: label TEXT for the invoice module lives in the i18n dictionaries
// (src/lib/i18n/locales), not here. This file keeps only the styling (`cls`) maps,
// the ordered keys, and the derivation logic. Components translate keys via useTranslation.
// Bank maps below stay German (out of scope for now).

import type { ChainPerson, ApprovalRule, Document, FieldSource, WorkflowStatus } from "./types";
import i18n, { tDe } from "@/lib/i18n";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

// Dates follow the language the user picked. formatDate was pinned to "en-US" and formatMonthYear
// to "de-DE", so with English selected the period filter still listed German month names while the
// column beside it printed English ones, and with German selected the columns stayed English.
// Read from the live i18n instance rather than passed in: every call site is a render path that
// already re-renders on a language change.
// Exported so a shared component can format month and weekday names in the active
// language without reaching for the i18n instance itself.
export function dateLocale(): string {
  return i18n.language?.startsWith("en") ? "en-US" : "de-DE";
}

export function formatEUR(value: number | null | undefined): string {
  return eur.format(value ?? 0);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

// Parse a user-entered decimal that may be German ("1.234,56") or plain ("1234.56").
// Returns null for empty input, NaN for non-empty-but-invalid (caller must reject,
// never store) — the whole point is to stop "1.234,56" silently becoming null.
export function parseDecimalInput(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", "."); // comma is the decimal (German)
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, ""); // dot is the decimal, commas are thousands
  } else {
    normalized = s; // a single or no separator
  }
  normalized = normalized.replace(/[^0-9.-]/g, "");
  return Number(normalized); // NaN when the input isn't a valid number
}

// Period selection → inclusive beleg_datum range for the server query.
// Values mirror the list dropdown: "__alle", "jahr-YYYY", "quartal-YYYY-Q", "monat-YYYY-MM",
// "individuell". Returns ISO date strings (or null when unbounded).
// "2026-06" → "Juni 2026" (German display) — used by every "monat-YYYY-MM" period-filter dropdown.
export function formatMonthYear(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return yearMonth;
  return d.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
}

// The "last 30 days" period value, shared by the invoice list filter and the Overview volume
// figure so both mean the same 30 days. It travels in the URL, so the two screens have to agree
// on the exact string.
export const LAST_30_DAYS = "letzte-30-tage";

// Today and the 29 days before it, so 30 calendar days including today. Local dates, because the
// column this filters (document_date) is a plain date and every other value here (a month, a
// year) is a local calendar range too.
export function last30DaysRange(today: Date = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 29);
  return { fromDate: iso(fromDate), toDate: iso(toDate) };
}

// THE OVERVIEW'S PERIOD FILTER, in the order the dropdown lists them. The overview is a summary
// screen, so it offers the handful of periods you compare against each other (this month against
// last month, the last half year, last year). The invoice list keeps its open ended month by month
// history, which grows with the data and exists for finding one document.
/**
 * Euro shortened for a chart axis: 3.300 € becomes "3,3 Tsd. €" in German and "$3.3K"-style compact
 * in English. A y-axis repeating "3.300,00 €" five times spends most of its width on decimals
 * nobody reads at that size, and forces the axis wide enough to squeeze the plot.
 */
export function formatEURCompact(value: number | null | undefined): string {
  return new Intl.NumberFormat(dateLocale(), {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

/** Day and short month for a chart axis: "2 Aug" rather than "August 2, 2026". */
export function formatDayShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
}

/** Short month and year for a chart axis: "Aug 26" rather than "August 2026". */
export function formatMonthShort(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return yearMonth;
  return d.toLocaleDateString(dateLocale(), { month: "short", year: "2-digit" });
}

// Period types and range math live in the reusable dashboard core; re-exported here so the many
// existing importers (and the list-filter mapping below) keep one import path.
export {
  OVERVIEW_PERIODS,
  OVERVIEW_PERIOD_DEFAULT,
  isOverviewPeriod,
  overviewPeriodRange,
  previousPeriodRange,
} from "@/components/dashboard/periods";
export type { OverviewPeriod, PeriodRange } from "@/components/dashboard/periods";
import {
  overviewPeriodRange,
  type OverviewPeriod,
  type PeriodRange,
} from "@/components/dashboard/periods";

// The value the list screens use for "no period filter". Kept here because the Overview has to
// hand that exact string over when its own period is "alle", and the screens each declare it
// locally as ALLE.
export const ALL_PERIOD = "__alle";

// "Assigned to no company" has TWO representations in this data. The pipeline expresses it by
// leaving company_code NULL, and there is also a real companies row `NZO` ("Nicht zugeordnet")
// that means the same thing. Migration 20260813190000 settled the meaning for the AI-search RPCs:
// NZO matches the explicit code AND the NULLs. The list filter, the KPI tiles and the counter above
// the table go through this constant so all four agree on what "unassigned" is.
export const COMPANY_WITHOUT = "NZO";

// "No property assigned" as a filter value. Unlike companies, properties have no catch-all code in
// the data (companies have NZO), so this is a sentinel the column can never actually hold. The list
// query and invoices_kpis (migration 20260815210000) both read it.
export const PROPERTY_WITHOUT = "__ohne";

// The same period written as the invoice list's own period filter, so a tile that counted a range
// links to a list showing that range and the two screens report the same number.
export function overviewPeriodListSearch(
  period: OverviewPeriod,
  today: Date = new Date(),
): { period: string; fromDate?: string; toDate?: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  switch (period) {
    case "alle":
      return { period: ALL_PERIOD };
    // Filled in by the caller, which is the only place the chosen bounds live.
    case "benutzerdefiniert":
      return { period: "individuell" };
    case "letzte-30-tage":
      return { period: LAST_30_DAYS };
    case "aktueller-monat":
      return { period: `monat-${ym(new Date(y, m, 1))}` };
    case "letzter-monat":
      return { period: `monat-${ym(new Date(y, m - 1, 1))}` };
    case "aktuelles-jahr":
      return { period: `jahr-${y}` };
    case "letztes-jahr":
      return { period: `jahr-${y - 1}` };
    // No named option covers six or twelve months, so they travel as the list's custom range.
    case "letzte-6-monate":
    case "letzte-12-monate": {
      const r = overviewPeriodRange(period, today);
      return {
        period: "individuell",
        fromDate: r.fromDate ?? undefined,
        toDate: r.toDate ?? undefined,
      };
    }
  }
}

// Inclusive test for a plain date column. A missing date is OUT, because the list's period filter
// cannot match it either. Counting it here would put documents in a tile that the page behind the
// tile does not show.
export function inDateRange(date: string | null | undefined, range: PeriodRange): boolean {
  // No bounds at all means no date test, exactly as the list behaves with its period filter off.
  // Rows WITHOUT a date belong in that answer too, which is why this returns before the null check.
  if (!range.fromDate && !range.toDate) return true;
  if (!date) return false;
  const d = date.slice(0, 10);
  if (range.fromDate && d < range.fromDate) return false;
  if (range.toDate && d > range.toDate) return false;
  return true;
}

export function periodToRange(
  period: string,
  fromDate: string,
  toDate: string,
): { fromDate: string | null; toDate: string | null } {
  if (period === LAST_30_DAYS) return last30DaysRange();
  if (period.startsWith("jahr-")) {
    const y = period.slice("jahr-".length);
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  if (period.startsWith("quartal-")) {
    const [y, q] = period.slice("quartal-".length).split("-").map(Number);
    const startMonth = (q - 1) * 3 + 1; // Q1→1, Q2→4, Q3→7, Q4→10
    const lastDay = new Date(y, startMonth + 2, 0).getDate(); // last day of the quarter's 3rd month
    return {
      fromDate: `${y}-${String(startMonth).padStart(2, "0")}-01`,
      toDate: `${y}-${String(startMonth + 2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  if (period.startsWith("monat-")) {
    const ym = period.slice("monat-".length);
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
    return { fromDate: `${ym}-01`, toDate: `${ym}-${String(lastDay).padStart(2, "0")}` };
  }
  if (period === "individuell") {
    return { fromDate: fromDate || null, toDate: toDate || null };
  }
  return { fromDate: null, toDate: null };
}

// IBAN in Vierergruppen (z. B. "DE89 3704 0044 0532 0130 00").
/**
 * Group an IBAN into blocks of four for reading.
 *
 * Handles a field holding SEVERAL IBANs, which the supplier records genuinely do -- one live row
 * stores "DE81 2655 2286 0000 1116 66; DE88 2657 0024 0041 3526 00". Stripping all whitespace and
 * re-grouping the whole string from the start ran straight through the semicolon and shifted every
 * block of the second IBAN by one character:
 *
 *   "DE81 2655 2286 0000 1116 66;D E882 6570 0240 0413 5260 0"
 *
 * The stored data was fine; only the display was wrong. Each IBAN is now grouped on its own, so
 * neither the separator nor the count of them can shift the grouping.
 */
/**
 * One readable name for a bank account.
 *
 * BANKSapi fills `account_name` with the PRODUCT CATEGORY, not a name: five accounts belonging to
 * four different companies all arrive as "Sichteinlagen", and four more as "Sonstige Darlehen". A
 * column or a filter option showing that alone cannot be read at all, so the company code and the
 * last four IBAN digits -- the two things that actually differ -- are shown with it.
 *
 * A card has no IBAN, so that last part is empty exactly where it is needed most: "BusinessCard"
 * told nobody whose card it was, which is the complaint this exists to answer. The holder takes the
 * IBAN's place there.
 */
export function accountLabel(
  account:
    | { account_name?: string | null; iban?: string | null; holder?: string | null }
    | null
    | undefined,
  companyCode?: string | null,
): string {
  const name = account?.account_name?.trim() || null;
  const iban = account?.iban?.replace(/\s+/g, "") || null;
  const short = iban ? `…${iban.slice(-4)}` : null;
  const holder = short ? null : account?.holder?.trim() || null;
  const distinction = short ?? holder;
  if (!name && !distinction) return "—";
  const parts = [name ?? distinction!];
  if (companyCode) parts.push(companyCode);
  if (name && distinction) parts.push(distinction);
  return parts.join(" · ");
}

/**
 * Labels for a whole set of accounts, guaranteed to be different from one another.
 *
 * kontoLabel alone is not always enough: Immonetz has two accounts both called "Termineinlage"
 * whose IBANs end in the same four digits and which belong to no company, so the short label
 * collides. Every label that is not unique is extended with more of the IBAN, then by the holder for
 * cards (which have no IBAN to extend), and only then by a slice of the id -- a filter option that
 * cannot be told from its neighbour is the bug this exists to prevent, and a uuid fragment barely
 * counts as telling them apart.
 */
export function uniqueAccountLabels<
  T extends {
    id: string;
    account_name?: string | null;
    iban?: string | null;
    holder?: string | null;
    company_id?: string | null;
  },
>(
  accounts: T[],
  companyCode: (companyId: string | null | undefined) => string | null,
): Map<string, string> {
  const basis = new Map<string, string>();
  const count = new Map<string, number>();
  for (const k of accounts) {
    const label = accountLabel(k, companyCode(k.company_id));
    basis.set(k.id, label);
    count.set(label, (count.get(label) ?? 0) + 1);
  }
  const done = new Map<string, string>();
  const assign = new Set<string>();
  for (const k of accounts) {
    let label = basis.get(k.id)!;
    if ((count.get(label) ?? 0) > 1) {
      const iban = k.iban?.replace(/\s+/g, "");
      const holder = k.holder?.trim();
      if (iban && iban.length > 4) {
        label = `${label.replace(/…\d+$/, "")}…${iban.slice(-8)}`;
      } else if (holder && !label.includes(holder)) {
        label = `${label} · ${holder}`;
      }
      while (assign.has(label)) label = `${label} · ${k.id.slice(0, 6)}`;
    }
    assign.add(label);
    done.set(k.id, label);
  }
  return done;
}

/**
 * An IBAN the way the database stores it in supplier_bank_accounts: no spaces, dots or dashes,
 * upper case.
 *
 * A trigger (trg_compact_supplier_iban) rewrites every value written to that table into this form,
 * so a raw IBAN compared against a stored one will not match. `suppliers.iban` is NOT compacted --
 * it has accepted whatever the reader printed, spaces included -- so anything comparing the default
 * account against the account rows has to put both sides through this first.
 */
export function compactIBAN(iban: string | null | undefined): string {
  return (iban ?? "").replace(/[\s.-]/g, "").toUpperCase();
}

/**
 * Whether a value is shaped like something a payment can actually be sent to.
 *
 * Deliberately the SAME test as supplier_bank_accounts_iban_shape, the CHECK constraint on the
 * table: two letters, two digits, then 11-30 alphanumerics. Anything the Hub offers to save has to
 * pass this first, or the insert is refused by the database with a constraint error instead of a
 * message anybody can act on.
 *
 * Shape only, NOT the mod-97 checksum -- same as the constraint. It refuses a blank, a half-read
 * fragment and the "DE.. und DE.." splice that a single free-text column used to accept, which is
 * what the supplier records actually contain; it does not claim the account exists.
 */
export function isPayableIBAN(iban: string | null | undefined): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(compactIBAN(iban));
}

/** A BIC is 8 or 11 characters: bank, country, location, and an optional branch. */
export function isBIC(bic: string | null | undefined): boolean {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test((bic ?? "").replace(/\s+/g, "").toUpperCase());
}

/** An ISO 4217 code, shape only: three letters. */
export function isCurrencyCode(code: string | null | undefined): boolean {
  return /^[A-Z]{3}$/.test((code ?? "").trim().toUpperCase());
}

export function formatIBAN(iban: string | null | undefined): string {
  if (!iban) return "—";
  const parts = iban
    .split(";")
    .map((part) => part.replace(/\s+/g, "").toUpperCase())
    .filter(Boolean)
    .map((part) => part.replace(/(.{4})/g, "$1 ").trim());
  return parts.length ? parts.join("; ") : "—";
}

/**
 * What is actually stored in a supplier's `vat_id` field.
 *
 * The column is labelled "USt-IdNr" but holds whatever the extraction found next to the words on
 * the invoice. Live examples from one Hub: a clean VAT id, a German Steuernummer, an insurance
 * registration number ("VersSt.-Nr.: 806/..."), both a VAT id and a Steuernummer concatenated with
 * their own labels, and "DE30i1360" -- which resembles a VAT id but is not one (a letter inside the
 * digits, and too short).
 *
 * This does not clean the stored value; it only says what can be recognised in it, so the screen
 * can show the identifier it actually found and flag a value it cannot account for instead of
 * presenting everything as a VAT id.
 */
export type TaxId =
  | { art: "ust"; value: string; rest: string | null }
  | { art: "steuernummer"; value: string; rest: string | null }
  /** Recognised as neither, but plausible: a foreign tax number, an EIN, an insurance number. */
  | { art: "unbekannt"; value: string; rest: null }
  /** Shaped like a VAT id and not a valid one — the only case worth actively flagging. */
  | { art: "verdaechtig"; value: string; rest: null };

export function recogniseTaxId(vatId: string | null | undefined): TaxId | null {
  const raw = (vatId ?? "").trim();
  if (!raw) return null;

  // The two letters must START a word, and the digits may be spaced. Checked against every vat_id
  // actually stored: without the word boundary this reads the tail of a label as a country code
  // ("N.I.F. A84205863" -> "FA84205863", "USt-IdNr. 70 829 151637" -> "NR70829151637"), and without
  // allowing interior spaces it fails to recognise the very common "DE 112 595 008".
  const vatMatch = raw.toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2} ?[0-9][0-9 ]{7,13})/);
  const vatRaw = vatMatch ? vatMatch[1] : null;
  const vat = vatRaw ? vatRaw.replace(/\s/g, "") : null;
  // Not starting mid-number: "St.-Nr. 9212/101/00021" must not yield "212/101/00021".
  const taxNumber = raw.match(/(?:^|[^0-9])([0-9]{2,4}\/[0-9]{3}\/[0-9]{4,5})/)?.[1] ?? null;

  // Whatever is left once the recognised identifier is removed -- shown as a quiet secondary line
  // rather than dropped, since it is often a second, real identifier. Matched against the text as
  // it appears in the field, not the normalised value, so a spaced VAT id still removes cleanly.
  const rest = (match: string) => {
    const remaining = raw
      .replace(new RegExp(match.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      .replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g, "")
      .trim();
    return remaining || null;
  };

  if (vat) return { art: "ust", value: vat, rest: rest(vatRaw ?? vat) };
  if (taxNumber) return { art: "steuernummer", value: taxNumber, rest: rest(taxNumber) };

  // Only a bare token that is TRYING to be a VAT id gets flagged. A value carrying its own label
  // ("C.I.F.: B-07866890", "Tax ID/EIN: 41-4535625") or an obvious tax-number shape ("082/12000079")
  // is a different identifier, not a broken VAT id, and marking those amber would bury the one
  // value that genuinely looks wrong -- "DE30i1360", a letter sitting inside the digits.
  const bareToken = !/[:;/]/.test(raw) && /^[A-Za-z]{2}[A-Za-z0-9 -]{4,14}$/.test(raw);
  if (bareToken) return { art: "verdaechtig", value: raw, rest: null };

  return { art: "unbekannt", value: raw, rest: null };
}

/**
 * Every identifier the field holds, not only the first.
 *
 * `vat_id` regularly carries two: an Italian VAT id and a Polish one, or a VAT id and a
 * Steuernummer. erkenneSteuerId() recognises one and hands back the remainder, so this walks that
 * remainder until nothing is left. The caller can then show them as separate chips instead of
 * squeezing the second one onto a tiny second line.
 */
export function recogniseTaxIds(vatId: string | null | undefined): TaxId[] {
  const found: TaxId[] = [];
  let rest = (vatId ?? "").trim();
  // Bounded: each pass removes the token it recognised, so `rest` strictly shrinks and the loop
  // ends on its own. The cap is a backstop against a value that matches without consuming anything.
  for (let i = 0; i < 5 && rest; i++) {
    const recognised = recogniseTaxId(rest);
    if (!recognised) break;
    // A remainder with no digit in it is the LABEL the identifier was printed under, not a second
    // identifier: "Tax no. 27/197/86423" leaves "Tax no", and "USt-IdNr. DE123456789; St.-Nr.
    // 27/197/86423" leaves "USt-IdNr. ; St.-Nr". Both would otherwise become a chip, and the first
    // of them an amber "looks like a VAT id and is not" chip, which is the opposite of useful.
    // Only applied from the second entry on, so a field that is nothing but a label still shows
    // what it holds rather than silently rendering as empty.
    if (found.length > 0 && !/[0-9]/.test(recognised.value)) break;
    found.push(recognised);
    const next = recognised.rest ?? "";
    if (next === rest) break;
    rest = next;
  }
  return found;
}

// One shape for every date this product shows: a short month name, so "23. Aug. 2026" in German
// and "Aug 23, 2026" in English. The long form ("23. August 2026") is a third wider for no more
// information, and it set the width of every column and card that carries a date.
const DATUM_SHORT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};
// `hour: "numeric"`, not "2-digit": en-US renders the latter as "04:04 PM", which is a clock
// nobody writes. German is 24-hour either way.
const TIME_SHORT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

// Date only, e.g. "July 16, 2026" — used for every table/list date column.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(dateLocale(), DATUM_SHORT);
}

// Date + time, e.g. "July 16, 2026 at 8:49 PM" — used on detail pages for timestamp fields.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(dateLocale(), { ...DATUM_SHORT, ...TIME_SHORT });
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString(dateLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
];

export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  const seconds = Math.round((d.getTime() - now) / 1000);
  if (Math.abs(seconds) > 7 * 86_400) return formatDateTime(iso);
  const rtf = new Intl.RelativeTimeFormat(dateLocale(), { numeric: "auto" });
  let value = seconds;
  for (const [unit, step] of RELATIVE_STEPS) {
    if (Math.abs(value) < step) return rtf.format(Math.round(value), unit);
    value /= step;
  }
  return rtf.format(Math.round(value), "week");
}

/**
 * The same instant as formatDateTime, split so a table cell can put the date and the time on
 * separate lines. On one line the "Eingegangen" column was held at the width of
 * "13. August 2026 um 11:29", wider than anything else in the row needs, which squeezed the
 * columns carrying the actual content.
 */
export function formatDateTimeParts(iso: string | null | undefined): {
  datum: string;
  time: string | null;
} {
  if (!iso) return { datum: "\u2014", time: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { datum: "\u2014", time: null };
  return {
    datum: d.toLocaleDateString(dateLocale(), DATUM_SHORT),
    time: d.toLocaleTimeString(dateLocale(), TIME_SHORT),
  };
}

// Duration between two workflow steps (Briefing: "time spent at each step"). Returns a value +
// unit rather than a formatted string, so the caller translates via i18next pluralization
// (`documents.detail.workflow.dauer.<unit>`) instead of a hardcoded language here.
export function formatDuration(ms: number): {
  value: number;
  unit: "minutes" | "hours" | "days";
} {
  const minutes = ms / 60_000;
  if (minutes < 60) return { value: Math.max(1, Math.round(minutes)), unit: "minutes" };
  const hours = minutes / 60;
  if (hours < 24) return { value: Math.round(hours), unit: "hours" };
  return { value: Math.round(hours / 24), unit: "days" };
}

export function isVatRelevant(vatRate: number | null | undefined): boolean {
  return (vatRate ?? 0) > 0;
}

// ---- Konfidenz-TrafficLight ----
export type TrafficLight = "green" | "yellow" | "red" | "none";

// grün ≥ 0.95 · gelb 0.8–0.95 · rot < 0.8 (Vorgabe Stufe 1).
export function confidenceTrafficLight(score: number | null | undefined): TrafficLight {
  if (score == null) return "none";
  if (score >= 0.95) return "green";
  if (score >= 0.8) return "yellow";
  return "red";
}

export const TRAFFICLIGHT_STYLES: Record<TrafficLight, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  none: "bg-muted-foreground/30",
};
// Confidence label text: i18n key `documents.konfidenz.<ampel>` (see KonfidenzDot).

// ---- Recognition traffic light (DB column belege.traffic_light, from the pipeline A2/A6) ----
// Pill styling for the server-computed traffic light. The solid dot inside the pill uses
// AMPEL_STYLES above; these are the tinted pill backgrounds. Label via `documents.ampel.<value>`.
export const TRAFFICLIGHT_META: Record<TrafficLight, { cls: string }> = {
  green: { cls: "bg-emerald-100 text-emerald-800 border-transparent" },
  yellow: { cls: "bg-amber-100 text-amber-800 border-transparent" },
  red: { cls: "bg-red-100 text-red-800 border-transparent" },
  none: { cls: "bg-muted text-muted-foreground border-transparent" },
};

// Map the raw DB value straight through (no client scoring). Unknown/absent -> "none".
export function trafficLightFromValue(value: string | null | undefined): TrafficLight {
  return value === "green" || value === "yellow" || value === "red" ? value : "none";
}

// ---- Status (styling only; label text via i18n key `documents.status.<value>`) ----
export const STATUS_META: Record<string, { cls: string }> = {
  recognised: { cls: "bg-brand-tint text-brand-dark border-transparent" },
  needs_review: { cls: "bg-amber-100 text-amber-800 border-transparent" },
};

// ---- Field provenance (migration 0025; label text via i18n key `documents.quelle.<value>`) ----
// Deliberately ranked by authority rather than by field: a human decision is the strongest and
// gets the strongest colour, a rule is settled but automatic, and the AI is a suggestion. The
// same three colours are reused wherever a source is shown so the ranking reads without a legend.
export type FieldSourceKey = FieldSource | "none";

export const SOURCE_META: Record<FieldSourceKey, { cls: string }> = {
  human: { cls: "bg-emerald-100 text-emerald-800 border-transparent" },
  rule: { cls: "bg-sky-100 text-sky-800 border-transparent" },
  ai: { cls: "bg-violet-100 text-violet-800 border-transparent" },
  none: { cls: "bg-muted text-muted-foreground border-transparent" },
};

// A missing source is NOT "unknown provenance" in practice: the ingestion pipeline writes
// extracted values without one, and the DB resolver treats null as overwritable exactly like
// 'ai'. Collapsing null onto "ai" here keeps the UI honest about what a rule may still change.
export function fieldSourceKey(
  value: string | null | undefined,
  hasValue: boolean,
): FieldSourceKey {
  if (!hasValue) return "none";
  if (value === "human" || value === "rule") return value;
  return "ai";
}

// ---- Belegart (document type, from the pipeline classifier) ----
// Non-invoice types are visually distinct so Mahnung/Angebot/Kontoauszug stand out
// from real payable invoices in the queue. Label text via i18n key `documents.belegart.<value>`.
// ONE SPELLING PER DOCUMENT TYPE, resolved here. The pipeline writes lowercase German
// ("rechnung", "mahnung", "credit_note", …) while this file was keyed on the capitalized
// "Eingangsrechnung" the UI expected, so nothing ever matched: every ordinary invoice counted as an
// exception, and the badge fell back to printing the raw column value. That is how a tag reading
// "rechnungen" ended up on every row of an English screen.
const DOCUMENTTYPE_ALIASES = new Map<string, string>([
  ["eingangsrechnung", "rechnung"],
  ["rechnungen", "rechnung"],
  ["invoice", "rechnung"],
  ["invoices", "rechnung"],
  ["erechnung", "rechnung"],
  ["e-rechnung", "rechnung"],
  ["gutschriften", "credit_note"],
  ["credit_note", "credit_note"],
  ["mahnungen", "mahnung"],
  ["dunning", "mahnung"],
  ["angebote", "angebot"],
  ["offer", "angebot"],
  ["lieferscheine", "lieferschein"],
  ["delivery_note", "lieferschein"],
  ["kontoauszuege", "kontoauszug"],
  ["bank_statement", "kontoauszug"],
  ["advertising", "werbung"],
  ["not_a_receipt", "kein_beleg"],
]);

/** The canonical lowercase key for a stored document type, or null when none is stored. */
export function documentTypeKey(documentType: string | null | undefined): string | null {
  if (!documentType) return null;
  const raw = documentType.trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return null;
  return DOCUMENTTYPE_ALIASES.get(raw) ?? raw;
}

export const DOCUMENTTYPE_META = new Map<string, { cls: string }>([
  ["rechnung", { cls: "bg-brand-tint text-brand-dark" }],
  ["gutschrift", { cls: "bg-brand-tint text-brand-dark" }],
  ["mahnung", { cls: "bg-red-100 text-red-800" }],
  ["angebot", { cls: "bg-slate-100 text-slate-700" }],
  ["lieferschein", { cls: "bg-slate-100 text-slate-700" }],
  ["kontoauszug", { cls: "bg-slate-100 text-slate-700" }],
  ["werbung", { cls: "bg-slate-100 text-slate-700" }],
  ["kein_beleg", { cls: "bg-slate-100 text-slate-700" }],
]);

// True incoming invoices are the default type; everything else is an exception worth flagging.
// A missing type counts as ordinary too: an unclassified document is not evidence of anything.
export function isIncomingInvoice(documentType: string | null | undefined): boolean {
  const key = documentTypeKey(documentType);
  return key === null || key === "rechnung";
}

// ---- Direct debit (Lastschrift) detection ----
// The invoice was (or will be) auto-collected — a bank transfer would pay it twice.
// Normalized substring match so extractor-supplied variants also count, not just the
// classifier's canonical "Lastschrift".
export function isDirectDebit(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  const s = paymentMethod.toLowerCase();
  return s.includes("lastschrift") || s.includes("einzug") || s.includes("abbuch");
}

// ---- Unusual-amount detection (Briefing Screen 12 warning) ----
// Disclosed heuristic — no threshold for this exists anywhere in this app or the external
// pipeline's own source (checked both the live schema and handover/pipeline/*.py). Modeled on the
// illustrative rule in the pipeline's own spec doc (handover/docs/SPEC-EINGANGSRECHNUNG.md: "amount
// 68% above the average of the last 6 invoices of this supplier -> escalate"), not copied from an
// existing config, so treat the constants below as a starting point to tune, not a fixed spec.
//
// Only warns when the supplier's own history is otherwise stable — the briefing's own rule: "for a
// supplier whose invoices fluctuate strongly anyway, we do not warn, otherwise it only annoys" —
// gated on the coefficient of variation (stddev/mean) of the supplier's prior amounts staying below
// STABLE_CV. Needs at least MIN_HISTORY prior receipts to judge stability at all; a shorter history
// is too noisy to call "stable" or "unusual" either way.
const UNUSUAL_AMOUNT_MIN_HISTORY = 4;
const UNUSUAL_AMOUNT_HISTORY_WINDOW = 6; // "last 6 invoices", matching the spec's illustrative rule
const UNUSUAL_AMOUNT_STABLE_CV = 0.35; // below this = "otherwise stable" amounts
const UNUSUAL_AMOUNT_DEVIATION = 0.5; // 50% above/below the stable mean = flagged

// Returns the ids of receipts (within the given, already-supplier-scoped list) whose amount
// deviates unusually from that supplier's own recent, otherwise-stable history.
// Takes only the three fields it reads, not a whole Beleg: the supplier page now computes this
// over a narrow projection of its invoices (see BELEG_AGGREGAT_SPALTEN) rather than over full
// rows, and the wider signature would have forced that projection to carry every column again.
export function detectUnusualAmounts(
  documents: Pick<Document, "id" | "amount_gross" | "document_date">[],
): Set<string> {
  const sorted = [...documents]
    .filter((b) => b.amount_gross != null && b.document_date)
    .sort((a, b) => (a.document_date ?? "").localeCompare(b.document_date ?? ""));

  const flagged = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const history = sorted.slice(Math.max(0, i - UNUSUAL_AMOUNT_HISTORY_WINDOW), i);
    if (history.length < UNUSUAL_AMOUNT_MIN_HISTORY) continue;
    const amounts = history.map((b) => b.amount_gross as number);
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (mean === 0) continue;
    const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    if (stddev / mean > UNUSUAL_AMOUNT_STABLE_CV) continue; // amounts fluctuate anyway — don't warn

    const current = sorted[i].amount_gross as number;
    if (Math.abs(current - mean) / mean > UNUSUAL_AMOUNT_DEVIATION) {
      flagged.add(sorted[i].id);
    }
  }
  return flagged;
}

// ---- Recently-changed IBAN (Briefing Screen 12 warning) ----
// A history row within this window is surfaced as "recently changed" — old enough that a
// months-old, already-reviewed change doesn't keep nagging, recent enough to still matter.
const IBAN_RECENTLY_CHANGED_DAYS = 90;

/**
 * The most recent IBAN event for a supplier, within the "recently changed" window.
 *
 * `erstmalig` separates the two things this used to conflate. A history row whose stored (previous)
 * IBAN is null is the pipeline recording a bank account for the FIRST time; a row with a previous
 * IBAN is the account actually changing. Both produced the identical red "Bisherige IBAN: —. Neue
 * IBAN: … Bitte prüfen" warning, which is the fraud signal for a supplier's bank details being
 * swapped.
 *
 * That matters more as time passes, not less: first-time capture is a normal, steady event as the
 * supplier base grows, so the false warnings accumulate and train people to ignore the badge —
 * exactly when a real bank swap needs to stand out. The callers now show a plain, neutral note for
 * a first capture and keep the warning for a real change.
 */
export function recentSupplierIbanChange(
  history: { iban: string | null; changed_at: string }[],
): { alt: string | null; changedAt: string; initial: boolean } | null {
  const cutoff = Date.now() - IBAN_RECENTLY_CHANGED_DAYS * 24 * 60 * 60 * 1000;
  let latest: { alt: string | null; changedAt: string; initial: boolean } | null = null;
  for (const h of history) {
    if (new Date(h.changed_at).getTime() < cutoff) continue;
    if (!latest || h.changed_at > latest.changedAt)
      latest = {
        alt: h.iban,
        changedAt: h.changed_at,
        // Nothing to compare against: no previous IBAN was on file when this was written.
        initial: !h.iban || !h.iban.trim(),
      };
  }
  return latest;
}

// ---- Invoice frequency (Briefing Screen 12: "total paid and payment frequency over time") ----
// Average gap between a supplier's receipts, in days. null when fewer than 2 dated receipts exist
// (no gap to measure).
export function computeInvoiceFrequency(documents: Document[]): { avgDays: number | null } {
  const dates = documents
    .map((b) => b.document_date)
    .filter((d): d is string => !!d)
    .sort();
  if (dates.length < 2) return { avgDays: null };
  const first = new Date(dates[0]).getTime();
  const last = new Date(dates[dates.length - 1]).getTime();
  const spanDays = (last - first) / (1000 * 60 * 60 * 24);
  return { avgDays: Math.round(spanDays / (dates.length - 1)) };
}

// Payment & reconciliation reasons — the third, independent axis (briefing A6/A8, Screen 8): is the
// receipt paid, matched to a bank transaction, and handed to DATEV? Stable IDs translated via i18n
// key `documents.detail.zahlung.grund.<id>`. `abgleich` comes from abgleichStatus() (confirmed matches).
export type PaymentReasonId =
  | "lastschrift"
  | "lastschrift_ausstehend"
  | "paid"
  | "open"
  | "reconciled"
  | "partial"
  | "not_reconciled"
  | "datev_bereit"
  | "datev_offen";

export function paymentReasons(
  doc: Pick<Document, "payment_method" | "paid_at" | "workflow_status" | "amount_gross">,
  // 'suggested' falls through to the same lines as 'open' below: a suggestion nobody has
  // confirmed has not reconciled anything yet, whatever the header badge calls it.
  matching: MatchingStatus,
): PaymentReasonId[] {
  const g: PaymentReasonId[] = [];
  const isLs = isDirectDebit(doc.payment_method);
  // Payment state — direct-debit-aware so the lines never contradict. A Lastschrift is collected
  // automatically, so "not paid" would be misleading: until the bank debit is matched/confirmed
  // (paid_at set) it is "auto-collected — awaiting bank confirmation", not "open/owed". Only a
  // manual-transfer invoice that isn't paid is a genuine open item.
  if (doc.paid_at) {
    if (isLs) g.push("lastschrift");
    g.push("paid");
  } else if (isLs) {
    g.push("lastschrift_ausstehend");
  } else {
    g.push("open");
  }
  g.push(
    matching === "reconciled"
      ? "reconciled"
      : matching === "partial"
        ? "partial"
        : "not_reconciled",
  );
  g.push(isDatevReady(doc.workflow_status) ? "datev_bereit" : "datev_offen");
  return g;
}

// Whether a receipt is connected to a transaction and handed to DATEV (Briefing Screen 6: "should
// be visible on the receipt"). Extracted so both zahlungGruende (detail page) and the Kanban
// board card can show the same signal without duplicating the two-value check.
export function isDatevReady(workflowStatus: string | null | undefined): boolean {
  return workflowStatus === "handed_over" || workflowStatus === "closed";
}

// Review-priority score: higher = needs attention sooner. Counts deterministic issues
// and adds weight for low field confidence, so the worst rows sort to the top.

// ---- Workflow-Status (Freigabe-Kette, Stufe 2) ----
// Styling only; label text via i18n key `documents.workflow.<value>`.
export const WORKFLOW_META: Record<string, { cls: string }> = {
  received: { cls: "bg-muted text-muted-foreground border-transparent" },
  in_review: { cls: "bg-amber-100 text-amber-800 border-transparent" },
  query: { cls: "bg-orange-100 text-orange-800 border-transparent" },
  approved_first: { cls: "bg-sky-100 text-sky-800 border-transparent" },
  approved_final: { cls: "bg-violet-100 text-violet-800 border-transparent" },
  paid: { cls: "bg-teal-100 text-teal-800 border-transparent" },
  handed_over: { cls: "bg-emerald-100 text-emerald-800 border-transparent" },
  closed: { cls: "bg-emerald-600 text-white border-transparent" },
  // Two side paths off the main chain (Appendix A6, migration 0025). Falling back to the
  // `eingegangen` default here (as WorkflowBadge did before these two existed) painted a
  // rejected invoice the same neutral grey as a brand-new one — the one status that most needs
  // to read as final/destructive looked the least urgent of all of them.
  rejected: { cls: "bg-red-100 text-red-800 border-transparent" },
  not_relevant: { cls: "bg-sky-100 text-sky-800 border-transparent" },
};

// These must match the DB `workflow_status` CHECK constraint exactly — writing a value
// not in the constraint would fail. Keep in sync with supabase/migrations/0002/0036.
export const WORKFLOW_ORDER = [
  "received",
  "in_review",
  "query",
  "approved_first",
  "approved_final",
  "paid",
  "handed_over",
  "closed",
] as const;

// German-only workflow label for PERSISTED audit/history text (beleg_verlauf). Always German
// regardless of the active UI language, so the audit trail stays consistent. Do NOT use this
// for display — the UI translates `documents.workflow.<value>` via useTranslation.
export function workflowLabelDe(status: string | null | undefined): string {
  if (!status) return tDe("documents.workflow.eingegangen");
  return tDe(`documents.workflow.${status}`, { defaultValue: status });
}

// ---- Approval workflow actions (Briefing Screen 6; migration 0035) ----

export type ApprovalActionId =
  "send_for_review" | "approve" | "complete" | "final_approve" | "return_with_query" | "reject";

// German-only label for PERSISTED audit text (invoice_history), matching workflowLabelDe's own
// convention. Display text goes through useTranslation via `documents.workflow.actions.<id>`.
export function approvalActionLabelDe(id: ApprovalActionId): string {
  return tDe(`documents.workflow.actions.${id}`, { defaultValue: id });
}

export interface ApprovalAction {
  id: ApprovalActionId;
  nextStatus: WorkflowStatus;
  // invoice_history `type` for this action, distinct from the plain 'status_change' the older
  // free-click stepper still writes.
  type:
    | "approval_first"
    | "approval_final"
    | "query"
    | "rejection"
    | "already_approved"
    | "skipped"
    | "closed"
    | "payment_failed";
  requiresComment: boolean;
}

// Exported alongside APPROVAL_PHASE_STATUSES: the invoice screen needs to tell "the chain is
// finished" apart from "it is somebody else's move", and nextLegalActions() returns an empty
// list for both.
export const APPROVAL_TERMINAL_STATUSES: WorkflowStatus[] = [
  "handed_over",
  "closed",
  "rejected",
  "not_relevant",
];

// The approval phase proper — where a query/reject/skip/already-approved still makes sense.
// Once actually paid ('bezahlt'), the corrective action is specifically "payment failed" or the
// manual correction tool, not a query/reject on an already-approved item (migration 0036).
// 'approved_final' IS the "awaiting payment" state — nothing else to click there; the
// DB trigger advances straight to 'bezahlt' the moment paid_at is confirmed, regardless of how.
// Exported for useInvoicesAssignedToMe (queries.ts), which needs the same "still in the approval
// phase" test to tell an open assignment from a record of who once handled a finished invoice.
export const APPROVAL_PHASE_STATUSES: WorkflowStatus[] = [
  "received",
  "in_review",
  "query",
  "approved_first",
  "approved_final",
];

// Which approval actions are legal right now, given the current status, the resolved chain for
// this invoice, and who is acting.
//
// TWO QUESTIONS, IN ORDER. May I approve at all -- answered by the permission, from Team & Rollen.
// May I approve THIS one -- answered by the rule, when a rule resolves. Neither alone is enough
// and neither overrides the other.
//
// An empty array means no buttons render at all, per the briefing ("whoever may not approve does
// not see the button at all"). keineAktionenGrund on the invoice screen turns that silence back
// into a sentence.
export function nextLegalActions(
  status: WorkflowStatus | string | null,
  rule: Pick<ApprovalRule, "step_1_user_id" | "step_2_user_id"> | null,
  // The signed-in person as a chain member, by id. Was a name matched against the approvers
  // table, which resolved to null for anybody never registered there and silently took their
  // buttons away (migration 20260901160000).
  me: Pick<ChainPerson, "id"> | null,
  // `invoices.assigned_user_id`, set on the Workflow tab by somebody holding invoices.assign.
  // Defaulted to null so a caller that does not know about assignment keeps the pre-assignment
  // behaviour exactly.
  assignedUserId: string | null = null,
  // What the SIGNED-IN account may do, from Team & Rollen. Defaulted so existing callers keep
  // their behaviour; the invoice screen passes the real values.
  capabilities: { canApprove: boolean; canFinalApprove: boolean } = {
    canApprove: true,
    canFinalApprove: true,
  },
): ApprovalAction[] {
  if (!me || !capabilities.canApprove) return [];
  const s = (status ?? "received") as WorkflowStatus;
  // 'handed_over' stays in APPROVAL_TERMINAL_STATUSES -- there is genuinely nothing left to
  // APPROVE there, and the "chain is finished" message still has to read that way for anyone who
  // cannot close the invoice. It is not the end of the invoice's life though: a supervisor still
  // marks it complete, so it is excluded from the guard and handled near the bottom.
  if (APPROVAL_TERMINAL_STATUSES.includes(s) && s !== "handed_over") return [];

  // An invoice with a rule may only be acted on by the people that rule names. Until now the rule
  // decided nothing about WHO could act -- any approver could approve any invoice, which made the
  // rules a routing hint rather than an authority.
  //
  // No rule resolved is deliberately NOT a refusal. Every rule on this client is scoped to a supplier,
  // company or property and there is no catch-all, so most invoices match none; refusing there
  // would leave them approvable by nobody. Role decides in that case, as before.
  //
  // An explicit assignment overrides the rule. Assigning is an admin/super-admin action, and the
  // point of it is to hand one invoice to one person: refusing them because the rule names two
  // other people would make the assignment a label with no effect. It ADDS an actor, it never
  // removes one -- the people the rule names keep everything they had.
  const isAssigned = !!assignedUserId && assignedUserId === me.id;
  const isStep1 = !!rule && rule.step_1_user_id === me.id;
  const isStep2 = !!rule && rule.step_2_user_id === me.id;
  if (rule && !isStep1 && !isStep2 && !isAssigned) return [];

  // WHO approves decides what the approval means. This used to read only the rule's step 2:
  // with no second approver configured, an approval by ANYONE -- an assistant included -- landed
  // directly on 'approved_final'. That is the state "Jetzt bezahlen" unlocks, so an
  // assistant could put an invoice into the payable state with no supervisor ever involved. Every
  // approval rule on this client leaves step 2 empty, so this was not an edge case: it was every
  // approval. An assistant's approval is an assistant's approval; only a manager's is final.
  const approveNextStatus: WorkflowStatus = capabilities.canFinalApprove
    ? "approved_final"
    : "approved_first";
  const actions: ApprovalAction[] = [];

  if (s === "received") {
    // A freshly arrived document is taken into review first, rather than approved out of the inbox
    // in one click. 'in_review' existed in the chain but nothing ever moved anything into it,
    // because the check-and-approve step below accepted 'received' directly.
    actions.push({
      id: "send_for_review",
      nextStatus: "in_review",
      type: "approval_first",
      requiresComment: false,
    });
  } else if ((s === "in_review" || s === "query") && (!rule || isStep1 || isAssigned)) {
    // The check-and-approve step. Rework-and-resubmit from 'query' re-enters here too
    // (v1 simplification: always the check step, not a reconstruction of exactly which stage
    // raised the query — the briefing's "query loop can go around any number of times" still
    // holds either way).
    actions.push({
      id: "approve",
      nextStatus: approveNextStatus,
      type: "approval_first",
      requiresComment: false,
    });
  } else if (
    s === "approved_first" &&
    (rule && !isAssigned ? isStep2 : capabilities.canFinalApprove)
  ) {
    actions.push({
      id: "final_approve",
      nextStatus: "approved_final",
      type: "approval_final",
      requiresComment: false,
    });
  }

  if (APPROVAL_PHASE_STATUSES.includes(s)) {
    actions.push({
      id: "return_with_query",
      nextStatus: "query",
      type: "query",
      requiresComment: true,
    });

    actions.push({
      id: "reject",
      nextStatus: "rejected",
      type: "rejection",
      requiresComment: true,
    });

    // 'mark_already_approved' and 'skip_step' used to sit here, both manager-only and both landing
    // on 'approved_final'. They were removed once the workflow bar became the navigation:
    // all three did the same thing to the invoice and differed only in the history line they wrote,
    // so a manager now approves by clicking the step circle. The two `typ` values they used
    // ('already_approved', 'skipped') stay in the union and in APPROVAL_VERLAUF_TYPES,
    // because rows written before the removal still have to render in the Freigabe-Verlauf.
  }

  // Closing off an invoice that has gone to DATEV. Manager-only, and until now there was no route
  // to 'closed' at all except the manual status correction on the Workflow tab -- which is
  // there to fix a wrong status, not to perform a normal step. Handing over to DATEV and then
  // closing the invoice IS a normal step, so it gets a real action and a clickable circle.
  if (s === "handed_over" && capabilities.canFinalApprove) {
    actions.push({
      id: "complete",
      nextStatus: "closed",
      type: "closed",
      requiresComment: false,
    });
  }

  // 'payment_failed' used to sit here, offered at 'bezahlt' to either role. Nobody marks a payment
  // failed by hand: 'bezahlt' is stamped by a DB trigger off a confirmed bank match or the manual
  // paid checkbox, so undoing it is a correction, and corrections have their own control on the
  // Workflow tab. The 'payment_failed' history type stays in the union and in
  // APPROVAL_VERLAUF_TYPES: rows written before this, and any the payment provider writes itself,
  // still have to render.

  return actions;
}

// Who a return-with-query is addressed to: by default the chain's step-1 approver (the common
// case — a manager questioning the assistant's check), unless the person raising the query IS
// that step-1 approver, in which case it addresses step 2 instead. Null when neither applies
// (no resolved chain, or a single-step chain where the actor is that one step) — the receipt
// still moves to 'query' either way, it just has no specific "returned to me" addressee.
export function approvalQueryTarget(
  rule: Pick<ApprovalRule, "step_1_user_id" | "step_2_user_id"> | null,
  me: Pick<ChainPerson, "id"> | null,
): string | null {
  if (!rule) return null;
  if (!me || rule.step_1_user_id !== me.id) return rule.step_1_user_id;
  return rule.step_2_user_id ?? null;
}

// German-only before→after label for PERSISTED assignment history (beleg_verlauf, typ "booking").
// Always German regardless of UI language, matching workflowLabelDe. Empty sides render as "—".
// `feld` is a fixed German dimension label ("Gesellschaft" | "Objekt").
export function assignmentLabelDe(
  field: string,
  alt: string | null | undefined,
  next: string | null | undefined,
): string {
  const dash = "—";
  const a = alt && alt.trim() ? alt : dash;
  const b = next && next.trim() ? next : dash;
  // Reassignment vs. removal read differently: "war: X" makes an unlink explicit.
  if (b === dash) return `${field} entfernt (war: ${a})`;
  return `${field}: ${a} → ${b}`;
}

// ---- Audit trail: one before→after line per changed field ----
//
// The history has to record what a value BECAME, not merely which field somebody touched. Until now
// a plain field edit logged "Felder geändert: amount_gross", which tells a later reader nothing:
// they can see the current value already, and the one that was corrected away is exactly the one
// they are looking for.
//
// Keyed by DB column, because the history is written from a diff against the DB row. The labels are
// fixed German and deliberately NOT taken from the i18n dictionary: a history entry is a record of
// what happened, written once. Reading it back through a changed dictionary, or in English, would
// silently change what the record says.
export const FIELD_LABEL_DE: Record<string, string> = {
  issuer: "Rechnungssteller",
  issuer_address: "Anschrift Rechnungssteller",
  invoice_number: "Rechnungsnummer",
  order_number: "Auftragsnummer",
  document_date: "Rechnungsdatum",
  due_date: "Fälligkeitsdatum",
  service_date: "Leistungsdatum",
  service_period_from: "Leistung von",
  service_period_to: "Leistung bis",
  amount_net: "Betrag netto",
  vat_rate: "USt-Satz",
  vat_amount: "USt-Betrag",
  amount_gross: "Betrag brutto",
  currency: "Währung",
  company_code: "Gesellschaft",
  property_code: "Objekt",
  cost_category: "Kostenkategorie",
  category_id: "Kategorie (BWA)",
  service_description: "Leistungsbeschreibung",
  recipient_name: "Empfänger",
  recipient_address: "Empfänger-Anschrift",
  customer_number: "Kundennummer",
  payment_reference: "Verwendungszweck",
  payment_method: "Zahlungsart",
  tax_note: "Steuerhinweis",
  vat_deductible_pct: "Abzugsfähigkeit",
  vat_special_case: "Steuerlicher Sonderfall",
  supplier_id: "Lieferant",
  income_tax_treatment: "Herstellungs-/Erhaltungsaufwand",
};

const GELD_FIELDS = new Set(["amount_net", "vat_amount", "amount_gross"]);
const DATUM_FIELDS = new Set([
  "document_date",
  "due_date",
  "service_date",
  "service_period_from",
  "service_period_to",
]);

// Deliberately NOT formatDate: that one renders en-US ("January 5, 2026") for the UI, and a
// persisted German record must not carry an English date, nor change shape with the UI language.
// 05.01.2026 with an explicit de-DE locale, independent of the runtime's default.
const datumDe = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// A single value the way the reviewer saw it on screen. Money, percentages and dates are formatted
// rather than dumped raw, so the line in the history matches what was actually in the field instead
// of forcing the reader to translate "1190" back into "1.190,00 €". Returns null for "no value",
// which zuordnungLabelDe renders as a removal.
export function fieldValueDe(field: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (GELD_FIELDS.has(field)) return formatEUR(value);
    if (field === "vat_rate" || field === "vat_deductible_pct") return `${formatNumber(value)} %`;
    return formatNumber(value);
  }
  const s = String(value).trim();
  if (s === "") return null;
  if (DATUM_FIELDS.has(field)) {
    // An unparseable date is kept verbatim rather than swallowed: the history has to record what
    // was actually stored, even when what was stored is junk.
    const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
    return Number.isNaN(d.getTime()) ? s : datumDe.format(d);
  }
  return s;
}

// "Betrag brutto: 1.190,00 € → 1.250,00 €", or "Objekt entfernt (war: OBJ-01)" when cleared.
// `anzeige` lets the caller substitute a resolved name for a bare key (a supplier id is meaningless
// in a history line, the supplier's name is the point).
export function fieldChangeDe(
  field: string,
  alt: unknown,
  next: unknown,
  display?: (value: unknown) => string | null,
): string {
  const value = (v: unknown) => (display ? display(v) : fieldValueDe(field, v));
  return assignmentLabelDe(FIELD_LABEL_DE[field] ?? field, value(alt), value(next));
}

// Eingangskanal label text via i18n key `documents.kanal.<value>` (see KanalBadge).

// ---- BANKSapi bank reconciliation (Phase 1) ----

// Signed amount: positive gets an explicit "+" so incoming vs outgoing reads at a glance.
export function formatSignedEUR(value: number | null | undefined): string {
  const v = value ?? 0;
  const s = formatEUR(Math.abs(v));
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : s;
}

// Bank-transaction direction (generated `richtung` column).
export const DIRECTION_META = new Map<string, { label: string; cls: string }>([
  ["ausgehend", { label: "Ausgehend", cls: "bg-muted text-muted-foreground border-transparent" }],
  ["eingehend", { label: "Eingehend", cls: "bg-emerald-100 text-emerald-800 border-transparent" }],
]);

export function directionLabel(direction: string | null | undefined): string {
  if (!direction) return "—";
  return DIRECTION_META.get(direction)?.label ?? direction;
}

// Movement type (transaction_type column, migration 0023). Colors carry the handling: amber for
// the two that still need work (a transfer awaiting approval, a card debit awaiting its split),
// neutral for the ones that are already settled, and a visible amber-free grey for "unbekannt"
// so an unclassified movement reads as missing information rather than as a category.
// COLOURS THAT ARE NOT ALREADY SPOKEN FOR ON THIS ROW.
//
// A transaction row wears three chips, and each one has to answer a different question at a
// glance: which rail the money came down (Bank sky, Pleo violet), whether the line still needs
// work (Vorschlag amber, Zugeordnet emerald), and what kind of movement it was. Those first four
// hues are therefore reserved -- reusing one here is how a reader ends up reading "Lastschrift" as
// "this came from the bank feed", which is a different claim entirely.
//
// So the movement types take the hues nothing else on the row uses: teal, orange, indigo, fuchsia,
// lime. Red is off the table everywhere -- on a screen full of money it reads as an error or an
// overdraft, and none of these is either. "Nicht klassifiziert" stays muted on purpose: it is an
// absence, and a colour would make a gap look like a category.
export const TRANSACTION_TYPE_META = new Map<string, { label: string; cls: string }>([
  ["ueberweisung", { label: "Überweisung", cls: "bg-teal-100 text-teal-800 border-transparent" }],
  [
    "lastschrift",
    { label: "Lastschrift", cls: "bg-orange-100 text-orange-800 border-transparent" },
  ],
  [
    "kreditkarte",
    { label: "Kreditkartenabbuchung", cls: "bg-indigo-100 text-indigo-800 border-transparent" },
  ],
  [
    "kartenzahlung",
    { label: "Kartenzahlung", cls: "bg-fuchsia-100 text-fuchsia-800 border-transparent" },
  ],
  ["gutschrift", { label: "Gutschrift", cls: "bg-lime-100 text-lime-800 border-transparent" }],
  [
    "unbekannt",
    { label: "Nicht klassifiziert", cls: "bg-muted text-muted-foreground border-transparent" },
  ],
]);

export function transactionTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return TRANSACTION_TYPE_META.get(type)?.label ?? type;
}

export const TXN_SOURCE_META: Record<string, { label: string; cls: string }> = {
  banksapi: { label: "Bank", cls: "bg-sky-100 text-sky-800 border-transparent" },
  pleo: { label: "Pleo", cls: "bg-violet-100 text-violet-800 border-transparent" },
  manual: { label: "Manuell", cls: "bg-muted text-muted-foreground border-transparent" },
};

export function txnSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return TXN_SOURCE_META[source]?.label ?? source;
}

// Match status of a beleg↔transaction link.
export const MATCH_STATUS_META: Record<string, { label: string; cls: string }> = {
  candidate: { label: "Vorschlag", cls: "bg-amber-100 text-amber-800 border-transparent" },
  auto: { label: "Auto-Abgleich", cls: "bg-sky-100 text-sky-800 border-transparent" },
  confirmed: { label: "Bestätigt", cls: "bg-emerald-100 text-emerald-800 border-transparent" },
  rejected: { label: "Abgelehnt", cls: "bg-muted text-muted-foreground border-transparent" },
};

export function matchStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return MATCH_STATUS_META[status]?.label ?? status;
}

// Transaction reconciliation state (matching_status column).
export const TXN_MATCHING_STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Offen", cls: "bg-muted text-muted-foreground border-transparent" },
  suggestion: {
    label: "Vorschlag prüfen",
    cls: "bg-amber-100 text-amber-800 border-transparent",
  },
  matched: { label: "Zugeordnet", cls: "bg-emerald-100 text-emerald-800 border-transparent" },
  ignored: { label: "Ignoriert", cls: "bg-muted text-muted-foreground border-transparent" },
};

export function txnMatchingLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return TXN_MATCHING_STATUS_META[status]?.label ?? status;
}

// Derived per-beleg reconciliation summary (computed from confirmed matches).
export const RECONCILIATION_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Nicht abgeglichen", cls: "bg-muted text-muted-foreground border-transparent" },
  // A match is waiting to be confirmed. Its own state, because "nothing matched yet" and "a
  // transaction is sitting there waiting for you to say yes" call for opposite responses, and the
  // header used to show both as the same grey "Nicht abgeglichen".
  // Amber, because that is what a pending suggestion wears in the invoice TABLE (BankMatchBadge).
  // The detail page had it in sky and the list in amber, so the same invoice changed colour on the
  // way from the row to the page that row opens -- and colour is the whole point of these chips.
  suggested: {
    label: "Vorschlag offen",
    cls: "bg-amber-100 text-amber-800 border-transparent",
  },
  // Sky, vacated by 'suggested' above. Partial coverage exists only here (the table's badge
  // reports match PRESENCE, so it has no partial state to clash with), and it must stay
  // distinguishable from the suggestion state -- two amber chips reading "Vorschlag offen" and
  // "Teilweise" would make the colour carry no information at all.
  partial: { label: "Teilweise", cls: "bg-sky-100 text-sky-800 border-transparent" },
  reconciled: { label: "Abgeglichen", cls: "bg-emerald-100 text-emerald-800 border-transparent" },
};

// brutto = beleg gross amount; matchedSum = sum of confirmed matched transaction amounts.
// How far BELOW the gross a payment may land and still close the invoice (Appendix A8 discount
// tolerance: invoice 1.000, paid 980). German Skonto is typically 2% and occasionally 3%, so 3%
// covers the real cases; the absolute cap stops the percentage from writing off a large sum on a
// big invoice. Mirrors public.payment_tolerance() in migration 0024 — keep the two in step.
export function paymentTolerance(gross: number | null | undefined): number {
  return Math.min(Math.max(Math.abs(gross ?? 0) * 0.03, 0.01), 150);
}

// Is this invoice fully settled by the amounts matched to it?
//
// THE SINGLE coverage test for the front end. Everything that asks "is this still an open item"
// must go through here, so the invoice list, the reconciliation badge and the paid display can
// never disagree with each other or with the database.
//
// Compared in whole cents on purpose. Postgres evaluates the same rule in `numeric`, which is exact
// decimal, while IEEE754 makes 0.10 - 0.01 into 0.09000000000000001. Comparing floats directly left
// a 10-cent invoice paid with 9 cents looking open in the browser while the trigger had already
// marked it paid. An OVERPAYMENT counts as covered: more money than owed arrived, so nothing is open.
function cents(value: number): number {
  return Math.round(value * 100);
}

export function isFullyCovered(gross: number | null | undefined, matchedSum: number): boolean {
  const owed = Math.abs(gross ?? 0);
  if (owed <= 0) return false; // no gross amount to measure against, so never judged covered
  return cents(matchedSum) >= cents(owed) - cents(paymentTolerance(owed));
}

// How much of an invoice counts as "covered" for open-item / Cost Analysis purposes: the real
// bank-matched sum, OR the full gross amount when it's already considered paid outside of
// matching — a human explicitly marked it paid (invoices.paid_source='manual') or an outgoing
// invoice's own status says so (status='paidoff') — because some payments (cash, a
// channel with no bank feed) never produce a matchable transaction at all. Bank-matched coverage
// already implies paid_at/status agree, so this never UNDER-counts an already-covered
// invoice; it only closes the gap for one that will never get a real match.
export function coveredAmount(
  amountGross: number | null | undefined,
  matchedSum: number,
  consideredPaid: boolean,
): number {
  return consideredPaid ? Math.abs(amountGross ?? 0) : matchedSum;
}

// ---- Dates the way the office experiences them ----

/**
 * Today, in the LOCAL timezone, as an ISO date.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC day, and the app runs in Europe/Berlin
 * (UTC+1/+2). Between local midnight and 01:00 or 02:00 that string is still YESTERDAY, so an
 * invoice that fell due at midnight was not flagged overdue for the first hour or two of the day.
 * `en-CA` is the shortest way to a YYYY-MM-DD in local time.
 */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Whole days between an ISO date and today, local time. Negative for a date in the future.
 *
 * Compared at UTC midnight on both sides on purpose: the inputs are plain dates with no time of
 * day, so the difference has to be a whole number of days regardless of when in the day it is
 * asked, and regardless of a daylight-saving change in between.
 */
export const DUE_BUCKETS = [
  "overdue",
  "today",
  "within_3_days",
  "within_week",
  "later",
  "unknown",
] as const;

export type DueBucket = (typeof DUE_BUCKETS)[number];

/** The bands a person would call urgent, worst first. */
export const URGENT_DUE_BUCKETS: DueBucket[] = ["overdue", "today", "within_3_days"];

/**
 * Deep links minted before these values were renamed still carry the old German ones. Accepting
 * them keeps every shared or bookmarked link working; nothing emits them any more.
 */
const LEGACY_DUE_BUCKETS = new Map<string, DueBucket>([
  ["ueberfaellig", "overdue"],
  ["heute", "today"],
  ["drei-tage", "within_3_days"],
  ["woche", "within_week"],
  ["spaeter", "later"],
  ["unbekannt", "unknown"],
]);

export function isDueBucket(value: unknown): value is DueBucket {
  return (DUE_BUCKETS as readonly unknown[]).includes(value);
}

/** A bucket from a URL parameter, accepting the retired German spellings. */
export function toDueBucket(value: unknown): DueBucket | undefined {
  if (isDueBucket(value)) return value;
  return typeof value === "string" ? LEGACY_DUE_BUCKETS.get(value) : undefined;
}

export function dueBucket(
  dueDate: string | null | undefined,
  today: string = todayLocal(),
): DueBucket {
  const date = (dueDate ?? "").slice(0, 10);
  if (!date) return "unknown";
  if (date < today) return "overdue";
  if (date === today) return "today";
  // Day counts, not milliseconds: both sides are plain dates, and a timezone-shifted "now" must
  // not move an invoice between bands depending on when the page is opened.
  const days = daysUntil(date, today);
  if (days == null) return "unknown";
  if (days <= 3) return "within_3_days";
  if (days <= 7) return "within_week";
  return "later";
}

// `due_now` spans overdue and today: that is the band a payment list is worked from.
export const DUE_FILTER_VALUES = ["due_now", ...DUE_BUCKETS] as const;

export type DueFilter = (typeof DUE_FILTER_VALUES)[number];

export function isDueFilter(value: unknown): value is DueFilter {
  return (DUE_FILTER_VALUES as readonly unknown[]).includes(value);
}

export function toDueFilter(value: unknown): DueFilter | undefined {
  if (isDueFilter(value)) return value;
  return typeof value === "string" ? LEGACY_DUE_BUCKETS.get(value) : undefined;
}

// Resolved here, not in SQL: the list query and the invoices_kpis RPC must apply one definition,
// and `today` has to be the local day (heuteLokal), not the database server's.
export function dueFilterRange(
  value: DueFilter,
  today: string = todayLocal(),
): { fromDate?: string; toDate?: string; unknown?: boolean } {
  const plus = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  switch (value) {
    case "due_now":
      return { toDate: today };
    case "overdue":
      return { toDate: plus(-1) };
    case "today":
      return { fromDate: today, toDate: today };
    case "within_3_days":
      return { fromDate: plus(1), toDate: plus(3) };
    case "within_week":
      return { fromDate: plus(4), toDate: plus(7) };
    case "later":
      return { fromDate: plus(8) };
    case "unknown":
      return { unknown: true };
  }
}

export type DiscountState = "open" | "closing" | "lapsed";

export interface DiscountOpportunity {
  state: DiscountState;
  deadline: string;
  percent: number | null;
  reducedAmount: number | null;
  saving: number | null;
  days: number;
}

export const DISCOUNT_CLOSING_DAYS = 3;

export function discountOpportunity(
  row: {
    early_payment_deadline?: string | null;
    early_payment_discount_percent?: number | null;
    early_payment_discount_amount?: number | null;
    amount_gross?: number | null;
    paid_at?: string | null;
  },
  today: string = todayLocal(),
): DiscountOpportunity | null {
  const deadline = (row.early_payment_deadline ?? "").slice(0, 10);
  if (!deadline || row.paid_at) return null;

  const days = daysUntil(deadline, today);
  if (days == null) return null;

  const gross = Math.abs(row.amount_gross ?? 0);
  const reduced = row.early_payment_discount_amount;
  const percent = row.early_payment_discount_percent ?? null;
  const saving =
    reduced != null && gross > 0
      ? Math.max(gross - Math.abs(reduced), 0)
      : percent != null && gross > 0
        ? (gross * percent) / 100
        : null;

  return {
    state: days < 0 ? "lapsed" : days <= DISCOUNT_CLOSING_DAYS ? "closing" : "open",
    deadline,
    percent,
    reducedAmount: reduced ?? null,
    saving,
    days,
  };
}

/** Whole days from `today` forward to `date`; negative once the date has passed. */
export function daysUntil(date: string | null | undefined, today = todayLocal()): number | null {
  const since = daysSince(date, today);
  return since == null ? null : -since;
}

export function daysSince(datum: string | null | undefined, today = todayLocal()): number | null {
  if (!datum) return null;
  const then = Date.parse(`${datum.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((now - then) / 86_400_000);
}

export type MatchingStatus = "open" | "suggested" | "partial" | "reconciled";

/**
 * Where this invoice stands against the bank.
 *
 * `matchedSum` counts CONFIRMED links only, so an unconfirmed suggestion contributes nothing to it
 * and would otherwise read as "not reconciled". `hatVorschlag` is the missing third state: someone
 * has to look at it, which is the opposite of the "nothing to do yet" the grey badge implied.
 * Optional, so callers that genuinely only know the confirmed sum keep their old behaviour.
 */
export function matchingStatus(
  gross: number | null | undefined,
  matchedSum: number,
  hatSuggestion = false,
  restWrittenOff = false,
): MatchingStatus {
  if (matchedSum <= 0) return hatSuggestion ? "suggested" : "open";
  if (isFullyCovered(gross, matchedSum)) return "reconciled";
  // A remainder somebody wrote off is not a gap that is still being worked on. Without this the
  // invoice reads "Teilweise ... 92,86 EUR offen" for good, next to a workflow that says paid and
  // a card that says the rest is written off. It needs a confirmed allocation to say this: an
  // invoice paid by hand with no bank match behind it has nothing to be reconciled against.
  if (restWrittenOff) return "reconciled";
  return "partial";
}

/** A link that is neither confirmed nor rejected: it is waiting on a person. */
export function isOpenSuggestion(status: string | null | undefined): boolean {
  return status === "candidate" || status === "auto";
}

// Human labels for bank_sync_logs events.
export const SYNC_EVENT_LABELS: Record<string, string> = {
  sync_started: "Sync gestartet",
  accounts_fetched: "Konten geladen",
  transactions_fetched: "Umsätze geladen",
  match_run: "Abgleich durchgeführt",
  sync_finished: "Sync abgeschlossen",
  error: "Fehler",
};

export function syncEventLabel(event: string | null | undefined): string {
  if (!event) return "—";
  return SYNC_EVENT_LABELS[event] ?? event;
}

/**
 * Does this outgoing invoice count as real revenue?
 *
 * A cancelled ("voided" -> "Storniert") or not-yet-issued ("draft" -> "Entwurf") voucher is not
 * money the company is owed or has received. The customer list and the customer detail page both
 * used to sum EVERY outgoing invoice with no status check at all, so a cancellation inflated a
 * customer's revenue exactly as much as a real invoice did. Reproduced on Immonetz DEV: one real
 * 1.000,00 EUR invoice plus a 500,00 EUR cancellation and a 250,00 EUR draft rendered as
 * "3 Rechnungen / 1.750,00 EUR" -- a 75% overstatement, on the same table that labelled those two
 * rows "Storniert" and "Entwurf" one column over.
 *
 * The documents themselves are still listed; only the totals are filtered.
 */
export function countsAlsRevenue(status: string | null | undefined): boolean {
  return status !== "voided" && status !== "draft";
}

/**
 * Is this outgoing invoice overdue?
 *
 * The rule (open + has a due date + due date in the past) was written out independently in the
 * Kunden list's "Überfällig" column and in OutgoingStatusBadge, with nothing keeping them in sync.
 * Both now call this, so a future change to the definition -- a grace period, a different status --
 * lands in one place instead of silently disagreeing across screens.
 *
 * `today` is passed in rather than computed here so callers inside a useMemo keep a stable
 * dependency instead of re-deriving a new date string on every render.
 */
export function isOverdue(
  status: string | null | undefined,
  dueDate: string | null | undefined,
  today: string,
): boolean {
  return status === "open" && !!dueDate && dueDate < today;
}

/**
 * A human-readable message for anything thrown.
 *
 * `e instanceof Error ? e.message : String(e)` was written out at ~90 call sites per Hub, and it is
 * wrong for the error type this app throws most: Supabase/PostgREST rejects with a plain object
 * ({ message, details, hint, code }), which is not an Error, so `String(e)` produced the literal
 * text "[object Object]". Seen live on Eiffler's Kunden screen, where a failed save reported
 * "Anlegen fehlgeschlagen: [object Object]" while the real cause (a 403 from a missing RLS insert
 * policy) was only visible in the network tab.
 *
 * Order matters: check for a `message` property before falling back, since PostgrestError carries
 * one without being an Error. `details` is appended when it says something the message does not,
 * because for constraint violations that is usually the part naming the actual column.
 */
export function errorText(e: unknown): string {
  if (e == null) return "Unbekannter Fehler";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;

  if (typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof o.message === "string" ? o.message.trim() : "";
    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";

    const parts = [message, details && details !== message ? details : "", hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
    // Nothing readable on the object itself: show the code rather than "[object Object]", and as a
    // last resort the serialised object, which at least tells someone what to search for.
    if (code) return `Fehler ${code}`;
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch {
      /* circular or otherwise unserialisable — fall through */
    }
  }
  return String(e);
}
