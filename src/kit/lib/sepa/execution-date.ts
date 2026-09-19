import type { ExecutionDateRule } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(toUtc(value).getTime());
}

export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function settlementClosingDays(year: number): string[] {
  const easter = easterSunday(year);
  return [
    `${year}-01-01`,
    addDays(easter, -2),
    addDays(easter, 1),
    `${year}-05-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
}

export function isBusinessDay(iso: string, extraClosingDays: readonly string[] = []): boolean {
  const weekday = toUtc(iso).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (extraClosingDays.includes(iso)) return false;
  return !settlementClosingDays(Number(iso.slice(0, 4))).includes(iso);
}

export function nextBusinessDay(iso: string, extraClosingDays: readonly string[] = []): string {
  let candidate = iso;
  for (let step = 0; step < 14; step += 1) {
    if (isBusinessDay(candidate, extraClosingDays)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export interface ResolvedExecutionDate {
  date: string;
  moved: boolean;
}

export function resolveExecutionDate(
  rule: ExecutionDateRule,
  today: string,
  dueDate: string | null | undefined,
  extraClosingDays: readonly string[] = [],
): ResolvedExecutionDate {
  const requested = rule === "on_due_date" && isIsoDate(dueDate) ? dueDate : today;
  const notInThePast = requested < today ? today : requested;
  const date = nextBusinessDay(notInThePast, extraClosingDays);
  return { date, moved: date !== requested };
}
