import { describe, expect, it } from "bun:test";

import { resolvePracticeTask, resolvedStepPath } from "@/kit/onboarding/resolve-practice-task";

import { seededRecordValues, stopCasesRecordIds } from "./practice-seeded-records";
import {
  STOP_CASES_CORRECT_NET_AMOUNT,
  STOP_CASES_PRACTICE_TASK_ID,
  buildStopCasesPracticeTask,
} from "./practice-stop-cases-task";

const recordIds = ["supplier-1", "account-1", "iban-doc", "ai-doc", "flyer-doc"];
const placeholders = {
  lastUploadedId: null,
  values: seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, recordIds),
};

describe("buildStopCasesPracticeTask", () => {
  const task = buildStopCasesPracticeTask((key) => key);
  const resolved = resolvePracticeTask(task, placeholders);

  it("walks the three cases in order, each opened from the list", () => {
    expect(task.steps.map((step) => step.id)).toEqual([
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
    ]);
  });

  it("needs no role other than the preparer", () => {
    expect(task.roles).toEqual(["preparer"]);
    expect(new Set(task.steps.map((step) => step.role))).toEqual(new Set(["preparer"]));
  });

  it("completes the three action steps on the events the real screens emit", () => {
    const conditionOf = (id: string) =>
      resolved.steps.find((s) => s.id === id)?.completionCondition;
    expect(conditionOf("iban-read-warning")).toEqual({
      eventType: "document_tab_opened",
      recordId: "iban-doc",
      data: { tab: "zahlung" },
    });
    expect(conditionOf("iban-confirm")).toEqual({
      eventType: "supplier_bank_account_confirmed",
      recordId: "account-1",
    });
    expect(conditionOf("ai-correct-net")).toEqual({
      eventType: "document_updated",
      recordId: "ai-doc",
      data: { amount_net: STOP_CASES_CORRECT_NET_AMOUNT, amounts_add_up: true },
    });
    expect(conditionOf("flyer-set-aside")).toEqual({
      eventType: "document_not_relevant_set",
      recordId: "flyer-doc",
    });
  });

  it("opens each practice document on its own record", () => {
    const opened = resolved.steps
      .filter((step) => step.completionCondition?.eventType === "document_opened")
      .map((step) => step.completionCondition?.recordId);
    expect(opened).toEqual(["iban-doc", "ai-doc", "flyer-doc"]);
  });

  it("leaves no placeholder behind once the seeded records are known", () => {
    expect(JSON.stringify(resolved).match(/\{[A-Za-z]+\}/)).toBeNull();
    for (const step of resolved.steps) {
      expect(resolvedStepPath(step.path)).not.toBeNull();
    }
  });

  it("keeps the placeholders visible until the records are known", () => {
    const beforeSeed = resolvePracticeTask(task, { ...placeholders, values: {} });
    expect(beforeSeed.steps.find((step) => step.id === "ai-open")?.target).toBe(
      "invoice-row-{aiDocId}",
    );
  });

  it("shows the restart hint on every action step and on no info step", () => {
    for (const step of task.steps) {
      const hasHint = (step.helpText ?? "").includes("onboarding.stopCases.restartHint");
      expect(hasHint).toBe(step.completionCondition !== null);
    }
  });

  it("gives every step a why-sentence", () => {
    for (const step of task.steps) expect(step.expectedOutcome).toBeTruthy();
  });
});

describe("seeded record ids", () => {
  it("reads the five ids from the seed result in a fixed order", () => {
    expect(
      stopCasesRecordIds({
        supplier_id: "s",
        iban_account_id: "a",
        iban_document_id: "i",
        ai_document_id: "k",
        flyer_document_id: "f",
      }),
    ).toEqual(["s", "a", "i", "k", "f"]);
  });

  it("refuses a seed result with a missing id", () => {
    expect(() => stopCasesRecordIds({ supplier_id: "s" })).toThrow();
  });

  it("names no placeholders for the other task or for a wrong number of ids", () => {
    expect(seededRecordValues("process-an-invoice", recordIds)).toEqual({});
    expect(seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, ["only-one"])).toEqual({});
  });

  it("names the five placeholders the task steps use", () => {
    expect(seededRecordValues(STOP_CASES_PRACTICE_TASK_ID, recordIds)).toEqual({
      practiceSupplierId: "supplier-1",
      ibanAccountId: "account-1",
      ibanDocId: "iban-doc",
      aiDocId: "ai-doc",
      flyerDocId: "flyer-doc",
    });
  });
});
