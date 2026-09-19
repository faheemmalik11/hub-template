import { cn } from "../../lib/class-names";
import { HintTooltip } from "../../ui/hint-tooltip";

export function StackedCell({
  primary,
  secondary,
  className,
  primaryClassName,
  secondaryClassName,
}: {
  primary: string;
  secondary?: string | null;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}) {
  const showSecondary = secondary && secondary !== primary;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <HintTooltip label={primary}>
        <span className={cn("block truncate text-foreground", primaryClassName)}>{primary}</span>
      </HintTooltip>
      {showSecondary && (
        <HintTooltip label={secondary}>
          <span className={cn("block truncate text-xs text-muted-foreground", secondaryClassName)}>
            {secondary}
          </span>
        </HintTooltip>
      )}
    </div>
  );
}
