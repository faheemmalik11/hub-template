import { useEffect, useRef } from "react";

import {
  eventMeetsCompletionCondition,
  type OnboardingCompletionCondition,
} from "@/kit/onboarding";

import { useOnboardingEvents } from "./use-onboarding-events";

export function useOnboardingWrongAttempt(
  condition: OnboardingCompletionCondition | null,
  onWrongAttempt: () => void,
): void {
  const bus = useOnboardingEvents();
  const conditionKey = condition ? JSON.stringify(condition) : null;
  const latestOnWrongAttempt = useRef(onWrongAttempt);
  latestOnWrongAttempt.current = onWrongAttempt;

  useEffect(() => {
    if (!bus || !condition) return;
    return bus.subscribe((event) => {
      const sameKind =
        event.type === condition.eventType &&
        (condition.recordId === undefined || event.recordId === condition.recordId);
      if (sameKind && !eventMeetsCompletionCondition(condition, event)) {
        latestOnWrongAttempt.current();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, conditionKey]);
}
