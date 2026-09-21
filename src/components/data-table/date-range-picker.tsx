import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** An ISO `YYYY-MM-DD` day, or "" for unset. Kept as a string because that is what the filters store. */
export type IsoDay = string;

export type DateRangePickerLabels = {
  /** Shown on the trigger while nothing is chosen. */
  placeholder: string;
  reset: string;
  apply: string;
  /** Named for screen readers, and the tooltip on the month arrows. */
  previousMonth: string;
  nextMonth: string;
  /** Told to the reader while only one end has been picked. */
  pickSecond: string;
};

/**
 * A from/to range on one calendar.
 *
 * Written against plain `Date` arithmetic rather than react-day-picker on purpose: the four Hubs do
 * not agree on that library's major version, and v8 and v9 differ enough in prop and class names
 * that a shared wrapper would have to branch on which one is installed. A month grid is a fortnight
 * of date maths, and it keeps this file byte-identical in every repository.
 *
 * Two clicks, always. Opening the calendar clears whatever half-finished selection was left behind,
 * so the first click starts a new range and the second closes it. Without that reset, reopening
 * mid-selection left an anchor nobody could see and the next click produced a range starting
 * somewhere the reader had forgotten about.
 *
 * The clicks are ordered afterwards, not as they arrive: whichever day is earlier becomes `from`.
 * Somebody reaching for the end of the range first is not making a mistake worth correcting them
 * over, and refusing the click would just be a puzzle.
 *
 * Nothing is applied until Apply. The calendar can be opened, browsed and closed again without
 * touching the filter, which matters because these ranges usually sit in front of a slow query.
 */
export function DateRangePicker({
  from,
  to,
  onApply,
  labels,
  locale,
  className,
  align = "start",
}: {
  from: IsoDay;
  to: IsoDay;
  /** Both ends at once. Reset sends two empty strings. */
  onApply: (from: IsoDay, to: IsoDay) => void;
  labels: DateRangePickerLabels;
  /** For month and weekday names. The host knows its own active language. */
  locale: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const appliedFromDateLabel = parse(from);
  const appliedToDateLabel = parse(to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start gap-2 font-normal", className)}>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          {appliedFromDateLabel || appliedToDateLabel ? (
            <span className="tabular-nums">
              {short(appliedFromDateLabel, locale)} – {short(appliedToDateLabel, locale)}
            </span>
          ) : (
            <span className="text-muted-foreground">{labels.placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-3">
        <DateRangeCalendar
          from={from}
          to={to}
          labels={labels}
          locale={locale}
          open={open}
          onApply={(v, b) => {
            onApply(v, b);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The calendar body on its own, for a popover somebody else already owns.
 *
 * `open` is passed in rather than owned here so the two-click reset still happens: the grid has to
 * know when it has just been shown, and inside a foreign popover it cannot find that out itself.
 */
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
  labels: DateRangePickerLabels;
  locale: string;
  /** Whether the surrounding popover is showing. Every opening starts a fresh selection. */
  open: boolean;
  /** Rendered at the left of the button row, e.g. a "back to presets" link. */
  footerExtra?: ReactNode;
}) {
  // The range being drawn, which is not the applied one until Apply is pressed.
  const [draftFromDate, setDraftFromDate] = useState<Date | null>(null);
  const [draftToDate, setDraftToDate] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => monthStart(parse(from) ?? new Date()));

  // Opening starts a fresh selection and shows the applied range as context.
  useEffect(() => {
    if (!open) return;
    setDraftFromDate(null);
    setDraftToDate(null);
    setMonth(monthStart(parse(from) ?? parse(to) ?? new Date()));
  }, [open, from, to]);

  const appliedFromDate = parse(from);
  const appliedToDate = parse(to);
  // While a range is being drawn it is what the grid shows; otherwise the applied one is.
  const showsFromDate = draftFromDate ?? (draftToDate ? null : appliedFromDate);
  const showsToDate = draftToDate ?? (draftFromDate ? null : appliedToDate);
  const halfDone = !!draftFromDate !== !!draftToDate;

  const days = useMemo(() => rasterFor(month), [month]);
  const weekdays = useMemo(() => weekdayNames(locale), [locale]);
  const monthName = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month),
    [month, locale],
  );

  function choose(tag: Date) {
    // First click anchors, second completes. Ordered here so either end may be clicked first.
    if (!draftFromDate || draftToDate) {
      setDraftFromDate(tag);
      setDraftToDate(null);
      return;
    }
    if (tag < draftFromDate) {
      setDraftToDate(draftFromDate);
      setDraftFromDate(tag);
    } else {
      setDraftToDate(tag);
    }
  }

  const canApply = !!draftFromDate && !!draftToDate;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={labels.previousMonth}
          onClick={() => setMonth(monthMove(month, -1))}
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
          onClick={() => setMonth(monthMove(month, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weekdays.map((name) => (
          <div
            key={name}
            className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}
        {days.map((tag) => {
          const imMonth = tag.getMonth() === month.getMonth();
          const start = sameTag(tag, showsFromDate);
          const end = sameTag(tag, showsToDate);
          const between =
            !!showsFromDate && !!showsToDate && tag > showsFromDate && tag < showsToDate;
          const rand = start || end;
          return (
            <button
              key={tag.toISOString()}
              type="button"
              onClick={() => choose(tag)}
              className={cn(
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sm transition-colors",
                !imMonth && "text-muted-foreground/40",
                imMonth && !rand && !between && "hover:bg-accent",
                between && "bg-accent text-accent-foreground",
                rand && "bg-primary font-medium text-primary-foreground",
                today(tag) && !rand && "ring-1 ring-inset ring-border",
              )}
              aria-pressed={rand || between}
            >
              {tag.getDate()}
            </button>
          );
        })}
      </div>

      {/* Says what the second click is for, so a half-drawn range does not look like a dead
            Apply button. */}
      <p className="mt-2 min-h-[1.25rem] text-xs text-muted-foreground">
        {halfDone ? labels.pickSecond : null}
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
              if (!draftFromDate || !draftToDate) return;
              onApply(iso(draftFromDate), iso(draftToDate));
            }}
          >
            {labels.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Local noon, not midnight: a date built at midnight and formatted in a timezone behind UTC lands
// on the previous day, which is how a range quietly shifts by one.
function parse(value: IsoDay): Date | null {
  if (!value) return null;
  const [j, m, t] = value.split("-").map(Number);
  if (!j || !m || !t) return null;
  const d = new Date(j, m - 1, t, 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(d: Date): IsoDay {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const t = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

function short(d: Date | null, locale: string): string {
  return d
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d)
    : "—";
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

function monthMove(d: Date, um: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + um, 1, 12);
}

function sameTag(a: Date, b: Date | null): boolean {
  return (
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function today(d: Date): boolean {
  return sameTag(d, new Date());
}

/** Six weeks, so the grid does not change height from month to month and move the buttons. */
function rasterFor(month: Date): Date[] {
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1, 12).getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday, 12);
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  );
}

/** Monday first, which is what every locale these Hubs run in expects. */
function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i, 12)));
}
