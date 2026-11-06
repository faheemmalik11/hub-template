import type { OnboardingTask } from "@/kit/onboarding";

import { buildPracticeInvoiceTask, type PracticeTranslate } from "./practice-invoice-task";
import { buildStopCasesPracticeTask } from "./practice-stop-cases-task";

export type { PracticeTranslate } from "./practice-invoice-task";

export function buildPracticeTasks(t: PracticeTranslate): OnboardingTask[] {
  return [buildPracticeInvoiceTask(t), buildStopCasesPracticeTask(t)];
}

export function findPracticeTask(taskId: string, t: PracticeTranslate): OnboardingTask | null {
  return buildPracticeTasks(t).find((task) => task.id === taskId) ?? null;
}
