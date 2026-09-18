import { useEffect, useState } from "react";

/**
 * Delays following `value` until it has stopped changing for `delayMs`. For a search box wired
 * to a server-side query, this is what keeps typing from firing one request per keystroke — the
 * input itself stays bound to the live value, only the value handed to the query is debounced.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
