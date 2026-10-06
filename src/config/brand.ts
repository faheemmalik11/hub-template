/**
 * Central brand configuration for Immobilien van Oepen. This branch is that client's Hub, so the
 * values are theirs: the name, the colours of FARBEN_IvO_NEU_2026 and the logo package.
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
  name: "Immobilien van Oepen",

  /** Wordmark shown in the logo. */
  wordmark: "Immobilien van Oepen",

  /** The organization's mail domain, e.g. the login placeholder (`{{domain}}`). */
  emailDomain: "immobilien-vanoepen.de",

  /** Full product name for page titles and meta descriptions. */
  productName: "Immobilien van Oepen",

  /**
   * Separator between page name and product name in the browser title. A middot,
   * matching the separator the UI already uses elsewhere (`home.kicker`,
   * `demo.panelFooter`).
   */
  titleSeparator: "·",

  /**
   * Meta description. User-facing, so German (see the language rule in CLAUDE.md).
   */
  description: "Buchhaltung und Provisionen von Immobilien van Oepen.",

  /**
   * Browser-chrome color (`<meta name="theme-color">`). The one place a brand
   * color is duplicated outside `styles.css`: the meta tag needs a literal value
   * and cannot read a CSS variable. Keep in sync with `--brand`
   * (`#423F3B`, Kohle: the primary colour of the brand).
   */
  themeColor: "#423F3B",

  /**
   * Brand assets under `public/`. `logo.mode` selects how `<Logo>` renders:
   * `"text"` draws `wordmark`, `"image"` draws `logo.src` / `logo.white`.
   *
   * The artwork here is the client's own, from their logo package: the gold wordmark with the symbol,
   * and the white one for the dark login panel. `mark.png` is the symbol alone.
   */
  assets: {
    // The ?v= on each file is a cache buster: browsers hold on to a favicon and a logo for a long time,
    // so a changed file needs a changed address. Raise it when the artwork changes again.
    icon: "/favicon.ico?v=ivo1",
    iconPng: "/brand/mark.png?v=ivo1",
    logo: {
      mode: "image" as "text" | "image",
      src: "/brand/logo.png?v=ivo1",
      white: "/brand/logo-white.png?v=ivo1",
      /** Intrinsic aspect ratio (1200 × 268), so callers can size by height alone. */
      aspectRatio: "1200 / 268",
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
