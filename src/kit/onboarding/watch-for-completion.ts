import { eventMeetsCompletionCondition } from "./completion";
import type { OnboardingEventBus } from "./event-bus";
import type { OnboardingCompletionCondition } from "./types";

export function watchForCompletion(
  bus: OnboardingEventBus,
  condition: OnboardingCompletionCondition,
  onComplete: () => void,
): () => void {
  return bus.subscribe((event) => {
    if (eventMeetsCompletionCondition(condition, event)) onComplete();
  });
}
