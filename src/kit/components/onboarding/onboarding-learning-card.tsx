import { Button } from "@/kit/ui/button";
import type { OnboardingStep } from "@/kit/onboarding";

import type { OnboardingHighlightLabels } from "./onboarding-highlight-labels";

export interface OnboardingLearningCardProps {
  step: OnboardingStep;
  stepIndex: number;
  stepCount: number;
  labels: OnboardingHighlightLabels;
  showHelp: boolean;
  onCompleteInfoStep: () => void;
}

export function OnboardingLearningCard({
  step,
  stepIndex,
  stepCount,
  labels,
  showHelp,
  onCompleteInfoStep,
}: OnboardingLearningCardProps) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 rounded-full bg-[var(--onboarding-accent,var(--primary))] px-2 py-0.5 text-[11px] font-semibold text-primary-foreground sm:text-xs">
          {labels.stepCounter(stepIndex + 1, stepCount)}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-popover-foreground sm:text-[17px]">
        {step.instruction}
      </p>
      {step.expectedOutcome && (
        <div className="mt-2 rounded-lg bg-muted/50 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.outcomeTitle}
          </p>
          <p className="mt-0.5 text-sm text-foreground">{step.expectedOutcome}</p>
        </div>
      )}
      {showHelp && step.helpText && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2.5">
          <p className="text-sm text-amber-900">{step.helpText}</p>
        </div>
      )}
      {step.type === "info" ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            onClick={onCompleteInfoStep}
            className="h-7 rounded-lg bg-[var(--onboarding-accent,var(--primary))] px-3.5 text-[12px] sm:h-8 sm:px-5 sm:text-sm"
          >
            {labels.nextButton}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-[var(--onboarding-accent,var(--primary))] sm:text-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--onboarding-accent,var(--primary))] opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--onboarding-accent,var(--primary))]" />
          </span>
          {labels.waiting}
        </div>
      )}
    </div>
  );
}
