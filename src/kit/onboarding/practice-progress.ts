const STORAGE_KEY_PREFIX = "onboarding-practice-progress-";

export interface PracticeProgress {
  stepIndex: number;
  uploadedIds: string[];
}

function storageKey(taskId: string, appUserId: string | null): string {
  return `${STORAGE_KEY_PREFIX}${appUserId ?? "anonymous"}-${taskId}`;
}

export function readPracticeProgress(
  taskId: string,
  appUserId: string | null,
): PracticeProgress | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(taskId, appUserId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeProgress>;
    if (typeof parsed.stepIndex !== "number" || !Array.isArray(parsed.uploadedIds)) return null;
    return { stepIndex: parsed.stepIndex, uploadedIds: parsed.uploadedIds };
  } catch {
    return null;
  }
}

export function writePracticeProgress(
  taskId: string,
  appUserId: string | null,
  progress: PracticeProgress,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(taskId, appUserId), JSON.stringify(progress));
}

export function clearPracticeProgress(taskId: string, appUserId: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(taskId, appUserId));
}

const COMPLETED_KEY_PREFIX = "onboarding-practice-completed-";

function completedKey(taskId: string, appUserId: string | null): string {
  return `${COMPLETED_KEY_PREFIX}${appUserId ?? "anonymous"}-${taskId}`;
}

export function markPracticeCompleted(taskId: string, appUserId: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(completedKey(taskId, appUserId), "1");
}

export function isPracticeCompleted(taskId: string, appUserId: string | null): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(completedKey(taskId, appUserId)) === "1";
}

export function validatePracticeProgress(
  progress: PracticeProgress | null,
  stepCount: number,
  liveRecordIds: string[] | null,
): PracticeProgress | null {
  if (!progress) return null;
  if (!Number.isInteger(progress.stepIndex)) return null;
  const storedIds = progress.uploadedIds.filter((id): id is string => typeof id === "string");
  if (storedIds.length === 0) return null;
  const lastId = storedIds[storedIds.length - 1];
  if (liveRecordIds && !liveRecordIds.includes(lastId)) return null;
  const uploadedIds = liveRecordIds
    ? storedIds.filter((id) => liveRecordIds.includes(id))
    : storedIds;
  const stepIndex = Math.min(Math.max(progress.stepIndex, 0), stepCount);
  return { stepIndex, uploadedIds };
}
