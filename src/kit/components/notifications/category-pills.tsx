import { cn } from "../../lib/class-names";
import type { NotificationTone } from "./types";

const TONE_BADGE: Record<NotificationTone, string> = {
  default: "bg-sky-500 text-white",
  warn: "bg-amber-500 text-white",
  danger: "bg-red-500 text-white",
};

export interface CategoryPillOption {
  key: string;
  label: string;
  count: number;
  tone?: NotificationTone;
}

export function CategoryFilterPills({
  options,
  value,
  onChange,
  className,
}: {
  options: CategoryPillOption[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1", className)}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "border border-border bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count > 0 && (
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                  option.tone ? TONE_BADGE[option.tone] : "bg-brand text-primary-foreground",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
