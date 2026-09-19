import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * An explanation attached to a value, marked by a dotted underline.
 *
 * Use it where the value alone is ambiguous: a name that could be either of two things, a figure
 * whose unit is not on screen. The explanation is the caller's, so this holds no text of its own.
 */
export function InfoTip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      {/* asChild keeps the trigger transparent to layout. A wrapper element of its own would
          break the flex rows these sit in. */}
      <TooltipTrigger asChild>
        <span className="decoration-dotted underline-offset-4 hover:underline">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The same explanation, on something that also acts when clicked.
 *
 * Hover brightens rather than swapping colour, so a chip keeps whatever state colour it carries
 * and stays as readable hovered as it was at rest.
 */
export function InfoTipButton({
  label,
  onClick,
  children,
}: {
  label: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="cursor-pointer rounded-md transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{label}</TooltipContent>
    </Tooltip>
  );
}
