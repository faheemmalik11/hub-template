import { cn } from "../lib/class-names";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export interface LabelledSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A caption and a picker on one line.
 *
 * For any setting that belongs beside the thing it governs rather than on a form of its own: who
 * you are acting as, who a record is assigned to, which period a chart covers. Nothing here knows
 * what is being picked.
 *
 * Two of these side by side have to read as one pair, so the trigger carries a fixed height and a
 * minimum width by default. Override `triggerClassName` where a row needs something else — a wide
 * picker in a sidebar, a narrow one in a toolbar.
 *
 * Every string is the caller's, including any "nobody" or "all" row: pass it in `options` and the
 * kit never has to decide what an empty value means or what to call it.
 */
export function LabelledSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  labelPosition = "start",
  className,
  triggerClassName,
}: {
  /** The caption. Also the picker's accessible name, so it is never an unlabelled control. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: LabelledSelectOption[];
  /** Shown while `value` matches no option. Falls back to the label. */
  placeholder?: string;
  disabled?: boolean;
  /** "hidden" keeps the accessible name and drops the visible caption, for a picker in a tight row. */
  labelPosition?: "start" | "top" | "hidden";
  /** The wrapper. */
  className?: string;
  /** The trigger, to override the default height and minimum width. */
  triggerClassName?: string;
}) {
  const caption =
    labelPosition === "hidden" ? null : (
      <span className="whitespace-nowrap text-sm text-muted-foreground">{label}</span>
    );
  return (
    <div
      className={cn(
        labelPosition === "top" ? "flex flex-col gap-1" : "flex items-center gap-1.5",
        className,
      )}
    >
      {caption}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          className={cn("h-9 w-auto min-w-[9rem] gap-1.5", triggerClassName)}
          aria-label={label}
        >
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
