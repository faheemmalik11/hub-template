import type { ColumnMapping, NormalizedRow, NormalizeResult, ParsedTable } from "./types";

export function parseFlexibleDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const german = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (german) {
    const [, d, m, yRaw] = german;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

export function parseFlexibleAmount(value: string): number | null {
  let v = value.trim();
  if (!v) return null;

  const trailingMinus = /-\s*$/.test(v);
  v = v.replace(/[^\d,.-]/g, "");

  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  if (hasComma && hasDot) {
    v =
      v.lastIndexOf(",") > v.lastIndexOf(".")
        ? v.replace(/\./g, "").replace(",", ".")
        : v.replace(/,/g, "");
  } else if (hasComma) {
    v = v.replace(",", ".");
  }

  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return trailingMinus && n > 0 ? -n : n;
}

function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  return (row[header] ?? "").trim();
}

export function normalizeTable(table: ParsedTable, mapping: ColumnMapping): NormalizeResult {
  const rows: NormalizedRow[] = [];
  const issues: NormalizeResult["issues"] = [];

  table.rows.forEach((row, rowIndex) => {
    const bookingDateRaw = cell(row, mapping.booking_date);
    const bookingDate = parseFlexibleDate(bookingDateRaw);
    if (!bookingDate) {
      issues.push({ rowIndex, code: "missing_booking_date", rawValue: bookingDateRaw });
      return;
    }

    let amount: number | null;
    if (mapping.amountDebit || mapping.amountCredit) {
      const debit = parseFlexibleAmount(cell(row, mapping.amountDebit)) ?? 0;
      const credit = parseFlexibleAmount(cell(row, mapping.amountCredit)) ?? 0;
      amount = credit - Math.abs(debit);
      if (debit === 0 && credit === 0) amount = null;
    } else {
      amount = parseFlexibleAmount(cell(row, mapping.amount));
    }
    if (amount === null) {
      issues.push({ rowIndex, code: "missing_amount", rawValue: cell(row, mapping.amount) });
      return;
    }

    rows.push({
      booking_date: bookingDate,
      value_date: parseFlexibleDate(cell(row, mapping.value_date)),
      amount,
      currency: cell(row, mapping.currency) || null,
      counterparty_holder: cell(row, mapping.counterparty_holder) || null,
      counterparty_iban: cell(row, mapping.counterparty_iban).replace(/\s+/g, "") || null,
      payment_reference: cell(row, mapping.payment_reference) || null,
      booking_text: cell(row, mapping.booking_text) || null,
      provider_ref: null,
    });
  });

  return { rows, issues };
}
