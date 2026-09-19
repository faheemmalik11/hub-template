import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { cn } from "../lib/class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

function isClipped(element: HTMLElement | null): boolean {
  if (!element) return false;
  const candidates = [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))];
  return candidates.some(
    (node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
  );
}

export function HintTooltip({
  label,
  children,
  contentClassName,
  onlyWhenClipped = true,
}: {
  label: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  onlyWhenClipped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const wrapper = useRef<HTMLSpanElement>(null);

  if (label === null || label === undefined || label === "") return <>{children}</>;

  function trackPointer(event: ReactPointerEvent<HTMLSpanElement>) {
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return;
    setPoint({ x: event.clientX - box.left, y: event.clientY - box.top });
  }

  return (
    <span
      ref={wrapper}
      className="relative block min-w-0"
      onPointerMove={trackPointer}
      onPointerEnter={(event) => {
        if (onlyWhenClipped && !isClipped(wrapper.current)) return;
        trackPointer(event);
        setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
    >
      {children}
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: point.x, top: point.y, width: 0, height: 0 }}
          />
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={12}
          className={cn(
            "max-w-[min(28rem,90vw)] whitespace-pre-wrap break-words",
            contentClassName,
          )}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
