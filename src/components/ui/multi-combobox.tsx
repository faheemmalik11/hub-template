"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface MultiComboboxOption {
  value: string;
  label: string;
  color?: string | null;
  // Extra text to match against when searching — not shown.
  keywords?: string;
}

/**
 * Multi-select sibling of `Combobox` — same Popover + Command shell, but selecting an item
 * toggles membership instead of closing the popover, and the trigger summarizes the selection
 * count. Used for tag assignment and tag filtering.
 */
export function MultiCombobox({
  values,
  onValuesChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
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
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((o) => values.includes(o.value));

  function toggle(value: string) {
    onValuesChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  // Same fix as Combobox (see its own comment for the full explanation): inside a Dialog, Radix's
  // scroll lock swallows wheel events on this popover's portalled content unless the popover is
  // modal, which makes the dropdown look broken (keyboard nav still works) rather than unscrollable.
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [inDialog, setInDialog] = React.useState(false);
  React.useEffect(() => {
    setInDialog(!!triggerRef.current?.closest('[role="dialog"], [role="alertdialog"]'));
  }, []);

  // Drive cmdk's highlight from the first selected value so the list opens scrolled to it instead
  // of always at the top — e.g. a fiscal-year picker pre-selected with the current year opens
  // already showing that year, not 1999. Empty selection = top of list, same as Combobox.
  const firstSelectedValue = selected[0]
    ? `${selected[0].label} ${selected[0].keywords ?? ""} ${selected[0].value}`
    : "";
  const [highlighted, setHighlighted] = React.useState(firstSelectedValue);

  // WHAT is selected, not how many. "3 ausgewählt" is a count of things the reader cannot see,
  // on a control whose whole job is to say which ones are picked -- so checking an assignment
  // meant opening the dropdown and scrolling it. Pills name them on the closed trigger.
  //
  // Capped, because the trigger sits in a dialog next to other fields and a person with access to
  // twelve companies would otherwise push the buttons below the fold. Past the cap the remainder
  // becomes one "+n" pill, which is the only place a bare number is still the honest answer.
  const PILL_LIMIT = 4;
  const sichtbar = selected.slice(0, PILL_LIMIT);
  const rest = selected.length - sichtbar.length;

  return (
    <Popover
      open={open}
      modal={inDialog}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setHighlighted(firstSelectedValue);
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
          {selected.length === 0 ? (
            <span className="min-w-0 truncate">
              {placeholder ?? t("common.combobox.placeholder")}
            </span>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {sichtbar.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {o.color && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: o.color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{o.label}</span>
                </span>
              ))}
              {rest > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("common.multiCombobox.weitere", { count: rest })}
                </span>
              )}
            </span>
          )}
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
          <CommandList className="scroll-py-3">
            <CommandEmpty>{emptyText ?? t("common.combobox.empty")}</CommandEmpty>
            {options.map((opt) => {
              const isSelected = values.includes(opt.value);
              return (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.keywords ?? ""} ${opt.value}`}
                  onSelect={() => toggle(opt.value)}
                  className="cursor-pointer gap-2 whitespace-normal data-[selected=true]:bg-accent"
                >
                  {/* A real checkbox box, not a checkmark that fades in. At opacity-0 an
                      unselected row carried nothing at all, so the list read as a single-choice
                      menu and the one thing it needed to say -- that you may pick several -- was
                      visible only AFTER you had already picked one. An empty box states the
                      affordance up front. Same classes as ui/checkbox, so the control inside the
                      dropdown and the ones on the form are recognisably the same thing.
                      aria-hidden: CommandItem already exposes aria-selected to a screen reader,
                      and a second announcement of the same state would only repeat it. */}
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 shrink-0 place-content-center rounded-sm border border-primary shadow transition-colors",
                      isSelected && "bg-primary text-primary-foreground",
                    )}
                  >
                    <Check className={cn("size-3.5", !isSelected && "opacity-0")} />
                  </span>
                  {opt.color && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                      aria-hidden
                    />
                  )}
                  <span className={cn(isSelected && "font-medium text-brand")}>{opt.label}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
