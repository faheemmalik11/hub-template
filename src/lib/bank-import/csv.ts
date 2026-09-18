import Papa from "papaparse";
import type { ParsedTable } from "./types";

/**
 * Parse a CSV file into a header row + string-keyed rows. Delimiter is auto-detected (German
 * bank exports mix "," and ";"), header row is required (banks always export one).
 */
export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  // Papa reports genuinely fatal errors (e.g. unclosed quote) via result.errors, not by throwing.
  const fatal = result.errors.find((e) => e.type !== "FieldMismatch");
  if (fatal) {
    throw new Error(
      `CSV konnte nicht gelesen werden: ${fatal.message} (Zeile ${(fatal.row ?? 0) + 2})`,
    );
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
