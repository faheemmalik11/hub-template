import { cn } from "../../lib/class-names";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

export const PAYMENT_FILE_STEPS = ["prepare", "review", "track"] as const;
export type PaymentFileStep = (typeof PAYMENT_FILE_STEPS)[number];

export interface StepNavProps {
  step: PaymentFileStep;
  onStepChange: (step: PaymentFileStep) => void;
  labels: PaymentFileLabels;
}

export function StepNav({ step, onStepChange, labels }: StepNavProps) {
  const stepIndex = PAYMENT_FILE_STEPS.indexOf(step);
  return (
    <ol aria-label={labels.stepsAriaLabel} className="flex items-start">
      {PAYMENT_FILE_STEPS.map((key, index) => {
        const current = index === stepIndex;
        const last = index === PAYMENT_FILE_STEPS.length - 1;
        return (
          <li
            key={key}
            aria-current={current ? "step" : undefined}
            className={last ? "shrink-0" : "flex-1"}
          >
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => onStepChange(key)}
                aria-label={labels.steps[key].title}
                className={cn(
                  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                  current
                    ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
                )}
              >
                {index + 1}
              </button>
              {!last && <span className="mx-2 h-0.5 flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className="mt-2 max-w-40">
              <div
                className={cn(
                  "text-sm",
                  current ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
              >
                {labels.steps[key].title}
              </div>
              <div className="text-xs text-muted-foreground">{labels.steps[key].subtitle}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
