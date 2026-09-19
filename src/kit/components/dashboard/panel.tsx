import type { ReactNode } from "react";

import { cn } from "../../lib/class-names";

export function DashboardPanel({
  title,
  titleExtra,
  headerRight,
  className,
  dataTour,
  children,
}: {
  title: string;
  titleExtra?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
  dataTour?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-tour={dataTour}
      className={cn("flex min-w-0 flex-col rounded-2xl bg-brand-wash p-4", className)}
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
