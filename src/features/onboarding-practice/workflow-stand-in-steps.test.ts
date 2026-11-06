import { describe, expect, it } from "bun:test";

import { workflowStepsToRun } from "./workflow-stand-in-steps";

describe("workflowStepsToRun", () => {
  it("sends a fresh document for review only from received", () => {
    expect(workflowStepsToRun("send-for-review", "received")).toEqual(["send-for-review"]);
    expect(workflowStepsToRun("send-for-review", "in_review")).toEqual([]);
  });

  it("runs the whole chain up to approve from received", () => {
    expect(workflowStepsToRun("approve", "received")).toEqual(["send-for-review", "approve"]);
  });

  it("runs only approve once it is already in review", () => {
    expect(workflowStepsToRun("approve", "in_review")).toEqual(["approve"]);
    expect(workflowStepsToRun("approve", "query")).toEqual(["approve"]);
  });

  it("runs approve then final-approve when final approval is requested from review", () => {
    expect(workflowStepsToRun("final-approve", "in_review")).toEqual(["approve", "final-approve"]);
  });

  it("runs only final-approve once the first approval already happened", () => {
    expect(workflowStepsToRun("final-approve", "approved_first")).toEqual(["final-approve"]);
    expect(workflowStepsToRun("approve", "approved_first")).toEqual([]);
  });

  it("runs nothing once the document is past the approval phase", () => {
    expect(workflowStepsToRun("approve", "approved_final")).toEqual([]);
    expect(workflowStepsToRun("final-approve", "closed")).toEqual([]);
  });
});
