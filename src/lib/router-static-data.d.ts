import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The key under `pageTitles` in the locale files: the browser tab title, in the current language. */
    titleKey?: string;
  }
}
