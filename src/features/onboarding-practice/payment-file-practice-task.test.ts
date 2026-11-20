import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PAYMENT_FILE_PRACTICE_INVOICE_COUNT,
  buildPaymentFilePracticeTask,
} from "./payment-file-practice-task.ts";

describe("buildPaymentFilePracticeTask", () => {
  const task = buildPaymentFilePracticeTask((key) => key);

  it("walks choose company, open accounts, select, build, check, download, track and pay in order", () => {
    assert.deepEqual(
      task.steps.map((step) => step.id),
      [
        "payment-choose-company",
        "payment-open-accounts",
        "payment-see-payer-account",
        "payment-select-invoices",
        "payment-build-file",
        "payment-check-list",
        "payment-download-file",
        "payment-open-track",
        "payment-mark-paid",
      ],
    );
  });

  it("needs no role other than the preparer", () => {
    assert.deepEqual(task.roles, ["preparer"]);
    assert.deepEqual(new Set(task.steps.map((step) => step.role)), new Set(["preparer"]));
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
        assert.equal(realTargets.has(alternative), true);
      }
    }
  });

  it("completes each step on the event the real payment-file page emits", () => {
    const conditionOf = (id: string) =>
      task.steps.find((step) => step.id === id)?.completionCondition;
    assert.deepEqual(conditionOf("payment-choose-company"), {
      eventType: "payment_company_chosen",
    });
    assert.deepEqual(conditionOf("payment-open-accounts"), {
      eventType: "payment_accounts_opened",
    });
    assert.deepEqual(conditionOf("payment-see-payer-account"), {
      eventType: "payment_accounts_closed",
    });
    assert.deepEqual(conditionOf("payment-select-invoices"), {
      eventType: "payment_invoices_selected",
      data: { count: PAYMENT_FILE_PRACTICE_INVOICE_COUNT },
    });
    assert.deepEqual(conditionOf("payment-build-file"), { eventType: "payment_file_created" });
    assert.equal(conditionOf("payment-check-list"), null);
    assert.deepEqual(conditionOf("payment-download-file"), {
      eventType: "payment_file_downloaded",
    });
    assert.deepEqual(conditionOf("payment-open-track"), {
      eventType: "payment_step_opened",
      data: { step: "track" },
    });
    assert.deepEqual(conditionOf("payment-mark-paid"), { eventType: "payment_marked_paid" });
  });

  it("shows the restart hint on every action step and on no info step", () => {
    for (const step of task.steps) {
      const hasHint = (step.helpText ?? "").includes("onboarding.paymentFile.restartHint");
      assert.equal(hasHint, step.completionCondition !== null);
    }
  });

  it("gives every step a why-sentence", () => {
    for (const step of task.steps) assert.ok(step.expectedOutcome);
  });
});
