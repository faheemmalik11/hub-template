"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "../lib/class-names";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { useFieldId } from "./field-context";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./command";

export interface ComboboxOption {
  value: string;
  label: string;
  depth?: number;
  // Extra text to match against when searching (e.g. a code, address) — not shown.
  keywords?: string;

  disabled?: boolean;
  /** Second line under the label, muted. Usually the reason a disabled option is disabled. */
  hint?: string;
}

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

  invalid?: boolean;
  className?: string;
  contentClassName?: string;
  /** Usually left off: inside a Field the id comes from the surrounding field. */
  id?: string;

  ariaLabel?: string;
}) {
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
            {selected ? selected.label : (placeholder ?? "Select …")}
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
          <CommandInput placeholder={searchPlaceholder ?? "Search …"} />
          <CommandList className="scroll-py-3">
            <CommandEmpty>{emptyText ?? "No match found."}</CommandEmpty>
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
                {(opt.depth ?? 0) > 0 && (
                  <span
                    aria-hidden="true"
                    className="-my-1.5 self-stretch shrink-0"
                    style={{
                      width: (opt.depth ?? 0) * 16,
                      backgroundImage:
                        "repeating-linear-gradient(to right, transparent 0, transparent 7px, var(--border) 7px, var(--border) 8px, transparent 8px, transparent 16px)",
                    }}
                  />
                )}
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
