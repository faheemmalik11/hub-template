import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { workflowStepsToRun } from "./workflow-stand-in-steps.ts";

describe("workflowStepsToRun", () => {
  it("sends a fresh document for review only from received", () => {
    assert.deepEqual(workflowStepsToRun("send-for-review", "received"), ["send-for-review"]);
    assert.deepEqual(workflowStepsToRun("send-for-review", "in_review"), []);
  });

  it("runs the whole chain up to approve from received", () => {
    assert.deepEqual(workflowStepsToRun("approve", "received"), ["send-for-review", "approve"]);
  });

  it("runs only approve once it is already in review", () => {
    assert.deepEqual(workflowStepsToRun("approve", "in_review"), ["approve"]);
    assert.deepEqual(workflowStepsToRun("approve", "query"), ["approve"]);
  });

  it("runs approve then final-approve when final approval is requested from review", () => {
    assert.deepEqual(workflowStepsToRun("final-approve", "in_review"), [
      "approve",
      "final-approve",
    ]);
  });

  it("runs only final-approve once the first approval already happened", () => {
    assert.deepEqual(workflowStepsToRun("final-approve", "approved_first"), ["final-approve"]);
    assert.deepEqual(workflowStepsToRun("approve", "approved_first"), []);
  });

  it("runs nothing once the document is past the approval phase", () => {
    assert.deepEqual(workflowStepsToRun("approve", "approved_final"), []);
    assert.deepEqual(workflowStepsToRun("final-approve", "closed"), []);
  });
});
