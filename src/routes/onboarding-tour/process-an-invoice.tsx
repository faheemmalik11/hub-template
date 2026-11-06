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
  PRACTICE_INVOICE_TASK_ID,
  buildPracticeInvoiceTask,
} from "@/features/onboarding-practice/practice-invoice-task";
import { seedPracticeData } from "@/features/onboarding-practice/seed-practice-data";

export const Route = createFileRoute("/onboarding-tour/process-an-invoice")({
  head: () => ({ meta: [{ title: pageTitle("Practice: process an invoice") }] }),
  component: ProcessAnInvoicePracticePage,
});

function ProcessAnInvoicePracticePage() {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const { activeTaskId } = useOnboardingPractice();
  if (activeTaskId) return null;
  const stepCount = buildPracticeInvoiceTask((key) => key).steps.length;
  return (
    <OnboardingPracticeStart
      taskId={PRACTICE_INVOICE_TASK_ID}
      appUserId={appUserId}
      stepCount={stepCount}
      title={t("onboarding.practice.startTitle")}
      intro={t("onboarding.practice.startIntro")}
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
      findLiveRecordIds={findLivePracticeDocumentIds}
      discardRecords={discardPracticeDocuments}
      onStartFailed={() => toast.error(t("onboarding.practice.startFailed"))}
      onProgressLost={() => toast.info(t("onboarding.practice.progressLost"))}
    />
  );
}
