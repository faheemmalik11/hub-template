import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/kit/ui/button";
import { cn } from "@/kit/lib/class-names";
import { ProgressRing } from "@/kit/components/checklist";

import { findOnboardingTarget } from "./find-onboarding-target";
import {
  englishOnboardingHighlightLabels,
  type OnboardingHighlightLabels,
} from "./onboarding-highlight-labels";
import { OnboardingStepList } from "./onboarding-step-list";
import type { OnboardingStep, OnboardingStepStatus } from "@/kit/onboarding";
import type { OnboardingTaskRunner } from "./use-onboarding-task-runner";
import { useOnboardingTargetTracking } from "./use-onboarding-target-tracking";

export interface OnboardingTaskPanelLabels {
  nextButton: string;
  resetButton: string;
  finishedTitle: string;
  sampleFileButton?: string;
  closeButton?: string;
}

export interface OnboardingTaskPanelProps {
  runner: OnboardingTaskRunner;
  labels: OnboardingTaskPanelLabels;
  highlightLabels?: OnboardingHighlightLabels;
  roleLabels?: Record<string, string>;
  currentRoleLabel?: string;
  pathname: string;
  onNavigate?: (path: string) => void;
  onClose?: () => void;
  onRestart?: () => void;
  restartPending?: boolean;
  className?: string;
}

export function OnboardingTaskPanel({
  runner,
  labels,
  highlightLabels = englishOnboardingHighlightLabels,
  roleLabels,
  currentRoleLabel,
  pathname,
  onNavigate,
  onClose,
  onRestart,
  restartPending = false,
  className,
}: OnboardingTaskPanelProps) {
  const { task, currentStep, stepStatuses, isFinished, showHelp, completeInfoStep, restart } =
    runner;
  const completedCount = stepStatuses.filter((status) => status === "done").length;
  const target = isFinished ? null : currentStep.target;
  const stepPath = isFinished ? null : (currentStep.path ?? null);
  const { onWrongPage, targetOffScreen } = useOnboardingTargetTracking(target, stepPath, pathname);
  const sampleFileUrl = isFinished ? undefined : currentStep.sampleFileUrl;
  const sampleFileName = isFinished ? undefined : currentStep.sampleFileName;
  const [draggableSampleFile, setDraggableSampleFile] = useState<File | null>(null);

  useEffect(() => {
    if (!sampleFileUrl) {
      setDraggableSampleFile(null);
      return;
    }
    let cancelled = false;
    fetch(sampleFileUrl)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        setDraggableSampleFile(
          new File([blob], sampleFileName ?? "sample-file", { type: blob.type }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sampleFileUrl, sampleFileName]);

  const renderStepExtra = (step: OnboardingStep, _index: number, status: OnboardingStepStatus) => {
    if (status !== "active" || !step.sampleFileUrl || !labels.sampleFileButton) return null;
    if (step.sampleFileDropPath && pathname !== step.sampleFileDropPath) return null;
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{labels.sampleFileButton}</p>
        <div
          role="button"
          tabIndex={0}
          draggable={Boolean(draggableSampleFile)}
          onDragStart={(event) => {
            if (!draggableSampleFile) return;
            event.dataTransfer.items.add(draggableSampleFile);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => {
            const link = document.createElement("a");
            link.href = step.sampleFileUrl ?? "";
            if (step.sampleFileName) link.download = step.sampleFileName;
            link.click();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.currentTarget.click();
            }
          }}
          className="inline-flex w-fit cursor-pointer select-none items-center gap-2 rounded-lg bg-muted/40 py-1.5 pl-2 pr-3 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-[var(--onboarding-accent,var(--primary))]"
        >
          <span draggable={false} className="shrink-0">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <span className="text-sm font-medium text-foreground">{step.sampleFileName}</span>
          <span draggable={false} className="ml-auto shrink-0">
            <Download className="size-3.5 text-muted-foreground/60" aria-hidden />
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-[var(--onboarding-accent,var(--primary))] bg-card shadow-2xl ring-4 ring-[var(--onboarding-accent,var(--primary))]/20",
        className,
      )}
    >
      <div className="flex items-center gap-3 bg-[var(--onboarding-accent,var(--primary))] px-4 py-3 text-primary-foreground">
        <div className="relative shrink-0 rounded-full bg-card p-0.5">
          <ProgressRing
            completed={completedCount}
            total={task.steps.length}
            size={44}
            strokeWidth={4}
          />
          <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-foreground tabular-nums">
            {completedCount}/{task.steps.length}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-primary-foreground">{task.title}</h3>
          <p className="mt-0.5 text-sm text-primary-foreground/80">{task.goal}</p>
          {currentRoleLabel && (
            <p className="mt-1 text-xs font-semibold text-primary-foreground">{currentRoleLabel}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {isFinished && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            {labels.finishedTitle}
          </div>
        )}
        {!isFinished && onWrongPage && stepPath && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              {highlightLabels.goToPage(currentStep.pageLabel ?? stepPath)}
            </p>
            <Button size="sm" className="mt-3" onClick={() => onNavigate?.(stepPath)}>
              {highlightLabels.goToPageButton}
            </Button>
          </div>
        )}
        {!isFinished && !onWrongPage && targetOffScreen && target && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">{highlightLabels.scrollToTarget}</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() =>
                findOnboardingTarget(target)?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                })
              }
            >
              {highlightLabels.scrollToTargetButton}
            </Button>
          </div>
        )}
        {!isFinished &&
          !onWrongPage &&
          !targetOffScreen &&
          (currentStep.type === "info" || (showHelp && currentStep.helpText)) && (
            <div className="rounded-lg bg-muted/40 p-3">
              {(showHelp || currentStep.type === "info") && currentStep.helpText && (
                <p className="text-sm text-muted-foreground">{currentStep.helpText}</p>
              )}
              {currentStep.type === "info" && (
                <Button size="sm" className="mt-3" onClick={completeInfoStep}>
                  {labels.nextButton}
                </Button>
              )}
            </div>
          )}
        <OnboardingStepList
          steps={task.steps}
          statuses={stepStatuses}
          roleLabels={roleLabels}
          renderStepExtra={renderStepExtra}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={restartPending}
            onClick={() => {
              onRestart?.();
              restart();
            }}
          >
            {restartPending && <Loader2 className="size-3.5 animate-spin" />}
            {labels.resetButton}
          </Button>
          {onClose && labels.closeButton && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={restartPending}
              onClick={onClose}
            >
              {labels.closeButton}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
