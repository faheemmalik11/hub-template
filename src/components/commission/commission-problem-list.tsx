import type { CommissionSide, SideProblem } from "@/kit/lib/commission";
import type { ReviewLine } from "@/kit/ui";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { DEAL_TABS, type DealAnchor, type DealTab } from "./deal-tabs";
import { FixLink } from "./fix-link";
import { anchorForProblem, problemHasAnchor } from "./problem-anchors";

interface ListItem {
  key: string;
  label?: string;
  text: string;
  target?: DealAnchor;
}

function ItemList({
  items,
  onJumpToField,
  className,
}: {
  items: readonly ListItem[];
  onJumpToField?: (tab: DealTab, id: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item) => {
        const target = item.target;
        return (
          <li
            key={item.key}
            className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
          >
            <span>
              • {item.label && <span className="font-medium text-foreground">{item.label}: </span>}
              {item.text}
            </span>
            {target && onJumpToField && (
              <FixLink onClick={() => onJumpToField(target.tab, target.id)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

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
    <ItemList
      items={problems.map((problem) => ({
        key: `${problem.side}-${problem.problem}`,
        text: t(`commissionDeals.problems.${problem.problem}`, { side: sideName(problem.side) }),
        target: problemHasAnchor(problem)
          ? anchorForProblem(problem.side, problem.problem)
          : undefined,
      }))}
      onJumpToField={onJumpToField}
      className={className}
    />
  );
}

function anchorOfReviewLine(line: ReviewLine): DealAnchor | undefined {
  const target = line.target;
  if (!target) return undefined;
  const tab = DEAL_TABS.find((candidate) => candidate === target.tab);
  return tab ? { tab, id: target.anchor } : undefined;
}

export function CommissionReviewLineList({
  lines,
  onJumpToField,
  className,
}: {
  lines: readonly ReviewLine[];
  onJumpToField?: (tab: DealTab, id: string) => void;
  className?: string;
}) {
  return (
    <ItemList
      items={lines.map((line) => ({
        key: line.field,
        label: line.title,
        text: line.text,
        target: anchorOfReviewLine(line),
      }))}
      onJumpToField={onJumpToField}
      className={className}
    />
  );
}
