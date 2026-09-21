import { useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import {
  DateRangeCalendar,
  type DateRangePickerLabels,
} from "@/components/data-table/date-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  isOverviewPeriod,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  type OverviewPeriod,
} from "@/components/dashboard/periods";
import { cn } from "@/lib/utils";

/**
 * The dashboard's compact period control: a plain preset list plus a real date-range calendar.
 *
 * Not the app-wide Combobox: a search box over eight fixed options is noise, and the narrow
 * popover wrapped labels like "This month" onto two lines. Here the list is exactly as wide as
 * its longest label, and "custom range" is a first-class option rather than a missing feature.
 */
export interface PeriodValue {
  period: OverviewPeriod;
  fromDate?: string;
  toDate?: string;
}

const PRESETS = OVERVIEW_PERIODS.filter((p) => p !== "benutzerdefiniert");

const STORAGE_PREFIX = "hv.overview-period.";

/**
 * A section's period, surviving a reload. Every dashboard section owns its own period; storing
 * each under its own key means the mix a user set up comes back exactly after a refresh. Guarded
 * reads/writes: a blocked localStorage (private mode) degrades to session-only state, not a crash.
 */
export function useStoredPeriod(key: string): [PeriodValue, (v: PeriodValue) => void] {
  const [value, setValue] = useState<PeriodValue>(() => {
    if (typeof window === "undefined") return { period: OVERVIEW_PERIOD_DEFAULT };
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PeriodValue>;
        if (isOverviewPeriod(parsed?.period)) {
          return { period: parsed.period, fromDate: parsed.fromDate, toDate: parsed.toDate };
        }
      }
    } catch {
      // Unreadable storage or corrupt JSON: fall through to the default.
    }
    return { period: OVERVIEW_PERIOD_DEFAULT };
  });
  const set = (v: PeriodValue) => {
    setValue(v);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(v));
    } catch {
      // Storage full or blocked: the choice still applies until the next reload.
    }
  };
  return [value, set];
}

function fromIso(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function PeriodPicker({
  value,
  onChange,
  className,
  contentClassName,
  labelFor,
  formatDay,
  backLabel,
  rangeLabels,
  calendarLocale,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
  /** Extra classes for the dropdown itself, e.g. to match the trigger's width when the picker is
   *  used as a full-width filter field rather than a compact header link. */
  contentClassName?: string;
  /** Translated label per period, including "benutzerdefiniert". Supplied by the host app. */
  labelFor: (period: OverviewPeriod) => string;
  /** Short day label ("26. Aug") for the custom-range trigger text. */
  formatDay: (
    iso: string,
  ) => string; /** Footer action in the calendar view: back to the preset list. */
  backLabel: string;
  /** Wording for the range calendar, already translated by the host. */
  rangeLabels: DateRangePickerLabels;
  /** BCP-47 tag for month and weekday names, e.g. "de-DE". */
  calendarLocale: string;
  /** Footer action in the calendar view: drop the custom range, back to the default period. */
  resetLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [, setRange] = useState<DateRange | undefined>();

  const custom = value.period === "benutzerdefiniert";
  const label =
    custom && value.fromDate && value.toDate
      ? `${formatDay(value.fromDate)} – ${formatDay(value.toDate)}`
      : labelFor(value.period);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCustomOpen(custom);
          setRange({ from: fromIso(value.fromDate), to: fromIso(value.toDate) });
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
      <PopoverContent align="end" className={cn("w-auto p-1", contentClassName)}>
        {customOpen ? (
          <div className="p-2">
            {/* The same range calendar the invoice screens use, so a custom period is picked the
                same way everywhere: two clicks, then Apply. It applied itself on the second click
                before, which made a mis-click a query nobody asked for. */}
            <DateRangeCalendar
              open={open}
              from={value.fromDate ?? ""}
              to={value.toDate ?? ""}
              locale={calendarLocale}
              labels={rangeLabels}
              footerExtra={
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="size-3" />
                  {backLabel}
                </button>
              }
              onApply={(fromDate, toDate) => {
                if (!fromDate || !toDate) {
                  onChange({
                    period: OVERVIEW_PERIOD_DEFAULT,
                    fromDate: undefined,
                    toDate: undefined,
                  });
                } else {
                  onChange({ period: "benutzerdefiniert", fromDate, toDate });
                }
                setOpen(false);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange({ period: p, fromDate: undefined, toDate: undefined });
                  setOpen(false);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left text-xs whitespace-nowrap transition-colors hover:bg-muted",
                  p === value.period && "font-medium",
                )}
              >
                {labelFor(p)}
                {p === value.period && <Check className="size-3" />}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left text-xs whitespace-nowrap transition-colors hover:bg-muted",
                custom && "font-medium",
              )}
            >
              {labelFor("benutzerdefiniert")}
              {custom && <Check className="size-3" />}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
