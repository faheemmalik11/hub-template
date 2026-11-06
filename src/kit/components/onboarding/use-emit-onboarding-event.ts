import { useCallback } from "react";

import type { OnboardingEventInput } from "@/kit/onboarding";

import { useOnboardingEvents } from "./use-onboarding-events";

export function useEmitOnboardingEvent(): (event: OnboardingEventInput) => void {
  const bus = useOnboardingEvents();
  return useCallback(
    (event: OnboardingEventInput) => {
      bus?.emit(event);
    },
    [bus],
  );
}
