import type { OnboardingTask } from "@/kit/onboarding";

export const PRACTICE_INVOICE_TASK_ID = "process-an-invoice";

export const PRACTICE_INVOICE = {
  issuer: "Gartenbau Möller",
  invoiceNumber: "2026-1043",
  documentDate: "2026-10-23",
  dueDate: "2026-11-06",
  amountNet: 410,
  vatRate: 19,
  vatAmount: 77.9,
  correctAmountGross: 487.9,
  wronglyExtractedAmountGross: 478.9,
} as const;

export function practiceInvoiceAmountIsWrong(amountGross: number | null | undefined): boolean {
  if (amountGross == null) return false;
  return Math.round(amountGross * 100) !== Math.round(PRACTICE_INVOICE.correctAmountGross * 100);
}

export type PracticeTranslate = (key: string, options?: Record<string, unknown>) => string;

const INVOICE_DETAIL_PATH = "/incoming-invoices/{lastUploadedId}";

export function buildPracticeInvoiceTask(t: PracticeTranslate): OnboardingTask {
  const pageInvoices = t("onboarding.practice.pageInvoices");
  const pageInvoice = t("onboarding.practice.pageInvoice");
  return {
    id: PRACTICE_INVOICE_TASK_ID,
    title: t("onboarding.practice.taskTitle"),
    goal: t("onboarding.practice.taskGoal"),
    roles: ["preparer", "approver", "finalApprover", "payer"],
    steps: [
      {
        id: "upload",
        type: "upload",
        role: "preparer",
        instruction: t("onboarding.practice.uploadInstruction"),
        expectedOutcome: t("onboarding.practice.uploadOutcome"),
        target: "incoming-upload|incoming-upload-dropzone|incoming-upload-actions",
        placement: "bottom",
        path: "/incoming-invoices",
        pageLabel: pageInvoices,
        sampleFileUrl: "/seed/sample-invoice.pdf",
        sampleFileName: "sample-invoice.pdf",
        sampleFileDropPath: "/incoming-invoices/upload",
        completionCondition: { eventType: "document_uploaded" },
      },
      {
        id: "open-invoice",
        type: "check",
        role: "preparer",
        instruction: t("onboarding.practice.openInstruction"),
        expectedOutcome: t("onboarding.practice.openOutcome"),
        target: "invoice-row-{lastUploadedId}",
        path: "/incoming-invoices",
        pageLabel: pageInvoices,
        completionCondition: { eventType: "document_opened", recordId: "{lastUploadedId}" },
      },
      {
        id: "correct-amount",
        type: "check",
        role: "preparer",
        instruction: t("onboarding.practice.amountInstruction"),
        expectedOutcome: t("onboarding.practice.amountOutcome"),
        target: "invoice-detail-amounts",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        helpText: t("onboarding.practice.amountHelp"),
        completionCondition: {
          eventType: "document_updated",
          recordId: "{lastUploadedId}",
          data: { amount_gross: PRACTICE_INVOICE.correctAmountGross, amounts_add_up: true },
        },
        deviationQuestion: {
          prompt: t("onboarding.practice.amountDeviation"),
          allowFreeText: true,
        },
      },
      {
        id: "assign-company",
        type: "match",
        role: "preparer",
        instruction: t("onboarding.practice.companyInstruction"),
        expectedOutcome: t("onboarding.practice.companyOutcome"),
        target: "invoice-detail-company",
        placement: "right",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        helpText: t("onboarding.practice.companyHelp"),
        completionCondition: {
          eventType: "document_updated",
          recordId: "{lastUploadedId}",
          data: { company_code: "{demoCompanyCode}" },
        },
      },
      {
        id: "assign-property",
        type: "match",
        role: "preparer",
        instruction: t("onboarding.practice.propertyInstruction"),
        expectedOutcome: t("onboarding.practice.propertyOutcome"),
        target: "invoice-detail-property",
        placement: "left",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        helpText: t("onboarding.practice.propertyHelp"),
        completionCondition: {
          eventType: "document_updated",
          recordId: "{lastUploadedId}",
          data: { property_code: "{demoPropertyCode}" },
        },
        deviationQuestion: {
          prompt: t("onboarding.practice.propertyDeviation"),
          allowFreeText: true,
        },
      },
      {
        id: "send-for-review",
        type: "confirm",
        role: "approver",
        instruction: t("onboarding.practice.reviewInstruction"),
        expectedOutcome: t("onboarding.practice.reviewOutcome"),
        target: "invoice-detail-header|invoice-detail-tabs",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        completionCondition: {
          eventType: "document_status_changed",
          recordId: "{lastUploadedId}",
          data: { actionId: "send_for_review" },
        },
        deviationQuestion: {
          prompt: t("onboarding.practice.reviewDeviation"),
          allowFreeText: true,
        },
      },
      {
        id: "approve",
        type: "approve",
        role: "approver",
        instruction: t("onboarding.practice.approveInstruction"),
        expectedOutcome: t("onboarding.practice.approveOutcome"),
        target: "invoice-detail-header|invoice-detail-tabs",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        completionCondition: {
          eventType: "document_status_changed",
          recordId: "{lastUploadedId}",
          data: { actionId: "approve" },
        },
        deviationQuestion: {
          prompt: t("onboarding.practice.approveDeviation"),
          allowFreeText: true,
        },
      },
      {
        id: "final-approve",
        type: "approve",
        role: "finalApprover",
        instruction: t("onboarding.practice.finalApproveInstruction"),
        expectedOutcome: t("onboarding.practice.finalApproveOutcome"),
        target: "invoice-detail-header|invoice-detail-tabs",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        completionCondition: {
          eventType: "document_status_changed",
          recordId: "{lastUploadedId}",
          data: { actionId: "final_approve" },
        },
      },
      {
        id: "match-bank-payment",
        type: "match",
        role: "payer",
        instruction: t("onboarding.practice.bankInstruction"),
        expectedOutcome: t("onboarding.practice.bankOutcome"),
        target: "invoice-detail-tabs",
        path: INVOICE_DETAIL_PATH,
        pageLabel: pageInvoice,
        helpText: t("onboarding.practice.bankHelp"),
        completionCondition: { eventType: "bank_match_confirmed", recordId: "{lastUploadedId}" },
      },
    ],
  };
}
