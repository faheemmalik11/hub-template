import { eventMeetsCompletionCondition } from "./completion";
import type { OnboardingEventBus } from "./event-bus";
import type { OnboardingCompletionCondition } from "./types";

export interface OnboardingCompletionInfo {
  /** True when the condition was already met before this step started watching for it, so the
   *  caller should mark the step ready without auto-advancing past it. */
  fromReplay: boolean;
}

export function watchForCompletion(
  bus: OnboardingEventBus,
  condition: OnboardingCompletionCondition,
  onComplete: (info: OnboardingCompletionInfo) => void,
): () => void {
  if (condition.recordId !== undefined) {
    const last = bus.lastEventOfType(condition.eventType);
    if (last && eventMeetsCompletionCondition(condition, last)) onComplete({ fromReplay: true });
  }
  return bus.subscribe((event) => {
    if (eventMeetsCompletionCondition(condition, event)) onComplete({ fromReplay: false });
  });
}
