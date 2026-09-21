// CSV export and prior-period comparison for the Cost Analysis (BWA) screen.
//
// Both are pure helpers with no React and no Supabase, so the three Hubs that carry this screen
// (Immonetz, this client, Eiffler /buchhaltung) can hold byte-identical copies and cannot drift on the one
// thing the client actually checks — the numbers.
//
// CSV dialect is deliberately the German-Excel one: semicolon separator, comma decimal, UTF-8 BOM.
// Excel on a German locale opens a comma-separated file with every row crammed into column A, and
// writes 1.234,56 rather than 1234.56 — a "correct" RFC 4180 file is the one that arrives broken.

export interface CostAnalysisExportRow {
  key: string;
  label: string;
  kind: "line" | "subtotal";
  amount: number;
  // Prior-period figure, when a comparison period is active.
  compareAmount?: number | null;
}

export interface CostAnalysisExportMeta {
  // Human-readable filter state, already localized by the caller — the export has to record what
  // the numbers were filtered by, or a saved file is unattributable a week later.
  filters: { label: string; value: string }[];
  generatedAt: Date;
  compareLabel?: string | null;
}

function csvCell(value: string): string {
  // Quote when the value carries a delimiter, a quote or a newline; double any embedded quote.
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  // Fixed 2 decimals with a comma separator and NO thousands separator: a thousands dot would need
  // quoting and gives Excel a second chance to misread the number as text.
  return value.toFixed(2).replace(".", ",");
}

/**
 * Render the P&L skeleton as a German-Excel CSV, with the active filters recorded above the table.
 */
export function buildCostAnalysisCsv(
  rows: CostAnalysisExportRow[],
  meta: CostAnalysisExportMeta,
): string {
  const lines: string[] = [];

  for (const f of meta.filters) {
    lines.push([csvCell(f.label), csvCell(f.value)].join(";"));
  }
  // Zero-padded: toLocaleString("de-DE") renders 19.8.2026, which sorts and reads badly next to
  // the zero-padded dates everywhere else in the app.
  const d = meta.generatedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  lines.push([csvCell("Exportiert am"), csvCell(stamp)].join(";"));
  lines.push("");

  const hasCompare = rows.some((r) => r.compareAmount != null);
  const header = hasCompare
    ? [
        "Zeile",
        "Art",
        "Betrag (EUR)",
        `Vorperiode (EUR)${meta.compareLabel ? ` – ${meta.compareLabel}` : ""}`,
        "Differenz (EUR)",
      ]
    : ["Zeile", "Art", "Betrag (EUR)"];
  lines.push(header.map(csvCell).join(";"));

  for (const r of rows) {
    const base = [
      csvCell(r.label),
      csvCell(r.kind === "subtotal" ? "Zwischensumme" : "Position"),
      csvAmount(r.amount),
    ];
    if (hasCompare) {
      const delta = r.compareAmount == null ? null : r.amount - r.compareAmount;
      base.push(csvAmount(r.compareAmount), csvAmount(delta));
    }
    lines.push(base.join(";"));
  }

  // \r\n and a BOM: both are what Excel expects, and the BOM is what keeps "Umsatzerlöse" from
  // arriving as "UmsatzerlÃ¶se".
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * Trigger a client-side download of `content` as `filename`.
 *
 * Object URL rather than a data: URI — a full-year P&L with a drilldown comfortably exceeds the
 * length some browsers still cap data: URIs at, and revoking frees the blob immediately.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * The period immediately before the selected one, for the comparison column.
 *
 * Returns null when no meaningful predecessor exists ("all periods" has none). A custom range gets
 * the equally long window ending the day before it starts, which is the only defensible reading of
 * "the period before" for an arbitrary span.
 */
export function previousPeriodRange(
  period: string,
  fromDate: string,
  toDate: string,
): { fromDate: string; toDate: string; label: string } | null {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // The range values stay ISO (they are query bounds); only the LABEL is German, because it is the
  // one part of this that a person reads — an ISO date in a German column header is a bug.
  const de = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

  if (period.startsWith("jahr-")) {
    const y = Number(period.slice("jahr-".length)) - 1;
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31`, label: String(y) };
  }

  if (period.startsWith("quartal-")) {
    const [y, q] = period.slice("quartal-".length).split("-").map(Number);
    const prevQ = q === 1 ? 4 : q - 1;
    const prevY = q === 1 ? y - 1 : y;
    const startMonth = (prevQ - 1) * 3 + 1;
    const lastDay = new Date(prevY, startMonth + 2, 0).getDate();
    return {
      fromDate: `${prevY}-${String(startMonth).padStart(2, "0")}-01`,
      toDate: `${prevY}-${String(startMonth + 2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      label: `Q${prevQ} ${prevY}`,
    };
  }

  if (period.startsWith("monat-")) {
    const [y, m] = period.slice("monat-".length).split("-").map(Number);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const lastDay = new Date(prevY, prevM, 0).getDate();
    const mm = String(prevM).padStart(2, "0");
    return {
      fromDate: `${prevY}-${mm}-01`,
      toDate: `${prevY}-${mm}-${String(lastDay).padStart(2, "0")}`,
      label: `${mm}.${prevY}`,
    };
  }

  if (period === "individuell" && fromDate && toDate) {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    // Inclusive span, so a single day compares against the single day before it.
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
    return {
      fromDate: iso(prevStart),
      toDate: iso(prevEnd),
      label: `${de(prevStart)} – ${de(prevEnd)}`,
    };
  }

  return null;
}
