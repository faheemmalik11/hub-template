import { forwardRef, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ZeitraumPicker } from "@/components/data-table/zeitraum-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  clearFilters,
  countActiveFilters,
  type FilterField,
} from "@/components/data-table/filter-fields";

// forwardRef + ...props: PopoverTrigger/SheetTrigger's `asChild` clones this element via Radix
// Slot, injecting its own onClick/ref/aria-expanded. A component that doesn't accept and forward
// those never receives the click handler that opens the surface -- it just sits there looking
// clickable.
const FilterTriggerButton = forwardRef<
  HTMLButtonElement,
  { label: string; count: number } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, count, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
      count > 0
        ? "border-brand bg-brand-wash text-brand-dark"
        : // The same classes as Button's `outline` variant, not an approximation of them. Muted
          // text on a transparent ground made this read as DISABLED whenever it sat next to real
          // outline buttons, which is exactly what it does on the Bankkonten toolbar.
          "border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
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

/**
 * Every field is the same two rows: a heading, then a control exactly one `h-9` tall, the height
 * of the Combobox trigger, which is what a select field's control is. Mixing shapes here (a
 * labelled dropdown beside an unlabelled bordered box that grows a line whenever its text wraps)
 * left the two sitting at different heights on different baselines.
 */
function FilterFields({ fields }: { fields: FilterField[] }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div
          key={f.key}
          // A toggle spans the row. Its label is a sentence with a count in it, and in a half-width
          // cell that ran out of room and had to be truncated behind a tooltip, so the one thing
          // the filter tells you was the thing you could not read.
          className={cn(
            "flex flex-col gap-1",
            // A toggle spans the row. Its label is a sentence with a count in it, and in a
            // half-width cell that ran out of room and had to be truncated behind a tooltip, so the
            // one thing the filter tells you was the thing you could not read. Everything else
            // keeps the two-column grid, which is what makes four filters read as a 2x2 block
            // rather than a column of full-width bars.
            f.kind === "toggle" && "sm:col-span-2",
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">
            {f.kind === "toggle" ? (f.fieldLabel ?? f.label) : f.label}
          </span>
          {f.kind === "select" ? (
            <Combobox
              value={f.value}
              onValueChange={f.onChange}
              className="w-full"
              placeholder={f.label}
              ariaLabel={f.label}
              options={f.options}
            />
          ) : f.kind === "zeitraum" ? (
            // The app's own period control: a list of presets that turns into ONE calendar in
            // place. Two separate date fields made a single question look like two filters and let
            // a reader pick a range that runs backwards.
            <ZeitraumPicker
              value={f.value}
              onValueChange={f.onChange}
              options={f.options}
              customValue={f.customValue}
              von={f.von}
              bis={f.bis}
              onRangeApply={f.onRangeApply}
              locale={f.locale}
              rangeLabels={f.rangeLabels}
              backLabel={f.backLabel}
              placeholder={f.placeholder}
              ariaLabel={f.label}
              formatDay={f.formatDay}
              className="w-full"
            />
          ) : (
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm">
              <span className="min-w-0">{f.label}</span>
              {/* The switch carries its own name: a wrapping label would not forward a click to it
                  anyway (Radix renders a button), so it cannot be the thing that names it. */}
              <Switch checked={f.value} onCheckedChange={f.onChange} aria-label={f.label} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * One "Filter" button holding every filter a list has, instead of a row of loose controls.
 *
 * Same grouped-filters pattern the receipts and open-items lists already use: a trigger carrying
 * the number of active filters, opening a popover on the desktop and a bottom sheet on a phone (a
 * popover there either clips against the viewport edge or floats somewhere unrelated to the tap).
 *
 * `mobileExtra` exists because sorting is a table-header affordance and the table is desktop-only:
 * a card list needs its sort control somewhere, and the sheet is where it goes.
 */
export function FilterPopover({
  fields,
  labels,
  mobileExtra,
  className,
  contentClassName = "w-[420px] max-w-[90vw] p-3",
}: {
  fields: FilterField[];
  labels: { button: string; title: string; reset: string };
  mobileExtra?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const isMobile = useIsMobile();
  const active = countActiveFilters(fields);

  const trigger = (
    <FilterTriggerButton label={labels.button} count={active} className={className} />
  );
  const resetButton = active > 0 && (
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
