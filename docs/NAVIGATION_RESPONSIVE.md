# Header navigation: breakpoints and horizontal scrolling

## What was asked for

The header nav was unusable between a phone and a wide desktop. First round: labels were clipped at
around 950px with no sign that anything was hidden. Second round: "on desktop view 768 and above the
nav bar should scroll, the icon should appear on tablet only, the scroll should be proper, and a
dark area indicating if the scroll can happen horizontally".

## What is implemented

### Breakpoints

| Width                 | What the user sees                                                      |
| --------------------- | ----------------------------------------------------------------------- |
| below 768px (`md`)    | Hamburger button left of the logo, full nav in a left drawer            |
| 768px and up          | The inline row, scrolling sideways when it does not fit                 |
| 1536px and up (`2xl`) | Same row, plus the user's name next to the avatar and wider tab padding |

Files: `src/components/layout/app-shell.tsx` (`md:hidden` on the hamburger button and on
`SheetContent`, `hidden md:block` on the `NavScroller` wrapper). The user's name is hidden from `md`
to `2xl` because that is exactly the range where the row is on screen and short of room.

The drawer is unchanged: groups collapsed, the group holding the current page open on mount.

### The scrolling row

`src/components/layout/nav-scroller.tsx` (`NavScroller`) wraps the row. It owns three things.

1. **Edge fade plus a chevron.** The standard tab-strip affordance, on whichever side still has
   entries behind it. The 64px overlay is two layers: the page background fading to transparent,
   which is what dissolves the entries under it, and a soft `--foreground` shade over the outer
   32px, because a fade alone is easy to miss when the row and the header are the same colour. A
   chevron sits in it and scrolls by 80% of the visible width. The overlay is `pointer-events-none`, so a half-faded entry stays
   clickable where it shows; only the chevron takes clicks. Both are `aria-hidden` with
   `tabIndex={-1}`: tabbing through the entries scrolls the row on its own, so the buttons are a
   pointer convenience with nothing extra to announce.
2. **Wheel easing.** A mouse wheel sends one large jump per notch and the browser applies it at
   once, which made the row step rather than move. The handler collects the deltas into a target and
   eases toward it (`distance * 0.22` per frame). Trackpads are left to the browser: their deltas are
   small and already continuous. At either end the wheel is handed back to the page, so the sticky
   header never blocks scrolling down. The listener is registered with `addEventListener` and
   `passive: false`, because React's `onWheel` is passive at the root and cannot `preventDefault`.
3. **The active entry stays visible.** On a route change the entry marked `aria-current="page"` is
   scrolled into view with `behavior: "smooth"` if it sits outside the viewport, with 40px of margin
   so it does not land under a chevron.

Measuring is throttled to one animation frame and the state is only replaced when a side actually
flips between having more and not. Without that, every frame of a scroll re-rendered every nav entry.

The row is `w-max` inside the scroll box and **only centred while it fits**. Centring an
overflowing row breaks the scrolling rather than just looking off: auto margins (and
`justify-content: center`) centre a box wider than its container by giving it negative margins on
both sides, and a scroll container cannot scroll to content that overflows its start edge. The
first entries end up cut off and unreachable, and only half the overflow is left to scroll, so the
fades barely register. Once the row overflows it starts at the left, where every entry is
reachable.

### Props

| Prop        | Meaning                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `align`     | `"center"` (header) or `"start"`. Only applies while the row fits; once it overflows it starts at the left either way. |
| `activeKey` | Changes on route change, which is what triggers the scroll-into-view.                                                  |
| `label`     | Accessible name for the `<nav>` landmark the component renders.                                                        |
| `className` | Goes on the positioned wrapper, which is where the responsive `hidden md:block` lives.                                 |

## Open points

- Not verified in a browser by Claude: the app is behind a login, so the breakpoints and the fade
  were reasoned from the layout, then confirmed by the client on screen.
- The scrollbar stays hidden (`scrollbar-none`). A visible one would sit under the header border and
  change the row height between platforms.
- Keyboard users reach hidden entries by tabbing, which scrolls the row natively. The chevrons are
  pointer-only for that reason.
