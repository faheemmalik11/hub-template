import { useState } from "react";
import { Check, ChevronLeft, ChevronsUpDown } from "lucide-react";

import { Button } from "../../ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import type { ComboboxOption } from "../../ui/combobox";
import { cn } from "../../lib/class-names";
import { DateRangeCalendar, type DateRangeCalendarLabels } from "../dashboard/date-range-calendar";

export function DateRangePicker({
  value,
  onValueChange,
  options,
  customValue,
  from,
  to,
  onRangeApply,
  locale,
  rangeLabels,
  backLabel,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  className,
  formatDay,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  customValue: string;
  from: string;
  to: string;
  onRangeApply: (from: string, to: string) => void;
  locale: string;
  rangeLabels: DateRangeCalendarLabels;
  backLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel?: string;
  className?: string;
  formatDay: (isoDay: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  const isCustom = value === customValue;
  const triggerLabel =
    isCustom && from && to
      ? `${formatDay(from)} – ${formatDay(to)}`
      : (selected?.label ?? placeholder);

  const selectedValue = selected ? `${selected.label} ${selected.value}` : "";
  const [highlighted, setHighlighted] = useState(selectedValue);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setShowCalendar(isCustom);
          setHighlighted(selectedValue);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          title={triggerLabel}
          className={cn(
            "h-9 w-full cursor-pointer justify-between whitespace-nowrap px-3 py-2 text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "p-0",
          showCalendar ? "w-auto p-3" : "w-[var(--radix-popover-trigger-width)] min-w-[220px]",
        )}
      >
        {showCalendar ? (
          <DateRangeCalendar
            open={open}
            from={from}
            to={to}
            locale={locale}
            labels={rangeLabels}
            footerExtra={
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-3" />
                {backLabel}
              </button>
            }
            onApply={(newFrom, newTo) => {
              onRangeApply(newFrom, newTo);
              setOpen(false);
            }}
          />
        ) : (
          <Command
            value={highlighted}
            onValueChange={setHighlighted}
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="scroll-py-3">
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    if (option.value === customValue) {
                      onValueChange(customValue);
                      setShowCalendar(true);
                      return;
                    }
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer whitespace-normal data-[selected=true]:bg-accent"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === option.value ? "text-brand opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    className={cn("min-w-0", value === option.value && "font-medium text-brand")}
                  >
                    {option.label}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
