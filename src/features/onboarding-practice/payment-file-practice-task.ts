import type { OnboardingTask } from "@/kit/onboarding";

import type { PracticeTranslate } from "./practice-invoice-task";

export const PAYMENT_FILE_PRACTICE_TASK_ID = "payment-file";

export const PAYMENT_FILE_PRACTICE_INVOICE_COUNT = 1;

const PAYMENT_PAGE_PATH = "/payment-file";

export function buildPaymentFilePracticeTask(t: PracticeTranslate): OnboardingTask {
  const text = (key: string) => t(`onboarding.paymentFile.${key}`);
  const pagePayment = text("pagePayment");
  const task: OnboardingTask = {
    id: PAYMENT_FILE_PRACTICE_TASK_ID,
    title: text("taskTitle"),
    goal: text("taskGoal"),
    roles: ["preparer"],
    steps: [
      {
        id: "payment-choose-company",
        group: text("groupPrepare"),
        type: "check",
        role: "preparer",
        instruction: text("companyInstruction"),
        expectedOutcome: text("companyOutcome"),
        target: "payment-company",
        placement: "right",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_company_chosen" },
      },
      {
        id: "payment-open-accounts",
        group: text("groupPrepare"),
        type: "check",
        role: "preparer",
        instruction: text("openAccountsInstruction"),
        expectedOutcome: text("openAccountsOutcome"),
        target: "payment-accounts-button",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_accounts_opened" },
      },
      {
        id: "payment-see-payer-account",
        group: text("groupPrepare"),
        type: "check",
        role: "preparer",
        instruction: text("seePayerInstruction"),
        expectedOutcome: text("seePayerOutcome"),
        target: "payment-accounts-list",
        placement: "left",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_accounts_closed" },
      },
      {
        id: "payment-select-invoices",
        group: text("groupPrepare"),
        type: "check",
        role: "preparer",
        instruction: text("selectInvoicesInstruction"),
        expectedOutcome: text("selectInvoicesOutcome"),
        helpText: text("selectInvoicesHelp"),
        target: "payment-invoice-table",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: {
          eventType: "payment_invoices_selected",
          data: { count: PAYMENT_FILE_PRACTICE_INVOICE_COUNT },
        },
      },
      {
        id: "payment-build-file",
        group: text("groupPrepare"),
        type: "check",
        role: "preparer",
        instruction: text("buildInstruction"),
        expectedOutcome: text("buildOutcome"),
        target: "payment-build-button|payment-build-button-inline",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_file_created" },
      },
      {
        id: "payment-check-list",
        group: text("groupCheck"),
        type: "info",
        role: "preparer",
        instruction: text("checkListInstruction"),
        expectedOutcome: text("checkListOutcome"),
        target: "payment-review-table",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: null,
      },
      {
        id: "payment-download-file",
        group: text("groupCheck"),
        type: "check",
        role: "preparer",
        instruction: text("downloadInstruction"),
        expectedOutcome: text("downloadOutcome"),
        helpText: text("downloadHelp"),
        target: "payment-download-button",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_file_downloaded" },
      },
      {
        id: "payment-open-track",
        group: text("groupTrack"),
        type: "check",
        role: "preparer",
        instruction: text("openTrackInstruction"),
        expectedOutcome: text("openTrackOutcome"),
        target: "payment-step-track",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_step_opened", data: { step: "track" } },
      },
      {
        id: "payment-mark-paid",
        group: text("groupTrack"),
        type: "confirm",
        role: "preparer",
        instruction: text("markPaidInstruction"),
        expectedOutcome: text("markPaidOutcome"),
        helpText: text("markPaidHelp"),
        target: "payment-mark-paid",
        path: PAYMENT_PAGE_PATH,
        pageLabel: pagePayment,
        completionCondition: { eventType: "payment_marked_paid" },
      },
    ],
  };
  const restartHint = t("onboarding.paymentFile.restartHint", {
    button: t("onboarding.practice.panelReset"),
  });
  return {
    ...task,
    steps: task.steps.map((step) =>
      step.completionCondition
        ? { ...step, helpText: [step.helpText, restartHint].filter(Boolean).join(" ") }
        : step,
    ),
  };
}
