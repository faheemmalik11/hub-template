import { useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";

import { Button } from "../../ui/button";
import {
  DateRangeCalendar,
  englishDateRangeCalendarLabels,
  type DateRangeCalendarLabels,
} from "./date-range-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import {
  isOverviewPeriod,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  type OverviewPeriod,
} from "./periods";
import { cn } from "../../lib/class-names";

export interface PeriodValue {
  period: OverviewPeriod;
  from?: string;
  to?: string;
}

export interface PeriodLabels {
  period: Record<OverviewPeriod, string>;
  back: string;
  reset: string;
  calendar: DateRangeCalendarLabels;
}

export const englishPeriodLabels: PeriodLabels = {
  period: {
    all: "All time",
    custom: "Custom range",
    last30Days: "Last 30 days",
    currentMonth: "This month",
    lastMonth: "Last month",
    last6Months: "Last 6 months",
    last12Months: "Last 12 months",
    currentYear: "This year",
    lastYear: "Last year",
  },
  back: "Back",
  reset: "Reset",
  calendar: englishDateRangeCalendarLabels,
};

const PRESETS = OVERVIEW_PERIODS.filter((period) => period !== "custom");

const STORAGE_PREFIX = "hub.overview-period.";

export function readStoredPeriod(key: string): PeriodValue {
  if (typeof window === "undefined") return { period: OVERVIEW_PERIOD_DEFAULT };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PeriodValue>;
      if (isOverviewPeriod(parsed?.period)) {
        return { period: parsed.period, from: parsed.from, to: parsed.to };
      }
    }
  } catch {
    return { period: OVERVIEW_PERIOD_DEFAULT };
  }
  return { period: OVERVIEW_PERIOD_DEFAULT };
}

export function writeStoredPeriod(key: string, value: PeriodValue): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // A browser with storage disabled must not take the screen down over a saved preference.
  }
}

export function useStoredPeriod(key: string): [PeriodValue, (value: PeriodValue) => void] {
  const [value, setValue] = useState<PeriodValue>(() => readStoredPeriod(key));
  const set = (next: PeriodValue) => {
    setValue(next);
    writeStoredPeriod(key, next);
  };
  return [value, set];
}

export function PeriodPicker({
  value,
  onChange,
  className,
  labels = englishPeriodLabels,
  formatDay,
  locale = "en",
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
  labels?: PeriodLabels;
  formatDay: (iso: string) => string;
  locale?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const isCustom = value.period === "custom";
  const label =
    isCustom && value.from && value.to
      ? `${formatDay(value.from)} – ${formatDay(value.to)}`
      : labels.period[value.period];

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setCustomOpen(isCustom);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-6 gap-1 px-1.5 text-[0.7rem] font-normal text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-1">
        {customOpen ? (
          <div className="p-2">
            <DateRangeCalendar
              open={open}
              from={value.from ?? ""}
              to={value.to ?? ""}
              locale={locale}
              labels={labels.calendar}
              footerExtra={
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="size-3" />
                  {labels.back}
                </button>
              }
              onApply={(from, to) => {
                if (!from || !to) {
                  onChange({ period: OVERVIEW_PERIOD_DEFAULT, from: undefined, to: undefined });
                } else {
                  onChange({ period: "custom", from, to });
                }
                setOpen(false);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {PRESETS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => {
                  onChange({ period, from: undefined, to: undefined });
                  setOpen(false);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left text-xs whitespace-nowrap transition-colors hover:bg-muted",
                  period === value.period && "font-medium",
                )}
              >
                {labels.period[period]}
                {period === value.period && <Check className="size-3" />}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left text-xs whitespace-nowrap transition-colors hover:bg-muted",
                isCustom && "font-medium",
              )}
            >
              {labels.period.custom}
              {isCustom && <Check className="size-3" />}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
