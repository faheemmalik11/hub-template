import { useEffect, useRef } from "react";

const HIGHLIGHT = ["ring-2", "ring-amber-500", "ring-offset-4", "rounded-md", "bg-amber-50"];

/**
 * Scrolls to the field a deep link points at and flashes it.
 *
 * The element is inside a sheet that opens after this runs, so it is polled for rather than read
 * once.
 */
export function useFokusHighlight(fokus: string | null | undefined, openSourceId?: string | null) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!fokus || !openSourceId) return;
    const token = `${openSourceId}:${fokus}`;
    if (done.current === token) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const element = document.querySelector<HTMLElement>(`[data-fokus="${fokus}"]`);
      if (!element && tries < 20) return;
      window.clearInterval(timer);
      if (!element) return;
      done.current = token;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add(...HIGHLIGHT);
      window.setTimeout(() => element.classList.remove(...HIGHLIGHT), 5000);
    }, 150);

    return () => window.clearInterval(timer);
  }, [fokus, openSourceId]);
}
