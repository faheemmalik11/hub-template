import * as XLSX from "xlsx";
import type { ParsedTable } from "./types";

export async function parseXlsxFile(file: File): Promise<ParsedTable> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The Excel file has no sheets.");
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headerRowIndex = matrix.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (headerRowIndex === -1) throw new Error("The Excel file has no data.");

  const headers = matrix[headerRowIndex].map((cell) => String(cell ?? "").trim());
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        record[header] = String(row[i] ?? "").trim();
      });
      return record;
    });

  return { headers, rows };
}
