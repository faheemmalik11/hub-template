import type { CommissionSide, SideProblem } from "@/kit/lib/commission";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { DealTab } from "./deal-tabs";
import { FixLink } from "./fix-link";
import { anchorForProblem, problemHasAnchor } from "./problem-anchors";

export function CommissionProblemList({
  problems,
  onJumpToField,
  className,
}: {
  problems: readonly SideProblem[];
  onJumpToField?: (tab: DealTab, id: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const sideName = (side: CommissionSide | null) => (side ? t(`commissionDeals.side.${side}`) : "");

  return (
    <ul className={cn("space-y-1", className)}>
      {problems.map((problem) => (
        <li
          key={`${problem.side}-${problem.problem}`}
          className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
        >
          <span>
            •{" "}
            {t(`commissionDeals.problems.${problem.problem}`, {
              side: sideName(problem.side),
            })}
          </span>
          {problemHasAnchor(problem) && onJumpToField && (
            <FixLink
              onClick={() => {
                const target = anchorForProblem(problem.side, problem.problem);
                onJumpToField(target.tab, target.id);
              }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
