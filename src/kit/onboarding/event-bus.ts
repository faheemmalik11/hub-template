import type { OnboardingEventHandler, OnboardingEventInput } from "./types";

export interface OnboardingEventBus {
  emit(event: OnboardingEventInput): void;
  subscribe(handler: OnboardingEventHandler): () => void;
}

export function createOnboardingEventBus(): OnboardingEventBus {
  const handlers = new Set<OnboardingEventHandler>();

  function emit(event: OnboardingEventInput): void {
    const fullEvent = { ...event, at: Date.now() };
    for (const handler of handlers) {
      handler(fullEvent);
    }
  }

  function subscribe(handler: OnboardingEventHandler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  return { emit, subscribe };
}
