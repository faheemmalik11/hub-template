import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/kit/ui/button";
import {
  clearPracticeProgress,
  readPracticeProgress,
  validatePracticeProgress,
  writePracticeProgress,
} from "@/kit/onboarding/practice-progress";
import { readPracticeModeActive, setPracticeMode } from "@/kit/onboarding/practice-mode-session";
import { decidePracticeStartOptions } from "@/kit/onboarding/practice-start-state";
import { useOnboardingPractice } from "@/kit/onboarding/practice-context";

export interface OnboardingPracticeStartProps {
  taskId: string;
  appUserId: string | null;
  stepCount: number;
  title: string;
  intro: string;
  hidesData: string;
  startButtonLabel: string;
  resumeButtonLabel: string;
  resumeIntroLabel: string;
  restartButtonLabel: string;
  endModeButtonLabel: string;
  checkingLabel: string;
  howToLeaveLabel: string;
  staleNoticeLabel: string;
  seedPracticeData: () => Promise<void>;
  findLiveRecordIds: (recordIds: string[]) => Promise<string[]>;
  discardRecords?: (recordIds: string[]) => Promise<void>;
  seedTaskRecords?: () => Promise<string[]>;
  onStartFailed: () => void;
  onProgressLost: () => void;
}

export function OnboardingPracticeStart({
  taskId,
  appUserId,
  stepCount,
  title,
  intro,
  hidesData,
  startButtonLabel,
  resumeButtonLabel,
  resumeIntroLabel,
  restartButtonLabel,
  endModeButtonLabel,
  checkingLabel,
  howToLeaveLabel,
  staleNoticeLabel,
  seedPracticeData,
  findLiveRecordIds,
  discardRecords,
  seedTaskRecords,
  onStartFailed,
  onProgressLost,
}: OnboardingPracticeStartProps) {
  const { startTask } = useOnboardingPractice();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const state = useQuery({
    queryKey: ["practice-start-state", taskId, appUserId],
    queryFn: async () => {
      const practiceModeActive = await readPracticeModeActive();
      const progress = validatePracticeProgress(
        readPracticeProgress(taskId, appUserId),
        stepCount,
        null,
      );
      return { practiceModeActive, progress };
    },
    staleTime: 0,
    gcTime: 0,
  });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      onStartFailed();
    } finally {
      setBusy(false);
    }
  };

  if (state.isLoading) {
    return <p className="text-sm text-muted-foreground">{checkingLabel}</p>;
  }
  const progress = state.data?.progress ?? null;
  const options = decidePracticeStartOptions({
    practiceModeActive: state.data?.practiceModeActive ?? false,
    progress,
  });

  const seedAndRememberTaskRecords = async () => {
    if (!seedTaskRecords) return;
    const recordIds = await seedTaskRecords();
    writePracticeProgress(taskId, appUserId, { stepIndex: 0, uploadedIds: recordIds });
  };

  const startFresh = () =>
    run(async () => {
      clearPracticeProgress(taskId, appUserId);
      await setPracticeMode(true);
      await seedPracticeData();
      await seedAndRememberTaskRecords();
      void queryClient.invalidateQueries();
      startTask(taskId);
    });

  const resume = () =>
    run(async () => {
      if (!progress) return;
      await setPracticeMode(true);
      await seedPracticeData();
      const liveIds = await findLiveRecordIds(progress.uploadedIds);
      const stillValid = validatePracticeProgress(progress, stepCount, liveIds);
      if (!stillValid) {
        clearPracticeProgress(taskId, appUserId);
        await setPracticeMode(false);
        onProgressLost();
        void queryClient.invalidateQueries();
        return;
      }
      writePracticeProgress(taskId, appUserId, stillValid);
      void queryClient.invalidateQueries();
      startTask(taskId);
    });

  const restart = () =>
    run(async () => {
      if (!progress) return;
      await setPracticeMode(true);
      await seedPracticeData();
      await discardRecords?.(progress.uploadedIds);
      clearPracticeProgress(taskId, appUserId);
      await seedAndRememberTaskRecords();
      void queryClient.invalidateQueries();
      startTask(taskId);
    });

  const endPracticeMode = () =>
    run(async () => {
      await setPracticeMode(false);
      void queryClient.invalidateQueries();
    });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {options.canResume ? resumeIntroLabel : intro}
      </p>
      <p className="text-sm text-muted-foreground">{hidesData}</p>
      <p className="text-sm text-muted-foreground">{howToLeaveLabel}</p>
      {options.sessionIsStale && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{staleNoticeLabel}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.canStart && (
          <Button disabled={busy} onClick={() => void startFresh()}>
            {startButtonLabel}
          </Button>
        )}
        {options.canResume && (
          <Button disabled={busy} onClick={() => void resume()}>
            {resumeButtonLabel}
          </Button>
        )}
        {options.canRestart && (
          <Button variant="outline" disabled={busy} onClick={() => void restart()}>
            {restartButtonLabel}
          </Button>
        )}
        {options.canEndPracticeMode && (
          <Button variant="outline" disabled={busy} onClick={() => void endPracticeMode()}>
            {endModeButtonLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
