import { STOP_CASES_PRACTICE_TASK_ID } from "./practice-stop-cases-task";

const TASK_IDS_THAT_LOCK_THE_WORKFLOW = [STOP_CASES_PRACTICE_TASK_ID];

export function practiceLocksWorkflowActions(
  activeTaskId: string | null,
  documentIsPractice: boolean | null | undefined,
): boolean {
  return (
    documentIsPractice === true &&
    activeTaskId !== null &&
    TASK_IDS_THAT_LOCK_THE_WORKFLOW.includes(activeTaskId)
  );
}
