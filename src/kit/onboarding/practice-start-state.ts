import type { PracticeProgress } from "./practice-progress";

export interface PracticeStartOptions {
  canStart: boolean;
  canResume: boolean;
  canRestart: boolean;
  canEndPracticeMode: boolean;
  sessionIsStale: boolean;
}

export function decidePracticeStartOptions(input: {
  practiceModeActive: boolean;
  progress: PracticeProgress | null;
}): PracticeStartOptions {
  const hasProgress = input.progress !== null;
  return {
    canStart: !hasProgress,
    canResume: hasProgress,
    canRestart: hasProgress,
    canEndPracticeMode: input.practiceModeActive,
    sessionIsStale: input.practiceModeActive && !hasProgress,
  };
}
