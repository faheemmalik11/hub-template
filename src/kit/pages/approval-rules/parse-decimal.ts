export function parseDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const groupingSeparator = decimalSeparator === "," ? "." : ",";

  const normalised = trimmed
    .split(groupingSeparator)
    .join("")
    .replace(decimalSeparator, ".")
    .replace(/[^0-9.-]/g, "");

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
