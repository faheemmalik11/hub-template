import { cn } from "@/kit/lib/class-names";
import { Button } from "@/kit/ui/button";
import type { OnboardingStep } from "@/kit/onboarding";

import type { OnboardingHighlightLabels } from "./onboarding-highlight-labels";
import { SampleFileChip } from "./sample-file-chip";

export interface OnboardingLearningCardProps {
  step: OnboardingStep;
  stepIndex: number;
  stepCount: number;
  labels: OnboardingHighlightLabels;
  showHelp: boolean;
  onCompleteInfoStep: () => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  pathname: string;
}

export function OnboardingLearningCard({
  step,
  stepIndex,
  stepCount,
  labels,
  showHelp,
  onCompleteInfoStep,
  onNext,
  onBack,
  canGoBack,
  canGoNext,
  pathname,
}: OnboardingLearningCardProps) {
  const showSampleFile =
    Boolean(step.sampleFileUrl) &&
    Boolean(labels.sampleFileButton) &&
    (!step.sampleFileDropPath || step.sampleFileDropPath === pathname);
  return (
    <div>
      <div onMouseDown={(event) => event.preventDefault()}>
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
        {(showHelp || step.type === "info") && step.helpText && (
          <div className="mt-2 rounded-lg bg-amber-50 p-2.5">
            <p className="text-sm text-amber-900">{step.helpText}</p>
          </div>
        )}
        {showSampleFile && step.sampleFileUrl && (
          <div className="mt-2">
            <SampleFileChip
              label={labels.sampleFileButton ?? ""}
              sampleFileUrl={step.sampleFileUrl}
              sampleFileName={step.sampleFileName}
            />
          </div>
        )}
      </div>
      {step.type === "info" ? (
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            aria-disabled={!canGoBack}
            className={cn(
              "h-6 rounded-full bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground sm:h-7 sm:text-xs",
              canGoBack ? "hover:bg-muted/70" : "cursor-not-allowed opacity-50 hover:bg-muted",
            )}
          >
            {labels.backButton}
          </Button>
          <Button
            type="button"
            onClick={onCompleteInfoStep}
            className="h-6 rounded-full bg-[var(--onboarding-accent,var(--primary))] px-2.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 sm:h-7 sm:text-xs"
          >
            {labels.nextButton}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-1.5">
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--onboarding-accent,var(--primary))] sm:text-sm"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--onboarding-accent,var(--primary))] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--onboarding-accent,var(--primary))]" />
            </span>
            {labels.waiting}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              aria-disabled={!canGoBack}
              className={cn(
                "h-6 rounded-full bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground sm:h-7 sm:text-xs",
                canGoBack ? "hover:bg-muted/70" : "cursor-not-allowed opacity-50 hover:bg-muted",
              )}
            >
              {labels.backButton}
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops the click instead of absorbing it. */}
            <Button
              type="button"
              onClick={onNext}
              aria-disabled={!canGoNext}
              className={cn(
                "h-6 rounded-full bg-[var(--onboarding-accent,var(--primary))] px-2.5 text-[11px] font-semibold text-primary-foreground sm:h-7 sm:text-xs",
                canGoNext ? "hover:opacity-90" : "cursor-not-allowed opacity-50",
              )}
            >
              {labels.nextButton}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
