import { useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

export function useUnsavedChangesGuard(unsaved: boolean) {
  const ownNavigation = useRef(false);
  const blocker = useBlocker({
    // Pathname only, so a page keeping its active tab in `?tab=…` can switch tabs without asking.
    shouldBlockFn: ({ current, next }) =>
      !ownNavigation.current && unsaved && current.pathname !== next.pathname,
    enableBeforeUnload: () => unsaved,
    withResolver: true,
  });
  return { blocker, ownNavigation };
}

export type UnsavedChangesGuardState = ReturnType<typeof useUnsavedChangesGuard>;
