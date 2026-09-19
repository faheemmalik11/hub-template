export type MatchDifferenceReason =
  "discount" | "rounding_difference" | "bank_fees" | "partial_payment" | "other";

export interface MatchingSettingsConfig {
  amountTolerance: number;
  autoMatchThreshold: number;
  candidateThreshold: number;
}
