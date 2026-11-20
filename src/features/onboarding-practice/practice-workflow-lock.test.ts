import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { practiceLocksWorkflowActions } from "./practice-workflow-lock.ts";

describe("practiceLocksWorkflowActions", () => {
  it("locks approve and reject on a practice document while the stop cases task runs", () => {
    assert.equal(practiceLocksWorkflowActions("when-does-it-stop", true), true);
  });

  it("never locks a real document, even while the task runs", () => {
    assert.equal(practiceLocksWorkflowActions("when-does-it-stop", false), false);
    assert.equal(practiceLocksWorkflowActions("when-does-it-stop", null), false);
    assert.equal(practiceLocksWorkflowActions("when-does-it-stop", undefined), false);
  });

  it("does not lock without an active task or in the other practice task", () => {
    assert.equal(practiceLocksWorkflowActions(null, true), false);
    assert.equal(practiceLocksWorkflowActions("process-an-invoice", true), false);
  });
});
