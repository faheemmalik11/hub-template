import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The dashboard's one surface: a white card with a hairline border and a title row. The page
 *  background carries the brand warmth, so beige is an accent here, not the surface. */
export function DashboardPanel({
  title,
  titleExtra,
  headerRight,
  className,
  children,
}: {
  title: string;
  /** A quiet figure that belongs to the title (a total), not to the controls on the right. */
  titleExtra?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] font-semibold tracking-tight text-foreground">
          <span className="truncate">{title}</span>
          {titleExtra && (
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              {titleExtra}
            </span>
          )}
        </h2>
        {headerRight && <span className="flex shrink-0 items-center gap-2">{headerRight}</span>}
      </div>
      {children}
    </section>
  );
}
