import type { OnboardingCompletionCondition, OnboardingEvent } from "./types";

export function eventMeetsCompletionCondition(
  condition: OnboardingCompletionCondition,
  event: OnboardingEvent,
): boolean {
  if (event.type !== condition.eventType) return false;
  if (condition.recordId !== undefined && event.recordId !== condition.recordId) return false;
  if (condition.data) {
    for (const key of Object.keys(condition.data)) {
      if (event.data?.[key] !== condition.data[key]) return false;
    }
  }
  return true;
}
