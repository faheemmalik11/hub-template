import { ChevronRight, CircleCheck, Circle, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "../../lib/class-names";
import type { ChecklistLinkComponent, ChecklistStepItem, ChecklistStepState } from "./types";

const STATE_ICON: Record<ChecklistStepState, ComponentType<{ className?: string }>> = {
  done: CircleCheck,
  open: Circle,
  problem: TriangleAlert,
};

const STATE_ICON_WRAP: Record<ChecklistStepState, string> = {
  done: "bg-emerald-100 text-emerald-700",
  open: "bg-muted text-muted-foreground",
  problem: "bg-amber-100 text-amber-700",
};

export function ChecklistSteps({
  steps,
  className,
  LinkComponent,
}: {
  steps: ChecklistStepItem[];
  className?: string;
  /**
   * No default: the TanStack Router `Link` this used to default to is an unconditional import,
   * which breaks the build for any Hub without `@tanstack/react-router` installed, even though
   * it's never rendered there. TanStack Hubs pass `TanStackChecklistLink` from
   * `@/kit/components/checklist/tanstack-link` explicitly; other routers pass their own.
   */
  LinkComponent: ChecklistLinkComponent;
}) {
  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {steps.map((step) => {
        const Icon = STATE_ICON[step.state];
        const problem = step.state === "problem";
        const done = step.state === "done";
        // A step with per-problem links still gets its own row link and action: those bullets sit
        // at z-20, above the row's z-10 overlay, so each stays individually clickable.
        const link = !done ? step.link : undefined;
        return (
          <li
            key={step.key}
            className={cn(
              "group relative flex items-start gap-3 px-4 py-3 transition-colors",
              problem ? "bg-amber-50/60 hover:bg-amber-50" : link && "hover:bg-muted/40",
            )}
          >
            {link && (
              <LinkComponent
                to={link.to}
                search={link.search}
                hash={link.hash}
                aria-label={step.title}
                className="absolute inset-0 z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            )}
            {problem && (
              <span className="absolute inset-y-0 left-2 w-0.5 bg-amber-600" aria-hidden />
            )}
            <span
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                STATE_ICON_WRAP[step.state],
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm leading-snug",
                  problem ? "font-semibold text-foreground" : "font-medium text-foreground",
                  done && "text-muted-foreground",
                )}
              >
                {step.title}
              </p>
              {step.problems && step.problems.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {step.problems.map((problem_item, index) => (
                    <li key={index} className="flex gap-1.5 text-sm text-muted-foreground">
                      <span
                        className="mt-[7px] size-1 shrink-0 rounded-full bg-amber-600"
                        aria-hidden
                      />
                      {problem_item.link ? (
                        <LinkComponent
                          to={problem_item.link.to}
                          search={problem_item.link.search}
                          hash={problem_item.link.hash}
                          className="relative z-20 rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {problem_item.text}
                        </LinkComponent>
                      ) : (
                        problem_item.text
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              )}
            </div>
            {link && (
              <div className="pointer-events-none relative z-0 flex shrink-0 items-center gap-0.5 self-center">
                {step.actionLabel && (
                  <span className="hidden text-sm font-semibold text-brand-dark group-hover:underline sm:inline">
                    {step.actionLabel}
                  </span>
                )}
                <ChevronRight className="size-4 text-brand-dark" aria-hidden />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
