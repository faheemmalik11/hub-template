import * as React from "react";

import { cn } from "@/lib/utils";
import { useFeldId } from "@/components/ui/feld-context";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, id, ...props }, ref) => {
    // Inside a Feld this carries the id the sibling Label points at. An explicit id still wins.
    const feldId = useFeldId();
    return (
      <input
        id={id ?? feldId ?? undefined}
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
