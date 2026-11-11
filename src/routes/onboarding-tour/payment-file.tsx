import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { OnboardingPracticeStart } from "@/kit/components/onboarding";
import { useOnboardingPractice } from "@/kit/onboarding/practice-context";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

import {
  discardPracticeDocuments,
  findLivePracticeDocumentIds,
} from "@/features/onboarding-practice/find-live-practice-documents";
import {
  PAYMENT_FILE_PRACTICE_TASK_ID,
  buildPaymentFilePracticeTask,
} from "@/features/onboarding-practice/payment-file-practice-task";
import { seedPracticeData } from "@/features/onboarding-practice/seed-practice-data";
import { seedPaymentFilePracticeData } from "@/features/onboarding-practice/seed-payment-file-practice-data";

export const Route = createFileRoute("/onboarding-tour/payment-file")({
  head: () => ({ meta: [{ title: pageTitle("Practice: build a payment file") }] }),
  component: PaymentFilePracticePage,
});

function PaymentFilePracticePage() {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const { activeTaskId } = useOnboardingPractice();
  if (activeTaskId) return null;
  const stepCount = buildPaymentFilePracticeTask((key) => key).steps.length;
  return (
    <OnboardingPracticeStart
      taskId={PAYMENT_FILE_PRACTICE_TASK_ID}
      appUserId={appUserId}
      stepCount={stepCount}
      title={t("onboarding.paymentFile.startTitle")}
      intro={t("onboarding.paymentFile.startIntro")}
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
      seedTaskRecords={seedPaymentFilePracticeData}
      findLiveRecordIds={findLivePracticeDocumentIds}
      discardRecords={discardPracticeDocuments}
      onStartFailed={() => toast.error(t("onboarding.practice.startFailed"))}
      onProgressLost={() => toast.info(t("onboarding.paymentFile.progressLost"))}
    />
  );
}
