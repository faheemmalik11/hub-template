import type { TourSeenStore } from "./types";

const STORAGE_KEY = "hub-kit.tour.seen";

type StoredEntry = { id: string; version: number };

function readEntries(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (typeof entry === "string") {
        return [{ id: entry, version: 1 }];
      }
      if (entry && typeof entry === "object" && "id" in entry) {
        const record = entry as { id?: unknown; version?: unknown };
        if (typeof record.id === "string") {
          return [{ id: record.id, version: Number(record.version) || 1 }];
        }
      }
      return [];
    });
  } catch {
    return [];
  }
}

/**
 * SEEN IS SEEN. The version is recorded but no longer gates this.
 *
 * It used to require `entry.version >= version`, so bumping a tour's version replayed it for
 * everybody who had already sat through it. In practice that reads as the app forgetting, and it
 * cost the client's trust in a screen they had already been walked through. A tour worth showing
 * again is a new tour with a new id.
 */
export function hasSeenTour(tourId: string, _version = 1): boolean {
  return readEntries().some((entry) => entry.id === tourId);
}

export function markTourSeen(tourId: string, version = 1): void {
  const entries = readEntries().filter((entry) => entry.id !== tourId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, { id: tourId, version }]));
  } catch {
    return;
  }
}

export const localTourSeenStore: TourSeenStore = {
  isReady: true,
  hasSeen: hasSeenTour,
  markSeen: (tourId, version) => markTourSeen(tourId, version),
};

export function resetSeenTours(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
