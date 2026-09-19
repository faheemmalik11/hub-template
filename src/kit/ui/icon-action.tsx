import { forwardRef } from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// An icon-only button with a visible tooltip, so the icon is never a guessing game.
export const IconAction = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { label: string }
>(function IconAction({ label, children, ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});
