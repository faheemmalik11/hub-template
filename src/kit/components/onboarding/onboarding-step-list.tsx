import { Check } from "lucide-react";

import { cn } from "@/kit/lib/class-names";
import type { OnboardingStep, OnboardingStepStatus } from "@/kit/onboarding";

const NUMBER_CIRCLE_CLASS: Record<OnboardingStepStatus, string> = {
  done: "bg-emerald-100 text-emerald-700",
  active: "bg-[var(--onboarding-accent,var(--primary))] text-primary-foreground",
  pending: "bg-muted text-muted-foreground",
};

export interface OnboardingStepListProps {
  steps: OnboardingStep[];
  statuses: OnboardingStepStatus[];
  roleLabels?: Record<string, string>;
  renderStepExtra?: (
    step: OnboardingStep,
    index: number,
    status: OnboardingStepStatus,
  ) => React.ReactNode;
  className?: string;
}

export function OnboardingStepList({
  steps,
  statuses,
  roleLabels,
  renderStepExtra,
  className,
}: OnboardingStepListProps) {
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((step, index) => {
        const status = statuses[index];
        const extra = renderStepExtra?.(step, index, status);
        return (
          <li
            key={step.id}
            className={cn(
              "flex flex-col gap-2",
              status === "active" &&
                "-mx-2 rounded-lg bg-[var(--onboarding-accent,var(--primary))]/10 px-2 py-1.5",
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  NUMBER_CIRCLE_CLASS[status],
                )}
              >
                {status === "done" ? <Check className="size-3" /> : index + 1}
              </span>
              <p
                className={cn(
                  "text-sm leading-snug",
                  status === "active" ? "font-semibold text-foreground" : "text-foreground",
                  status === "done" && "text-muted-foreground",
                )}
              >
                {step.instruction}
                {step.role && roleLabels?.[step.role] && (
                  <span className="ml-2 inline-flex rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
                    {roleLabels[step.role]}
                  </span>
                )}
              </p>
            </div>
            {extra && <div className="pl-[30px]">{extra}</div>}
          </li>
        );
      })}
    </ol>
  );
}
