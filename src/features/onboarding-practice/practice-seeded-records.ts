import { STOP_CASES_PRACTICE_TASK_ID } from "./practice-stop-cases-task";

export const STOP_CASES_SEED_KEYS = [
  "supplier_id",
  "iban_account_id",
  "iban_document_id",
  "ai_document_id",
  "flyer_document_id",
] as const;

const STOP_CASES_PLACEHOLDER_NAMES = [
  "practiceSupplierId",
  "ibanAccountId",
  "ibanDocId",
  "aiDocId",
  "flyerDocId",
] as const;

export function stopCasesRecordIds(seedResult: Record<string, unknown>): string[] {
  return STOP_CASES_SEED_KEYS.map((key) => {
    const id = seedResult[key];
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`The stop cases seed did not return ${key}`);
    }
    return id;
  });
}

export function seededRecordValues(taskId: string, recordIds: string[]): Record<string, string> {
  if (taskId !== STOP_CASES_PRACTICE_TASK_ID) return {};
  if (recordIds.length !== STOP_CASES_PLACEHOLDER_NAMES.length) return {};
  return Object.fromEntries(STOP_CASES_PLACEHOLDER_NAMES.map((name, i) => [name, recordIds[i]]));
}

export function taskSeedsItsOwnRecords(taskId: string): boolean {
  return taskId === STOP_CASES_PRACTICE_TASK_ID;
}
