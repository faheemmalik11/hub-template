import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  OnboardingCompletionModal,
  OnboardingHighlight,
  OnboardingPracticeModeBanner,
  OnboardingTaskPanel,
  useOnboardingEvents,
} from "@/kit/components/onboarding";
import {
  PRACTICE_MODE_HEARTBEAT_MS,
  extendPracticeModeIfActive,
  readPracticeModeActive,
  setPracticeMode,
} from "@/kit/onboarding/practice-mode-session";
import { useOnboardingPractice } from "@/kit/onboarding/practice-context";
import {
  clearPracticeProgress,
  markPracticeCompleted,
  readPracticeProgress,
  validatePracticeProgress,
  writePracticeProgress,
} from "@/kit/onboarding/practice-progress";
import {
  practiceUserRoles,
  resolvePracticeTask,
  resolvedStepPath,
} from "@/kit/onboarding/resolve-practice-task";
import { useOnboardingTaskRunner } from "@/kit/components/onboarding/use-onboarding-task-runner";
import type { OnboardingTask } from "@/kit/onboarding";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { usePaymentRight } from "@/lib/payment-right";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";

import { discardPracticeDocuments } from "./find-live-practice-documents";
import { demoCompanyAndPropertyCodes } from "./practice-placeholder-values";
import {
  approveEvent,
  approvalSkippedFinalApprove,
  approvalSkippedTheReviewStep,
  sendForReviewEvent,
} from "./practice-step-skip";
import { findPracticeTask } from "./practice-tasks";
import { seededRecordValues, taskSeedsItsOwnRecords } from "./practice-seeded-records";
import { seedStopCasesPracticeData } from "./seed-stop-cases-practice-data";
import { advancePracticeDocumentAsStandIn } from "./practice-approval.functions";

const STAND_IN_STEPS: Record<
  string,
  { role: string; step: "send-for-review" | "approve" | "final-approve" | "pay" }
> = {
  "send-for-review": { role: "approver", step: "send-for-review" },
  approve: { role: "approver", step: "approve" },
  "final-approve": { role: "finalApprover", step: "final-approve" },
  "match-bank-payment": { role: "payer", step: "pay" },
};

const STEP_IDS_WITH_COLLAPSED_PANEL = new Set(["match-bank-payment"]);

