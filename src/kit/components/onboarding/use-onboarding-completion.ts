import { useEffect, useRef } from "react";

import { watchForCompletion, type OnboardingCompletionCondition } from "@/kit/onboarding";

import { useOnboardingEvents } from "./use-onboarding-events";

export function useOnboardingCompletion(
  condition: OnboardingCompletionCondition | null,
  onComplete: () => void,
): void {
  const bus = useOnboardingEvents();
  const conditionKey = condition ? JSON.stringify(condition) : null;
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (!bus || !condition) return;
    return watchForCompletion(bus, condition, () => latestOnComplete.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, conditionKey]);
}
