import { useCallback, useEffect, useMemo, useState } from "react";

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
  goNext: () => void;
  goBack: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
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
  const [stepsReadyToAdvance, setStepsReadyToAdvance] = useState<Set<number>>(new Set());
  const [furthestIndexReached, setFurthestIndexReached] = useState(currentStepIndex);
  const isFinished = currentStepIndex >= task.steps.length;
  const currentStep = task.steps[currentStepIndex] ?? task.steps[task.steps.length - 1];

  const backFloor = useMemo(() => {
    let floor = 0;
    for (let index = 0; index < Math.min(furthestIndexReached, task.steps.length); index++) {
      if (task.steps[index].irreversible) floor = index + 1;
    }
    return floor;
  }, [task.steps, furthestIndexReached]);

  useEffect(() => {
    setFurthestIndexReached((furthest) => Math.max(furthest, currentStepIndex));
  }, [currentStepIndex]);

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
    ({ fromReplay }) => {
      setStepsReadyToAdvance((steps) => new Set(steps).add(currentStepIndex));
      if (!currentStep.requiresNextClick && !fromReplay) advanceFrom(currentStepIndex);
    },
  );
  useOnboardingWrongAttempt(
    !isFinished && currentStep.type !== "info" ? currentStep.completionCondition : null,
    () => setHelpStepIndex(currentStepIndex),
  );

  const completeInfoStep = useCallback(() => {
    if (!isFinished && currentStep.type === "info") advanceFrom(currentStepIndex);
  }, [isFinished, currentStep, currentStepIndex, advanceFrom]);

  const canGoNext =
    isFinished ||
    currentStep.type === "info" ||
    !currentStep.completionCondition ||
    stepsReadyToAdvance.has(currentStepIndex);

  const goNext = useCallback(() => {
    if (!isFinished && canGoNext) advanceFrom(currentStepIndex);
  }, [isFinished, canGoNext, currentStepIndex, advanceFrom]);

  const goBack = useCallback(() => {
    setCurrentStepIndex((index) => Math.max(backFloor, index - 1));
    setHelpStepIndex(null);
  }, [backFloor]);

  const restart = useCallback(() => {
    setCurrentStepIndex(0);
    setHelpStepIndex(null);
    setStepsReadyToAdvance(new Set());
    setFurthestIndexReached(0);
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
    goNext,
    goBack,
    canGoBack: currentStepIndex > backFloor,
    canGoNext,
    restart,
  };
}
