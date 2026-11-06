function findSingleOnboardingTarget(target: string): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const element of matches) {
    if (element.getClientRects().length > 0) return element;
  }
  return matches[0] ?? null;
}

export function findOnboardingTarget(target: string): HTMLElement | null {
  for (const alternative of target.split("|")) {
    const found = findSingleOnboardingTarget(alternative);
    if (found) return found;
  }
  return null;
}
