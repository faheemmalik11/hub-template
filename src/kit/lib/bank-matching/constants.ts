import type { MatchDifferenceReason, MatchingSettingsConfig } from "./types";

// Kept in step with matching_settings' own column defaults (0055), so a client with no row
// bands scores the same way as a client with the shipped one.
export const DEFAULT_MATCHING_SETTINGS: MatchingSettingsConfig = {
  amountTolerance: 0.01,
  autoMatchThreshold: 0.95,
  candidateThreshold: 0.6,
};

export const STANDARD_DIFFERENCE_REASONS: { code: MatchDifferenceReason; labelKey: string }[] = [
  { code: "discount", labelKey: "matching.differenceReason.discount" },
  { code: "rounding_difference", labelKey: "matching.differenceReason.roundingDifference" },
  { code: "bank_fees", labelKey: "matching.differenceReason.bankFees" },
  { code: "partial_payment", labelKey: "matching.differenceReason.partialPayment" },
  { code: "other", labelKey: "matching.differenceReason.other" },
];
