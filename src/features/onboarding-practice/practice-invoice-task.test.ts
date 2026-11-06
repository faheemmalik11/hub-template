import { describe, expect, it } from "bun:test";

import { resolvePracticeTask, resolvedStepPath } from "@/kit/onboarding/resolve-practice-task";

import { buildPracticeInvoiceTask, practiceInvoiceAmountIsWrong } from "./practice-invoice-task";
import { demoCompanyAndPropertyCodes } from "./practice-placeholder-values";

const placeholders = {
  lastUploadedId: "doc-1",
  values: { demoCompanyCode: "DEMO-ab12cd34", demoPropertyCode: "DEMO-ab12cd34-P1" },
};

describe("practiceInvoiceAmountIsWrong", () => {
  it("is wrong until the amount is corrected", () => {
    expect(practiceInvoiceAmountIsWrong(478.9)).toBe(true);
    expect(practiceInvoiceAmountIsWrong(487.9)).toBe(false);
    expect(practiceInvoiceAmountIsWrong(null)).toBe(false);
  });
});

describe("demoCompanyAndPropertyCodes", () => {
  it("builds a stable pair of codes from the signed-in person's id", () => {
    expect(demoCompanyAndPropertyCodes("c2a625aa-b4d5-4cdf-a4c2-52a683e8f761")).toEqual({
      demoCompanyCode: "DEMO-c2a625aa",
      demoPropertyCode: "DEMO-c2a625aa-P1",
    });
  });
});

describe("buildPracticeInvoiceTask", () => {
  const task = buildPracticeInvoiceTask((key) => key);
  const resolved = resolvePracticeTask(task, placeholders);

  it("walks upload, check, assign, approve, final-approve and pay in order", () => {
    expect(task.steps.map((step) => step.id)).toEqual([
      "upload",
      "open-invoice",
      "correct-amount",
      "assign-company-and-property",
      "send-for-review",
      "approve",
      "final-approve",
      "match-bank-payment",
    ]);
  });

  it("leaves no placeholder behind once an invoice has been uploaded", () => {
    expect(
      JSON.stringify(resolved).match(/\{(lastUploadedId|demoCompanyCode|demoPropertyCode)\}/),
    ).toBeNull();
  });

  it("points the assignment step at the demo company and property codes together", () => {
    const assignment = resolved.steps.find((step) => step.id === "assign-company-and-property");
    expect(assignment?.completionCondition?.data).toEqual({
      company_code: "DEMO-ab12cd34",
      property_code: "DEMO-ab12cd34-P1",
    });
  });

  it("scopes every step after the upload to the uploaded document", () => {
    for (const step of resolved.steps.slice(1)) {
      expect(step.completionCondition?.recordId).toBe("doc-1");
    }
  });

  it("keeps a placeholder visible until there is an upload to resolve against", () => {
    const beforeUpload = resolvePracticeTask(task, { ...placeholders, lastUploadedId: null });
    const openStep = beforeUpload.steps.find((step) => step.id === "open-invoice");
    expect(openStep?.target).toContain("{lastUploadedId}");
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
    expect(approve?.type).toBe("info");
    expect(approve?.instruction).toBe("We approve for you.");
    expect(approve?.completionCondition).toBeNull();
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
    expect(approve?.type).toBe("approve");
    expect(approve?.completionCondition?.eventType).toBe("document_status_changed");
  });
});

describe("resolvedStepPath", () => {
  it("returns null while the document id is unresolved", () => {
    expect(resolvedStepPath("/incoming-invoices/{lastUploadedId}")).toBeNull();
  });

  it("returns resolved and plain paths unchanged", () => {
    expect(resolvedStepPath("/incoming-invoices/abc")).toBe("/incoming-invoices/abc");
    expect(resolvedStepPath("/incoming-invoices")).toBe("/incoming-invoices");
  });

  it("returns null for no path", () => {
    expect(resolvedStepPath(undefined)).toBeNull();
  });
});
