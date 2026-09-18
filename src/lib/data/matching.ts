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
export { scoreMatch, runMatching } from "../../../supabase/functions/_shared/matching";
export type {
  MatchBeleg,
  MatchTransaction,
  MatchReasons,
  MatchCandidate,
} from "../../../supabase/functions/_shared/matching";

// Thresholds mirror _shared/matching.ts (AUTO_THRESHOLD / CANDIDATE_THRESHOLD), which does not export
// them. Used only to label a score in the UI with the same words the matcher would use.
export const AUTO_THRESHOLD = 0.9;
export const CANDIDATE_THRESHOLD = 0.6;

export type ConfidenceBand = "auto" | "kandidat" | "schwach";

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= AUTO_THRESHOLD) return "auto";
  if (score >= CANDIDATE_THRESHOLD) return "kandidat";
  return "schwach";
}
