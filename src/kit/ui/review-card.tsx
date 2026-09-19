import { ArrowRight, ChevronRight, TriangleAlert } from "lucide-react";

import { cn } from "../lib/class-names";

/** One review line's importance. A field the reader must pick, not merely fix, gets its own label. */
export const REVIEW_SEVERITY_ACTION_REQUIRED = "action_required";

/** One failed check as the card renders it: label, sentence, figures, destination. */
export interface ReviewLine {
  /** Stable key. Not shown. */
  field: string;
  /** The check's own name. Omitted lines fall back to `text` alone. */
  title?: string;
  text: string;
  /** The compared figures, where the check reported a usable pair. */
  figures?: string;
  severity?: string;
  /** Where the fix button sends the reader. Absent lines get no button. */
  target?: { tab: string; anchor: string };
}

export interface ReviewCardLabels {
  title: string;
  /** How many checks failed, e.g. "3 checks failed". */
  checkCount: (count: number) => string;
  /** The fix button's text for a line whose severity is `REVIEW_SEVERITY_ACTION_REQUIRED`. */
  choose: string;
  /** The fix button's text for every other line. */
  fix: string;
}

/**
 * The review card: the checks that did NOT pass, and nothing else.
 *
 * Reads one source of already-translated lines and renders only the ones with something wrong.
 * Every line that names a destination is a button that jumps there — the card is the way IN to
 * the correction, not a description of it. With nothing to report it renders nothing at all: a
 * panel whose whole content is "nothing was flagged" is screen space spent confirming the absence
 * of work.
 */
export function ReviewCard({
  lines,
  labels,
  anchorId,
  open,
  onOpenChange,
  flash,
  onNavigate,
  className,
}: {
  lines: ReviewLine[];
  labels: ReviewCardLabels;
  /** The id the header's review chip scrolls to. */
  anchorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Flash the card, for the moment after the chip has scrolled the reader here. */
  flash: boolean;
  onNavigate: (tab: string, anchor: string) => void;
  className?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <details
      id={anchorId}
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className={cn(
        "group scroll-mt-24 rounded-xl border p-4 text-base transition-shadow duration-500",
        className,
        // The flash after jumping here from the header. The card's OWN colour, not the brand
        // one: a brand-coloured ring around an amber panel reads as a second, unrelated signal,
        // where the panel's own colour just turns up louder for a moment.
        flash && "ring-2 ring-destructive ring-offset-2",
        // One colour, because the card has one meaning: checks failed. It only renders when
        // they did, and it wears the same red as the chip that opens it.
        "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{labels.title}</span>
        <span className="shrink-0 text-sm font-normal opacity-80">
          {labels.checkCount(lines.length)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 opacity-60 transition-transform group-open:rotate-90" />
      </summary>
      {/* A bullet list, and the warning triangle appears once in the header rather than on every
          row. Repeating the icon down the card gave each entry its own alarm, louder than the
          card is trying to be: the headline already says these checks failed, the rows are just
          which ones. */}
      <ul className="mt-3 list-disc space-y-2 pl-10 marker:text-destructive/60">
        {lines.map((line, i) => {
          /**
           * Only "Fix ->" is the control, not the whole row.
           *
           * A wide button lights up the entire row under the pointer, so the field name and the
           * sentence explaining it both look clickable and the reader cannot tell what the click
           * would do. The action is one specific thing -- go to that field -- so it gets one
           * specific target. A check with nowhere to send anybody simply has no button.
           */
          const fixLink = line.target ? (
            <button
              type="button"
              onClick={() => onNavigate(line.target!.tab, line.target!.anchor)}
              className="group/fix inline-flex shrink-0 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded px-1 text-xs font-medium text-destructive underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              {line.severity === REVIEW_SEVERITY_ACTION_REQUIRED ? labels.choose : labels.fix}
              <ArrowRight className="size-3 transition-transform group-hover/fix:translate-x-0.5" />
            </button>
          ) : null;
          return (
            <li key={`${line.field}-${i}`} className="py-0.5 pl-1">
              <span className="min-w-0 flex-1">
                {/* The field name and the reason read as text, not as parts of a control: the
                    foreground and muted tokens the rest of the screen uses, so the only red left
                    on the row is the warning icon and the thing you can actually click. */}
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {line.title && (
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {line.title}
                    </span>
                  )}
                  <span className={cn("text-sm text-muted-foreground", !line.title && "text-base")}>
                    {line.text}
                  </span>
                  {fixLink}
                </span>
                {line.figures && (
                  <span className="block text-sm tabular-nums text-muted-foreground">
                    {line.figures}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
