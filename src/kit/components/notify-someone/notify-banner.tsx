import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";
import type { NotifyBannerLabels } from "./labels";

/** How long the card takes to slide out. Long enough to read as a movement, short enough that
 *  the write behind it does not feel delayed. */
const EXIT_MS = 200;

export interface NotifyBannerItem {
  /** Whatever the host uses to acknowledge this one. Opaque to the kit. */
  id: string;
  /** The sender's display name, or null if the account is gone. */
  fromName: string | null;
  /** What they typed. A notification with no note is still worth showing. */
  note: string | null;
  /** Rendered as given, so the host decides the locale and the format. */
  sentAt?: string;
}

/** "Faheem Malik" -> "FM". Two letters, because three stops reading as a monogram. */
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * "Somebody asked you to look at THIS" -- floating over the record it names.
 *
 * The bell already lists what you were sent, but it lists it away from the thing it is about: you
 * click through, land on a transaction, and the sentence explaining why you are here is back on the
 * previous screen. This puts the note on the record itself.
 *
 * FIXED TO THE VIEWPORT'S TOP RIGHT, the corner the bell and the account menu already live in, so
 * a message addressed to the reader arrives where they already look for messages.
 *
 * Width is capped against the viewport rather than set flat, so it still fits on a narrow window
 * where a flat 24rem would hang off the edge.
 *
 * DISMISSING IS A WRITE, not local state, and there is no auto-dismiss. The cross has to mean "I
 * have read this", so a timer would either fire that write for somebody who never looked, or let
 * the note come back on the next visit and turn into wallpaper. It stays until it is crossed.
 */
export function NotifyBanner({
  items,
  labels,
  onDismiss,
  className,
}: {
  items: NotifyBannerItem[];
  labels: NotifyBannerLabels;
  onDismiss: (id: string) => void;
  className?: string;
}) {
  // WHICH CARDS ARE ON THEIR WAY OUT. The cross cannot simply call onDismiss: that writes, the
  // query refetches, and the card is gone between two frames with nothing to see. So the click
  // starts the animation and the write happens when it ends.
  const [leaving, setLeaving] = useState<string[]>([]);
  // Cleared on unmount so a card that is mid-flight when the page changes does not fire its write
  // into a screen that no longer exists.
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const startDismiss = useCallback(
    (id: string) => {
      // A second click on a card already sliding out would queue a second write.
      if (leaving.includes(id)) return;
      setLeaving((prev) => [...prev, id]);
      timers.current.push(window.setTimeout(() => onDismiss(id), EXIT_MS));
    },
    [leaving, onDismiss],
  );

  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        // pointer-events-none on the container, auto on each card. The container is a tall
        // fixed box and the page's own header controls sit underneath it, so without this the
        // empty space between and below the cards silently swallows clicks meant for them.
        "pointer-events-none fixed right-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))]",
        className,
      )}
    >
      <div className="space-y-2">
        {items.map((item) => {
          const isLeaving = leaving.includes(item.id);
          return (
            <div
              key={item.id}
              // Two things at once: the card slides out to the right it came from and fades, and
              // the grid row collapses so anything below it rises into the gap instead of jumping.
              // `grid-rows-[0fr]` to `[1fr]` is what makes a height transition possible without
              // measuring the content first.
              className={cn(
                "pointer-events-auto grid transition-all ease-out motion-reduce:transition-none",
                isLeaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
              )}
              style={{ transitionDuration: `${EXIT_MS}ms` }}
            >
              <div className="overflow-hidden">
                <div
                  // Opaque background and a real shadow, unlike an inline notice: this sits ON the
                  // page, so the content underneath has to stop showing through it.
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg ring-1 ring-black/5",
                    "transition-transform ease-out motion-reduce:transition-none",
                    isLeaving && "translate-x-6",
                  )}
                  style={{ transitionDuration: `${EXIT_MS}ms` }}
                  role="status"
                >
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-dark text-[0.7rem] font-medium text-white"
                  >
                    {item.fromName ? initials(item.fromName) : "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-foreground">
                      <span className="truncate">{item.fromName ?? labels.fromUnknown}</span>
                      {item.sentAt ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          {item.sentAt}
                        </span>
                      ) : null}
                    </p>
                    {item.note ? (
                      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">
                        {item.note}
                      </p>
                    ) : (
                      // No note is still a message: somebody pointed you here on purpose.
                      <p className="mt-0.5 text-sm text-muted-foreground">{labels.noNote}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-1 size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    aria-label={labels.dismiss}
                    title={labels.dismiss}
                    onClick={() => startDismiss(item.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
