import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

const paintBeforeAnInstantAnswerHidesTheSpinner = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

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
  const [pendingAction, setPendingAction] = useState<"start" | "resume" | "restart" | "end" | null>(
    null,
  );
  const busy = pendingAction !== null;

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

  const run = async (
    which: "start" | "resume" | "restart" | "end",
    action: () => Promise<void>,
  ) => {
    setPendingAction(which);
    await paintBeforeAnInstantAnswerHidesTheSpinner();
    try {
      await action();
    } catch {
      onStartFailed();
    } finally {
      setPendingAction(null);
    }
  };

  if (state.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {checkingLabel}
      </p>
    );
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
    run("start", async () => {
      clearPracticeProgress(taskId, appUserId);
      await setPracticeMode(true);
      await seedPracticeData();
      await seedAndRememberTaskRecords();
      void queryClient.invalidateQueries();
      startTask(taskId);
    });

  const resume = () =>
    run("resume", async () => {
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
    run("restart", async () => {
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
    run("end", async () => {
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
            {pendingAction === "start" && <Loader2 className="size-4 animate-spin" />}
            {startButtonLabel}
          </Button>
        )}
        {options.canResume && (
          <Button disabled={busy} onClick={() => void resume()}>
            {pendingAction === "resume" && <Loader2 className="size-4 animate-spin" />}
            {resumeButtonLabel}
          </Button>
        )}
        {options.canRestart && (
          <Button variant="outline" disabled={busy} onClick={() => void restart()}>
            {pendingAction === "restart" && <Loader2 className="size-4 animate-spin" />}
            {restartButtonLabel}
          </Button>
        )}
        {options.canEndPracticeMode && (
          <Button variant="outline" disabled={busy} onClick={() => void endPracticeMode()}>
            {pendingAction === "end" && <Loader2 className="size-4 animate-spin" />}
            {endModeButtonLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
