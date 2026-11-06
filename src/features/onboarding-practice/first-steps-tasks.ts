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

export const FIRST_STEPS_TASKS: FirstStepsTask[] = [
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
];

export function resolveFirstStepsEntries(
  tasks: FirstStepsTask[],
  stateOf: (taskId: string) => FirstStepsState,
): FirstStepsEntry[] {
  return tasks.map((task) => ({ task, state: stateOf(task.id) }));
}

export function shouldShowFirstSteps(entries: FirstStepsEntry[]): boolean {
  return entries.some((entry) => entry.state !== "completed");
}
