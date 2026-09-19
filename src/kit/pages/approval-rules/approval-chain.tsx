import type { ApprovalRulesLabels } from "./labels";
import type { ApproverOption } from "../../adapters/approval-rules";
import { ArrowRight } from "lucide-react";

import { cn } from "../../lib/class-names";

export function ApprovalChain({
  steps,
  autoFinalStep = false,
  approvers,
  approverName,
  labels,
  className,
}: {
  steps: string[];

  autoFinalStep?: boolean;
  approvers: ApproverOption[];
  approverName: (userId: string) => string | null;
  labels: ApprovalRulesLabels;
  className?: string;
}) {
  const activeById = new Map(approvers.map((a) => [a.id, a.isActive]));
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-y-1.5", className)}>
      {steps.map((userId, index) => {
        const isFinal = index === steps.length - 1;

        const isActive = activeById.get(userId) ?? false;
        const name = approverName(userId) ?? labels.row.unknownApprover;
        return (
          <span key={`${userId}-${index}`} className="inline-flex min-w-0 items-center">
            {index > 0 && <ArrowRight className="mx-1 size-3 shrink-0 text-muted-foreground" />}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-xs",
                isFinal && "border-success/45 bg-success-soft",
                !isActive && "border-dashed border-danger/50 text-danger",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[9.5px] font-bold text-muted-foreground",
                  isFinal && isActive && "text-success",
                )}
              >
                {index + 1}
              </span>
              {name}
            </span>
          </span>
        );
      })}
      {autoFinalStep && (
        <span className="inline-flex min-w-0 items-center">
          {steps.length > 0 && (
            <ArrowRight className="mx-1 size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
            <span className="font-mono text-[9.5px] font-bold">{steps.length + 1}</span>
            {labels.row.autoStep}
          </span>
        </span>
      )}
    </div>
  );
}
