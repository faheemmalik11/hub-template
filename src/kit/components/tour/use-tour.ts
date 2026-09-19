import { useContext } from "react";

import { TourContext, type TourState } from "./tour-context";

export function useTour(): TourState | null {
  return useContext(TourContext);
}

export function useTourPlaceholderData(): boolean {
  const tour = useContext(TourContext);
  return tour?.showsPlaceholderData === true;
}
