export const SCHEME_MAXIMUM_CENTS = 99_999_999_999;

export function toCents(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function hasSubCentPrecision(value: number | null | undefined): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) > 1e-9;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, one) => total + one, 0);
}

export function centsToAmount(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const euros = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${euros}.${String(remainder).padStart(2, "0")}`;
}

export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}
