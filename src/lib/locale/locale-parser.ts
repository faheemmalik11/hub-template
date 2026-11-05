export interface LocaleSettings {
  dateFormat: "dd.MM.yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  decimalSeparator: "," | ".";
  currency: string;
}

export interface ILocaleParser {
  parseDate(value: string): string | null;
  parseAmount(value: string): number | null;
  formatCurrency(value: number): string;
}

function parseDateBySettings(value: string, format: LocaleSettings["dateFormat"]): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  if (format === "dd.MM.yyyy") {
    const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (!match) return null;
    const [, day, month, yearRaw] = match;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${year}-${mm}-${dd}`;
  }

  if (format === "MM/dd/yyyy") {
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return null;
    const [, month, day, yearRaw] = match;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${year}-${mm}-${dd}`;
  }

  return null;
}

function parseAmountBySettings(
  value: string,
  decimalSeparator: LocaleSettings["decimalSeparator"],
): number | null {
  let text = value.trim();
  if (!text) return null;

  const trailingMinus = /-\s*$/.test(text);
  text = text.replace(/[^\d,.-]/g, "");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    text =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (decimalSeparator === "," && hasComma) {
    text = text.replace(",", ".");
  } else if (decimalSeparator === "," && hasDot) {
    text = text.replace(/\./g, "");
  }

  const result = Number(text);
  if (!Number.isFinite(result)) return null;
  return trailingMinus && result > 0 ? -result : result;
}

function intlTagFor(settings: LocaleSettings): string {
  if (settings.decimalSeparator === "," && settings.currency === "EUR") return "de-DE";
  if (settings.decimalSeparator === "." && settings.currency === "USD") return "en-US";
  return settings.decimalSeparator === "," ? "de-DE" : "en-US";
}

export function createLocaleParser(settings: LocaleSettings): ILocaleParser {
  const currencyFormatter = new Intl.NumberFormat(intlTagFor(settings), {
    style: "currency",
    currency: settings.currency,
  });

  return {
    parseDate(value) {
      return parseDateBySettings(value, settings.dateFormat);
    },
    parseAmount(value) {
      return parseAmountBySettings(value, settings.decimalSeparator);
    },
    formatCurrency(value) {
      return currencyFormatter.format(value);
    },
  };
}

export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  dateFormat: "dd.MM.yyyy",
  decimalSeparator: ",",
  currency: "EUR",
};
