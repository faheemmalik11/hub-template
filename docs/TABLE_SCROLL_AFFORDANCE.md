# Table scroll affordance

## The problem

Wide tables scrolled sideways and said nothing about it. The last column was cut off flush with the
container edge, which reads as the table ending there. On a trackpad, and on any platform that draws
an overlay scrollbar (macOS by default, and Chrome on Linux for a container that is not being
scrolled), there was no scrollbar on screen either, so there was nothing at all to say that more
columns existed.

The incoming-invoices list made it visible because it has the most columns, but it was never that
screen's problem: every table in the app behaved the same way.

## What was built

`src/components/ui/scroll-shadow.tsx` (`ScrollShadow`) is a box that scrolls its content and shades
whichever edge still has content hidden behind it. The shade appears and disappears with the scroll
position: at the far right only the left edge is shaded, and a table that fits shows nothing.

It is the same affordance as the header nav (`NavScroller`, see `NAVIGATION_RESPONSIVE.md`) with two
deliberate differences:

- **A translucent shade, not an opaque background fade.** The nav always sits on the page
  background, so it can fade to that exact colour. Tables sit on the page, on a card, inside a
  dialog and inside a bordered panel, and an opaque fade would be the wrong colour in three of
  those. The shade is built from `foreground` (the theme's text colour), so it darkens in a light
  theme and lightens in a dark one without knowing what is behind it, and being translucent it
  shades the cells under it rather than hiding them.
- **No chevron buttons.** In the nav they sit in a 40px-tall strip. Over a table they would float in
  the middle of the rows, covering data and landing in a different place on every screen.

The scrollbar is left visible, unlike the nav's. A table is expected to have one, and it is a second
affordance for the people whose platform draws it.

Implementation notes worth keeping:

- Measuring is throttled to one animation frame and the state is only replaced when an edge actually
  flips between "has more" and "does not". Otherwise every frame of a scroll re-renders every row.
- A `ResizeObserver` watches both the viewport and the table inside it, so the shades stay correct
  when the window resizes, when the data arrives, and when a long cell widens a column.
- The shades are siblings of the scrolling box, not children. Inside it they would scroll away, and
  a vertically scrolling table would carry them off the top.

## Where it applies

**Every `<Table>` in the app, automatically.** `src/components/ui/table.tsx` already owned an
`overflow-auto` wrapper, so `Table` now renders that wrapper as a `ScrollShadow`. No call site has
to opt in.

`Table` gained one prop:

| Prop                 | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `containerClassName` | Goes on the **scrolling** box. This is the only correct place for a height cap. |

Height caps had to move. A `max-h-*` on a parent makes _that parent_ the scroller, so the table's
own scroller never overflows and never shows the shades. Every call site that capped a table's
height this way was changed from

```tsx
<div className="max-h-[360px] overflow-auto rounded-md border">
  <Table>
```

to

```tsx
<div className="rounded-md border overflow-hidden">
  <Table containerClassName="max-h-[360px]">
```

The same applies to a table sized by its flex parent (`flex-1 min-h-0`): the parent keeps the
height and loses its `overflow-*`, and the table gets `containerClassName="h-full"`.

`overflow-hidden` replaced the removed `overflow-*` wherever the wrapper had a `rounded-*` class,
because that wrapper was relying on its own overflow to clip the table to the rounded corners.

**Raw `<table>` markup** that does not go through the shared component (some older screens) was
wrapped in `ScrollShadow` directly, replacing its own `overflow-x-auto` div.

## Minimum widths

A shade only appears when there is something hidden, and an auto-layout `w-full` table never hides
anything: it squeezes columns until the content cannot shrink any further. On the incoming-invoices
list at 1468px that meant a truncated issuer and received dates wrapped onto three lines, while the
table technically still fitted, so it never scrolled and the shade was correctly absent. another client
showed the shade at the same width only because its copy of that table carries one extra column.

So every table with **8 or more columns** now sets a minimum width, at roughly **125px per column**,
which is the ratio behind the agreed 1500px for the 12-column invoice list:

| Columns | `min-w` |
| ------- | ------- |
| 8       | 1000px  |
| 9       | 1120px  |
| 10      | 1240px  |
| 11      | 1380px  |
| 12      | 1500px  |
| 13      | 1620px  |

Below 8 columns nothing was set: those tables have room to lay out honestly, and forcing a scroll
inside a narrow card or dialog would be worse than the squeeze.

Two tables were left alone because they were already sized: `BeraterPaymentView` (16 columns) and
the accounting `lieferanten` list both carry their own `min-w`. `Vertriebsliste` (28 columns) is
also untouched: its headers are `whitespace-nowrap` with a `sticky left-0` first column, so it
already overflows at its natural width by design.

The tiers are a starting point, not a measurement. A table of short numeric columns needs less than
125px each and one carrying addresses needs more, so adjust the individual value when a screen
proves it wrong rather than changing the ratio for everything.

## Verifying it

The failure mode is a _second_ scroller outside the table's own, which silently swallows the
overflow. To find any that get reintroduced, look for an `overflow-x-auto` / `overflow-auto`
wrapper sitting directly above a `<Table>` or a `<table>`:

```
grep -rn -A2 'overflow-\(x-\)\?auto' src --include=*.tsx | grep -i '<table'
```

This should return nothing.

## Open points

- Not verified in a browser by Claude: the apps are behind a login, so the behaviour was reasoned
  from the layout and confirmed by typecheck, lint and build.
- Tables whose wrapper is `overflow-hidden` (content clipped, never scrollable) were left alone,
  since there is nothing to indicate. If one of those turns out to cut off a column, it needs
  `ScrollShadow`, not a wider shade.
