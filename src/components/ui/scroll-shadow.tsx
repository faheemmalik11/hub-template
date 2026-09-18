import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A horizontally scrollable box that says so.
 *
 * Wide tables were scrollable and gave no sign of it: the last column was cut off at the container
 * edge, and on a trackpad or a Mac -- where the scrollbar is an overlay that only appears once you
 * are already scrolling -- there was nothing at all to say more columns existed. People read the
 * table as ending where the box ended.
 *
 * The fix is the same affordance the header nav uses: whichever side still has content hidden gets
 * a soft shade, so the rows read as sliding UNDER an edge rather than stopping at one. The shade
 * appears and disappears with the scroll position, so at the far right it is only on the left, and
 * a table that fits shows nothing at all.
 *
 * Deliberately a TRANSLUCENT SHADE, not the opaque background fade the nav uses. The nav always
 * sits on the page background, so it can fade to that exact colour; tables sit on the page, on a
 * card, inside a dialog and inside a bordered panel, and an opaque fade would be the wrong colour
 * in three of those. `foreground` is the theme's text colour, so this darkens in a light theme and
 * lightens in a dark one without knowing what is behind it, and being translucent it shades the
 * cells under it rather than hiding them.
 *
 * The scrollbar is left visible on purpose -- unlike the nav, a table is expected to have one, and
 * it is a second affordance for the people whose platform draws it.
 */
export function ScrollShadow({
  children,
  className,
  viewportClassName,
}: {
  children: ReactNode;
  /** The outer, non-scrolling box the shades are pinned to. */
  className?: string;
  /** The scrolling box itself. Put `max-h-*` here, not on a parent -- see the note below. */
  viewportClassName?: string;
}) {
  // A CALLBACK REF, NOT useRef. With `useRef` the subscribing effect runs once on mount and reads
  // whatever `ref.current` happened to be at that moment; if React attaches (or re-attaches) the
  // node on a later commit -- which is what happens here, where the table hydrates inside a
  // `hidden sm:block` panel -- the effect stays bound to a node that is no longer the one on
  // screen. It subscribes successfully, measures a detached element, and the shades never move:
  // observed live at every scroll position (0, 400, max) with the listener demonstrably attached.
  // Keeping the node in state makes its identity a dependency, so the effect re-runs against the
  // element that is actually mounted.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Measuring is cheap, re-rendering a table of a hundred rows is not. The work runs once per
  // animation frame rather than once per scroll event, and state is only replaced when a side
  // actually flips between "has more" and "does not".
  const measure = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (!viewport) return;
      // 1px of slack: fractional column widths leave scrollLeft a hair short of the maximum, which
      // would otherwise keep the end shade up for ever once scrolled all the way over.
      const max = viewport.scrollWidth - viewport.clientWidth;
      const next = { start: viewport.scrollLeft > 1, end: viewport.scrollLeft < max - 1 };
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    });
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    // Both boxes matter. The viewport changes width with the window and with the sidebar; the table
    // inside it changes width when the data arrives, when a column is toggled, and when a cell's
    // content is long enough to widen its column.
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", measure);
      observer.disconnect();
      if (frame.current) {
        cancelAnimationFrame(frame.current);
        // Reset, or a cancelled frame leaves the guard above permanently truthy and every later
        // measure() returns early -- the shades would freeze wherever they last were.
        frame.current = 0;
      }
    };
  }, [viewport, measure, children]);

  return (
    <div className={cn("relative", className)}>
      {/* The shades are siblings of the scroller, not children of it. Inside, they would scroll
          away with the content and a vertically scrolling table would carry them off the top. */}
      <div ref={setViewport} className={cn("w-full overflow-auto", viewportClassName)}>
        {children}
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-gradient-to-r from-foreground/15 via-foreground/[0.04] to-transparent transition-opacity duration-200",
          edges.start ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-foreground/15 via-foreground/[0.04] to-transparent transition-opacity duration-200",
          edges.end ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
