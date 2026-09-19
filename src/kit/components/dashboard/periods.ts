export const OVERVIEW_PERIODS = [
  "all",
  "custom",
  "last30Days",
  "currentMonth",
  "lastMonth",
  "last6Months",
  "last12Months",
  "currentYear",
  "lastYear",
] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const OVERVIEW_PERIOD_DEFAULT: OverviewPeriod = "last30Days";

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return (OVERVIEW_PERIODS as readonly unknown[]).includes(value);
}

export interface PeriodRange {
  from: string | null;
  to: string | null;
}

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function overviewPeriodRange(
  period: OverviewPeriod,
  today: Date = new Date(),
  custom?: { from?: string | null; to?: string | null },
): PeriodRange {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (period) {
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: custom?.from || null, to: custom?.to || null };
    case "last30Days": {
      const to = new Date(year, month, today.getDate());
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "currentMonth":
      return {
        from: toIsoDate(new Date(year, month, 1)),
        to: toIsoDate(new Date(year, month + 1, 0)),
      };
    case "lastMonth":
      return {
        from: toIsoDate(new Date(year, month - 1, 1)),
        to: toIsoDate(new Date(year, month, 0)),
      };
    case "last6Months":
      return {
        from: toIsoDate(new Date(year, month - 5, 1)),
        to: toIsoDate(new Date(year, month + 1, 0)),
      };
    case "last12Months":
      return {
        from: toIsoDate(new Date(year, month - 11, 1)),
        to: toIsoDate(new Date(year, month + 1, 0)),
      };
    case "currentYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}

export function previousPeriodRange(range: PeriodRange): PeriodRange {
  if (!range.from || !range.to) return { from: null, to: null };
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { from: null, to: null };
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * 86_400_000);
  const toUtcIso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: toUtcIso(previousFrom), to: toUtcIso(previousTo) };
}
