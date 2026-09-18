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
  von: string | null;
  bis: string | null;
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
  custom?: { von?: string | null; bis?: string | null },
): PeriodRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (period) {
    case "alle":
      return { von: null, bis: null };
    // An open end is legitimate: "everything since 1 March" is a question people ask. Only a range
    // with neither bound set falls back, because that is indistinguishable from no filter.
    case "benutzerdefiniert":
      return { von: custom?.von || null, bis: custom?.bis || null };
    case "letzte-30-tage": {
      const bis = new Date(y, m, today.getDate());
      const von = new Date(bis);
      von.setDate(von.getDate() - 29);
      return { von: iso(von), bis: iso(bis) };
    }
    case "aktueller-monat":
      return { von: iso(new Date(y, m, 1)), bis: iso(new Date(y, m + 1, 0)) };
    case "letzter-monat":
      return { von: iso(new Date(y, m - 1, 1)), bis: iso(new Date(y, m, 0)) };
    // Whole months, the current one and the five before it. A rolling "180 days" would cut two
    // months in half, and the label names months.
    case "letzte-6-monate":
      return { von: iso(new Date(y, m - 5, 1)), bis: iso(new Date(y, m + 1, 0)) };
    case "letzte-12-monate":
      return { von: iso(new Date(y, m - 11, 1)), bis: iso(new Date(y, m + 1, 0)) };
    case "aktuelles-jahr":
      return { von: `${y}-01-01`, bis: `${y}-12-31` };
    case "letztes-jahr":
      return { von: `${y - 1}-01-01`, bis: `${y - 1}-12-31` };
  }
}

/**
 * The equivalent stretch immediately before a range, for "vs the period before" deltas. Measured
 * in days and shifted back by exactly that many, so February against January cannot read as a drop
 * caused by the calendar alone. An open-ended range has no length, so it has no previous period.
 */
export function previousPeriodRange(range: PeriodRange): PeriodRange {
  if (!range.von || !range.bis) return { von: null, bis: null };
  const von = new Date(`${range.von}T00:00:00Z`);
  const bis = new Date(`${range.bis}T00:00:00Z`);
  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) return { von: null, bis: null };
  const tage = Math.round((bis.getTime() - von.getTime()) / 86_400_000) + 1;
  const vorherBis = new Date(von.getTime() - 86_400_000);
  const vorherVon = new Date(vorherBis.getTime() - (tage - 1) * 86_400_000);
  const utcIso = (d: Date) => d.toISOString().slice(0, 10);
  return { von: utcIso(vorherVon), bis: utcIso(vorherBis) };
}
