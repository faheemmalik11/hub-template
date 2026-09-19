import { ArrowRight } from "lucide-react";

import { cn } from "../../lib/class-names";

export function NextActionCell({
  label,
  muted,
  className,
}: {
  label: string;
  muted?: boolean;
  className?: string;
}) {
  if (muted) {
    return (
      <span className={cn("text-xs whitespace-nowrap text-muted-foreground", className)}>
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-brand-dark",
        className,
      )}
    >
      {label}
      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
    </span>
  );
}
