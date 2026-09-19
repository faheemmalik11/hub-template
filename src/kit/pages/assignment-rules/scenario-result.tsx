import { CircleAlert, CircleCheck, Tag } from "lucide-react";

import type {
  AssignmentRulesConfig,
  AssignmentRuleView,
  DimensionKey,
  ScopeOption,
} from "../../adapters/assignment-rules";
import { cn } from "../../lib/class-names";
import type { AssignmentRulesLabels } from "./labels";
import { ScopeChips } from "./scope-chips";

export function ScenarioResult({
  winner,
  outranked,
  config,
  scopeOptions,
  labels,
}: {
  winner: AssignmentRuleView | null;
  outranked: AssignmentRuleView[];
  config: AssignmentRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  labels: AssignmentRulesLabels;
}) {
  return (
    <div className="mt-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3.5",
          winner ? "border-brand bg-brand-wash" : "border-warning/40 bg-warning-soft",
        )}
      >
        {winner ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <div className="min-w-0">
          <strong className="text-sm font-semibold">
            {winner ? labels.tester.winnerHeading : labels.tester.none}
          </strong>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {winner
              ? outranked.length > 0
                ? labels.tester.alsoMatching(outranked.length)
                : labels.tester.onlyMatch
              : labels.tester.noneHint}
          </p>
        </div>
      </div>

      {winner && (
        <div className="mt-3 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
          <div className="border-border px-4 py-4 sm:border-r">
            <h4 className="mb-2 text-sm font-semibold">{labels.card.scope}</h4>
            <ScopeChips
              scope={winner.scope}
              dimensions={config.dimensions}
              options={scopeOptions}
              referencePattern={winner.referencePattern}
              labels={labels}
            />
          </div>
          <div className="px-4 py-4">
            <h4 className="mb-2 text-sm font-semibold">{labels.card.value}</h4>
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Tag className="size-3.5" />
              </span>
              <span className="text-sm">{winner.categoryLabel}</span>
            </div>
          </div>
        </div>
      )}

      {outranked.length > 0 && (
        <section className="mt-5">
          <h3 className="text-xs font-semibold text-muted-foreground">
            {labels.tester.outrankedTitle}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-2">
            {outranked.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <ScopeChips
                    scope={rule.scope}
                    dimensions={config.dimensions}
                    options={scopeOptions}
                    referencePattern={rule.referencePattern}
                    labels={labels}
                  />
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {rule.categoryLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
