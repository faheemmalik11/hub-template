/**
 * Central brand configuration. The single source for the product name and brand
 * identity. Components must not hardcode the name; import from here instead.
 *
 * Deliberately NOT here:
 * - **Copy**: lives in `src/lib/i18n/locales/{de,en}.ts`. Translatable strings
 *   interpolate the name through `{{brand}}` / `{{domain}}` (see `brandVars()`),
 *   so a rebrand never has to touch a translation.
 * - **Colors**: live as CSS variables in `src/styles.css` (`--brand`,
 *   `--brand-hover`, …). Tailwind utilities such as `bg-brand` read them, and
 *   `--primary`, `--ring`, `--accent` and the chart colors all derive from them.
 *   `themeColor` below is the single exception (see the note on it).
 *
 * Rebranding checklist:
 *   1. edit the values in this file,
 *   2. edit the `--brand*` ramp in `src/styles.css` (and mirror `--brand-hover`
 *      into `themeColor` below),
 *   3. replace the files in `public/` listed under `assets`.
 * See `docs/BRANDING.md`.
 */

export const BRAND = {
  /** Product name in running text and translations (`{{brand}}`). */
  name: "Stäy",

  /** Wordmark shown in the logo. */
  wordmark: "Stäy",

  /** The organization's mail domain, e.g. the login placeholder (`{{domain}}`). */
  emailDomain: "staey.de",

  /** Full product name for page titles and meta descriptions. */
  productName: "Stäy Hub",

  /**
   * Separator between page name and product name in the browser title. A middot,
   * matching the separator the UI already uses elsewhere (`home.kicker`,
   * `demo.panelFooter`).
   */
  titleSeparator: "·",

  /**
   * Meta description. User-facing, so German (see the language rule in CLAUDE.md).
   */
  description: "Internes Buchhaltungs-Cockpit von Stäy.",

  /**
   * Browser-chrome color (`<meta name="theme-color">`). The one place a brand
   * color is duplicated outside `styles.css`: the meta tag needs a literal value
   * and cannot read a CSS variable. Keep in sync with `--brand`
   * (`oklch(0.8 0.041 59.7)`, the logo beige).
   */
  themeColor: "#D2B8A4",

  /**
   * Brand assets under `public/`. `logo.mode` selects how `<Logo>` renders:
   * `"text"` draws `wordmark`, `"image"` draws `logo.src` / `logo.white`.
   *
   * The logo and favicon are the client's own files, taken from staey.de. The
   * white variant is the same artwork with the charcoal wordmark recoloured to
   * white for the dark `bg-brand-dark` login panel; the beige umlaut dots stay
   * beige, which is what keeps it legible there. Set `mode` back to `"text"` to
   * fall back to the plain wordmark.
   */
  assets: {
    icon: "/favicon.ico",
    logo: {
      mode: "image" as "text" | "image",
      src: "/brand/logo.svg",
      white: "/brand/logo-white.svg",
      /** Intrinsic aspect ratio (138.62 × 71.43), so callers can size by height alone. */
      aspectRatio: "138.62 / 71.43",
    },
  },
} as const;

/**
 * Interpolation values for every brand-related translation. Any locale string
 * that names the brand must use `{{brand}}`, `{{product}}` or `{{domain}}` and
 * pass this, never spelling the name out.
 *
 * Usage: `t("auth.login.subheading", brandVars())`
 */
export function brandVars() {
  return { brand: BRAND.name, product: BRAND.productName, domain: BRAND.emailDomain };
}

/**
 * Page title for a route's `head()`. Call with the page name; omit it for the
 * app root. Routes must not concatenate the product name themselves.
 *
 *   head: () => ({ meta: [{ title: pageTitle("Eingangsrechnungen") }] })
 *   // → "Eingangsrechnungen · Stäy Hub"
 */
export function pageTitle(page?: string) {
  return page ? `${page} ${BRAND.titleSeparator} ${BRAND.productName}` : BRAND.productName;
}
