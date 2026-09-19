export type TourContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "image"; src: string; alt: string }
  | { kind: "video"; src: string; caption?: string }
  | { kind: "link"; href: string; label: string; newTab?: boolean }
  | { kind: "keyValueList"; pairs: { label: string; value: string }[] }
  | { kind: "callout"; tone: "info" | "warning"; text: string };

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  target: string;
  title: string;
  content: TourContentBlock[];
  placement?: TourPlacement;
  showPlaceholderData?: boolean;
}

export interface TourDefinition {
  id: string;
  steps: TourStep[];
  autoStart?: boolean;
  version?: number;
}

export type TourOutcome = "skipped" | "completed";

export interface TourSeenStore {
  isReady: boolean;
  /**
   * Has this reader seen the tour at all? `version` is passed for the record and must NOT gate the
   * answer: bumping a version used to replay a tour for everybody, which reads as the app having
   * forgotten. Show something new under a new id instead.
   */
  hasSeen: (tourId: string, version: number) => boolean;
  markSeen: (
    tourId: string,
    version: number,
    outcome: { status: TourOutcome; lastStep: number },
  ) => void;
}

export type TourMap = Record<string, TourDefinition>;
