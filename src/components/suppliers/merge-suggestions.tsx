import { Fragment, forwardRef, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MergeSuggestion, SupplierLinkComponent } from "@/components/suppliers/types";

// forwardRef + ...props: DialogTrigger's `asChild` clones this element via Radix Slot, injecting
// its own onClick/ref/aria-expanded. A component that does not accept and forward those never
// receives the click handler that opens the dialog, it just sits there looking clickable.
const MergeSuggestionsTrigger = forwardRef<
  HTMLButtonElement,
  { label: string; count: number } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, count, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    // Amber rather than a plain outline button: this is work waiting, not another filter. It sits
    // in the toolbar at the same height as the controls beside it so the row still reads as a row.
    className={cn(
      "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100",
      className,
    )}
    {...props}
  >
    <TriangleAlert className="size-4 shrink-0" />
    {label}
    <span className="grid min-w-5 place-items-center rounded-full bg-amber-200 px-1.5 text-xs font-semibold text-amber-900">
      {count}
    </span>
  </button>
));
MergeSuggestionsTrigger.displayName = "MergeSuggestionsTrigger";

/**
 * The duplicate-supplier suggestions, behind one button.
 *
 * They used to be an open-ended panel above the table. Seven of them pushed the list you came for
 * most of a screen down, for work you had usually already dealt with. As a button the whole thing
 * costs one control's width and still says how many are waiting; the list opens in a modal, where
 * there is room to read both names and decide.
 *
 * Portable by construction. Suggestions, the link component and the merge control all arrive as
 * props, so nothing here knows which hub it is running in.
 */
export function MergeSuggestions({
  suggestions,
  labels,
  supplierLink: SupplierLink,
  renderAction,
  className,
  listClassName = "max-h-[55vh]",
}: {
  suggestions: MergeSuggestion[];
  labels: { title: string; description?: string };
  supplierLink: SupplierLinkComponent;
  /** The merge control for one suggestion. Kept out here: merging is a host-side mutation. */
  renderAction: (suggestion: MergeSuggestion) => ReactNode;
  className?: string;
  /** Height cap for the scroll container inside the modal. */
  listClassName?: string;
}) {
  if (suggestions.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <MergeSuggestionsTrigger
          label={labels.title}
          count={suggestions.length}
          className={className}
        />
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          {labels.description && <DialogDescription>{labels.description}</DialogDescription>}
        </DialogHeader>
        {/* The list scrolls, not the dialog: the title stays put while you work down a long set. */}
        <ul className={cn("space-y-2 overflow-y-auto pr-1", listClassName)}>
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground">
                  {suggestion.suppliers.map((supplier, i) => (
                    <Fragment key={supplier.id}>
                      {i > 0 && <span className="mx-1 text-muted-foreground">·</span>}
                      <SupplierLink
                        supplierId={supplier.id}
                        name={supplier.name}
                        className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </Fragment>
                  ))}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{suggestion.reason}</span>
              </div>
              {renderAction(suggestion)}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
