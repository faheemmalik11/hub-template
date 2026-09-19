import { useEffect } from "react";

import { findTourTarget, useTour } from "@/kit/components/tour";

export function TourOpenFlag() {
  const tour = useTour();
  const open = !!tour?.isOpen;
  const target = tour?.step?.target ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-tour-open", "");
    else root.removeAttribute("data-tour-open");
    return () => root.removeAttribute("data-tour-open");
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    let frame = 0;
    let attempts = 0;
    const bring = () => {
      const element = findTourTarget(target);
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (++attempts > 60) return;
      frame = requestAnimationFrame(bring);
    };
    frame = requestAnimationFrame(bring);
    return () => cancelAnimationFrame(frame);
  }, [open, target]);

  return null;
}
