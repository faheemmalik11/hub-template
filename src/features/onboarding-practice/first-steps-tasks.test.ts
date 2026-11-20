import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  firstStepsTasks,
  resolveFirstStepsEntries,
  shouldShowFirstSteps,
} from "./first-steps-tasks.ts";

const canPaymentFile = () => true;
const cannotPaymentFile = () => false;

describe("first steps card", () => {
  it("offers the invoice practice task first, then stop cases, then the payment file", () => {
    assert.deepEqual(
      firstStepsTasks(canPaymentFile).map((task) => task.id),
      ["process-an-invoice", "when-does-it-stop", "payment-file"],
    );
  });

  it("offers the commission deal practice task instead when payment files are switched off", () => {
    assert.deepEqual(
      firstStepsTasks(cannotPaymentFile).map((task) => task.id),
      ["process-an-invoice", "when-does-it-stop", "commission-deal"],
    );
  });

  it("gives every task its state in the order of the list", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), (id) =>
      id === "process-an-invoice" ? "completed" : "started",
    );
    assert.deepEqual(
      entries.map((entry) => [entry.task.id, entry.state]),
      [
        ["process-an-invoice", "completed"],
        ["when-does-it-stop", "started"],
        ["payment-file", "started"],
      ],
    );
  });

  it("shows the card while any task is not completed", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), (id) =>
      id === "process-an-invoice" ? "completed" : "new",
    );
    assert.equal(shouldShowFirstSteps(entries), true);
  });

  it("hides the card once every task is completed", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), () => "completed");
    assert.equal(shouldShowFirstSteps(entries), false);
  });

  it("shows the card for a task that was only started", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), () => "started");
    assert.equal(shouldShowFirstSteps(entries), true);
  });

  it("shows nothing when there are no tasks", () => {
    assert.equal(shouldShowFirstSteps(resolveFirstStepsEntries([], () => "new")), false);
  });
});
