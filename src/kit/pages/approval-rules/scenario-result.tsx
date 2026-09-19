import { CircleAlert, CircleCheck, Coins, Users } from "lucide-react";

import type {
  ApprovalRulesConfig,
  ApprovalRuleView,
  ApproverOption,
  DimensionKey,
  ScopeOption,
} from "../../adapters/approval-rules";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import { ApprovalChain } from "./approval-chain";
import type { ApprovalRulesLabels } from "./labels";
import { ScopeInline } from "./scope-inline";
import { WhenRows } from "./when-rows";

export function ScenarioResult({
  winner,
  outranked,
  config,
  scopeOptions,
  approvers,
  approverName,
  labels,
  formatters = englishFormatters,
  defaultChainSentence,
}: {
  winner: ApprovalRuleView | null;
  outranked: ApprovalRuleView[];
  config: ApprovalRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  approvers: ApproverOption[];
  approverName: (userId: string) => string | null;
  labels: ApprovalRulesLabels;
  formatters?: Formatters;
  defaultChainSentence: string;
}) {
  function amountText(rule: ApprovalRuleView) {
    return rule.minAmount === 0
      ? labels.card.anyAmount
      : labels.card.atLeast(formatters.formatMoney(rule.minAmount));
  }

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
              : labels.tester.noneWhy(defaultChainSentence)}
          </p>
        </div>
      </div>

      {winner && (
        <div className="mt-3 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
          <div className="border-border px-4 py-4 sm:border-r">
            <h4 className="mb-2 text-sm font-semibold">{labels.card.when}</h4>
            <WhenRows
              scope={winner.scope}
              dimensions={config.dimensions}
              options={scopeOptions}
              labels={labels}
            />
          </div>
          <div className="px-4 py-4">
            <h4 className="mb-2 text-sm font-semibold">{labels.card.amount}</h4>
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Coins className="size-3.5" />
              </span>
              <span className="text-sm tabular-nums">{amountText(winner)}</span>
            </div>
            <h4 className="mb-2 mt-4 border-t border-border pt-3 text-sm font-semibold">
              {labels.card.approvers}
            </h4>
            <div className="flex items-start gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Users className="size-3.5" />
              </span>
              <ApprovalChain
                steps={winner.steps}
                autoFinalStep={winner.autoFinalStep}
                approvers={approvers}
                approverName={approverName}
                labels={labels}
              />
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
                  <ScopeInline
                    scope={rule.scope}
                    dimensions={config.dimensions}
                    options={scopeOptions}
                    labels={labels}
                  />
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {amountText(rule)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
