export type PracticeStandInStep = "send-for-review" | "approve" | "final-approve" | "pay";

export type PracticeWorkflowStep = "send-for-review" | "approve" | "final-approve";

export const WORKFLOW_STEP_RESULT: Record<
  PracticeWorkflowStep,
  { status: string; historyType: string; historyText: string }
> = {
  "send-for-review": {
    status: "in_review",
    historyType: "status_change",
    historyText: "Zur Prüfung gegeben durch Onboarding",
  },
  approve: {
    status: "approved_first",
    historyType: "approval_first",
    historyText: "Freigegeben durch Onboarding",
  },
  "final-approve": {
    status: "approved_final",
    historyType: "approval_final",
    historyText: "Endgültig freigegeben durch Onboarding",
  },
};

export function workflowStepsToRun(
  requested: PracticeWorkflowStep,
  currentStatus: string,
): PracticeWorkflowStep[] {
  if (requested === "send-for-review") {
    return currentStatus === "received" ? ["send-for-review"] : [];
  }
  if (currentStatus === "received") return ["send-for-review", "approve"];
  if (currentStatus === "in_review" || currentStatus === "query") {
    if (requested === "approve") return ["approve"];
    return ["approve", "final-approve"];
  }
  if (currentStatus === "approved_first") {
    return requested === "final-approve" ? ["final-approve"] : [];
  }
  return [];
}
