export interface TourLabels {
  openTour: string;
  stepCounter: (current: number, total: number) => string;
  next: string;
  skip: string;
  finish: string;
  sampleData: string;
  cardTitle: string;
}

export const englishTourLabels: TourLabels = {
  openTour: "Tour",
  stepCounter: (current, total) => `${current} of ${total}`,
  next: "Next",
  skip: "Skip tour",
  finish: "Done",
  sampleData: "Sample data",
  cardTitle: "Guided tour",
};
