import { Check } from "lucide-react";

import type { DealStatus } from "@/data";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

import { DealStatusBadge } from "./deal-status-badge";

const STEPS = ["incomplete", "ready", "approved", "invoiced"] as const;

type Step = (typeof STEPS)[number];

type StepState = "done" | "current" | "upcoming";

function stateOf(step: Step, status: Step): StepState {
  const stepIndex = STEPS.indexOf(step);
  const statusIndex = STEPS.indexOf(status);
  if (stepIndex < statusIndex) return "done";
  if (stepIndex === statusIndex) return "current";
  return "upcoming";
}

export function DealStatusStepper({ status }: { status: DealStatus }) {
  const { t } = useTranslation();

  if (status === "cancelled" || status === "settled") {
    return <DealStatusBadge status={status} />;
  }

  return (
    <div>
      <div className="flex items-center">
        {STEPS.map((step, index) => {
          const state = stateOf(step, status);
          const isLast = index === STEPS.length - 1;
          return (
            <div key={step} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                    state === "done" && "border-brand bg-brand text-white",
                    state === "current" &&
                      "border-brand bg-brand text-white ring-2 ring-brand/30 ring-offset-1 ring-offset-background",
                    state === "upcoming" && "border-border bg-transparent text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3" /> : null}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs",
                    state === "current" && "font-semibold text-foreground",
                    state === "done" && "font-medium text-foreground",
                    state === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {t(`commissionDeals.status.${step}`)}
                </span>
              </div>
              {!isLast && (
                <span
                  className={cn(
                    "mx-2 h-px w-6 shrink-0",
                    state === "done" ? "bg-brand" : "border-t border-dashed border-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t(`commissionDeals.status.${status}Hint`)}
      </p>
    </div>
  );
}
