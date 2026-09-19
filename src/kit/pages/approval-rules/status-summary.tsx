import { cn } from "../../lib/class-names";
import type { ApprovalRulesLabels } from "./labels";

export function StatusSummary({
  activeRules,
  issueCount,
  labels,
  trailing,
}: {
  activeRules: number;
  issueCount: number;
  labels: ApprovalRulesLabels;

  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            activeRules > 0 ? "bg-success" : "bg-muted-foreground",
          )}
        />
        <span className={activeRules > 0 ? "text-success" : "text-muted-foreground"}>
          {labels.summary.active(activeRules)}
        </span>
      </span>

      <span className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            issueCount > 0 ? "bg-warning" : "bg-muted-foreground",
          )}
        />
        <span className={issueCount > 0 ? "text-warning" : "text-muted-foreground"}>
          {labels.summary.issues(issueCount)}
        </span>
      </span>

      {trailing}
    </div>
  );
}
