import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reveal a long list a page at a time as the reader scrolls to the end of it.
 *
 * THIS DOES NOT REDUCE FETCHING. It windows an array that has already been fetched whole: the DOM
 * stops carrying hundreds of rows nobody has scrolled to, and that is the entire benefit. The
 * request behind it is unchanged.
 *
 * Reach for it only when the caller genuinely needs the complete array anyway. If the array comes
 * from a query, the query is the thing to page -- use `useInfiniteQuery` with `.range()` and
 * `useFetchNextSentinel` instead. The company and supplier detail pages were built on this hook
 * and looked paginated while still pulling every invoice with `select("*")`; see
 * docs/GESELLSCHAFTEN.md for what that cost and what replaced it.
 *
 * `sentinelRef` goes on an element after the last row. When it comes into view another page is
 * revealed; when `rows` changes identity -- a filter, a refetch -- the window resets to page one.
 */
export function useInfiniteRows<T>(rows: T[], pageSize = 25) {
  const [count, setCount] = useState(pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);
  /**
   * Every sentinel currently mounted, not just the most recent one.
   *
   * These screens render the same list twice, a table above `sm` and cards below it, and both
   * renderings stay in the DOM at every width -- one is only `display:none`. With a single stored
   * node the ref callback disconnected the desktop sentinel the moment the mobile one mounted, so
   * on a wide window nothing was being observed and the list simply stopped at page one. A hidden
   * node never intersects, so observing both is safe: only the visible one can ever fire.
   */
  const nodesRef = useRef<Set<HTMLElement>>(new Set());

  useEffect(() => {
    setCount(pageSize);
  }, [rows, pageSize]);

  const hasMore = count < rows.length;

  /** Rebuild the single observer over whatever sentinels are mounted right now. */
  const beobachten = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!hasMore || nodesRef.current.size === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, rows.length));
        }
      },
      // Start the next page slightly before the sentinel is actually on screen, so scrolling
      // does not visibly stop at the boundary.
      { rootMargin: "120px" },
    );
    for (const el of nodesRef.current) observer.observe(el);
    observerRef.current = observer;
  }, [hasMore, pageSize, rows.length]);

  // A callback ref rather than useRef + useEffect: a sentinel only exists while there is more to
  // show, so it mounts and unmounts as the list grows, and this re-attaches on each change.
  //
  // The returned cleanup is React 19's ref-callback cleanup. It matters here because there can be
  // more than one sentinel: it removes exactly the node that unmounted, where reacting to a `null`
  // argument could only ever clear all of them and would take a still-mounted sibling with it.
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      nodesRef.current.add(node);
      beobachten();
      return () => {
        nodesRef.current.delete(node);
        beobachten();
      };
    },
    [beobachten],
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      nodesRef.current.clear();
    },
    [],
  );

  return { visible: rows.slice(0, count), hasMore, sentinelRef, total: rows.length };
}
