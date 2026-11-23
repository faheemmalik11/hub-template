import { useEffect, useRef } from "react";

import {
  watchForCompletion,
  type OnboardingCompletionCondition,
  type OnboardingCompletionInfo,
} from "@/kit/onboarding";

import { useOnboardingEvents } from "./use-onboarding-events";

export function useOnboardingCompletion(
  condition: OnboardingCompletionCondition | null,
  onComplete: (info: OnboardingCompletionInfo) => void,
): void {
  const bus = useOnboardingEvents();
  const conditionKey = condition ? JSON.stringify(condition) : null;
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (!bus || !condition) return;
    return watchForCompletion(bus, condition, (info) => latestOnComplete.current(info));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, conditionKey]);
}
