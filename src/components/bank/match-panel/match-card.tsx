import { forwardRef, type ReactNode } from "react";
import { ChevronRight, Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MatchScoreBreakdown } from "@/components/bank/match-score";
import type { MatchReasons } from "@/lib/data/types";

export function MatchCard({
  title,
  badge,
  meta,
  reasons,
  score,
  actions,
  muted,
}: {
  title: ReactNode;
  badge?: ReactNode;
  meta: ReactNode;
  reasons?: MatchReasons | null;
  score?: number | null;
  actions?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-3",
        muted && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {title}
          {badge}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {meta}
        </div>
        <MatchScoreBreakdown reasons={reasons ?? null} score={score ?? null} />
      </div>
      {actions && <div className="ml-auto flex w-fit flex-col items-end gap-0.5">{actions}</div>}
    </div>
  );
}

export function MatchCardMeta({ amount, detail }: { amount: ReactNode; detail: ReactNode }) {
  return (
    <>
      <span className="tabular-nums">{amount}</span>
      <span>·</span>
      <span>{detail}</span>
    </>
  );
}

export const MatchCardAction = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "variant" | "size" | "children"> & {
    label: string;
    pendingLabel?: string;
    pending?: boolean;
    tone?: "primary" | "quiet";
  }
>(({ label, pendingLabel, pending, tone = "primary", className, ...props }, ref) => (
  <Button
    ref={ref}
    size="sm"
    variant="link"
    className={cn(
      "h-auto gap-1 px-0 py-0",
      tone === "primary"
        ? "font-medium text-brand-dark hover:text-brand-dark"
        : "font-normal text-muted-foreground hover:text-destructive",
      className,
    )}
    {...props}
  >
    {pending && pendingLabel ? pendingLabel : label}
    {pending ? <Loader2 className="animate-spin" /> : <ChevronRight />}
  </Button>
));
MatchCardAction.displayName = "MatchCardAction";
