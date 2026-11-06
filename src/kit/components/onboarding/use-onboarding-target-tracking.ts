import { useEffect, useState } from "react";

import { findOnboardingTarget } from "./find-onboarding-target";
import {
  initialSpotlightVisibleArea,
  readSpotlightVisibleArea,
  type SpotlightRect,
  type SpotlightVisibleArea,
} from "./spotlight";

const SCROLL_RETRY_WINDOW_MS = 2000;
const SCROLL_RETRY_INTERVAL_MS = 300;

export interface OnboardingTargetTracking {
  rect: SpotlightRect | null;
  visibleArea: SpotlightVisibleArea;
  onWrongPage: boolean;
  targetOffScreen: boolean;
}

export function useOnboardingTargetTracking(
  target: string | null,
  stepPath: string | null,
  pathname: string,
): OnboardingTargetTracking {
  const onWrongPage = Boolean(target && stepPath && !pathname.startsWith(stepPath));
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [visibleArea, setVisibleArea] = useState<SpotlightVisibleArea>(initialSpotlightVisibleArea);

  useEffect(() => {
    const updateVisibleArea = () => setVisibleArea(readSpotlightVisibleArea());
    updateVisibleArea();
    window.addEventListener("resize", updateVisibleArea);
    window.visualViewport?.addEventListener("resize", updateVisibleArea);
    window.visualViewport?.addEventListener("scroll", updateVisibleArea);
    return () => {
      window.removeEventListener("resize", updateVisibleArea);
      window.visualViewport?.removeEventListener("resize", updateVisibleArea);
      window.visualViewport?.removeEventListener("scroll", updateVisibleArea);
    };
  }, []);

  useEffect(() => {
    if (!target || onWrongPage) {
      setRect(null);
      return;
    }

    let frame = 0;
    let trackedElement: HTMLElement | null = null;
    let trackedAt = 0;
    let lastScrollAt = 0;

    const scrollToTargetIfNeeded = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const area = readSpotlightVisibleArea();
      const offScreenVertically = box.top < area.top || box.bottom > area.top + area.height;
      const offScreenSideways = box.left < area.left - 1 || box.right > area.left + area.width + 1;
      if (offScreenVertically || offScreenSideways) {
        element.scrollIntoView({
          behavior: "smooth",
          block: offScreenVertically ? (box.height > area.height ? "start" : "center") : "nearest",
          inline: offScreenSideways ? "start" : "nearest",
        });
      }
    };

    const measure = () => {
      const element = findOnboardingTarget(target);
      const now = performance.now();
      if (element && element !== trackedElement && element.getClientRects().length > 0) {
        trackedElement = element;
        trackedAt = now;
        lastScrollAt = now;
        scrollToTargetIfNeeded(element);
      } else if (
        element &&
        element === trackedElement &&
        now - trackedAt < SCROLL_RETRY_WINDOW_MS &&
        now - lastScrollAt > SCROLL_RETRY_INTERVAL_MS
      ) {
        lastScrollAt = now;
        scrollToTargetIfNeeded(element);
      }
      if (element) {
        const box = element.getBoundingClientRect();
        setRect((current) =>
          current &&
          current.top === box.top &&
          current.left === box.left &&
          current.width === box.width &&
          current.height === box.height
            ? current
            : { top: box.top, left: box.left, width: box.width, height: box.height },
        );
      } else {
        setRect(null);
      }
      frame = requestAnimationFrame(measure);
    };

    setRect(null);
    const existing = findOnboardingTarget(target);
    if (existing) {
      scrollToTargetIfNeeded(existing);
      measure();
      return () => cancelAnimationFrame(frame);
    }

    const targetMountObserver = new MutationObserver(() => {
      const element = findOnboardingTarget(target);
      if (!element) return;
      targetMountObserver.disconnect();
      scrollToTargetIfNeeded(element);
      measure();
    });
    targetMountObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      targetMountObserver.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, pathname, onWrongPage]);

  const targetOffScreen = Boolean(
    rect &&
    (rect.top + rect.height < visibleArea.top ||
      rect.top > visibleArea.top + visibleArea.height ||
      rect.left + rect.width < visibleArea.left - 1 ||
      rect.left > visibleArea.left + visibleArea.width + 1),
  );

  return { rect, visibleArea, onWrongPage, targetOffScreen };
}
