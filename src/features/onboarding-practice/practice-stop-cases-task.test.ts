import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePracticeTask, resolvedStepPath } from "@/kit/onboarding/resolve-practice-task";

import { seededRecordValues, stopCasesRecordIds } from "./practice-seeded-records.ts";
import {
  STOP_CASES_CORRECT_NET_AMOUNT,
  STOP_CASES_PRACTICE_TASK_ID,
  buildStopCasesPracticeTask,
} from "./practice-stop-cases-task.ts";

const recordIds = ["supplier-1", "account-1", "iban-doc", "ai-doc", "flyer-doc"];
const placeholders = {
  lastUploadedId: null,
  values: seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, recordIds),
};

describe("buildStopCasesPracticeTask", () => {
  const task = buildStopCasesPracticeTask((key) => key);
  const resolved = resolvePracticeTask(task, placeholders);

  it("walks the three cases in order, each opened from the list", () => {
    assert.deepEqual(
      task.steps.map((step) => step.id),
      [
        "stop-intro",
        "iban-open",
        "iban-read-warning",
        "iban-check-with-supplier",
        "iban-confirm",
        "ai-open",
        "ai-read-light",
        "ai-find-wrong-value",
        "ai-correct-net",
        "ai-see-check-green",
        "flyer-open",
        "flyer-read-why",
        "flyer-set-aside",
        "flyer-open-history",
        "flyer-see-history",
        "stop-outro",
      ],
    );
  });

  it("needs no role other than the preparer", () => {
    assert.deepEqual(task.roles, ["preparer"]);
    assert.deepEqual(new Set(task.steps.map((step) => step.role)), new Set(["preparer"]));
  });

  it("completes the three action steps on the events the real screens emit", () => {
    const conditionOf = (id: string) =>
      resolved.steps.find((s) => s.id === id)?.completionCondition;
    assert.deepEqual(conditionOf("iban-read-warning"), {
      eventType: "document_tab_opened",
      recordId: "iban-doc",
      data: { tab: "zahlung" },
    });
    assert.deepEqual(conditionOf("iban-confirm"), {
      eventType: "supplier_bank_account_confirmed",
      recordId: "account-1",
    });
    assert.deepEqual(conditionOf("ai-correct-net"), {
      eventType: "document_updated",
      recordId: "ai-doc",
      data: { amount_net: STOP_CASES_CORRECT_NET_AMOUNT, amounts_add_up: true },
    });
    assert.deepEqual(conditionOf("flyer-set-aside"), {
      eventType: "document_not_relevant_set",
      recordId: "flyer-doc",
    });
  });

  it("opens each practice document on its own record", () => {
    const opened = resolved.steps
      .filter((step) => step.completionCondition?.eventType === "document_opened")
      .map((step) => step.completionCondition?.recordId);
    assert.deepEqual(opened, ["iban-doc", "ai-doc", "flyer-doc"]);
  });

  it("leaves no placeholder behind once the seeded records are known", () => {
    assert.equal(JSON.stringify(resolved).match(/\{[A-Za-z]+\}/), null);
    for (const step of resolved.steps) {
      assert.notEqual(resolvedStepPath(step.path), null);
    }
  });

  it("keeps the placeholders visible until the records are known", () => {
    const beforeSeed = resolvePracticeTask(task, { ...placeholders, values: {} });
    assert.equal(
      beforeSeed.steps.find((step) => step.id === "ai-open")?.target,
      "invoice-row-{aiDocId}",
    );
  });

  it("shows the restart hint on every action step and on no info step", () => {
    for (const step of task.steps) {
      const hasHint = (step.helpText ?? "").includes("onboarding.stopCases.restartHint");
      assert.equal(hasHint, step.completionCondition !== null);
    }
  });

  it("gives every step a why-sentence", () => {
    for (const step of task.steps) assert.ok(step.expectedOutcome);
  });
});

describe("seeded record ids", () => {
  it("reads the five ids from the seed result in a fixed order", () => {
    assert.deepEqual(
      stopCasesRecordIds({
        supplier_id: "s",
        iban_account_id: "a",
        iban_document_id: "i",
        ai_document_id: "k",
        flyer_document_id: "f",
      }),
      ["s", "a", "i", "k", "f"],
    );
  });

  it("refuses a seed result with a missing id", () => {
    assert.throws(() => stopCasesRecordIds({ supplier_id: "s" }));
  });

  it("names no placeholders for the other task or for a wrong number of ids", () => {
    assert.deepEqual(seededRecordValues("process-an-invoice", recordIds), {});
    assert.deepEqual(seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, ["only-one"]), {});
  });

  it("names the five placeholders the task steps use", () => {
    assert.deepEqual(seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, recordIds), {
      practiceSupplierId: "supplier-1",
      ibanAccountId: "account-1",
      ibanDocId: "iban-doc",
      aiDocId: "ai-doc",
      flyerDocId: "flyer-doc",
    });
  });
});
