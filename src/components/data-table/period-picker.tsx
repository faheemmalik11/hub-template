import * as React from "react";
import { Check, ChevronLeft, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DateRangeCalendar,
  type DateRangePickerLabels,
} from "@/components/data-table/date-range-picker";
import type { ComboboxOption } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * The period control: a searchable list of periods that turns into a calendar in place.
 *
 * ONE control, not two. Every list screen used to pair a period dropdown with a separate "choose
 * period" button that only did anything after "custom period" had already been picked — so the one
 * option whose whole meaning is "let me name the dates" was the one that did not take you to a
 * calendar. Picking it here swaps this popover's body for the range calendar, and the calendar's
 * footer carries a Back link to the list. That is the shape the overview's own picker has always
 * had; this one adds the search box, because these lists are built from the data and run to
 * dozens of months and years rather than eight fixed presets.
 */
export function PeriodPicker({
  value,
  onValueChange,
  options,
  customValue = "individuell",
  fromDate,
  toDate,
  onRangeApply,
  locale,
  rangeLabels,
  backLabel,
  className,
  placeholder,
  ariaLabel,
  /** Renders the applied range on the trigger, e.g. "1. Aug. – 15. Aug.". */
  formatDay,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  /** The option that opens the calendar instead of applying itself. */
  customValue?: string;
  fromDate: string;
  toDate: string;
  /** Both ends at once. Reset sends two empty strings. */
  onRangeApply: (fromDate: string, toDate: string) => void;
  locale: string;
  rangeLabels: DateRangePickerLabels;
  backLabel: string;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  formatDay: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [calendar, setCalendar] = React.useState(false);

  const selected = options.find((o) => o.value === value) ?? null;
  const isCustom = value === customValue;
  // A custom period names itself by its dates. Falling back to the option's own label ("custom
  // period …") would make every custom range look identical on the trigger.
  const triggerLabel =
    isCustom && fromDate && toDate
      ? `${formatDay(fromDate)} – ${formatDay(toDate)}`
      : (selected?.label ?? placeholder ?? t("common.combobox.placeholder"));

  // cmdk matches its highlight against each item's value string, so build the selected one the
  // same way the items below do.
  const selectedValue = selected ? `${selected.label} ${selected.value}` : "";
  const [highlighted, setHighlighted] = React.useState(selectedValue);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          // Reopening a custom period lands straight on its calendar: the list is one Back click
          // away, and the dates are what somebody reopening a custom range came to change.
          setCalendar(isCustom);
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
          // The calendar needs its own width; the list wants to match the trigger it dropped from.
          calendar ? "w-auto p-3" : "w-[var(--radix-popover-trigger-width)] min-w-[220px]",
        )}
      >
        {calendar ? (
          <DateRangeCalendar
            open={open}
            from={fromDate}
            to={toDate}
            locale={locale}
            labels={rangeLabels}
            footerExtra={
              <button
                type="button"
                onClick={() => setCalendar(false)}
                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-3" />
                {backLabel}
              </button>
            }
            onApply={(fromDateNew, toDateNew) => {
              onRangeApply(fromDateNew, toDateNew);
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
            <CommandInput placeholder={t("common.combobox.search")} />
            <CommandList className="scroll-py-3">
              <CommandEmpty>{t("common.combobox.empty")}</CommandEmpty>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    if (opt.value === customValue) {
                      // Commit the period so the page knows a custom range is being chosen, then
                      // show the calendar rather than closing onto a control that does nothing yet.
                      onValueChange(customValue);
                      setCalendar(true);
                      return;
                    }
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer whitespace-normal data-[selected=true]:bg-accent"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === opt.value ? "text-brand opacity-100" : "opacity-0",
                    )}
                  />
                  <span className={cn("min-w-0", value === opt.value && "font-medium text-brand")}>
                    {opt.label}
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
