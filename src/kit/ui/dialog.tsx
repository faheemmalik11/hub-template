"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../lib/class-names";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Scrim, not a blackout. bg-black/80 rendered a white page behind the modal as #333, so the
      // app stopped being visible at all and a dialog read as a page change rather than as
      // something sitting on top of what you were doing. Half strength plus a 2px blur keeps the
      // context readable and still pushes it back.
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // grid-cols-[minmax(0,1fr)], not the plain implicit column `grid` alone: a grid item's
        // default min-width is `auto` (its own content's min-content size), not 0. Any dialog
        // whose body contains one long unbreakable run of text — a Combobox showing a long
        // selected option, here — silently stretched every row (header, footer, every field) out
        // to match that one row's intrinsic width, pushing the whole dialog past the viewport on
        // a phone even though `w-full max-w-lg` looks like it should have capped it. minmax(0,1fr)
        // forces the track's minimum to 0 instead, so children truncate/wrap as their own classes
        // already say to, rather than the grid silently overriding that.
        //
        // w-[calc(100%-2rem)], not w-full: `fixed` positioning's containing block is the viewport,
        // so w-full was 100% of the SCREEN width — the dialog's own edge touched the screen edge
        // on every phone width, regardless of max-w-lg (which only ever caps the upper end). The
        // calc leaves a fixed 1rem gutter on each side at any width; max-w-lg still wins once the
        // viewport is wide enough for it to be the smaller value.
        // rounded-lg unconditionally, not sm:rounded-lg: that was deliberately square for the old
        // edge-to-edge mobile layout (a rounded corner against a flush screen edge looks wrong).
        // Now that w-[calc(100%-2rem)] above gives it a gutter on every width, it floats like a
        // real card at every size and should read like one.
        //
        // max-h + overflow-y-auto is the vertical half of that same gutter: a tall dialog (any of
        // the multi-field forms here) otherwise ran off both ends of a phone screen with its own
        // top and bottom edges cropped away, and no way to reach the footer buttons. dvh, not vh,
        // so the mobile browser's collapsing address bar doesn't push the footer out of reach.
        "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg grid-cols-[minmax(0,1fr)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // Row + right-aligned + gap on every width, not just sm: and up — the old `flex-col-reverse`
  // mobile default stacked the buttons with no vertical gap between them at all (nothing filled
  // in for `sm:space-x-2` below that breakpoint), so they visually touched. flex-wrap is a safety
  // net for a phone narrow enough that two full-width-ish buttons can't share one line — they drop
  // to a second row instead of overflowing, still with the same gap.
  <div className={cn("flex flex-row flex-wrap justify-end gap-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
