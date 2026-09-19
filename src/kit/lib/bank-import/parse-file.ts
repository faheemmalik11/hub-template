import { parseCsvFile } from "./csv";
import { parseXlsxFile } from "./xlsx";
import type { ParsedTable } from "./types";

export type DetectedFormat = "csv" | "xlsx" | "pdf" | null;

export function detectFormat(file: File): DetectedFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".pdf")) return "pdf";
  return null;
}

export async function parseBankFile(
  file: File,
): Promise<{ format: "csv" | "xlsx"; table: ParsedTable }> {
  const format = detectFormat(file);
  if (format !== "csv" && format !== "xlsx") {
    throw new Error("Unsupported file format. Upload a CSV or Excel (.xlsx) file.");
  }
  const table = format === "csv" ? await parseCsvFile(file) : await parseXlsxFile(file);
  if (table.headers.length === 0 || table.rows.length === 0) {
    throw new Error("The file has no recognizable columns or rows.");
  }
  return { format, table };
}
