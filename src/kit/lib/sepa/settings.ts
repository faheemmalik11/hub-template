import { SCHEME_MAXIMUM_CENTS } from "./amount";
import { DEFAULT_TRANSLITERATION } from "./charset";
import { DEFAULT_SEPA_COUNTRIES } from "./iban";
import type { CreditTransferVersion, SepaSettings } from "./types";

export const SUPPORTED_VERSIONS: readonly CreditTransferVersion[] = [
  "pain.001.001.02",
  "pain.001.001.03",
  "pain.001.001.08",
  "pain.001.001.09",
];

export const NAME_LIMIT = 70;
export const REMITTANCE_LIMIT = 140;
export const IDENTIFIER_LIMIT = 35;

export const DEFAULT_SEPA_SETTINGS: SepaSettings = {
  version: "pain.001.001.09",
  batchBooking: false,
  executionDateRule: "as_soon_as_possible",
  maxTransfersPerFile: null,
  maxAmountCents: SCHEME_MAXIMUM_CENTS,
  sepaCountries: DEFAULT_SEPA_COUNTRIES,
  extraClosingDays: [],
  transliteration: DEFAULT_TRANSLITERATION,
};

export function resolveSettings(overrides: Partial<SepaSettings> = {}): SepaSettings {
  const resolved = { ...DEFAULT_SEPA_SETTINGS };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      Object.assign(resolved, { [key]: value });
    }
  }
  return resolved;
}

export function isSupportedVersion(version: string): version is CreditTransferVersion {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(version);
}
