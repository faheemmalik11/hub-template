import Papa from "papaparse";
import type { ParsedTable } from "./types";

export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  const fatal = result.errors.find((e) => e.type !== "FieldMismatch");
  if (fatal) {
    throw new Error(`Could not read the CSV file: ${fatal.message} (row ${(fatal.row ?? 0) + 2})`);
  }

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}

export async function parseCsvFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  return parseCsv(text);
}
