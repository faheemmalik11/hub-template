const BOM = "﻿";

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? formatCsvNumber(value) : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatCsvNumber(value: number): string {
  return Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const withBom = content.startsWith(BOM) ? content : BOM + content;
  const blob = new Blob([withBom], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
