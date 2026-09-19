import type { ComponentType, ReactNode } from "react";

export type ChecklistStepState = "done" | "open" | "problem";

export interface ChecklistStepItem {
  key: string;
  state: ChecklistStepState;
  title: string;
  description: string;
  problems?: {
    text: string;
    link?: { to: string; search?: Record<string, unknown>; hash?: string };
  }[];
  actionLabel?: string;
  link?: { to: string; search?: Record<string, unknown>; hash?: string };
}

/**
 * Renders one checklist link target. Defaults to a TanStack Router `Link`, so every current
 * Hub keeps working with no changes; a Hub on a different router (e.g. react-router-dom) passes
 * its own `LinkComponent` to `ChecklistSteps`/`ChecklistSummaryCard`.
 */
export type ChecklistLinkComponent = ComponentType<{
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
  className?: string;
  "aria-label"?: string;
  children?: ReactNode;
}>;
