import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { ChecklistSteps, ProgressRing } from "@hub-kit/core/checklist";
import { TanStackChecklistLink } from "@hub-kit/core/checklist/tanstack";
import {
  checklistStepDescription,
  checklistStepProblems,
  checklistStepUserLink,
} from "@/lib/checklist-config";
import { useAuth } from "@/lib/auth";
import { useSetupChecklist } from "@/lib/data/use-setup-checklist";
import { useTranslation } from "@/lib/i18n";

export function SetupPriorityCard() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const checklist = useSetupChecklist();

  if (!checklist.ready) return null;
  if (checklist.doneCount >= checklist.steps.length) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-brand-wash/60 px-4 py-2.5">
        <h2 className="flex items-center gap-2.5 text-xs font-bold tracking-wider text-brand-dark uppercase">
          {t("home.priority.title")}
          <span className="relative inline-grid size-7 place-items-center">
            <ProgressRing
              completed={checklist.doneCount}
              total={checklist.steps.length}
              size={28}
              strokeWidth={3}
            />
            <span className="absolute text-[9px] font-bold text-foreground tabular-nums">
              {checklist.doneCount}/{checklist.steps.length}
            </span>
          </span>
        </h2>
        <Link
          to="/onboarding"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline"
        >
          {t("home.priority.openChecklist")} <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
      <ChecklistSteps
        steps={checklist.steps
          .filter((step) => step.state !== "done")
          .map((step) => ({
            key: step.key,
            state: step.state,
            title: t(`checklist.step.${step.key}.title`),
            description: checklistStepDescription(t, step),
            problems: checklistStepProblems(t, step),
            actionLabel: t(`checklist.step.${step.key}.action`),
            link: checklistStepUserLink(step.key, step.state, step.problemKinds, can),
          }))}
        LinkComponent={TanStackChecklistLink}
      />
    </div>
  );
}
