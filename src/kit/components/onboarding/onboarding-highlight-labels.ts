export interface OnboardingHighlightLabels {
  stepCounter: (current: number, total: number) => string;
  waiting: string;
  outcomeTitle: string;
  nextButton: string;
  goToPage: (pageLabel: string) => string;
  goToPageButton: string;
  scrollToTarget: string;
  scrollToTargetButton: string;
}

export const englishOnboardingHighlightLabels: OnboardingHighlightLabels = {
  stepCounter: (current, total) => `Step ${current} of ${total}`,
  waiting: "Do this now",
  outcomeTitle: "What happens next",
  nextButton: "Next",
  goToPage: (pageLabel) => `This step happens on the ${pageLabel} page.`,
  goToPageButton: "Go there",
  scrollToTarget: "It is further down this page.",
  scrollToTargetButton: "Show me",
};
