import type { OnboardingEventInput } from "@/kit/onboarding";

const REVIEW_SKIPPING_ACTION_IDS = ["approve", "final_approve"];

export function approvalSkippedTheReviewStep(
  currentStepId: string,
  event: Pick<OnboardingEventInput, "type" | "data">,
): boolean {
  if (currentStepId !== "send-for-review") return false;
  if (event.type !== "document_status_changed") return false;
  return REVIEW_SKIPPING_ACTION_IDS.includes(String(event.data?.actionId));
}

export function sendForReviewEvent(recordId: string): OnboardingEventInput {
  return {
    type: "document_status_changed",
    recordId,
    data: { actionId: "send_for_review" },
  };
}

export function approvalSkippedFinalApprove(
  currentStepId: string,
  event: Pick<OnboardingEventInput, "type" | "data">,
): boolean {
  if (currentStepId !== "approve") return false;
  if (event.type !== "document_status_changed") return false;
  return event.data?.actionId === "final_approve";
}

export function approveEvent(recordId: string): OnboardingEventInput {
  return { type: "document_status_changed", recordId, data: { actionId: "approve" } };
}
