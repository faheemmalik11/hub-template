import type { RefObject } from "react";
import { Loader2, Mic } from "lucide-react";

export function VoiceOrb({
  orbRef,
  busy,
}: {
  orbRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
}) {
  return (
    <div
      ref={orbRef}
      className="grid size-24 shrink-0 place-items-center rounded-full bg-brand-wash text-brand-dark transition-[box-shadow,transform] duration-100 ease-out"
      style={{ boxShadow: "0 0 16px 4px color-mix(in oklch, var(--brand) 28%, transparent)" }}
    >
      {busy ? <Loader2 className="size-8 animate-spin" /> : <Mic className="size-8" />}
    </div>
  );
}
