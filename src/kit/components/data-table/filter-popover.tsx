import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "../../lib/class-names";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../ui/sheet";
import { Switch } from "../../ui/switch";
import { useIsMobile } from "../../hooks/use-mobile";
import { DateRangePicker } from "./date-range-picker";
import { clearFilters, countActiveFilters, type FilterField } from "./filter-fields";

export interface FilterPopoverLabels {
  button: string;
  title: string;
  reset: string;
}

export const englishFilterPopoverLabels: FilterPopoverLabels = {
  button: "Filter",
  title: "Filters",
  reset: "Reset all filters",
};

const FilterTriggerButton = forwardRef<
  HTMLButtonElement,
  { label: string; count: number } & ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, count, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
      count > 0
        ? "border-brand bg-brand-wash text-brand-dark"
        : "border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <SlidersHorizontal className="size-4" />
    {label}
    {count > 0 && (
      <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
        {count}
      </span>
    )}
  </button>
));
FilterTriggerButton.displayName = "FilterTriggerButton";

function FilterFields({ fields }: { fields: FilterField[] }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          className={cn("flex flex-col gap-1", field.kind === "toggle" && "sm:col-span-2")}
        >
          <span className="text-xs font-medium text-muted-foreground">
            {field.kind === "toggle" ? (field.fieldLabel ?? field.label) : field.label}
          </span>
          {field.kind === "select" ? (
            <Combobox
              value={field.value}
              onValueChange={field.onChange}
              className="w-full"
              placeholder={field.label}
              ariaLabel={field.label}
              options={field.options}
            />
          ) : field.kind === "dateRange" ? (
            <DateRangePicker
              value={field.value}
              onValueChange={field.onChange}
              options={field.options}
              customValue={field.customValue}
              from={field.from}
              to={field.to}
              onRangeApply={field.onRangeApply}
              locale={field.locale}
              rangeLabels={field.rangeLabels}
              backLabel={field.backLabel}
              placeholder={field.placeholder}
              searchPlaceholder={field.searchPlaceholder}
              emptyLabel={field.emptyLabel}
              ariaLabel={field.label}
              formatDay={field.formatDay}
              className="w-full"
            />
          ) : field.kind === "numberRange" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={field.from}
                onChange={(event) => field.onRangeChange(event.target.value, field.to)}
                placeholder={field.fromPlaceholder}
                aria-label={`${field.label} — ${field.fromPlaceholder ?? "from"}`}
                className="w-full"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="decimal"
                value={field.to}
                onChange={(event) => field.onRangeChange(field.from, event.target.value)}
                placeholder={field.toPlaceholder}
                aria-label={`${field.label} — ${field.toPlaceholder ?? "to"}`}
                className="w-full"
              />
            </div>
          ) : (
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm">
              <span className="min-w-0">{field.label}</span>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label={field.label}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FilterPopover({
  fields,
  labels = englishFilterPopoverLabels,
  mobileExtra,
  className,
  contentClassName = "w-[420px] max-w-[90vw] p-3",
}: {
  fields: FilterField[];
  labels?: FilterPopoverLabels;
  mobileExtra?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const isMobile = useIsMobile();
  const activeCount = countActiveFilters(fields);

  const trigger = (
    <FilterTriggerButton label={labels.button} count={activeCount} className={className} />
  );
  const resetButton = activeCount > 0 && (
    <button
      type="button"
      onClick={() => clearFilters(fields)}
      className="mt-3 cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
    >
      {labels.reset}
    </button>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{labels.title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <FilterFields fields={fields} />
            {mobileExtra && <div className="mt-4 border-t border-border pt-4">{mobileExtra}</div>}
            {resetButton}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className={contentClassName}>
        <FilterFields fields={fields} />
        {resetButton}
      </PopoverContent>
    </Popover>
  );
}
