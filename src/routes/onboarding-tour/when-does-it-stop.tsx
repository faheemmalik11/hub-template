import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { OnboardingPracticeStart } from "@/kit/components/onboarding";
import { useOnboardingPractice } from "@/kit/onboarding/practice-context";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

import { findLiveStopCasesRecordIds } from "@/features/onboarding-practice/find-live-stop-cases-records";
import { seedPracticeData } from "@/features/onboarding-practice/seed-practice-data";
import { seedStopCasesPracticeData } from "@/features/onboarding-practice/seed-stop-cases-practice-data";
import {
  STOP_CASES_PRACTICE_TASK_ID,
  buildStopCasesPracticeTask,
} from "@/features/onboarding-practice/practice-stop-cases-task";

export const Route = createFileRoute("/onboarding-tour/when-does-it-stop")({
  head: () => ({ meta: [{ title: pageTitle("Practice: when does the system stop") }] }),
  component: WhenDoesItStopPracticePage,
});

function WhenDoesItStopPracticePage() {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const { activeTaskId } = useOnboardingPractice();
  if (activeTaskId) return null;
  const stepCount = buildStopCasesPracticeTask((key) => key).steps.length;
  return (
    <OnboardingPracticeStart
      taskId={STOP_CASES_PRACTICE_TASK_ID}
      appUserId={appUserId}
      stepCount={stepCount}
      title={t("onboarding.stopCases.startTitle")}
      intro={t("onboarding.stopCases.startIntro")}
      hidesData={t("onboarding.stopCases.startHidesData")}
      startButtonLabel={t("onboarding.practice.startButton")}
      resumeButtonLabel={t("onboarding.practice.resumeButton")}
      resumeIntroLabel={t("onboarding.practice.resumeIntro")}
      restartButtonLabel={t("onboarding.practice.restartButton")}
      endModeButtonLabel={t("onboarding.practice.endModeButton")}
      checkingLabel={t("onboarding.practice.startChecking")}
      howToLeaveLabel={t("onboarding.practice.startHowToLeave")}
      staleNoticeLabel={t("onboarding.practice.staleNotice")}
      seedPracticeData={seedPracticeData}
      findLiveRecordIds={findLiveStopCasesRecordIds}
      seedTaskRecords={() => seedStopCasesPracticeData(true)}
      onStartFailed={() => toast.error(t("onboarding.practice.startFailed"))}
      onProgressLost={() => toast.info(t("onboarding.stopCases.progressLost"))}
    />
  );
}
