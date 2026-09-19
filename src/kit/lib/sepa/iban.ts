const IBAN_STRUCTURE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

export const DEFAULT_SEPA_COUNTRIES: readonly string[] = [
  "AD",
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "SM",
  "VA",
];

export function normalizeIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/\s/g, "").toUpperCase();
}

export function ibanCountry(iban: string | null | undefined): string {
  return normalizeIban(iban).slice(0, 2);
}

export function isIbanValid(iban: string | null | undefined): boolean {
  const candidate = normalizeIban(iban);
  if (!IBAN_STRUCTURE.test(candidate)) return false;

  const rearranged = candidate.slice(4) + candidate.slice(0, 4);
  let expanded = "";
  for (const character of rearranged) {
    const value = parseInt(character, 36);
    if (Number.isNaN(value)) return false;
    expanded += String(value);
  }
  return BigInt(expanded) % 97n === 1n;
}

export function isSepaIban(
  iban: string | null | undefined,
  countries: readonly string[] = DEFAULT_SEPA_COUNTRIES,
): boolean {
  return countries.includes(ibanCountry(iban));
}

export function formatIban(iban: string | null | undefined, placeholder = "—"): string {
  const candidate = normalizeIban(iban);
  if (!candidate) return placeholder;
  return candidate.replace(/(.{4})/g, "$1 ").trim();
}
