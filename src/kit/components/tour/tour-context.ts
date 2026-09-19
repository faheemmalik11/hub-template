import { createContext } from "react";

import type { TourLabels } from "./labels";
import type { TourDefinition, TourStep } from "./types";

export interface TourState {
  tour: TourDefinition | null;
  step: TourStep | null;
  stepIndex: number;
  stepCount: number;
  isOpen: boolean;
  showsPlaceholderData: boolean;
  labels: TourLabels;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
}

export const TourContext = createContext<TourState | null>(null);
