import { HelpCircle } from "lucide-react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";
import { useTour } from "./use-tour";

export interface TourButtonProps {
  className?: string;
}

export function TourButton({ className }: TourButtonProps) {
  const tour = useTour();

  if (!tour || !tour.tour || tour.stepCount === 0) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={tour.start}
    >
      <HelpCircle aria-hidden="true" />
      {tour.labels.openTour}
    </Button>
  );
}
