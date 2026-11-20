import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePracticeTask, resolvedStepPath } from "@/kit/onboarding/resolve-practice-task";

import { buildPracticeInvoiceTask, practiceInvoiceAmountIsWrong } from "./practice-invoice-task.ts";
import { demoCompanyAndPropertyCodes } from "./practice-placeholder-values.ts";

const placeholders = {
  lastUploadedId: "doc-1",
  values: { demoCompanyCode: "DEMO-ab12cd34", demoPropertyCode: "DEMO-ab12cd34-P1" },
};

describe("practiceInvoiceAmountIsWrong", () => {
  it("is wrong until the amount is corrected", () => {
    assert.equal(practiceInvoiceAmountIsWrong(240.0), true);
    assert.equal(practiceInvoiceAmountIsWrong(250.0), false);
    assert.equal(practiceInvoiceAmountIsWrong(null), false);
  });
});

describe("demoCompanyAndPropertyCodes", () => {
  it("builds a stable pair of codes from the signed-in person's id", () => {
    assert.deepEqual(demoCompanyAndPropertyCodes("c2a625aa-b4d5-4cdf-a4c2-52a683e8f761"), {
      demoCompanyCode: "DEMO-c2a625aa",
      demoPropertyCode: "DEMO-c2a625aa-P1",
    });
  });
});

describe("buildPracticeInvoiceTask", () => {
  const task = buildPracticeInvoiceTask((key) => key);
  const resolved = resolvePracticeTask(task, placeholders);

  it("walks upload, check, assign, approve, final-approve and pay in order", () => {
    assert.deepEqual(
      task.steps.map((step) => step.id),
      [
        "upload",
        "open-invoice",
        "correct-amount",
        "assign-company-and-property",
        "send-for-review",
        "approve",
        "final-approve",
        "match-bank-payment",
      ],
    );
  });

  it("leaves no placeholder behind once an invoice has been uploaded", () => {
    assert.equal(
      JSON.stringify(resolved).match(/\{(lastUploadedId|demoCompanyCode|demoPropertyCode)\}/),
      null,
    );
  });

  it("points the assignment step at the demo company and property codes together", () => {
    const assignment = resolved.steps.find((step) => step.id === "assign-company-and-property");
    assert.deepEqual(assignment?.completionCondition?.data, {
      company_code: "DEMO-ab12cd34",
      property_code: "DEMO-ab12cd34-P1",
    });
  });

  it("scopes every step after the upload to the uploaded document", () => {
    for (const step of resolved.steps.slice(1)) {
      assert.equal(step.completionCondition?.recordId, "doc-1");
    }
  });

  it("keeps a placeholder visible until there is an upload to resolve against", () => {
    const beforeUpload = resolvePracticeTask(task, { ...placeholders, lastUploadedId: null });
    const openStep = beforeUpload.steps.find((step) => step.id === "open-invoice");
    assert.ok(openStep?.target.includes("{lastUploadedId}"));
  });

  it("turns the approver step into an explanation for a preparer with no approval right", () => {
    const forPreparer = resolvePracticeTask(task, placeholders, {
      userRoles: [],
      standInInstructions: {
        approve: "We approve for you.",
        "send-for-review": "We send it for you.",
      },
    });
    const approve = forPreparer.steps.find((step) => step.id === "approve");
    assert.equal(approve?.type, "info");
    assert.equal(approve?.instruction, "We approve for you.");
    assert.equal(approve?.completionCondition, null);
  });

  it("keeps the approver step as an action for an approver", () => {
    const forApprover = resolvePracticeTask(task, placeholders, {
      userRoles: ["approver", "payer"],
      standInInstructions: {
        approve: "We approve for you.",
        "send-for-review": "We send it for you.",
      },
    });
    const approve = forApprover.steps.find((step) => step.id === "approve");
    assert.equal(approve?.type, "approve");
    assert.equal(approve?.completionCondition?.eventType, "document_status_changed");
  });
});

describe("resolvedStepPath", () => {
  it("returns null while the document id is unresolved", () => {
    assert.equal(resolvedStepPath("/incoming-invoices/{lastUploadedId}"), null);
  });

  it("returns resolved and plain paths unchanged", () => {
    assert.equal(resolvedStepPath("/incoming-invoices/abc"), "/incoming-invoices/abc");
    assert.equal(resolvedStepPath("/incoming-invoices"), "/incoming-invoices");
  });

  it("returns null for no path", () => {
    assert.equal(resolvedStepPath(undefined), null);
  });
});
