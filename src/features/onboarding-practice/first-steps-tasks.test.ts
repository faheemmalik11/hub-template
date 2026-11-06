import { describe, expect, it } from "bun:test";

import {
  FIRST_STEPS_TASKS,
  resolveFirstStepsEntries,
  shouldShowFirstSteps,
} from "./first-steps-tasks";

describe("first steps card", () => {
  it("offers the invoice practice task first and the stop cases task second", () => {
    expect(FIRST_STEPS_TASKS.map((task) => task.id)).toEqual([
      "process-an-invoice",
      "when-does-it-stop",
    ]);
  });

  it("gives every task its state in the order of the list", () => {
    const entries = resolveFirstStepsEntries(FIRST_STEPS_TASKS, (id) =>
      id === "process-an-invoice" ? "completed" : "started",
    );
    expect(entries.map((entry) => [entry.task.id, entry.state])).toEqual([
      ["process-an-invoice", "completed"],
      ["when-does-it-stop", "started"],
    ]);
  });

  it("shows the card while any task is not completed", () => {
    const entries = resolveFirstStepsEntries(FIRST_STEPS_TASKS, (id) =>
      id === "process-an-invoice" ? "completed" : "new",
    );
    expect(shouldShowFirstSteps(entries)).toBe(true);
  });

  it("hides the card once every task is completed", () => {
    const entries = resolveFirstStepsEntries(FIRST_STEPS_TASKS, () => "completed");
    expect(shouldShowFirstSteps(entries)).toBe(false);
  });

  it("shows the card for a task that was only started", () => {
    const entries = resolveFirstStepsEntries(FIRST_STEPS_TASKS, () => "started");
    expect(shouldShowFirstSteps(entries)).toBe(true);
  });

  it("shows nothing when there are no tasks", () => {
    expect(shouldShowFirstSteps(resolveFirstStepsEntries([], () => "new"))).toBe(false);
  });
});