function ActivePracticeTask({ task }: { task: OnboardingTask }) {
  const { t } = useTranslation();
  const { appUserId, can, role } = useAuth();
  const { mayPay } = usePaymentRight();
  const userRoles = practiceUserRoles({
    mayApprove: can(PERMISSIONS.invoicesApprove),
    mayApproveFinal: can(PERMISSIONS.invoicesApproveFinal),
    mayPay,
  });
  const roleLabels = {
    approver: t("onboarding.practice.roleApprove"),
    finalApprover: t("onboarding.practice.roleFinalApprove"),
    payer: t("onboarding.practice.rolePay"),
  };
  const panelLabels = {
    nextButton: t("onboarding.practice.panelNext"),
    resetButton: t("onboarding.practice.panelReset"),
    finishedTitle: t("onboarding.practice.panelFinished"),
    sampleFileButton: t("onboarding.practice.panelSampleFile"),
  };
  const highlightLabels = {
    stepCounter: (current: number, total: number) =>
      t("onboarding.practice.stepCounter", { current, total }),
    waiting: t("onboarding.practice.waiting"),
    outcomeTitle: t("onboarding.practice.outcomeTitle"),
    nextButton: t("onboarding.practice.panelNext"),
    goToPage: (page: string) => t("onboarding.practice.goToPage", { page }),
    goToPageButton: t("onboarding.practice.goToPageButton"),
    scrollToTarget: t("onboarding.practice.scrollToTarget"),
    scrollToTargetButton: t("onboarding.practice.scrollToTargetButton"),
    sampleFileButton: t("onboarding.practice.panelSampleFile"),
  };
  const { stopTask, setAllowedPath } = useOnboardingPractice();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const navigateToOnboardingStepPath = (path: string) => {
    void navigate({ to: path } as never);
  };

  const storedProgress = useMemo(
    () =>
      validatePracticeProgress(readPracticeProgress(task.id, appUserId), task.steps.length, null),
    [task.id, task.steps.length, appUserId],
  );

  const [seededRecordIds, setSeededRecordIds] = useState(() =>
    seededRecordValues(task.id, storedProgress?.uploadedIds ?? []),
  );

  const events = useOnboardingEvents();
  const uploadedDocumentIds = useRef<string[]>(storedProgress?.uploadedIds ?? []);
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(
    storedProgress?.uploadedIds.at(-1) ?? null,
  );
  useEffect(() => {
    if (!events) return;
    return events.subscribe((event) => {
      if (event.type === "document_uploaded") {
        uploadedDocumentIds.current.push(event.recordId);
        setLastUploadedId(event.recordId);
      }
    });
  }, [events]);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const [modalOpen, setModalOpen] = useState(
    () => typeof document !== "undefined" && document.body.hasAttribute("data-scroll-locked"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setModalOpen(document.body.hasAttribute("data-scroll-locked")),
    );
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => observer.disconnect();
  }, []);
  const queryClient = useQueryClient();
  const stopTaskRef = useRef(stopTask);
  stopTaskRef.current = stopTask;
  useEffect(() => {
    let cancelled = false;
    void readPracticeModeActive().then((active) => {
      if (cancelled || active) return;
      stopTaskRef.current();
      void queryClient.invalidateQueries();
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const resolvedTask = useMemo<OnboardingTask>(
    () =>
      resolvePracticeTask(
        task,
        {
          lastUploadedId,
          values: { ...demoCompanyAndPropertyCodes(appUserId), ...seededRecordIds },
        },
        {
          userRoles,
          standInInstructions: {
            "send-for-review": t("onboarding.practice.standInReview"),
            approve: t("onboarding.practice.standInApprove"),
            "final-approve": t("onboarding.practice.standInFinalApprove"),
            "match-bank-payment": t("onboarding.practice.standInPay"),
          },
        },
      ),
    [task, lastUploadedId, seededRecordIds, appUserId, userRoles.join(","), t],
  );
  const runner = useOnboardingTaskRunner(resolvedTask, {
    initialStepIndex: storedProgress?.stepIndex ?? 0,
  });

  useEffect(() => {
    if (runner.isFinished) setCompletionModalOpen(true);
  }, [runner.isFinished]);

  const replayApproveForRecord = useRef<string | null>(null);
  const currentStepId = runner.currentStep.id;
  useEffect(() => {
    if (!events || runner.isFinished) return;
    return events.subscribe((event) => {
      if (!approvalSkippedTheReviewStep(currentStepId, event)) return;
      if (event.recordId !== lastUploadedId) return;
      replayApproveForRecord.current = event.recordId;
      events.emit(sendForReviewEvent(event.recordId));
    });
  }, [events, currentStepId, lastUploadedId, runner.isFinished]);
  useEffect(() => {
    const recordId = replayApproveForRecord.current;
    if (!events || !recordId || currentStepId !== "approve") return;
    replayApproveForRecord.current = null;
    events.emit(approveEvent(recordId));
  }, [events, currentStepId]);

  const replayFinalApproveForRecord = useRef<string | null>(null);
  useEffect(() => {
    if (!events || runner.isFinished) return;
    return events.subscribe((event) => {
      if (!approvalSkippedFinalApprove(currentStepId, event)) return;
      if (event.recordId !== lastUploadedId) return;
      replayFinalApproveForRecord.current = event.recordId;
    });
  }, [events, currentStepId, lastUploadedId, runner.isFinished]);
  useEffect(() => {
    const recordId = replayFinalApproveForRecord.current;
    if (!events || !recordId || currentStepId !== "final-approve") return;
    replayFinalApproveForRecord.current = null;
    events.emit({ type: "document_status_changed", recordId, data: { actionId: "final_approve" } });
  }, [events, currentStepId]);

  const standInDoneFor = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!lastUploadedId || runner.isFinished) return;
    const standIn = STAND_IN_STEPS[runner.currentStep.id];
    if (!standIn || userRoles.includes(standIn.role)) return;
    const doneKey = `${lastUploadedId}:${standIn.step}`;
    if (standInDoneFor.current.has(doneKey)) return;
    standInDoneFor.current.add(doneKey);
    void advancePracticeDocumentAsStandIn({
      data: { documentId: lastUploadedId, step: standIn.step },
    }).then(() => queryClient.invalidateQueries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUploadedId, runner.isFinished, runner.currentStep.id, userRoles.join(","), queryClient]);

  useEffect(() => {
    if (uploadedDocumentIds.current.length === 0) return;
    writePracticeProgress(task.id, appUserId, {
      stepIndex: runner.currentStepIndex,
      uploadedIds: uploadedDocumentIds.current,
    });
  }, [task.id, appUserId, runner.currentStepIndex, lastUploadedId]);

  const discardUploadedDocuments = async () => {
    clearPracticeProgress(task.id, appUserId);
    const ids = uploadedDocumentIds.current;
    uploadedDocumentIds.current = [];
    setLastUploadedId(null);
    if (ids.length === 0) return;
    await discardPracticeDocuments(ids);
    await queryClient.invalidateQueries();
  };

  const restartTask = async () => {
    setRestarting(true);
    try {
      if (!taskSeedsItsOwnRecords(task.id)) {
        await discardUploadedDocuments();
        return;
      }
      const rebuiltIds = await seedStopCasesPracticeData(true);
      uploadedDocumentIds.current = rebuiltIds;
      setSeededRecordIds(seededRecordValues(task.id, rebuiltIds));
      writePracticeProgress(task.id, appUserId, { stepIndex: 0, uploadedIds: rebuiltIds });
      await queryClient.invalidateQueries();
    } finally {
      setRestarting(false);
    }
  };

  const leavingRef = useRef(false);
  const finishTutorial = () => {
    leavingRef.current = true;
    void navigate({ to: "/incoming-invoices" } as never);
    stopTask();
    void (async () => {
      markPracticeCompleted(task.id, appUserId);
      try {
        await discardUploadedDocuments();
      } catch {
        void 0;
      }
      try {
        await setPracticeMode(false);
      } catch {
        void 0;
      }
      await queryClient.invalidateQueries();
    })();
  };

  const pauseTutorial = () => {
    leavingRef.current = true;
    void navigate({ to: "/incoming-invoices" } as never);
    stopTask();
    void (async () => {
      try {
        await setPracticeMode(false);
      } catch {
        void 0;
      }
      await queryClient.invalidateQueries();
    })();
  };

  const leaveTutorial = runner.isFinished ? finishTutorial : pauseTutorial;
  const leaveLabel = runner.isFinished
    ? t("onboarding.practice.panelClose")
    : t("onboarding.practice.panelPause");
  const panelLabelsWithLeave = { ...panelLabels, closeButton: leaveLabel };

  const currentStepPath = runner.isFinished ? null : resolvedStepPath(runner.currentStep.path);
  useEffect(() => {
    setAllowedPath(currentStepPath);
    return () => setAllowedPath(null);
  }, [currentStepPath, setAllowedPath]);

  const navigatedForStep = useRef<number | null>(null);
  useEffect(() => {
    if (!currentStepPath) return;
    if (navigatedForStep.current === runner.currentStepIndex) return;
    const firstArrival = navigatedForStep.current === null;
    navigatedForStep.current = runner.currentStepIndex;
    if (firstArrival && !pathname.startsWith("/onboarding-tour")) return;
    void navigate({ to: currentStepPath } as never);
  }, [runner.currentStepIndex, currentStepPath, navigate, pathname]);

  useEffect(() => {
    const stepId = task.steps[runner.currentStepIndex]?.id;
    if (stepId !== undefined && STEP_IDS_WITH_COLLAPSED_PANEL.has(stepId)) {
      setPanelCollapsed(true);
    }
  }, [runner.currentStepIndex, task.steps]);

  const onStepPath = currentStepPath !== null && pathname.startsWith(currentStepPath);
  useEffect(() => {
    if (!onStepPath) return;
    let cancelled = false;
    const keepAlive = () =>
      void extendPracticeModeIfActive(() => !cancelled && !leavingRef.current).then((wasActive) => {
        if (wasActive || cancelled) return;
        stopTaskRef.current();
        return queryClient.invalidateQueries();
      });
    const heartbeat = setInterval(keepAlive, PRACTICE_MODE_HEARTBEAT_MS);
    const keepAliveWhenTabReturns = () => {
      if (document.visibilityState === "visible") keepAlive();
    };
    document.addEventListener("visibilitychange", keepAliveWhenTabReturns);
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", keepAliveWhenTabReturns);
    };
  }, [onStepPath, queryClient]);

  return (
    <>
      <OnboardingPracticeModeBanner
        label={t("onboarding.practice.bannerLabel")}
        onClose={leaveTutorial}
        closeLabel={leaveLabel}
      />
      {createPortal(
        <OnboardingHighlight runner={runner} pathname={pathname} labels={highlightLabels} />,
        document.body,
      )}
      <OnboardingCompletionModal
        open={completionModalOpen}
        onOpenChange={setCompletionModalOpen}
        labels={{
          title: t("onboarding.practice.completionTitle"),
          message: t("onboarding.practice.completionMessage"),
          exitButton: t("onboarding.practice.completionExit"),
          restartButton: t("onboarding.practice.completionRestart"),
        }}
        onExit={() => {
          setCompletionModalOpen(false);
          leaveTutorial();
        }}
        onRestart={() => {
          setCompletionModalOpen(false);
          void restartTask();
          runner.restart();
        }}
      />
      <div
        className={cn(
          "fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2",
          modalOpen && "hidden",
        )}
      >
        {panelCollapsed ? (
          <Button
            className="gap-2 rounded-full bg-[var(--onboarding-accent,var(--primary))] text-primary-foreground shadow-lg hover:bg-[var(--onboarding-accent,var(--primary))]/90"
            onClick={() => setPanelCollapsed(false)}
          >
            <ChevronUp className="size-4" aria-hidden />
            {t("onboarding.practice.panelExpand")}
            <span className="tabular-nums text-primary-foreground/80">
              {Math.min(runner.currentStepIndex, task.steps.length)}/{task.steps.length}
            </span>
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              className="gap-1.5 rounded-full bg-[var(--onboarding-accent,var(--primary))] text-primary-foreground shadow hover:bg-[var(--onboarding-accent,var(--primary))]/90"
              onClick={() => setPanelCollapsed(true)}
            >
              <ChevronDown className="size-4" aria-hidden />
              {t("onboarding.practice.panelCollapse")}
            </Button>
            <OnboardingTaskPanel
              runner={runner}
              labels={panelLabelsWithLeave}
              highlightLabels={highlightLabels}
              roleLabels={roleLabels}
              currentRoleLabel={
                role
                  ? t("onboarding.practice.yourRole", { role: t(`team.role.${role}`) })
                  : undefined
              }
              pathname={pathname}
              onNavigate={navigateToOnboardingStepPath}
              onClose={leaveTutorial}
              onRestart={() => void restartTask()}
              restartPending={restarting}
              className="max-h-[calc(100vh-14rem)] overflow-y-auto"
            />
          </>
        )}
      </div>
    </>
  );
}

export function OnboardingPracticeRunner() {
  const { activeTaskId } = useOnboardingPractice();
  const { t } = useTranslation();
  const task = useMemo(
    () => (activeTaskId ? findPracticeTask(activeTaskId, t) : null),
    [activeTaskId, t],
  );
  if (!task) return null;
  return <ActivePracticeTask key={task.id} task={task} />;
}
