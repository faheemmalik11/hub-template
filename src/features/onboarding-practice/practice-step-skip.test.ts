import { describe, expect, it } from "bun:test";

import {
  approvalSkippedFinalApprove,
  approvalSkippedTheReviewStep,
  approveEvent,
  sendForReviewEvent,
} from "./practice-step-skip";

describe("approvalSkippedTheReviewStep", () => {
  const approveStatusEvent = { type: "document_status_changed", data: { actionId: "approve" } };

  it("fires when approve arrives while the review step is waiting", () => {
    expect(approvalSkippedTheReviewStep("send-for-review", approveStatusEvent)).toBe(true);
    expect(
      approvalSkippedTheReviewStep("send-for-review", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
    ).toBe(true);
  });

  it("does not fire on the step that approve belongs to", () => {
    expect(approvalSkippedTheReviewStep("approve", approveStatusEvent)).toBe(false);
  });

  it("does not fire for the review action itself or other event types", () => {
    expect(
      approvalSkippedTheReviewStep("send-for-review", {
        type: "document_status_changed",
        data: { actionId: "send_for_review" },
      }),
    ).toBe(false);
    expect(approvalSkippedTheReviewStep("send-for-review", { type: "document_updated" })).toBe(
      false,
    );
  });

  it("builds a review event with the action id the review step completion condition expects", () => {
    const event = sendForReviewEvent("doc-1");
    expect(event.type).toBe("document_status_changed");
    expect(event.data?.actionId).toBe("send_for_review");
  });
});

describe("approvalSkippedFinalApprove", () => {
  it("fires when a final approver's own approve click lands straight on approved_final", () => {
    expect(
      approvalSkippedFinalApprove("approve", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
    ).toBe(true);
  });

  it("does not fire on another step or for a plain approve", () => {
    expect(
      approvalSkippedFinalApprove("final-approve", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
    ).toBe(false);
    expect(
      approvalSkippedFinalApprove("approve", {
        type: "document_status_changed",
        data: { actionId: "approve" },
      }),
    ).toBe(false);
  });

  it("builds an approve event with the action id the approve step completion condition expects", () => {
    const event = approveEvent("doc-1");
    expect(event.data?.actionId).toBe("approve");
  });
});
