import { useCallback, useEffect, useRef } from "react";

/**
 * True infinite scroll: a sentinel after the last row calls `fetchNextPage()` once it comes into
 * view.
 *
 * This drives a server-paginated `useInfiniteQuery` -- the next page is FETCHED when the reader
 * reaches the end. Its sibling `useInfiniteRows` only windows an array that has already been
 * fetched whole, which is the cheaper thing to reach for and almost always the wrong one: it makes
 * a screen feel paginated while the request behind it still pulls every row.
 *
 * Observes EVERY mounted sentinel, not just the most recent. These screens render the same list
 * twice, a table above `sm` and cards below it, and both stay in the DOM at all widths -- one is
 * merely `display:none`. Keeping a single node meant the second sentinel to mount silently
 * disconnected the first, so on a wide window nothing was observed and scrolling fetched nothing. A
 * hidden node never intersects, so observing both is safe: only the visible one can ever fire.
 *
 * Removal uses React 19's ref-callback cleanup, which takes out exactly the node that unmounted.
 * Reacting to a `null` argument instead could only ever clear all of them, taking a still-mounted
 * sibling with it.
 */
export function useFetchNextSentinel(
  hasNextPage: boolean | undefined,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodesRef = useRef<Set<HTMLElement>>(new Set());

  const watch = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!hasNextPage || nodesRef.current.size === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage();
      },
      // Starts the next fetch slightly before the sentinel is actually on screen, so scrolling
      // does not visibly stall at the boundary while the request is in flight.
      { rootMargin: "120px" },
    );
    for (const el of nodesRef.current) observer.observe(el);
    observerRef.current = observer;
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      nodesRef.current.add(node);
      watch();
      return () => {
        nodesRef.current.delete(node);
        watch();
      };
    },
    [watch],
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      nodesRef.current.clear();
    },
    [],
  );

  return sentinelRef;
}
