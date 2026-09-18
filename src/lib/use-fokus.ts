import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

export function useFokus() {
  const fokus = useRouterState({
    select: (state) => (state.location.search as { fokus?: string }).fokus,
  });
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!fokus || done.current === fokus) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = document.querySelector<HTMLElement>(`[data-fokus="${fokus}"]`);
      if (!el && tries < 20) return;
      window.clearInterval(timer);
      if (!el) return;
      done.current = fokus;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-500", "ring-offset-4", "rounded-md");
      window.setTimeout(
        () => el.classList.remove("ring-2", "ring-amber-500", "ring-offset-4", "rounded-md"),
        5000,
      );
    }, 150);
    return () => window.clearInterval(timer);
  }, [fokus]);
}
