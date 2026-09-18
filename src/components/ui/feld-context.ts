import * as React from "react";

/**
 * The id shared by one form field's label and its control. See `feld.tsx` for the wrapper that
 * provides it. It lives in its own module so `feld.tsx` exports a component and nothing else,
 * which is what fast refresh needs.
 */
export const FeldContext = React.createContext<string | null>(null);

/** The generated control id for the surrounding Feld, or null outside one. */
export function useFeldId() {
  return React.useContext(FeldContext);
}
