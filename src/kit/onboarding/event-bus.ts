import type { OnboardingEvent, OnboardingEventHandler, OnboardingEventInput } from "./types";

export interface OnboardingEventBus {
  emit(event: OnboardingEventInput): void;
  subscribe(handler: OnboardingEventHandler): () => void;
  /** The most recent event of this type, for a condition that opts into checking it on subscribe. */
  lastEventOfType(eventType: string): OnboardingEvent | undefined;
}

export function createOnboardingEventBus(): OnboardingEventBus {
  const handlers = new Set<OnboardingEventHandler>();
  const lastEventByType = new Map<string, OnboardingEvent>();

  function emit(event: OnboardingEventInput): void {
    const fullEvent = { ...event, at: Date.now() };
    lastEventByType.set(fullEvent.type, fullEvent);
    for (const handler of handlers) {
      handler(fullEvent);
    }
  }

  function subscribe(handler: OnboardingEventHandler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  function lastEventOfType(eventType: string): OnboardingEvent | undefined {
    return lastEventByType.get(eventType);
  }

  return { emit, subscribe, lastEventOfType };
}
