import * as React from "react";

import { cn } from "../lib/class-names";
import { useFieldId } from "./field-context";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, id, ...props }, ref) => {
    // Inside a Field this carries the id the sibling Label points at. An explicit id still wins.
    const fieldId = useFieldId();
    return (
      <textarea
        id={id ?? fieldId ?? undefined}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
