import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, cn } from "../adapter";

/**
 * A label that can explain itself, in one plain sentence.
 *
 * A Popover rather than a Tooltip, and a real <button> rather than a <span>. Radix tooltips open on
 * hover and focus but never on tap, so a tooltip here would put every explanation out of reach on a
 * phone and out of the tab order entirely. A popover opens on click, tap and Enter alike and
 * dismisses on Escape or an outside click. (Controlling a Tooltip's `open` to add click was tried
 * and loses a race with Radix's own pointerdown-closes handler.)
 *
 * `stopPropagation` on both click and keydown, because these labels sit inside rows that are
 * themselves clickable: opening an explanation must not also expand the row underneath it.
 *
 * Used by the KPI cards and by every line of the P&L table, so one dotted underline means the same
 * thing everywhere on the screen.
 *
 * `als="icon"` swaps the dotted underline for an ⓘ button, for places where the text it explains is
 * a figure rather than a label — underlining "28,9 %" would read as part of the number. Same
 * popover, same keyboard and tap behaviour; only the trigger differs.
 */
export function Explanation({
  label,
  explanation,
  className,
  align = "start",
  als = "text",
}: {
  label: string;
  /** Empty or missing renders the plain label with no affordance. */
  explanation?: string;
  className?: string;
  align?: "start" | "center" | "end";
  /** "icon" renders an ⓘ button instead of the underlined label; `label` becomes its aria-label. */
  als?: "text" | "icon";
}) {
  if (!explanation) return als === "icon" ? null : <>{label}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={als === "icon" ? label : undefined}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            "cursor-pointer text-left",
            als === "icon"
              ? "inline-flex items-center text-muted-foreground/70 hover:text-foreground"
              : "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          {als === "icon" ? <Info className="size-3.5" /> : label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto max-w-[22rem] p-3 text-sm font-normal leading-relaxed text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {explanation}
      </PopoverContent>
    </Popover>
  );
}
