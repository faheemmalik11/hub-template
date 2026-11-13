import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useMatchingSettings } from "@/data";
import { DEFAULT_MATCHING_SETTINGS } from "@/kit/lib/bank-matching";
import { formatEUR } from "@/lib/data/format";
import type { MatchReasons } from "@/lib/data/types";

// The signals the matching engine actually weighs (_shared/matching.ts). Only their names are used
// here: the weights themselves are an implementation detail of the scorer and are not shown.
const SIGNALS: (keyof MatchReasons)[] = ["amount", "reference", "customerNumber", "iban", "name"];

type ConfidenceLevel = "high" | "medium" | "low";

function confidenceLevel(
  score: number,
  autoThreshold: number,
  candidateThreshold: number,
): ConfidenceLevel {
  if (score >= autoThreshold) return "high";
  if (score >= candidateThreshold) return "medium";
  return "low";
}

/**
 * Why this pair was suggested, in the words of the person doing the reconciliation: how confident
 * the match is, and which details actually agree. What a human checks is "same amount, same name" —
 * not that those were worth 0.45 and 0.10 points, which says nothing without the weight table in
 * front of you.
 */
export function MatchScoreBreakdown({
  reasons,
  score,
}: {
  reasons: MatchReasons | null;
  score: number | null;
}) {
  const { t } = useTranslation();
  const matchingSettingsQ = useMatchingSettings();
  if (!reasons) return null;

  const level =
    score == null
      ? null
      : confidenceLevel(
          score,
          matchingSettingsQ.data?.auto_match_threshold ??
            DEFAULT_MATCHING_SETTINGS.autoMatchThreshold,
          matchingSettingsQ.data?.candidate_threshold ??
            DEFAULT_MATCHING_SETTINGS.candidateThreshold,
        );

  const dayDiff = typeof reasons.dayDiff === "number" ? reasons.dayDiff : null;
  // "The amount agrees" and "the amount agrees to within the 50 cents you allow" are different
  // claims, and the person about to confirm the link is the one who should weigh the difference.
  // Naming the actual gap beats a bare flag: 2 cents and 49 cents get read very differently.
  const tolerated = reasons.amountTolerated === true;
  const difference = typeof reasons.amountDifference === "number" ? reasons.amountDifference : null;
  const match = SIGNALS.filter((k) => reasons[k] === true).map((k) =>
    k === "amount" && tolerated
      ? difference != null
        ? t("bank.matchScore.signal.amountTolerated", {
            difference: formatEUR(difference),
          })
        : t("bank.matchScore.signal.amountToleratedPlain")
      : t(`bank.matchScore.signal.${k as string}`),
  );
  if (dayDiff != null && dayDiff <= 7) match.push(t("bank.matchScore.signal.date"));

  if (score == null && match.length === 0) return null;

  return (
    <div className="mt-2 w-full text-xs">
      {level != null && (
        <span
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 font-medium",
            level === "high"
              ? "bg-emerald-100 text-emerald-900"
              : level === "medium"
                ? "bg-amber-100 text-amber-900"
                : "bg-muted text-muted-foreground",
          )}
        >
          {t(`bank.matchScore.confidence.${level}`)}
        </span>
      )}
      {match.length > 0 && (
        <>
          <p className={cn("font-medium text-foreground", score != null && "mt-2")}>
            {t("bank.matchScore.why")}
          </p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {match.map((label) => (
              <li key={label} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
