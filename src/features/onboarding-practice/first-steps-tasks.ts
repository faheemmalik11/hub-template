import type { PermissionKey } from "@/config/permissions";
import { PERMISSIONS } from "@/config/permissions";

import { COMMISSION_DEAL_PRACTICE_TASK_ID } from "./commission-deal-practice-task";
import { PAYMENT_FILE_PRACTICE_TASK_ID } from "./payment-file-practice-task";
import { PRACTICE_INVOICE_TASK_ID } from "./practice-invoice-task";
import { STOP_CASES_PRACTICE_TASK_ID } from "./practice-stop-cases-task";

export interface FirstStepsTask {
  id: string;
  to: string;
  titleKey: string;
  descriptionKey: string;
}

export type FirstStepsState = "new" | "started" | "completed";

export interface FirstStepsEntry {
  task: FirstStepsTask;
  state: FirstStepsState;
}

const PAYMENT_FILE_TASK_ENTRY: FirstStepsTask = {
  id: PAYMENT_FILE_PRACTICE_TASK_ID,
  to: "/onboarding-tour/payment-file",
  titleKey: "home.firstSteps.paymentFile.title",
  descriptionKey: "home.firstSteps.paymentFile.description",
};

const COMMISSION_DEAL_TASK_ENTRY: FirstStepsTask = {
  id: COMMISSION_DEAL_PRACTICE_TASK_ID,
  to: "/onboarding-tour/commission-deal",
  titleKey: "home.firstSteps.commissionDeal.title",
  descriptionKey: "home.firstSteps.commissionDeal.description",
};

export function firstStepsTasks(can: (permission: PermissionKey) => boolean): FirstStepsTask[] {
  return [
    {
      id: PRACTICE_INVOICE_TASK_ID,
      to: "/onboarding-tour/process-an-invoice",
      titleKey: "home.firstSteps.invoice.title",
      descriptionKey: "home.firstSteps.invoice.description",
    },
    {
      id: STOP_CASES_PRACTICE_TASK_ID,
      to: "/onboarding-tour/when-does-it-stop",
      titleKey: "home.firstSteps.stopCases.title",
      descriptionKey: "home.firstSteps.stopCases.description",
    },
    can(PERMISSIONS.pagePaymentFile) ? PAYMENT_FILE_TASK_ENTRY : COMMISSION_DEAL_TASK_ENTRY,
  ];
}

export function resolveFirstStepsEntries(
  tasks: FirstStepsTask[],
  stateOf: (taskId: string) => FirstStepsState,
): FirstStepsEntry[] {
  return tasks.map((task) => ({ task, state: stateOf(task.id) }));
}

export function shouldShowFirstSteps(entries: FirstStepsEntry[]): boolean {
  return entries.some((entry) => entry.state !== "completed");
}
