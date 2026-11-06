import { describe, expect, it } from "bun:test";

import { practiceLocksWorkflowActions } from "./practice-workflow-lock";

describe("practiceLocksWorkflowActions", () => {
  it("locks approve and reject on a practice document while the stop cases task runs", () => {
    expect(practiceLocksWorkflowActions("when-does-it-stop", true)).toBe(true);
  });

  it("never locks a real document, even while the task runs", () => {
    expect(practiceLocksWorkflowActions("when-does-it-stop", false)).toBe(false);
    expect(practiceLocksWorkflowActions("when-does-it-stop", null)).toBe(false);
    expect(practiceLocksWorkflowActions("when-does-it-stop", undefined)).toBe(false);
  });

  it("does not lock without an active task or in the other practice task", () => {
    expect(practiceLocksWorkflowActions(null, true)).toBe(false);
    expect(practiceLocksWorkflowActions("process-an-invoice", true)).toBe(false);
  });
});
