---
name: theme
description: The this Hub colour system — warm white surfaces, soft beige chrome, muted brown accent. Load before choosing any colour, writing a Tailwind colour class, styling a button/toggle/badge/chart, or editing src/styles.css. Explains which token to reach for, the restraint rule that keeps the palette clean, and what never to hard-code.
---

# this Hub theme

Warm white + soft beige + muted brown. Defined once in `src/styles.css` under `:root`,
exposed to Tailwind through the `@theme inline` block above it.

## The rule that matters most

**Brown is an accent, not a surface.** It belongs on buttons, toggles, active states and
small marks. White stays the dominant surface, beige is only chrome. A page that turns brown
loses the calm the palette exists for. If you find yourself painting a panel `bg-brand-*`,
stop — use `bg-card` and put the brown on the control inside it.

## Tokens

Use the Tailwind class, never the hex. Every value below already exists as a token.

### Surfaces

| Class | Value | Use for |
| --- | --- | --- |
| `bg-background` / `bg-brand-wash` | `#FBF9F9` | Page background |
| `bg-card` | `#FFFFFF` | Cards, panels, inputs |
| `bg-sidebar` | `#F8F4F1` | Sidebar |
| `bg-header` | `#FAFAF8` | Top bar |
| `bg-brand-tint` | `#F7EFE8` | Light accent fill, group boxes |
| `bg-muted` | `#EEE9E4` | Neutral chips, dividers, tracks |
| `border-border` | `#E8E2DC` | All borders |
| `border-input` | `#E3DDD7` | Input borders |

Elevation ladder, lightest last: sidebar `#F8F4F1` → header `#FAFAF8` → page `#FBF9F9` →
cards `#FFFFFF`. The steps are deliberately tiny; cards are still the brightest thing on
screen, and that alone is what makes them read as raised. Do not widen the gaps to "make it
clearer" — the flatness is the design.

### Text

| Class | Value | Use for |
| --- | --- | --- |
| `text-foreground` | `#24211F` | Primary text |
| `text-muted-foreground` | `#6F6964` | Secondary and helper text |
| `text-placeholder` | `#A39C96` | Input placeholders only |
| `text-brand-dark` | `#8F5E3A` | Links, active tab text, card-title icons |

### Brand

| Class | Value | Use for |
| --- | --- | --- |
| `bg-primary` / `bg-brand-hover` | `#98603D` | Primary buttons, toggle ON |
| `bg-brand-dark` | `#8F5E3A` | Button hover, login panel |
| `ring-ring` | `#98603D` | Focus rings |

`--brand` (`#D2B8A4`) is the logo beige and `--brand-ink` (`#333335`) the logo charcoal.
Both are the brand's own reference values. Do not repurpose them as UI colours.

### Status

| Class | Value |
| --- | --- |
| `text-success` / `bg-success-soft` | `#16845B` / `#EDF8F3` |
| `text-warning` / `bg-warning-soft` | `#B7791F` / `#FDF4E6` |
| `text-danger` / `bg-danger-soft` | `#C64B4B` / `#FBEEEE` |

Status colour carries meaning, so never use it decoratively. A green figure must mean good
news, not "this is a number".

### Controls

Toggle ON `#98603D`, OFF `#DDD7D1` (`--switch-off`), knob white. Inputs, selects, comboboxes,
textareas and date pickers are white with an `#E3DDD7` border and an `#98603D` focus ring, and
are already wired up in `src/components/ui/` — do not restyle them per screen.

**Form controls carry no shadow.** The border defines them. A drop shadow muddies a palette this
flat and competes with cards, which are the only thing meant to read as raised. Floating layers
(popover and dropdown *content*, dialogs, the bell menu) do keep theirs, because they genuinely
sit above the page.

### Charts

`--chart-1` is the brand brown; `--chart-2..5` are a deliberately cool slate ramp so adjacent
series stay distinguishable. They differ in hue, not just lightness. Do not "harmonise" them
back into the beige family — that is the bug the ramp was introduced to fix.

## Hard rules

- **Never hard-code a hex or a raw Tailwind palette colour** (`bg-amber-50`, `text-red-600`,
  `#fff`) in a component. If a shade seems missing, add a token in `styles.css` and map it in
  `@theme inline`; do not inline it.
- **Never pair `bg-brand`/`bg-brand-tint` with `text-white`.** Those tints are light; white on
  them lands near 1.5:1. Use `text-brand-dark`. This has been a real bug here more than once.
- **Icon chips use a soft fill with a saturated glyph**, not a saturated fill with white.
  The shared map is `CHIP` in `src/components/dashboard/stat-tile.tsx` — reuse it rather than
  inventing per-screen colours.
- **Dark mode is a separate `.dark` block** in `styles.css` and is not part of this palette.
  Changing `:root` does not update it.

## Changing the theme

Edit `:root` in `src/styles.css` only. Every screen derives from it, so a token change is
global by design — which also means it needs a look at the login panel, the sidebar active
state and the charts before it ships, since those three are the usual casualties.
