import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { Popover, PopoverAnchor, PopoverArrow, PopoverContent } from "../../ui/popover";
import { findTourTarget } from "./find-target";
import { TourCard } from "./tour-card";
import { useTour } from "./use-tour";
import type { TourPlacement, TourStep } from "./types";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface VisibleArea {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface VerticalBand {
  top: number;
  bottom: number;
}

type CardPlacement = TourPlacement | "dockTop" | "dockBottom";

const SPOTLIGHT_PADDING = 6;
const RING_WIDTH = 5;
const MOVE_DURATION = "220ms";
const CARD_GAP = 12;
const CARD_HEIGHT_FALLBACK = 240;
const MAX_CARD_WIDTH = 352;
const SCREEN_MARGIN = 32;
const SCREEN_EDGE = 16;
const DOCKED_CARD_SHARE = 0.6;
const CARD_SELECTOR = "[data-tour-card]";

export function TourOverlay() {
  const tour = useTour();
  const step = tour?.step ?? null;
  const target = step?.target ?? null;
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [visibleArea, setVisibleArea] = useState<VisibleArea>(initialVisibleArea);
  const [topObstruction, setTopObstruction] = useState(0);
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const overlayRoot = useRef<HTMLDivElement>(null);
  const skipMissingStep = useRef(() => {});
  skipMissingStep.current = tour ? tour.next : () => {};

  useEffect(() => {
    const updateVisibleArea = () => setVisibleArea(readVisibleArea());
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
    if (!target) {
      setRect(null);
      return;
    }

    let frame = 0;
    const measure = () => {
      const element = findTourTarget(target);
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
      }
      frame = requestAnimationFrame(measure);
    };

    let attempts = 0;
    const waitForTarget = () => {
      attempts += 1;
      const element = findTourTarget(target);
      if (element) {
        // Bring the step into view before measuring. A tour opened while the reader is halfway
        // down a long screen used to highlight something off-screen: the page dimmed and nothing
        // visible was marked. Only scrolls when the element is not already fully in view, so a
        // step that is on screen does not jump the page under the reader.
        const box = element.getBoundingClientRect();
        const area = readVisibleArea();
        const offScreenVertically = box.top < area.top || box.bottom > area.top + area.height;
        const offScreenSideways =
          box.left < area.left - 1 || box.right > area.left + area.width + 1;
        if (offScreenVertically || offScreenSideways) {
          element.scrollIntoView({
            behavior: "smooth",
            block: offScreenVertically ? "center" : "nearest",
            inline: offScreenSideways ? "start" : "nearest",
          });
        }
        measure();
        return;
      }
      if (attempts > 60) {
        skipMissingStep.current();
        return;
      }
      frame = requestAnimationFrame(waitForTarget);
    };

    setRect(null);
    frame = requestAnimationFrame(waitForTarget);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useEffect(() => {
    if (!cardElement) {
      setCardHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => {
      // offsetHeight counts the card's padding, which the observer's content box leaves out.
      const height = cardElement.offsetHeight;
      setCardHeight((current) => (current === height ? current : height));
    });
    observer.observe(cardElement);
    return () => observer.disconnect();
  }, [cardElement]);

  const roomMadeFor = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      roomMadeFor.current = null;
      return;
    }
    const neededRoom = (cardHeight || CARD_HEIGHT_FALLBACK) + CARD_GAP * 2;
    const key = `${target}:${neededRoom}:${topObstruction}`;
    if (roomMadeFor.current === key) {
      return;
    }
    const element = findTourTarget(target);
    if (!element) {
      return;
    }
    roomMadeFor.current = key;
    makeRoomForCard(element, neededRoom, topObstruction);
  }, [target, cardHeight, topObstruction]);

  useEffect(() => {
    if (!tour?.isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setTopObstruction(stickyBarBottom(overlayRoot.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [tour?.isOpen, target]);

  useEffect(() => {
    if (!tour?.isOpen) {
      return;
    }
    let lastTouchY = 0;
    const rememberTouch = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };
    const blockWheel = (event: WheelEvent) => {
      if (!cardCanScroll(event.target, event.deltaY)) {
        event.preventDefault();
      }
    };
    const blockTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaY = lastTouchY - touchY;
      lastTouchY = touchY;
      if (!cardCanScroll(event.target, deltaY)) {
        event.preventDefault();
      }
    };
    const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const blockScrollKeys = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key) && !insideCard(event.target)) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    window.addEventListener("touchstart", rememberTouch, { passive: true, capture: true });
    window.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
    window.addEventListener("keydown", blockScrollKeys, { capture: true });
    return () => {
      window.removeEventListener("wheel", blockWheel, { capture: true });
      window.removeEventListener("touchstart", rememberTouch, { capture: true });
      window.removeEventListener("touchmove", blockTouchMove, { capture: true });
      window.removeEventListener("keydown", blockScrollKeys, { capture: true });
    };
  }, [tour?.isOpen]);

  useEffect(() => {
    if (!tour?.isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        tour.skip();
      } else if (event.key === "ArrowRight") {
        tour.next();
      } else if (event.key === "ArrowLeft") {
        tour.back();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tour]);

  const attachCard = useCallback((node: HTMLDivElement | null) => {
    setCardElement(node);
    const wrapper = node?.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
    if (wrapper) {
      wrapper.style.zIndex = "60";
      wrapper.style.transition = `transform ${MOVE_DURATION} ease`;
    }
  }, []);

  if (!tour || !tour.isOpen || !step || !rect) {
    return null;
  }

  const measuredCardHeight = cardHeight || CARD_HEIGHT_FALLBACK;
  const placement = pickPlacement(
    step.placement,
    rect,
    visibleArea,
    measuredCardHeight,
    topObstruction,
  );
  const freeBand = bandLeftForTarget(placement, visibleArea, measuredCardHeight, topObstruction);
  const spotlight = spotlightBox(rect, freeBand);
  const card = (
    <TourCard
      step={step}
      stepIndex={tour.stepIndex}
      stepCount={tour.stepCount}
      labels={tour.labels}
      onNext={tour.next}
      onSkip={tour.skip}
    />
  );

  return (
    <div ref={overlayRoot} className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0"
        style={{ background: "var(--tour-backdrop, rgb(0 0 0 / 0.5))" }}
      />
      <div
        className="absolute"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: "var(--tour-spotlight-radius, calc(var(--radius) + 4px))",
          transition: `top ${MOVE_DURATION} ease, left ${MOVE_DURATION} ease, width ${MOVE_DURATION} ease, height ${MOVE_DURATION} ease`,
          boxShadow: [
            "0 0 0 3px var(--tour-ring-gap, var(--background))",
            "0 0 0 5px var(--tour-accent, var(--primary))",
          ].join(", "),
        }}
      />
      {placement === "dockTop" || placement === "dockBottom" ? (
        <div
          className="pointer-events-none absolute flex justify-center"
          style={{
            top: visibleArea.top,
            left: visibleArea.left,
            width: visibleArea.width,
            height: visibleArea.height,
            alignItems: placement === "dockTop" ? "flex-start" : "flex-end",
            paddingTop: obstructionInside(visibleArea, topObstruction) + SCREEN_EDGE,
            paddingBottom: SCREEN_EDGE,
          }}
        >
          <div
            ref={attachCard}
            data-tour-card=""
            className="pointer-events-auto rounded-2xl bg-popover px-4 pt-4 pb-2.5 text-popover-foreground shadow-xl sm:px-5 sm:pt-5 sm:pb-3.5"
            style={dockedCardStyle(visibleArea, topObstruction)}
            aria-label={tour.labels.cardTitle}
          >
            {card}
          </div>
        </div>
      ) : (
        <Popover open>
          <PopoverAnchor asChild>
            <div
              className="absolute"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          </PopoverAnchor>
          <PopoverContent
            ref={attachCard}
            data-tour-card=""
            side={placement}
            align="center"
            sideOffset={CARD_GAP}
            arrowPadding={16}
            collisionPadding={{
              top: Math.max(SCREEN_EDGE, topObstruction + CARD_GAP),
              right: SCREEN_EDGE,
              bottom: SCREEN_EDGE,
              left: SCREEN_EDGE,
            }}
            className="z-[60] w-[min(var(--tour-card-width,22rem),calc(100vw-2rem))] rounded-2xl border-0 px-4 pt-4 pb-2.5 shadow-xl sm:px-5 sm:pt-5 sm:pb-3.5"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            aria-label={tour.labels.cardTitle}
          >
            {card}
            <PopoverArrow width={18} height={9} style={{ fill: "var(--popover)" }} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function initialVisibleArea(): VisibleArea {
  if (typeof window === "undefined") {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  return readVisibleArea();
}

// The visual viewport is what the phone really shows, even when the page is wider than the screen.
function readVisibleArea(): VisibleArea {
  const visual = window.visualViewport;
  if (!visual) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    top: visual.offsetTop,
    left: visual.offsetLeft,
    width: visual.width,
    height: visual.height,
  };
}

function obstructionInside(area: VisibleArea, topObstruction: number): number {
  return Math.max(0, topObstruction - area.top);
}

function screenBand(area: VisibleArea, topObstruction: number): VerticalBand {
  return { top: Math.max(area.top, topObstruction), bottom: area.top + area.height };
}

function pickPlacement(
  preferred: TourStep["placement"],
  rect: TargetRect,
  area: VisibleArea,
  cardHeight: number,
  topObstruction: number,
): CardPlacement {
  if (area.width === 0) {
    return preferred ?? "bottom";
  }
  const band = screenBand(area, topObstruction);
  const targetBottom = rect.top + rect.height;
  const targetOnScreen = rect.top < band.bottom && targetBottom > band.top;
  const cardWidth = Math.min(MAX_CARD_WIDTH, area.width - SCREEN_MARGIN);
  const need = cardHeight + CARD_GAP * 2;
  const fits = {
    top: targetOnScreen && rect.top - band.top >= need,
    bottom: targetOnScreen && band.bottom - targetBottom >= need,
    left: targetOnScreen && rect.left - area.left >= cardWidth + CARD_GAP,
    right:
      targetOnScreen && area.left + area.width - (rect.left + rect.width) >= cardWidth + CARD_GAP,
  };
  if (preferred && fits[preferred]) {
    return preferred;
  }
  if (fits.bottom) return "bottom";
  if (fits.top) return "top";
  if (fits.right) return "right";
  if (fits.left) return "left";
  return pickDockEdge(rect, area, cardHeight, topObstruction);
}

function pickDockEdge(
  rect: TargetRect,
  area: VisibleArea,
  cardHeight: number,
  topObstruction: number,
): "dockTop" | "dockBottom" {
  const shownBelowTopCard = visibleHeight(
    rect,
    bandLeftForTarget("dockTop", area, cardHeight, topObstruction),
  );
  const shownAboveBottomCard = visibleHeight(
    rect,
    bandLeftForTarget("dockBottom", area, cardHeight, topObstruction),
  );
  return shownBelowTopCard > shownAboveBottomCard ? "dockTop" : "dockBottom";
}

function bandLeftForTarget(
  placement: CardPlacement,
  area: VisibleArea,
  cardHeight: number,
  topObstruction: number,
): VerticalBand {
  const band = screenBand(area, topObstruction);
  const cardRoom = cardHeight + SCREEN_EDGE + CARD_GAP;
  if (placement === "dockTop") {
    return { top: band.top + cardRoom, bottom: band.bottom };
  }
  if (placement === "dockBottom") {
    return { top: band.top, bottom: band.bottom - cardRoom };
  }
  return band;
}

function visibleHeight(rect: TargetRect, band: VerticalBand): number {
  return Math.max(0, Math.min(rect.top + rect.height, band.bottom) - Math.max(rect.top, band.top));
}

// The ring stays inside the free band, so a tall section is marked only where it can be seen.
function spotlightBox(rect: TargetRect, band: VerticalBand): TargetRect {
  const top = Math.max(rect.top - SPOTLIGHT_PADDING, band.top + RING_WIDTH);
  const bottom = Math.min(rect.top + rect.height + SPOTLIGHT_PADDING, band.bottom - RING_WIDTH);
  return {
    top,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: Math.max(0, bottom - top),
  };
}

function dockedCardStyle(area: VisibleArea, topObstruction: number): CSSProperties {
  const usableHeight = area.height - obstructionInside(area, topObstruction);
  return {
    width: `min(var(--tour-card-width, 22rem), ${area.width - SCREEN_MARGIN}px)`,
    "--radix-popover-content-available-height": `${Math.round(usableHeight * DOCKED_CARD_SHARE)}px`,
  } as CSSProperties;
}

function insideCard(eventTarget: EventTarget | null): boolean {
  return eventTarget instanceof Element && eventTarget.closest(CARD_SELECTOR) !== null;
}

// A swipe on the card may only scroll the card, never the page behind it.
function cardCanScroll(eventTarget: EventTarget | null, deltaY: number): boolean {
  if (!(eventTarget instanceof Element)) {
    return false;
  }
  const card = eventTarget.closest(CARD_SELECTOR);
  let node: Element | null = eventTarget;
  while (card && node && card.contains(node)) {
    if (canScrollInDirection(node, deltaY)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function canScrollInDirection(element: Element, deltaY: number): boolean {
  const overflowY = getComputedStyle(element).overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") {
    return false;
  }
  if (deltaY > 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }
  if (deltaY < 0) {
    return element.scrollTop > 0;
  }
  return false;
}

function makeRoomForCard(element: HTMLElement, neededRoom: number, topObstruction: number) {
  const box = element.getBoundingClientRect();
  const band = screenBand(readVisibleArea(), topObstruction);
  const fitsAbove = box.top - band.top >= neededRoom && box.bottom <= band.bottom;
  const fitsBelow = band.bottom - box.bottom >= neededRoom && box.top >= band.top;
  if (fitsAbove || fitsBelow) {
    return;
  }

  const container = scrollingAncestor(element);
  const fitsWithRoomBelow = box.height + neededRoom <= band.bottom - band.top;
  const desiredTop = fitsWithRoomBelow
    ? band.bottom - neededRoom - box.height
    : band.top + SPOTLIGHT_PADDING + RING_WIDTH;
  container.scrollBy({ top: box.top - desiredTop, behavior: "smooth" });
}

function scrollingAncestor(element: HTMLElement): HTMLElement {
  let node = element.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function stickyBarBottom(overlayRoot: HTMLElement | null): number {
  const area = readVisibleArea();
  const probes = document.elementsFromPoint(area.left + area.width / 2, area.top + 4);
  for (const probe of probes) {
    if (overlayRoot && overlayRoot.contains(probe)) {
      continue;
    }
    let node: HTMLElement | null = probe as HTMLElement;
    while (node && node !== document.body) {
      const position = getComputedStyle(node).position;
      if (position === "sticky" || position === "fixed") {
        return Math.ceil(node.getBoundingClientRect().bottom);
      }
      node = node.parentElement;
    }
  }
  return 0;
}
