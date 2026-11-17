import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { OnboardingPracticeStart } from "@/kit/components/onboarding";
import { useOnboardingPractice } from "@/kit/onboarding/practice-context";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

import {
  COMMISSION_DEAL_PRACTICE_TASK_ID,
  buildCommissionDealPracticeTask,
} from "@/features/onboarding-practice/commission-deal-practice-task";
import {
  discardCommissionDealPracticeRecords,
  findLiveCommissionDealPracticeRecordIds,
} from "@/features/onboarding-practice/find-live-commission-deal-records";
import { seedPracticeData } from "@/features/onboarding-practice/seed-practice-data";
import { seedCommissionDealPracticeData } from "@/features/onboarding-practice/seed-commission-deal-practice-data";

export const Route = createFileRoute("/onboarding-tour/commission-deal")({
  head: () => ({ meta: [{ title: pageTitle("Practice: record a sale and its commission") }] }),
  component: CommissionDealPracticePage,
});

function CommissionDealPracticePage() {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const { activeTaskId } = useOnboardingPractice();
  if (activeTaskId) return null;
  const stepCount = buildCommissionDealPracticeTask((key) => key).steps.length;
  return (
    <OnboardingPracticeStart
      taskId={COMMISSION_DEAL_PRACTICE_TASK_ID}
      appUserId={appUserId}
      stepCount={stepCount}
      title={t("onboarding.commissionDeal.startTitle")}
      intro={t("onboarding.commissionDeal.startIntro")}
      hidesData={t("onboarding.practice.startHidesData")}
      startButtonLabel={t("onboarding.practice.startButton")}
      resumeButtonLabel={t("onboarding.practice.resumeButton")}
      resumeIntroLabel={t("onboarding.practice.resumeIntro")}
      restartButtonLabel={t("onboarding.practice.restartButton")}
      endModeButtonLabel={t("onboarding.practice.endModeButton")}
      checkingLabel={t("onboarding.practice.startChecking")}
      howToLeaveLabel={t("onboarding.practice.startHowToLeave")}
      staleNoticeLabel={t("onboarding.practice.staleNotice")}
      seedPracticeData={seedPracticeData}
      seedTaskRecords={seedCommissionDealPracticeData}
      findLiveRecordIds={findLiveCommissionDealPracticeRecordIds}
      discardRecords={discardCommissionDealPracticeRecords}
      onStartFailed={() => toast.error(t("onboarding.practice.startFailed"))}
      onProgressLost={() => toast.info(t("onboarding.commissionDeal.progressLost"))}
    />
  );
}
