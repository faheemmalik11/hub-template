import { X } from "lucide-react";

export interface OnboardingPracticeModeBannerProps {
  label: string;
  onClose?: () => void;
  closeLabel?: string;
}

export function OnboardingPracticeModeBanner({
  label,
  onClose,
  closeLabel,
}: OnboardingPracticeModeBannerProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center">
      <div className="mt-2 flex items-center gap-2 rounded-full bg-[var(--onboarding-accent,var(--primary))] py-1.5 pl-4 pr-2 text-xs font-semibold text-primary-foreground shadow-lg">
        {label}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? label}
            className="rounded-full p-1 transition-colors hover:bg-black/10"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
