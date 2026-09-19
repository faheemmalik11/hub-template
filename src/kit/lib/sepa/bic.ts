import { ibanCountry } from "./iban";

const BIC_STRUCTURE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

const TERRITORIES_OF: Readonly<Record<string, readonly string[]>> = {
  FI: ["AX"],
  FR: ["GF", "GP", "MQ", "RE", "PF", "TF", "YT", "NC", "BL", "MF", "PM", "WF"],
  GB: ["IM", "JE", "GG"],
};

export function normalizeBic(bic: string | null | undefined): string {
  return (bic ?? "").replace(/\s/g, "").toUpperCase();
}

export function bicCountry(bic: string | null | undefined): string {
  return normalizeBic(bic).slice(4, 6);
}

export function isBicValid(bic: string | null | undefined): boolean {
  return BIC_STRUCTURE.test(normalizeBic(bic));
}

export function bicMatchesIban(
  bic: string | null | undefined,
  iban: string | null | undefined,
): boolean {
  const country = ibanCountry(iban);
  const fromBic = bicCountry(bic);
  if (fromBic === country) return true;
  return (TERRITORIES_OF[country] ?? []).includes(fromBic);
}
