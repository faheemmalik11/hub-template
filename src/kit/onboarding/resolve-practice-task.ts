import type { OnboardingCompletionCondition, OnboardingTask } from "./types";

export interface PracticeTaskPlaceholders {
  lastUploadedId: string | null;
  values?: Record<string, string>;
}

function fillPlaceholders(text: string, placeholders: PracticeTaskPlaceholders): string {
  const withValues = Object.entries(placeholders.values ?? {}).reduce(
    (filled, [name, id]) => filled.replaceAll(`{${name}}`, id),
    text,
  );
  return withValues.replaceAll(
    "{lastUploadedId}",
    placeholders.lastUploadedId ?? "{lastUploadedId}",
  );
}

function fillCondition(
  condition: OnboardingCompletionCondition | null,
  placeholders: PracticeTaskPlaceholders,
): OnboardingCompletionCondition | null {
  if (!condition) return null;
  const data = condition.data
    ? Object.fromEntries(
        Object.entries(condition.data).map(([key, value]) => [
          key,
          typeof value === "string" ? fillPlaceholders(value, placeholders) : value,
        ]),
      )
    : undefined;
  return {
    ...condition,
    ...(condition.recordId !== undefined
      ? { recordId: fillPlaceholders(condition.recordId, placeholders) }
      : {}),
    ...(data ? { data } : {}),
  };
}

export interface PracticeRoleOptions {
  userRoles: string[];
  standInInstructions: Record<string, string>;
}

export function resolvePracticeTask(
  task: OnboardingTask,
  placeholders: PracticeTaskPlaceholders,
  roleOptions?: PracticeRoleOptions,
): OnboardingTask {
  return {
    ...task,
    steps: task.steps.map((rawStep) => {
      const step =
        roleOptions &&
        rawStep.role &&
        rawStep.role !== "preparer" &&
        !roleOptions.userRoles.includes(rawStep.role) &&
        roleOptions.standInInstructions[rawStep.id]
          ? {
              ...rawStep,
              type: "info" as const,
              instruction: roleOptions.standInInstructions[rawStep.id],
              completionCondition: null,
              helpText: undefined,
            }
          : rawStep;
      return {
        ...step,
        target: fillPlaceholders(step.target, placeholders),
        ...(step.path ? { path: fillPlaceholders(step.path, placeholders) } : {}),
        completionCondition: fillCondition(step.completionCondition, placeholders),
      };
    }),
  };
}

export function practiceUserRoles(rights: {
  mayApprove: boolean;
  mayApproveFinal: boolean;
  mayPay: boolean;
}): string[] {
  return [
    rights.mayApprove && "approver",
    rights.mayApproveFinal && "finalApprover",
    rights.mayPay && "payer",
  ].filter((heldRole): heldRole is string => Boolean(heldRole));
}

export function resolvedStepPath(path: string | null | undefined): string | null {
  if (!path || path.includes("{")) return null;
  return path;
}
