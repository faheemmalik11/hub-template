import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A section with a heading, a hairline, and nothing else around it.
 *
 * The card `Section` this replaces on the supplier tab draws a rounded border, a tinted header
 * band and a shadow around every block. Stacked three deep that reads as a pile of containers,
 * and the reader spends attention on the boxes rather than on what is in them. Here the heading
 * and the whitespace do the separating, which is what a ledger does.
 *
 * Presentation only, so the same section drops into any Hub.
 */
export function PlainSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  /** Rendered on the heading row, right-aligned. The action belongs beside what it changes. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-dark">{title}</h2>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={cn("pt-4")}>{children}</div>
    </section>
  );
}
