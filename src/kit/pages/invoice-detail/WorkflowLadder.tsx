import { ArrowDown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { cn } from "../../lib/class-names";

export interface LadderColors {
  circle: string;
  currentRing: string;
  line: string;
}

export interface WorkflowLadderLabels {
  navAriaLabel: string;
  stepLabel: (step: string) => string;
}

export function WorkflowLadder({
  steps,
  currentStep,
  since,
  actions,
  onAction,
  hint,
  labels,
  ladderColors,
  className,
}: {
  steps: readonly string[];
  currentStep: number;
  since?: string | null;
  actions?: Map<string, unknown>;
  onAction?: (step: string, action: unknown) => void;
  hint?: (step: string) => string;
  labels: WorkflowLadderLabels;
  ladderColors: LadderColors;
  className?: string;
}) {
  const nextAction = steps.reduce<number | null>(
    (nearest, step, i) => (nearest == null && actions?.has(step) ? i : nearest),
    null,
  );
  return (
    <ol
      className={cn("flex w-full items-start px-2 sm:px-[4.5rem]", className)}
      aria-label={labels.navAriaLabel}
    >
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const reached = currentStep >= 0 && i <= currentStep;
        const current = i === currentStep;
        const action = actions?.get(step) ?? null;
        const dashed = nextAction != null && i >= currentStep && i < nextAction;
        void dashed;
        return (
          <li
            key={step}
            className={cn("flex min-w-0 flex-col", last ? "shrink-0" : "flex-1")}
            aria-current={current ? "step" : undefined}
          >
            <div className="flex h-4 w-7 items-end justify-center">
              {action && (
                <ArrowDown
                  className="size-3.5 animate-bounce text-brand motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="flex items-center">
              {action ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onAction?.(step, action)}
                      aria-label={hint?.(step) ?? labels.stepLabel(step)}
                      className={cn(
                        "relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                        reached ? ladderColors.circle : "border-brand bg-background",
                        current && ladderColors.currentRing,
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {hint?.(step) ?? labels.stepLabel(step)}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border-2",
                    reached ? ladderColors.circle : "border-muted-foreground/30 bg-background",
                    current && ladderColors.currentRing,
                  )}
                  aria-hidden="true"
                />
              )}
              {!last && (
                <span
                  className={cn(
                    "h-0 min-w-0 flex-1 border-t-2",
                    reached && i < currentStep ? ladderColors.line : "border-muted-foreground/20",
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="-ml-[4.5rem] mt-2 w-[9rem] text-center">
              <span
                className={cn(
                  "block text-sm leading-tight",
                  current ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {labels.stepLabel(step)}
              </span>
              {current && since && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{since}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
