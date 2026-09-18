import * as React from "react";

// Matches Tailwind's default `sm` breakpoint (640px) — the mobile-card sections across the app
// swap layout via CSS `hidden sm:block` / `sm:hidden` at 640px. This hook drives the same swap in
// JS (Popover->Sheet filter swaps etc.), so both must agree on one cutoff or a device between
// 640-768px sees a mismatched mix of desktop and mobile UI on the same page.
const MOBILE_BREAKPOINT = 640;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
