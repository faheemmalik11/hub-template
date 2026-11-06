import { useRef, type ReactNode } from "react";

import { createOnboardingEventBus, type OnboardingEventBus } from "@/kit/onboarding";

import { OnboardingEventsContext } from "./onboarding-events-context";

export interface OnboardingEventsProviderProps {
  children: ReactNode;
}

export function OnboardingEventsProvider({ children }: OnboardingEventsProviderProps) {
  const busRef = useRef<OnboardingEventBus | null>(null);
  if (busRef.current === null) {
    busRef.current = createOnboardingEventBus();
  }
  return (
    <OnboardingEventsContext.Provider value={busRef.current}>
      {children}
    </OnboardingEventsContext.Provider>
  );
}
