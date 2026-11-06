import { createFileRoute } from "@tanstack/react-router";

import { FirstStepsCard } from "@/features/onboarding-practice/first-steps-card";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/onboarding-tour/")({
  head: () => ({ meta: [{ title: pageTitle("First steps") }] }),
  component: () => <FirstStepsCard alwaysShow />,
});
