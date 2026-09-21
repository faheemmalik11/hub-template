import { useEffect, useRef, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { de as deLocale, enUS } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFieldId } from "@/components/ui/feld-context";

/**
 * The one date field for the whole app.
 *
 * Every form used `<input type="date">`, which is a different control on every browser and on Linux
 * Chrome is the plain grey calendar this replaces. It also could not be styled, could not say what
 * format it wanted, and gave no hint when it was required or wrong.
 *
 * Values in and out are ISO `yyyy-mm-dd`, the same strings the database and the URL use, so this is
 * a drop-in for the inputs it replaces. Dates are built and read with LOCAL parts, never
 * `toISOString()`, which would shift a date across midnight for anyone east of Greenwich.
 *
 * IT IS A TEXT FIELD FIRST, A CALENDAR SECOND. An earlier version was popover-only, which quietly
 * took away typing: on the invoice detail screen four dates get corrected per document, and
 * "click, open, change the year dropdown, change the month dropdown, click the day" is far slower
 * than typing them -- and pasting a date stopped working entirely. So the value is editable
 * directly, in the numeric format the current language uses, and the calendar is one button beside
 * it for the times a calendar is genuinely easier.
 *
 * The three controls are SEPARATE focusable elements (input, clear, calendar). The previous version
 * nested a `span[role=button]` inside the trigger button, which no keyboard could reach -- so a
 * date could be cleared with a mouse and not without one -- and whose aria-label was folded into
 * the trigger's accessible name, announcing "15. August 2026 Datum leeren".
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  invalid,
  clearable = true,
  min,
  max,
  ariaLabel,
  id,
}: {
  /** ISO `yyyy-mm-dd`, or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Draws the field in the error colour, for a form that has flagged this field. */
  invalid?: boolean;
  /** Offers an X to empty the field. Off for a date the form always needs. */
  clearable?: boolean;
  /** ISO bounds, for the two halves of a range: picking a `von` after the `bis` is not a date. */
  min?: string;
  max?: string;
  ariaLabel?: string;
  /** Usually left off: inside a Feld the id comes from the surrounding field. */
  id?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // Inside a Feld this carries the id the sibling Label points at.
  const fieldId = useFieldId();
  const english = !!i18n.language?.startsWith("en");
  const selected = isoToDate(value);

  // What the user sees while typing. Kept separate from `value` so a half-typed "15.0" is not
  // parsed, rejected and yanked back on every keystroke; it is committed on blur and on Enter.
  const [text, setText] = useState(() => isoToInput(value, english));
  const types = useRef(false);
  useEffect(() => {
    // Re-sync when the value changes from outside (form reset, a different record loaded, the
    // calendar) -- but never while the field is being typed into.
    if (!types.current) setText(isoToInput(value, english));
  }, [value, english]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (value) onChange("");
      setText("");
      return;
    }
    const iso = inputToIso(trimmed);
    if (iso && iso !== value) onChange(iso);
    // Snap the text back to the canonical rendering, so "1.8.26" becomes "01.08.2026" and an
    // unparseable entry returns to the last good value rather than sitting there looking accepted.
    setText(isoToInput(iso ?? value, english));
  }

  // HOW FAR THE CALENDAR CAN NAVIGATE, not just how far its dropdowns list: in react-day-picker v9
  // `startMonth`/`endMonth` bound both. A fixed [now-10, now+5] put a 2014 supplier invoice out of
  // the calendar's reach altogether. Wide enough for old documents, and always stretched to cover
  // whatever is already selected or bounded, so no value the field can hold is unreachable.
  const now = new Date().getFullYear();
  const years = [
    now,
    selected?.getFullYear(),
    isoToDate(min ?? "")?.getFullYear(),
    isoToDate(max ?? "")?.getFullYear(),
  ].filter((j): j is number => typeof j === "number");
  const startYear = Math.min(now - 30, ...years);
  const endYear = Math.max(now + 10, ...years);

  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent pl-3 pr-1",
        "focus-within:ring-1 focus-within:ring-ring",
        invalid && "border-destructive focus-within:ring-destructive/30",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        id={id ?? fieldId ?? undefined}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder ?? formatHint(english)}
        onFocus={() => {
          types.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          types.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
          if (e.key === "Escape") {
            setText(isoToInput(value, english));
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />

      {clearable && !!value && !disabled && (
        <button
          type="button"
          aria-label={t("common.datum.leeren")}
          title={t("common.datum.leeren")}
          onClick={() => {
            onChange("");
            setText("");
          }}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t("common.datum.kalender")}
            title={t("common.datum.kalender")}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <CalendarIcon className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            // Month and year as dropdowns rather than one arrow at a time: entering a date from last
            // year meant twelve clicks otherwise.
            captionLayout="dropdown"
            startMonth={new Date(startYear, 0)}
            endMonth={new Date(endYear, 11)}
            locale={english ? enUS : deLocale}
            disabled={[
              ...(isoToDate(min ?? "") ? [{ before: isoToDate(min ?? "")! }] : []),
              ...(isoToDate(max ?? "") ? [{ after: isoToDate(max ?? "")! }] : []),
            ]}
            onSelect={(d) => {
              if (!d) return;
              const iso = dateToIso(d);
              onChange(iso);
              setText(isoToInput(iso, english));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** The format the field shows and expects, as a placeholder people can actually act on. */
function formatHint(english: boolean): string {
  return english ? "MM/DD/YYYY" : "TT.MM.JJJJ";
}

/** ISO to the editable numeric rendering for the current language. */
function isoToInput(iso: string, english: boolean): string {
  const d = isoToDate(iso);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const tag = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  return english ? `${month}/${tag}/${d.getFullYear()}` : `${tag}.${month}.${d.getFullYear()}`;
}

/**
 * Everything a person might reasonably type or paste, back to ISO. Accepts the German `15.8.2026`,
 * the US `8/15/2026`, the ISO `2026-08-15` the database itself uses, and two-digit years. Returns
 * null when it is not a real date, so `commit` can restore the previous value instead of writing
 * something invented.
 */
function inputToIso(raw: string): string | null {
  const s = raw.trim();

  // ISO first: unambiguous, and the format that arrives when a value is pasted out of the app.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const point = /^(\d{1,2})[.](\d{1,2})[.](\d{2}|\d{4})$/.exec(s); // 15.8.2026 / 15.08.26
  if (point) return build(year(point[3]), Number(point[2]), Number(point[1]));

  const italic = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s); // 8/15/2026, month first
  if (italic) return build(year(italic[3]), Number(italic[1]), Number(italic[2]));

  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(s); // 15082026, typed without separators
  if (compact) return build(Number(compact[3]), Number(compact[2]), Number(compact[1]));

  return null;
}

function year(part: string): number {
  const n = Number(part);
  // A two-digit year is this century. "26" is 2026, not 1926 -- nobody is entering 1920s invoices.
  return part.length === 2 ? 2000 + n : n;
}

/** Builds ISO only if the parts are a date that exists: 31.02. comes back null, not 03.03. */
function build(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return dateToIso(date);
}

/** `yyyy-mm-dd` to a local Date. `new Date("2026-08-15")` is UTC midnight, which is the day before
 *  in every timezone west of Greenwich. */
function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Local parts back to `yyyy-mm-dd`, for the same reason. */
function dateToIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
