import type { OnboardingTask } from "@/kit/onboarding";
import { PERMISSIONS, type PermissionKey } from "@/config/permissions";

import { buildCommissionDealPracticeTask } from "./commission-deal-practice-task";
import { buildPracticeInvoiceTask, type PracticeTranslate } from "./practice-invoice-task";
import {
  buildPaymentFilePracticeTask,
  PAYMENT_FILE_PRACTICE_TASK_ID,
} from "./payment-file-practice-task";
import { buildStopCasesPracticeTask } from "./practice-stop-cases-task";

export type { PracticeTranslate } from "./practice-invoice-task";

export function buildPracticeTasks(
  t: PracticeTranslate,
  can: (permission: PermissionKey) => boolean,
): OnboardingTask[] {
  return [
    buildPracticeInvoiceTask(t),
    buildStopCasesPracticeTask(t),
    buildPaymentFilePracticeTask(t),
    buildCommissionDealPracticeTask(t),
  ].filter((task) => task.id !== PAYMENT_FILE_PRACTICE_TASK_ID || can(PERMISSIONS.pagePaymentFile));
}

export function findPracticeTask(
  taskId: string,
  t: PracticeTranslate,
  can: (permission: PermissionKey) => boolean,
): OnboardingTask | null {
  return buildPracticeTasks(t, can).find((task) => task.id === taskId) ?? null;
}
