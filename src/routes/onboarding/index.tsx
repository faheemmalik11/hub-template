import { createFileRoute } from "@tanstack/react-router";

import { ChecklistSteps, ChecklistSummaryCard } from "@/kit/components/checklist";
import { TanStackChecklistLink } from "@/kit/components/checklist/tanstack-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  checklistStepDescription,
  checklistStepProblems,
  checklistStepUserLink,
} from "@/lib/checklist-config";
import { useSetupChecklist } from "@/lib/data/use-setup-checklist";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/onboarding/")({
  head: () => ({ meta: [{ title: pageTitle("Onboarding") }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const checklist = useSetupChecklist();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("onboarding.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("checklist.subtitle")}</p>
      </div>

      {!checklist.ready ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <ChecklistSummaryCard
            title={t("onboarding.progress")}
            progressLabel={t("checklist.summary", {
              done: checklist.doneCount,
              total: checklist.steps.length,
            })}
            completed={checklist.doneCount}
            total={checklist.steps.length}
            LinkComponent={TanStackChecklistLink}
          />
          <div
            className="overflow-hidden rounded-xl border border-border bg-card"
            data-tour="onboarding-steps"
          >
            <ChecklistSteps
              steps={checklist.steps.map((step) => ({
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
        </>
      )}
    </div>
  );
}
