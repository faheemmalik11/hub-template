/**
 * Two cards in one row, stacked again when the column gets narrow.
 *
 * The Amounts card is a right-aligned block of figures: net, VAT, gross, each a label on the left
 * of its own sub-grid and a number hard against the right edge. Given a full-width card that
 * leaves the entire left half blank, and the card below it -- three short invoice-data fields --
 * had to be scrolled to for no reason. Side by side, both fill the width they are given.
 *
 * `xl`, not `lg`: the detail screen already splits into document + content at `lg`, so at exactly
 * that width the content column is around 640px and halving it puts a euro amount and its label in
 * 320px. One breakpoint later there is room for both.
 *
 * Both cards take the height of the taller one. That is the grid's own default and the reason no
 * `items-start` is set here: two bordered cards of different heights side by side leave a ragged
 * step along the bottom edge, and the eye reads the step as the shorter card being cut off.
 *
 * Portable: byte-identical across the hub repos. It lays out whatever two sections a repo passes
 * it and knows nothing about them.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SideBySide({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-6 xl:grid-cols-2", className)}>{children}</div>;
}
