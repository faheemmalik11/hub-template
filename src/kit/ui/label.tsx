"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/class-names";
import { useFieldId } from "./field-context";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, htmlFor, ...props }, ref) => {
  // Inside a Field the label points at that field's control. An explicit htmlFor still wins.
  const fieldId = useFieldId();
  return (
    <LabelPrimitive.Root
      ref={ref}
      htmlFor={htmlFor ?? fieldId ?? undefined}
      className={cn(labelVariants(), className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
