import { parseCsvFile } from "./csv";
import { parseXlsxFile } from "./xlsx";
import type { ParsedTable } from "./types";

// "pdf" is detected here but NOT parsed by this module — it has no column structure to map, so
// the upload step sends it to the AI extraction server function instead (see
// bank-statement-ai.functions.ts) and skips straight to the preview step, same as the CAMT.053
// XML path is planned to once it exists.
export type DetectedFormat = "csv" | "xlsx" | "pdf";

/**
 * By extension, not content-sniffing — good enough since the user explicitly picks the file and
 * sees a preview before anything is imported. XML (CAMT.053) is intentionally not handled yet;
 * see docs/BANK_MANUAL_IMPORT.md for why it's a fast-follow.
 */
export function detectFormat(file: File): DetectedFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".pdf")) return "pdf";
  return null;
}

/** CSV/XLSX only — the caller is expected to route "pdf" to the AI extraction path instead. */
export async function parseBankFile(
  file: File,
): Promise<{ format: "csv" | "xlsx"; table: ParsedTable }> {
  const format = detectFormat(file);
  if (format !== "csv" && format !== "xlsx") {
    throw new Error(
      "Dateiformat wird nicht unterstützt. Bitte CSV, Excel (.xlsx) oder PDF hochladen — XML-Import (CAMT.053) folgt in einer späteren Version.",
    );
  }
  const table = format === "csv" ? await parseCsvFile(file) : await parseXlsxFile(file);
  if (table.headers.length === 0 || table.rows.length === 0) {
    throw new Error("Die Datei enthält keine erkennbaren Spalten oder Zeilen.");
  }
  return { format, table };
}
