// The Hub's window onto the CANONICAL matching scorer.
//
// The manual-linking panel shows a confidence rate "just like auto matching", which is only true if it
// runs the very same code the bank-sync Edge Function runs. So this re-exports
// supabase/functions/_shared/matching.ts rather than reimplementing the weights — a second copy of that
// file already existed once in the pipeline repo and was deleted precisely because it drifted (Task 08).
//
// Importing across the src/ ↔ supabase/functions/ boundary is safe here for one specific reason:
// matching.ts has ZERO imports and is pure TypeScript (no Deno globals, no I/O), so it bundles into the
// browser untouched. Keep it that way — if that file ever grows a Deno-only dependency, this indirection
// is the single place that has to change.
import { DEFAULT_MATCHING_SETTINGS } from "@/kit/lib/bank-matching";

export { scoreMatch, runMatching } from "../../../supabase/functions/_shared/matching";
export type {
  MatchDocument,
  MatchTransaction,
  MatchReasons,
  MatchCandidate,
} from "../../../supabase/functions/_shared/matching";

export const AUTO_THRESHOLD = DEFAULT_MATCHING_SETTINGS.autoMatchThreshold;
export const CANDIDATE_THRESHOLD = DEFAULT_MATCHING_SETTINGS.candidateThreshold;

export type ConfidenceBand = "auto" | "candidate" | "weak";

export function confidenceBand(
  score: number,
  autoThreshold: number = AUTO_THRESHOLD,
  candidateThreshold: number = CANDIDATE_THRESHOLD,
): ConfidenceBand {
  if (score >= autoThreshold) return "auto";
  if (score >= candidateThreshold) return "candidate";
  return "weak";
}
