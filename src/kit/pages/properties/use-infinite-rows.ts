import { useCallback, useEffect, useRef, useState } from "react";

// Reveals a long list a page at a time as the reader scrolls; windows rendering, not fetching.
export function useInfiniteRows<Row>(rows: Row[], pageSize = 25) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [rows, pageSize]);

  const hasMore = visibleCount < rows.length;

  // A callback ref because the sentinel mounts and unmounts as the list grows.
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      if (!node || !hasMore) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisibleCount((count) => Math.min(count + pageSize, rows.length));
          }
        },
        // Start the next page slightly before the sentinel is on screen.
        { rootMargin: "120px" },
      );
      observerRef.current.observe(node);
    },
    [hasMore, pageSize, rows.length],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { visible: rows.slice(0, visibleCount), hasMore, sentinelRef, total: rows.length };
}
