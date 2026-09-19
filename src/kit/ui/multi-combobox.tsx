"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "../lib/class-names";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./command";

export interface MultiComboboxOption {
  value: string;
  label: string;
  depth?: number;
  // Extra text to match against when searching — not shown.
  keywords?: string;
}

// Multi-select sibling of Combobox: selecting toggles membership and the trigger shows the count.
export function MultiCombobox({
  values,
  onValuesChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  selectedCountText = (count) => `${count} selected`,
  disabled,
  className,
  contentClassName,
}: {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: MultiComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  selectedCountText?: (count: number) => string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((option) => values.includes(option.value));

  function toggle(value: string) {
    onValuesChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  // Same fix as Combobox: inside a Dialog the popover must be modal or its list cannot scroll.
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [inDialog, setInDialog] = React.useState(false);
  React.useEffect(() => {
    setInDialog(!!triggerRef.current?.closest('[role="dialog"], [role="alertdialog"]'));
  }, []);

  // Drive cmdk's highlight from the first selected value so the list opens scrolled to it.
  const firstSelectedValue = selected[0]
    ? `${selected[0].label} ${selected[0].keywords ?? ""} ${selected[0].value}`
    : "";
  const [highlighted, setHighlighted] = React.useState(firstSelectedValue);

  const triggerLabel =
    selected.length === 0
      ? (placeholder ?? "Select …")
      : selected.length === 1
        ? selected[0].label
        : selectedCountText(selected.length);

  return (
    <Popover
      open={open}
      modal={inDialog}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setHighlighted(firstSelectedValue);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full cursor-pointer justify-between whitespace-normal px-3 py-2 text-left font-normal",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
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
            {options.map((option) => {
              const isSelected = values.includes(option.value);
              return (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.keywords ?? ""} ${option.value}`}
                  onSelect={() => toggle(option.value)}
                  className="cursor-pointer gap-2 whitespace-normal data-[selected=true]:bg-accent"
                >
                  {(option.depth ?? 0) > 0 && (
                    <span
                      aria-hidden="true"
                      className="-my-1.5 self-stretch shrink-0"
                      style={{
                        width: (option.depth ?? 0) * 16,
                        backgroundImage:
                          "repeating-linear-gradient(to right, transparent 0, transparent 7px, var(--border) 7px, var(--border) 8px, transparent 8px, transparent 16px)",
                      }}
                    />
                  )}
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      isSelected
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-input bg-background",
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                  <span className={cn(isSelected && "font-medium text-brand")}>{option.label}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
