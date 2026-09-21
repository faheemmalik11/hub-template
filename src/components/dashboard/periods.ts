export const OVERVIEW_PERIODS = [
  "alle",
  "benutzerdefiniert",
  "letzte-30-tage",
  "aktueller-monat",
  "letzter-monat",
  "letzte-6-monate",
  "letzte-12-monate",
  "aktuelles-jahr",
  "letztes-jahr",
] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const OVERVIEW_PERIOD_DEFAULT: OverviewPeriod = "letzte-30-tage";

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return (OVERVIEW_PERIODS as readonly unknown[]).includes(value);
}

export interface PeriodRange {
  fromDate: string | null;
  toDate: string | null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Inclusive ISO range per period. Local dates: the columns this filters are plain dates, not
 * timestamps, and every value here (a month, a year) is a local calendar range.
 */
export function overviewPeriodRange(
  period: OverviewPeriod,
  today: Date = new Date(),
  custom?: { fromDate?: string | null; toDate?: string | null },
): PeriodRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (period) {
    case "alle":
      return { fromDate: null, toDate: null };
    // An open end is legitimate: "everything since 1 March" is a question people ask. Only a range
    // with neither bound set falls back, because that is indistinguishable from no filter.
    case "benutzerdefiniert":
      return { fromDate: custom?.fromDate || null, toDate: custom?.toDate || null };
    case "letzte-30-tage": {
      const toDate = new Date(y, m, today.getDate());
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 29);
      return { fromDate: iso(fromDate), toDate: iso(toDate) };
    }
    case "aktueller-monat":
      return { fromDate: iso(new Date(y, m, 1)), toDate: iso(new Date(y, m + 1, 0)) };
    case "letzter-monat":
      return { fromDate: iso(new Date(y, m - 1, 1)), toDate: iso(new Date(y, m, 0)) };
    // Whole months, the current one and the five before it. A rolling "180 days" would cut two
    // months in half, and the label names months.
    case "letzte-6-monate":
      return { fromDate: iso(new Date(y, m - 5, 1)), toDate: iso(new Date(y, m + 1, 0)) };
    case "letzte-12-monate":
      return { fromDate: iso(new Date(y, m - 11, 1)), toDate: iso(new Date(y, m + 1, 0)) };
    case "aktuelles-jahr":
      return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
    case "letztes-jahr":
      return { fromDate: `${y - 1}-01-01`, toDate: `${y - 1}-12-31` };
  }
}

/**
 * The equivalent stretch immediately before a range, for "vs the period before" deltas. Measured
 * in days and shifted back by exactly that many, so February against January cannot read as a drop
 * caused by the calendar alone. An open-ended range has no length, so it has no previous period.
 */
export function previousPeriodRange(range: PeriodRange): PeriodRange {
  if (!range.fromDate || !range.toDate) return { fromDate: null, toDate: null };
  const fromDate = new Date(`${range.fromDate}T00:00:00Z`);
  const toDate = new Date(`${range.toDate}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()))
    return { fromDate: null, toDate: null };
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const beforeToDate = new Date(fromDate.getTime() - 86_400_000);
  const beforeFromDate = new Date(beforeToDate.getTime() - (days - 1) * 86_400_000);
  const utcIso = (d: Date) => d.toISOString().slice(0, 10);
  return { fromDate: utcIso(beforeFromDate), toDate: utcIso(beforeToDate) };
}
