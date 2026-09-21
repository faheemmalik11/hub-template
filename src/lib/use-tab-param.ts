import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Keeps a page's active tab in the URL (`?tab=…`) instead of in component state, so it survives a
 * refresh, a back/forward step, and a shared link. Every multi-tab screen uses this, so they all
 * behave the same way.
 *
 * Why the URL rather than localStorage: a refresh is only one of the ways a tab gets lost, and it
 * is the least annoying one. A link someone pastes into a chat should open on the tab they were
 * looking at, and the browser's back button should undo a tab switch the same way it undoes any
 * other navigation. localStorage does none of that, and it leaks one screen's last tab into a
 * different person's session on a shared machine.
 *
 * `replace: true`: a tab click rewrites the current history entry rather than pushing a new one.
 * Clicking through five tabs then pressing back should return to the PREVIOUS PAGE, not walk back
 * through five tab states.
 *
 * The route must let `tab` through its own `validateSearch` (see `withTabSearch`), otherwise
 * TanStack Router drops unknown search params and the value never round-trips.
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  fallback: T,
): [T, (next: string) => void] {
  const navigate = useNavigate();
  // `strict: false` so one hook works for every route without knowing its search type.
  const search = useSearch({ strict: false }) as { tab?: unknown };

  // Validated against the page's own tab list, never trusted raw: a hand-edited or stale
  // `?tab=whatever` must fall back to the default rather than render a Tabs component with a value
  // no TabsContent matches, which shows a page with every panel blank.
  const raw = typeof search.tab === "string" ? search.tab : undefined;
  const active = (tabs as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;

  const setActive = useCallback(
    (next: string) => {
      // Normalised on the way OUT too, not just on read: an unrecognised value would otherwise sit
      // in the address bar while the UI rendered the fallback, and sharing that link would
      // silently reproduce the wrong tab.
      const value = (tabs as readonly string[]).includes(next) ? next : fallback;
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, tab: value }),
        replace: true,
        // Switching a tab is not navigating to a new page, and the router's default scroll
        // restoration treated it as one: on the invoice screen, where the tabs sit well below a
        // tall header, every click threw the reader back to the top and they had to scroll down
        // again to see the panel they had just asked for.
        resetScroll: false,
      });
    },
    [navigate, tabs, fallback],
  );

  return [active, setActive];
}

/**
 * Merges `tab` into a route's `validateSearch`. Use as the whole validator on a route that has no
 * other search params, or spread alongside the existing ones.
 */
export function tabSearch(input: Record<string, unknown>): { tab?: string; focus?: string } {
  return {
    tab: typeof input.tab === "string" ? input.tab : undefined,
    focus: typeof input.focus === "string" ? input.focus : undefined,
  };
}
