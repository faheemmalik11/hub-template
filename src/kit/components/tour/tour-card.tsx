import { Button } from "../../ui/button";
import type { TourLabels } from "./labels";
import { TourBlock } from "./tour-blocks";
import type { TourStep } from "./types";

export interface TourCardProps {
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  labels: TourLabels;
  onNext: () => void;
  onSkip: () => void;
}

export function TourCard({ step, stepIndex, stepCount, labels, onNext, onSkip }: TourCardProps) {
  const isLastStep = stepIndex + 1 >= stepCount;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 rounded-full bg-[var(--tour-accent,var(--primary))] px-2 py-0.5 text-[11px] font-semibold text-primary-foreground sm:text-xs">
          {labels.stepCounter(stepIndex + 1, stepCount)}
        </span>
        <h2 className="min-w-0 text-[15px] font-semibold leading-snug text-popover-foreground sm:text-[17px]">
          {step.title}
        </h2>
      </div>
      {/* Scrolls when a step's content is long, but the scrollbar itself is not part of the
          design — hidden cross-browser. Firefox/IE take a style prop; Chrome/Safari only listen
          to the ::-webkit-scrollbar pseudo-element, which needs an actual style rule, so this
          carries its own scoped <style> rather than depending on a consumer's Tailwind build or
          hub-kit's theme CSS being imported (confirmed not every Hub does either). */}
      <style>{".tour-card-scroll::-webkit-scrollbar { display: none; }"}</style>
      <div
        className="tour-card-scroll mt-2 max-h-[max(8rem,min(70vh,calc(var(--radix-popover-content-available-height,70vh)-6rem)))] space-y-2 overflow-y-auto pr-3 pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", overscrollBehavior: "contain" }}
      >
        {step.content.map((block, index) => (
          <TourBlock key={index} block={block} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="cursor-pointer text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
        >
          {labels.skip}
        </button>
        <Button
          type="button"
          onClick={onNext}
          className="h-7 rounded-lg bg-[var(--tour-accent,var(--primary))] px-3.5 text-[12px] sm:h-8 sm:px-5 sm:text-sm"
        >
          {isLastStep ? labels.finish : labels.next}
        </Button>
      </div>
    </div>
  );
}
