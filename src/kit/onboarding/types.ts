export interface OnboardingEvent {
  type: string;
  recordId: string;
  data?: Record<string, unknown>;
  at: number;
}

export type OnboardingEventInput = Omit<OnboardingEvent, "at">;

export type OnboardingEventHandler = (event: OnboardingEvent) => void;

export interface OnboardingCompletionCondition {
  eventType: string;
  recordId?: string;
  data?: Record<string, unknown>;
}

export type OnboardingStepType =
  "upload" | "check" | "match" | "confirm" | "approve" | "handover" | "info";

export interface OnboardingDeviationQuestion {
  prompt: string;
  allowFreeText: boolean;
}

export interface OnboardingStep {
  id: string;
  type: OnboardingStepType;
  instruction: string;
  target: string;
  completionCondition: OnboardingCompletionCondition | null;
  group?: string;
  helpText?: string;
  expectedOutcome?: string;
  deviationQuestion?: OnboardingDeviationQuestion;
  path?: string;
  pageLabel?: string;
  placement?: "top" | "bottom" | "left" | "right";
  role?: string;
  sampleFileUrl?: string;
  sampleFileName?: string;
  sampleFileDropPath?: string;
}

export interface OnboardingTask {
  id: string;
  title: string;
  goal: string;
  roles: string[];
  steps: OnboardingStep[];
}

export type OnboardingStepStatus = "pending" | "active" | "done";
