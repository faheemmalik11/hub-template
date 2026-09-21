import { useEffect, useRef, useState } from "react";

/**
 * Show a few rows, append more as the list is scrolled.
 *
 * Its own file and its own hook because two different presentations of the same drilldown need it —
 * the compact `BelegListe` and the breakdown's entries table — and a category with four hundred
 * receipts must not render four hundred rows in either of them the moment it is opened.
 *
 * The reset on `items` identity is the load-bearing part: a freshly opened category would otherwise
 * inherit the previous one's row count. It also means callers MUST hand over a stable array —
 * rebuilding the list inline on every render resets the counter forever and "load more" never
 * advances past the first page. That bug has been shipped here once already; `useMemo` the array.
 */
export function useInfiniteRows<T>(items: T[], firstPage = 5, loadMore = 20) {
  const [visible, setVisible] = useState(firstPage);
  const sentinel = useRef<HTMLElement | null>(null);

  useEffect(() => setVisible(firstPage), [items, firstPage]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((n) => Math.min(n + loadMore, items.length));
        }
      },
      // Start fetching slightly before the sentinel is actually on screen, so scrolling does not
      // stall at the boundary.
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length, loadMore]);

  return { visible, sentinel, hatMore: visible < items.length, rest: items.length - visible };
}
