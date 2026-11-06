import { createContext } from "react";

import type { OnboardingEventBus } from "@/kit/onboarding";

export const OnboardingEventsContext = createContext<OnboardingEventBus | null>(null);
