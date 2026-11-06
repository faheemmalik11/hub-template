import { CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/ui/dialog";
import { Button } from "@/kit/ui/button";

export interface OnboardingCompletionModalLabels {
  title: string;
  message: string;
  exitButton: string;
  restartButton: string;
}

export interface OnboardingCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: OnboardingCompletionModalLabels;
  onExit: () => void;
  onRestart: () => void;
}

export function OnboardingCompletionModal({
  open,
  onOpenChange,
  labels,
  onExit,
  onRestart,
}: OnboardingCompletionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[65] text-center sm:text-center">
        <DialogHeader className="items-center text-center sm:text-center">
          <CheckCircle2
            className="size-10 text-[var(--onboarding-accent,var(--primary))]"
            aria-hidden
          />
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-center sm:justify-center">
          <Button variant="outline" onClick={onRestart}>
            {labels.restartButton}
          </Button>
          <Button onClick={onExit}>{labels.exitButton}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
