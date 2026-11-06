import { useCallback, useMemo, useState } from "react";

import type { OnboardingStep, OnboardingStepStatus, OnboardingTask } from "@/kit/onboarding";

import { useOnboardingCompletion } from "./use-onboarding-completion";
import { useOnboardingWrongAttempt } from "./use-onboarding-wrong-attempt";

export interface OnboardingTaskRunner {
  task: OnboardingTask;
  currentStepIndex: number;
  currentStep: OnboardingStep;
  stepStatuses: OnboardingStepStatus[];
  isFinished: boolean;
  showHelp: boolean;
  completeInfoStep: () => void;
  restart: () => void;
}

export interface OnboardingTaskRunnerOptions {
  initialStepIndex?: number;
}

export function useOnboardingTaskRunner(
  task: OnboardingTask,
  options?: OnboardingTaskRunnerOptions,
): OnboardingTaskRunner {
  const [currentStepIndex, setCurrentStepIndex] = useState(options?.initialStepIndex ?? 0);
  const [helpStepIndex, setHelpStepIndex] = useState<number | null>(null);
  const isFinished = currentStepIndex >= task.steps.length;
  const currentStep = task.steps[currentStepIndex] ?? task.steps[task.steps.length - 1];

  const advanceFrom = useCallback(
    (fromIndex: number) => {
      setCurrentStepIndex((index) =>
        index === fromIndex ? Math.min(index + 1, task.steps.length) : index,
      );
    },
    [task.steps.length],
  );

  useOnboardingCompletion(
    !isFinished && currentStep.type !== "info" ? currentStep.completionCondition : null,
    () => advanceFrom(currentStepIndex),
  );
  useOnboardingWrongAttempt(
    !isFinished && currentStep.type !== "info" ? currentStep.completionCondition : null,
    () => setHelpStepIndex(currentStepIndex),
  );

  const completeInfoStep = useCallback(() => {
    if (!isFinished && currentStep.type === "info") advanceFrom(currentStepIndex);
  }, [isFinished, currentStep, currentStepIndex, advanceFrom]);

  const restart = useCallback(() => {
    setCurrentStepIndex(0);
    setHelpStepIndex(null);
  }, []);

  const stepStatuses = useMemo<OnboardingStepStatus[]>(
    () =>
      task.steps.map((_, index) =>
        index < currentStepIndex ? "done" : index === currentStepIndex ? "active" : "pending",
      ),
    [task.steps, currentStepIndex],
  );

  return {
    task,
    currentStepIndex,
    currentStep,
    stepStatuses,
    isFinished,
    showHelp: helpStepIndex === currentStepIndex,
    completeInfoStep,
    restart,
  };
}
