import { describe, expect, it } from "bun:test";

import {
  firstStepsTasks,
  resolveFirstStepsEntries,
  shouldShowFirstSteps,
} from "./first-steps-tasks";

const canPaymentFile = () => true;
const cannotPaymentFile = () => false;

describe("first steps card", () => {
  it("offers the invoice practice task first, then stop cases, then the payment file", () => {
    expect(firstStepsTasks(canPaymentFile).map((task) => task.id)).toEqual([
      "process-an-invoice",
      "when-does-it-stop",
      "payment-file",
    ]);
  });

  it("offers the commission deal practice task instead when payment files are switched off", () => {
    expect(firstStepsTasks(cannotPaymentFile).map((task) => task.id)).toEqual([
      "process-an-invoice",
      "when-does-it-stop",
      "commission-deal",
    ]);
  });

  it("gives every task its state in the order of the list", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), (id) =>
      id === "process-an-invoice" ? "completed" : "started",
    );
    expect(entries.map((entry) => [entry.task.id, entry.state])).toEqual([
      ["process-an-invoice", "completed"],
      ["when-does-it-stop", "started"],
      ["payment-file", "started"],
    ]);
  });

  it("shows the card while any task is not completed", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), (id) =>
      id === "process-an-invoice" ? "completed" : "new",
    );
    expect(shouldShowFirstSteps(entries)).toBe(true);
  });

  it("hides the card once every task is completed", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), () => "completed");
    expect(shouldShowFirstSteps(entries)).toBe(false);
  });

  it("shows the card for a task that was only started", () => {
    const entries = resolveFirstStepsEntries(firstStepsTasks(canPaymentFile), () => "started");
    expect(shouldShowFirstSteps(entries)).toBe(true);
  });

  it("shows nothing when there are no tasks", () => {
    expect(shouldShowFirstSteps(resolveFirstStepsEntries([], () => "new"))).toBe(false);
  });
});
