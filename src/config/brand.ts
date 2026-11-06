/**
 * Central brand configuration. In this template the values are placeholders: a client
 * sets their own here, and nothing else in the app should need editing.
 *
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
  name: "Hub",

  /** Wordmark shown in the logo. */
  wordmark: "Hub",

  /** The organization's mail domain, e.g. the login placeholder (`{{domain}}`). */
  emailDomain: "example.com",

  /** Full product name for page titles and meta descriptions. */
  productName: "Hub",

  /**
   * Separator between page name and product name in the browser title. A middot,
   * matching the separator the UI already uses elsewhere (`home.kicker`,
   * `demo.panelFooter`).
   */
  titleSeparator: "·",

  /**
   * Meta description. User-facing, so German (see the language rule in CLAUDE.md).
   */
  description: "Internes Buchhaltungs-Cockpit.",

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
   * The artwork here is ours, not a client's. A client replaces these three files with their own
   * and edits nothing else; what must never happen is one client's mark reaching the next client's
   * Hub, which is what shipping their files in this folder would do. The white variant is the same
   * artwork recoloured for the dark login panel.
   */
  assets: {
    icon: "/favicon.ico",
    logo: {
      mode: "image" as "text" | "image",
      src: "/brand/logo.png",
      white: "/brand/logo-white.png",
      /** Intrinsic aspect ratio (1000 × 444), so callers can size by height alone. */
      aspectRatio: "1000 / 444",
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
 *   // → "Eingangsrechnungen · this Hub"
 */
export function pageTitle(page?: string) {
  return page ? `${page} ${BRAND.titleSeparator} ${BRAND.productName}` : BRAND.productName;
}
