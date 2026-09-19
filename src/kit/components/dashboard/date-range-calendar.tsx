import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";

export type IsoDay = string;

export interface DateRangeCalendarLabels {
  reset: string;
  apply: string;
  previousMonth: string;
  nextMonth: string;
  pickSecond: string;
}

export const englishDateRangeCalendarLabels: DateRangeCalendarLabels = {
  reset: "Reset",
  apply: "Apply",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  pickSecond: "Pick the second date",
};

export function DateRangeCalendar({
  from,
  to,
  onApply,
  labels,
  locale,
  open,
  footerExtra,
}: {
  from: IsoDay;
  to: IsoDay;
  onApply: (from: IsoDay, to: IsoDay) => void;
  labels: DateRangeCalendarLabels;
  locale: string;
  open: boolean;
  footerExtra?: ReactNode;
}) {
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(parseDay(from) ?? new Date()));

  useEffect(() => {
    if (!open) return;
    setDraftFrom(null);
    setDraftTo(null);
    setMonth(startOfMonth(parseDay(from) ?? parseDay(to) ?? new Date()));
  }, [open, from, to]);

  const appliedFrom = parseDay(from);
  const appliedTo = parseDay(to);
  const shownFrom = draftFrom ?? (draftTo ? null : appliedFrom);
  const shownTo = draftTo ?? (draftFrom ? null : appliedTo);
  const halfPicked = !!draftFrom !== !!draftTo;

  const days = useMemo(() => monthGrid(month), [month]);
  const weekdayNames = useMemo(() => weekdays(locale), [locale]);
  const monthName = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month),
    [month, locale],
  );

  function pick(day: Date) {
    if (!draftFrom || draftTo) {
      setDraftFrom(day);
      setDraftTo(null);
      return;
    }
    if (day < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(day);
    } else {
      setDraftTo(day);
    }
  }

  const canApply = !!draftFrom && !!draftTo;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={labels.previousMonth}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">{monthName}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={labels.nextMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weekdayNames.map((name) => (
          <div
            key={name}
            className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isStart = isSameDay(day, shownFrom);
          const isEnd = isSameDay(day, shownTo);
          const isBetween = !!shownFrom && !!shownTo && day > shownFrom && day < shownTo;
          const isEdge = isStart || isEnd;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pick(day)}
              className={cn(
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sm transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && !isEdge && !isBetween && "hover:bg-accent",
                isBetween && "bg-accent text-accent-foreground",
                isEdge && "bg-primary font-medium text-primary-foreground",
                isToday(day) && !isEdge && "ring-1 ring-inset ring-border",
              )}
              aria-pressed={isEdge || isBetween}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <p className="mt-2 min-h-[1.25rem] text-xs text-muted-foreground">
        {halfPicked ? labels.pickSecond : null}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div>{footerExtra}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onApply("", "")}>
            {labels.reset}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canApply}
            onClick={() => {
              if (!draftFrom || !draftTo) return;
              onApply(isoDay(draftFrom), isoDay(draftTo));
            }}
          >
            {labels.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}

function parseDay(value: IsoDay): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date: Date): IsoDay {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

function isSameDay(left: Date, right: Date | null): boolean {
  return (
    !!right &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function monthGrid(month: Date): Date[] {
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1, 12).getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday, 12);
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12),
  );
}

function weekdays(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2024, 0, 1 + index, 12)));
}
