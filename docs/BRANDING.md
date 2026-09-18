# Branding: single source of truth

How to rebrand this app, and where brand identity actually lives. Audience: a future
session picking this up cold.

## The three places

Brand identity is deliberately split across three layers, not one file. Each has a reason.

| Layer      | File                                     | Holds                                                                                 |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| **Config** | `src/lib/brand.ts`                       | name, wordmark, product name, mail domain, meta description, theme color, asset paths |
| **Colors** | `src/styles.css` (`:root`, ~lines 90-95) | the `--brand*` ramp                                                                   |
| **Copy**   | `src/lib/i18n/locales/{de,en}.ts`        | all user-facing text; interpolates the name via `{{brand}}` / `{{domain}}`            |

Colors stay in CSS rather than moving into `brand.ts` because Tailwind resolves
`bg-brand`, `text-brand` etc. at build time from the CSS variables, and everything else
(`--primary`, `--ring`, `--accent`, `--chart-*`, `--sidebar*`) already derives from the
same ramp. Moving them into TypeScript would require injecting a `<style>` block at boot,
which costs a first-paint color flash and a build-time regression, for no gain.

One brand color is duplicated: `BRAND.themeColor`. The `<meta name="theme-color">` tag
needs a literal value and cannot read a CSS variable. **Keep it in sync with
`--brand-hover`.**

## Rebranding checklist

1. `src/lib/brand.ts`: name, wordmark, `productName`, `emailDomain`, `description`.
2. `src/styles.css`: the `--brand*` ramp; mirror `--brand-hover` into `BRAND.themeColor`.
3. `public/favicon.ico`: replace the file.
4. Logo artwork: drop files into `public/brand/`, then set `BRAND.assets.logo.mode` to
   `"image"`. `<Logo>` handles the rest, with no component change.

Nothing else should need touching. If it does, that's a hardcoded value worth pulling
into `brand.ts`.

## API

```ts
import { BRAND, brandVars, pageTitle } from "@/lib/brand";

pageTitle("Eingangsrechnungen"); // "Eingangsrechnungen — Stäy Hub"
pageTitle(); // "Stäy Hub"
t("auth.login.subheading", brandVars()); // interpolates {{brand}} / {{product}} / {{domain}}
```

`brandVars()` supplies three placeholders: `{{brand}}` (the name, "Stäy"), `{{product}}`
(the full product name, "Stäy Hub") and `{{domain}}` (the mail domain). A locale string
that names the brand must use one of them and pass `brandVars()` at the call site. Never
spell the name out.

## What is implemented

- `src/lib/brand.ts`: `BRAND`, `brandVars()`, `pageTitle()`. Comments in English per the
  CLAUDE.md language rule.
- `src/routes/__root.tsx`: title, description, `theme-color`, `og:title`/`og:description`
  and the favicon link all read from `BRAND`. These were previously hardcoded, and the
  theme color was still the previous project's teal (`#4F8C8C`) while the ramp had already
  moved to beige.
- `src/components/brand/logo.tsx`: renders `BRAND.wordmark` as text, or an `<img>` when
  `BRAND.assets.logo.mode === "image"`.
- Four dead favicon `<link>`s removed from `__root.tsx` (`/favicon.svg`,
  `/favicon-32x32.png`, `/favicon-16x16.png`, `/favicon-48x48.png`). None of those files
  ever existed in `public/`, so each page load fired four 404s.
- **All 35 route files** use `pageTitle("<Seite>")` instead of writing
  `"<Seite> — Stäy Hub"` by hand. The dashboard's title was `"Stäy Hub — Übersicht"`
  (reversed) and is now `"Übersicht — Stäy Hub"`, consistent with every other page.
  `src/routes/index.tsx` also had its own hardcoded `description`; it reads
  `BRAND.description` now.
- **All 8 brand mentions in the locale files** interpolate instead: `demo.panelTitleLine1`
  (was `"Die STÄY Gruppe"` / `"The STÄY Group"`), `demo.panelFooter`, `home.kicker` and
  `ausgangsrechnungen.subtitle`, in both `de.ts` and `en.ts`. Their four call sites
  (`routes/demo.tsx` ×2, `routes/index.tsx`, `routes/ausgangsrechnungen/index.tsx`) pass
  `brandVars()`.
- **The DATEV handover email** (`src/lib/api/datev-handover.functions.ts`) uses
  `BRAND.productName` in its body. This one leaves the app: it goes to the tax advisor.

`grep -rni "stäy\|staey" src --include=*.ts --include=*.tsx` returns no user-facing hits
outside `brand.ts`. What remains are code comments and two localStorage keys
(`staey.locale`, `staey:acting-as-changed`), deliberately left, since renaming a storage
key would silently discard every user's saved preference.

## Assets: none of ours

The imported codebase shipped brand assets belonging to **other companies**. All removed:

| File                          | Was actually                                            |
| ----------------------------- | ------------------------------------------------------- |
| `public/brand/logo.svg`       | netz.immo (Immonetz) wordmark, `aria-label="netz.immo"` |
| `public/brand/logo-white.svg` | same, white variant                                     |
| `public/brand/og-default.jpg` | **HANSEVEST** logo, an unrelated third company          |

None were referenced by any component. `og-default.jpg` in particular must not be
restored: shipping another company's logo as this app's link-preview image is a real
problem, not a cosmetic one.

## Open / still to do

- ⚠️ **`public/favicon.ico` is still the netz.immo icon** (teal mountains). It is the only
  icon in the repo, so it was left in place rather than leaving the browser tab blank.
  **Replace before go-live.** No Stäy artwork has ever been supplied by the client. Tracked
  in `communication/INDEX.md` under "Awaiting client answer", item 11.
- No `og:image` is emitted, because there is no valid asset for one.

Everything else in the UI is done: nothing outside `brand.ts` spells the brand name out.
To keep it that way, `grep -rni "stäy\|staey" src --include=*.ts --include=*.tsx` should
only ever return comments and the two localStorage keys noted above.
