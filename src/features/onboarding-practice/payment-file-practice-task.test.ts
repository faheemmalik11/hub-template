import { describe, expect, it } from "bun:test";

import {
  PAYMENT_FILE_PRACTICE_INVOICE_COUNT,
  buildPaymentFilePracticeTask,
} from "./payment-file-practice-task";

describe("buildPaymentFilePracticeTask", () => {
  const task = buildPaymentFilePracticeTask((key) => key);

  it("walks choose company, open accounts, select, build, check, download, track and pay in order", () => {
    expect(task.steps.map((step) => step.id)).toEqual([
      "payment-choose-company",
      "payment-open-accounts",
      "payment-see-payer-account",
      "payment-select-invoices",
      "payment-build-file",
      "payment-check-list",
      "payment-download-file",
      "payment-open-track",
      "payment-mark-paid",
    ]);
  });

  it("needs no role other than the preparer", () => {
    expect(task.roles).toEqual(["preparer"]);
    expect(new Set(task.steps.map((step) => step.role))).toEqual(new Set(["preparer"]));
  });

  it("names a real data-tour target for every step, with no stray alternates", () => {
    const realTargets = new Set([
      "payment-company",
      "payment-accounts-button",
      "payment-accounts-list",
      "payment-invoice-table",
      "payment-build-button",
      "payment-review-table",
      "payment-download-button",
      "payment-step-track",
      "payment-mark-paid",
    ]);
    for (const step of task.steps) {
      for (const alternative of step.target.split("|")) {
        expect(realTargets.has(alternative)).toBe(true);
      }
    }
  });

  it("completes each step on the event the real payment-file page emits", () => {
    const conditionOf = (id: string) =>
      task.steps.find((step) => step.id === id)?.completionCondition;
    expect(conditionOf("payment-choose-company")).toEqual({ eventType: "payment_company_chosen" });
    expect(conditionOf("payment-open-accounts")).toEqual({ eventType: "payment_accounts_opened" });
    expect(conditionOf("payment-see-payer-account")).toEqual({
      eventType: "payment_accounts_closed",
    });
    expect(conditionOf("payment-select-invoices")).toEqual({
      eventType: "payment_invoices_selected",
      data: { count: PAYMENT_FILE_PRACTICE_INVOICE_COUNT },
    });
    expect(conditionOf("payment-build-file")).toEqual({ eventType: "payment_file_created" });
    expect(conditionOf("payment-check-list")).toBeNull();
    expect(conditionOf("payment-download-file")).toEqual({ eventType: "payment_file_downloaded" });
    expect(conditionOf("payment-open-track")).toEqual({
      eventType: "payment_step_opened",
      data: { step: "track" },
    });
    expect(conditionOf("payment-mark-paid")).toEqual({ eventType: "payment_marked_paid" });
  });

  it("shows the restart hint on every action step and on no info step", () => {
    for (const step of task.steps) {
      const hasHint = (step.helpText ?? "").includes("onboarding.paymentFile.restartHint");
      expect(hasHint).toBe(step.completionCondition !== null);
    }
  });

  it("gives every step a why-sentence", () => {
    for (const step of task.steps) expect(step.expectedOutcome).toBeTruthy();
  });
});
