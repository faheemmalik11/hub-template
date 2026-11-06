import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import {
  FIRST_STEPS_TASKS,
  resolveFirstStepsEntries,
  shouldShowFirstSteps,
  type FirstStepsEntry,
} from "./first-steps-tasks";
import { isPracticeCompleted, readPracticeProgress } from "@/kit/onboarding/practice-progress";

export function FirstStepsCard({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  const [entries, setEntries] = useState<FirstStepsEntry[] | null>(null);

  useEffect(() => {
    setEntries(
      resolveFirstStepsEntries(FIRST_STEPS_TASKS, (taskId) => {
        if (isPracticeCompleted(taskId, appUserId)) return "completed";
        return readPracticeProgress(taskId, appUserId) ? "started" : "new";
      }),
    );
  }, [appUserId]);

  if (!entries || (!alwaysShow && !shouldShowFirstSteps(entries))) return null;

  return (
    <section data-tour="home-first-steps" className="rounded-2xl bg-brand-wash p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-dark text-primary-foreground">
          <GraduationCap className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("home.firstSteps.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("home.firstSteps.subtitle")}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {entries.map(({ task, state }) => (
          <li
            key={task.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                {state === "completed" ? (
                  <Check className="size-4 text-emerald-600" aria-hidden />
                ) : null}
                {t(task.titleKey)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(task.descriptionKey)}</p>
            </div>
            <Link
              to={task.to as never}
              className={cn(
                buttonVariants({ size: "sm", variant: state === "new" ? "default" : "outline" }),
                "shrink-0 gap-2",
              )}
            >
              {t(`home.firstSteps.action.${state}`)}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
