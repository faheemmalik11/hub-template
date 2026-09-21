"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFieldId } from "@/components/ui/feld-context";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface ComboboxOption {
  value: string;
  label: string;
  // Extra text to match against when searching (e.g. a code, address) — not shown.
  keywords?: string;
  /**
   * Listed but not choosable. For a value that exists and is the wrong answer here: a company with
   * no LexOffice connection on a screen that can only create LexOffice drafts, say. Dropping such
   * an option entirely is worse, because then the question "where is my company?" has no answer on
   * screen at all. Pair it with `hint` so the row says why.
   */
  disabled?: boolean;
  /** Second line under the label, muted. Usually the reason a disabled option is disabled. */
  hint?: string;
}

/**
 * App-wide searchable dropdown. Drop-in replacement for a shadcn Select: pass `options`,
 * `value` and `onValueChange`. Built on Popover + Command (cmdk) so the search box is pinned
 * to the top of the list and always in view while options scroll. One component, one place to
 * change dropdown behaviour app-wide.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  invalid,
  className,
  contentClassName,
  id,
  ariaLabel,
}: {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Draws the field in the error colour, for a form that has flagged this field. Same prop name
   *  and same look as DatePicker, so a form marks every kind of control the same way. */
  invalid?: boolean;
  className?: string;
  contentClassName?: string;
  /** Usually left off: inside a Feld the id comes from the surrounding field. */
  id?: string;
  /**
   * Accessible name, for the callers that have no surrounding Feld to take an id from — the
   * pagination bar's page-size picker being the one on every list screen. Without it the trigger
   * is announced as an unnamed combobox, which is the very thing the `id` note above is about.
   */
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  // The trigger IS the control here, so it carries the id the sibling Label points at. Without it
  // a screen reader reads this dropdown as an unnamed combobox.
  const fieldId = useFieldId();

  // Scrolling the option list inside a Dialog.
  //
  // Radix Dialog locks scrolling to its own content subtree: it wraps DialogContent in
  // react-remove-scroll with `shards: [contentRef]`, and wheel events whose target sits outside
  // that subtree get swallowed. Our PopoverContent is portalled to the body, so it IS outside, and
  // the list refuses to scroll with the wheel. Keyboard navigation still works, which is why the
  // bug looks like "the dropdown is broken" rather than "the page is locked".
  //
  // A modal popover installs its own scroll lock and becomes the innermost one, so its content
  // scrolls again. That is Radix's intended answer here.
  //
  // Applied ONLY inside a dialog. Modal everywhere would lock page scroll while any dropdown is
  // open and swallow the first click on the next control, which on a filter bar with several
  // dropdowns side by side is a worse bug than the one being fixed. Whether this combobox sits in
  // a dialog cannot change after mount, so it is detected once.
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [inDialog, setInDialog] = React.useState(false);
  React.useEffect(() => {
    setInDialog(!!triggerRef.current?.closest('[role="dialog"], [role="alertdialog"]'));
  }, []);

  const selected = options.find((o) => o.value === value) ?? null;
  // cmdk matches its highlighted value against each CommandItem's value string, so build the
  // selected option's composite the same way the items below do.
  const selectedValue = selected
    ? `${selected.label} ${selected.keywords ?? ""} ${selected.value}`
    : "";
  // Drive cmdk's highlight so the list opens scrolled to the current selection (empty = top of list).
  const [highlighted, setHighlighted] = React.useState(selectedValue);

  return (
    <Popover
      open={open}
      modal={inDialog}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setHighlighted(selectedValue);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          id={id ?? fieldId ?? undefined}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          title={selected ? selected.label : undefined}
          className={cn(
            "h-9 w-full cursor-pointer justify-between whitespace-nowrap px-3 py-2 text-left font-normal shadow-none",
            !selected && "text-muted-foreground",
            invalid && "border-destructive focus-visible:ring-destructive/30",
            className,
          )}
        >
          <span className="min-w-0 truncate">
            {selected ? selected.label : (placeholder ?? t("common.combobox.placeholder"))}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
      >
        <Command
          value={highlighted}
          onValueChange={setHighlighted}
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder ?? t("common.combobox.search")} />
          {/* scroll-py leaves breathing room so the highlighted item isn't flush against an edge
              when cmdk scrolls it into view on open. */}
          <CommandList className="scroll-py-3">
            <CommandEmpty>{emptyText ?? t("common.combobox.empty")}</CommandEmpty>
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                // cmdk matches + dedupes on this string; include label + keywords + value.
                value={`${opt.label} ${opt.keywords ?? ""} ${opt.value}`}
                disabled={opt.disabled}
                onSelect={() => {
                  if (opt.disabled) return;
                  onValueChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "whitespace-normal data-[selected=true]:bg-accent",
                  opt.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    value === opt.value ? "opacity-100 text-brand" : "opacity-0",
                  )}
                />
                <span className="min-w-0">
                  <span className={cn("block", value === opt.value && "font-medium text-brand")}>
                    {opt.label}
                  </span>
                  {opt.hint && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
