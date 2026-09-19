export function findTourTarget(target: string): HTMLElement | null {
  // A screen may carry the same anchor twice, once in the desktop layout and once in the mobile
  // one, with the inactive half hidden by CSS rather than unmounted. Taking the first match would
  // point the step at a zero-size element on the other breakpoint, so a laid-out one wins.
  const matches = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const element of matches) {
    if (element.getClientRects().length > 0) return element;
  }
  return matches[0] ?? null;
}
