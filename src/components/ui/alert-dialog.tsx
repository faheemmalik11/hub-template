import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    // CLICKING OUTSIDE CLOSES IT. Radix suppresses that for AlertDialog on purpose, so the exit
    // is triggered here, on the overlay, which is the "outside" being clicked. Routed to Cancel
    // rather than a bare dismiss: a stray click can then only ever take the harmless exit, never
    // the confirm, and whatever handler the caller put on Cancel still runs. A dialog with no
    // Cancel stays sticky, which is right, because it has no safe exit to take.
    onClick={() => {
      document.querySelector<HTMLElement>('[role="alertdialog"] [data-alert-cancel]')?.click();
    }}
    className={cn(
      // pointer-events-auto is what makes the click above reachable at all. DismissableLayer puts
      // `pointer-events: none` on the body and re-enables it only on the content, so the overlay
      // inherits none and every click on it lands on nothing.
      "pointer-events-auto fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        // See DialogContent's identical fix for why grid-cols-[minmax(0,1fr)] is needed here too:
        // a plain `grid` item's default min-width is its own content's min-content size, not 0,
        // so one long unbreakable text run anywhere in the body silently stretches the whole
        // dialog past the viewport on a phone.
        //
        // w-[calc(100%-2rem)], not w-full: see DialogContent's identical fix — `fixed`'s containing
        // block is the viewport, so w-full put the dialog's own edge flush against the screen edge
        // on every phone width. The calc leaves a fixed 1rem gutter on each side; max-w-lg still
        // wins once the viewport is wide enough for it to be the smaller value.
        // rounded-lg unconditionally, not sm:rounded-lg — see DialogContent's identical fix.
        // max-h-[calc(100dvh-2rem)] + overflow-y-auto gives the same 1rem gutter vertically that
        // w-[calc(100%-2rem)] gives horizontally — see DialogContent's identical fix.
        "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg grid-cols-[minmax(0,1fr)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // Row + right-aligned + gap on every width — see DialogFooter's identical fix. The old
  // `flex-col-reverse` mobile default stacked Cancel/Action with no vertical gap between them.
  <div className={cn("flex flex-row flex-wrap justify-end gap-2", className)} {...props} />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    data-alert-cancel
    className={cn(buttonVariants({ variant: "outline" }), className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
