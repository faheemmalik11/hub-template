import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvalSkippedFinalApprove,
  approvalSkippedTheReviewStep,
  approveEvent,
  sendForReviewEvent,
} from "./practice-step-skip.ts";

describe("approvalSkippedTheReviewStep", () => {
  const approveStatusEvent = { type: "document_status_changed", data: { actionId: "approve" } };

  it("fires when approve arrives while the review step is waiting", () => {
    assert.equal(approvalSkippedTheReviewStep("send-for-review", approveStatusEvent), true);
    assert.equal(
      approvalSkippedTheReviewStep("send-for-review", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
      true,
    );
  });

  it("does not fire on the step that approve belongs to", () => {
    assert.equal(approvalSkippedTheReviewStep("approve", approveStatusEvent), false);
  });

  it("does not fire for the review action itself or other event types", () => {
    assert.equal(
      approvalSkippedTheReviewStep("send-for-review", {
        type: "document_status_changed",
        data: { actionId: "send_for_review" },
      }),
      false,
    );
    assert.equal(
      approvalSkippedTheReviewStep("send-for-review", { type: "document_updated" }),
      false,
    );
  });

  it("builds a review event with the action id the review step completion condition expects", () => {
    const event = sendForReviewEvent("doc-1");
    assert.equal(event.type, "document_status_changed");
    assert.equal(event.data?.actionId, "send_for_review");
  });
});

describe("approvalSkippedFinalApprove", () => {
  it("fires when a final approver's own approve click lands straight on approved_final", () => {
    assert.equal(
      approvalSkippedFinalApprove("approve", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
      true,
    );
  });

  it("does not fire on another step or for a plain approve", () => {
    assert.equal(
      approvalSkippedFinalApprove("final-approve", {
        type: "document_status_changed",
        data: { actionId: "final_approve" },
      }),
      false,
    );
    assert.equal(
      approvalSkippedFinalApprove("approve", {
        type: "document_status_changed",
        data: { actionId: "approve" },
      }),
      false,
    );
  });

  it("builds an approve event with the action id the approve step completion condition expects", () => {
    const event = approveEvent("doc-1");
    assert.equal(event.data?.actionId, "approve");
  });
});
