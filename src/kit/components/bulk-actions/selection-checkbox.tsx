import { Checkbox } from "../../ui/checkbox";
import { cn } from "../../lib/class-names";
import type { PageSelectionState } from "./use-row-selection";

/**
 * A row checkbox that does not trigger the row.
 *
 * List rows usually open a detail page on click, so the tick has to swallow the event or every
 * attempt to select would navigate away instead.
 */
export function SelectRowCheckbox({
  checked,
  onToggle,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex", className)}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
        aria-label={label}
      />
    </span>
  );
}

/** The header checkbox. Shows a dash while only part of the page is ticked. */
export function SelectPageCheckbox({
  state,
  onToggle,
  label,
  disabled,
  className,
}: {
  state: PageSelectionState;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex", className)}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <Checkbox
        checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
        disabled={disabled}
        onCheckedChange={onToggle}
        aria-label={label}
      />
    </span>
  );
}
