export interface DocumentReadingFacts {
  intake_channel: string | null;
  extracted: unknown;
  created_at?: string | null;
}

export const DOCUMENT_READING_REFRESH_MS = 3_000;
export const DOCUMENT_READING_GIVE_UP_MS = 10 * 60 * 1000;

export function isDocumentBeingRead(doc: DocumentReadingFacts, now: number = Date.now()): boolean {
  if (doc.intake_channel !== "upload" || (doc.extracted ?? null) !== null) return false;
  const created = doc.created_at ? Date.parse(doc.created_at) : Number.NaN;
  return Number.isNaN(created) || now - created < DOCUMENT_READING_GIVE_UP_MS;
}

function anyBeingRead(rows: DocumentReadingFacts[] | undefined): boolean {
  return (rows ?? []).some((row) => isDocumentBeingRead(row));
}

export function refreshListWhileReading(query: {
  state: { data?: DocumentReadingFacts[] };
}): number | false {
  return anyBeingRead(query.state.data) ? DOCUMENT_READING_REFRESH_MS : false;
}

export function refreshPageWhileReading(query: {
  state: { data?: { rows: DocumentReadingFacts[] } };
}): number | false {
  return anyBeingRead(query.state.data?.rows) ? DOCUMENT_READING_REFRESH_MS : false;
}

export function refreshPagesWhileReading(query: {
  state: { data?: { pages: { rows: DocumentReadingFacts[] }[] } };
}): number | false {
  const rows = (query.state.data?.pages ?? []).flatMap((page) => page.rows);
  return anyBeingRead(rows) ? DOCUMENT_READING_REFRESH_MS : false;
}

export function refreshDocumentWhileReading(query: {
  state: { data?: DocumentReadingFacts | null };
}): number | false {
  const doc = query.state.data;
  return doc && isDocumentBeingRead(doc) ? DOCUMENT_READING_REFRESH_MS : false;
}

// A background reading-poll must not count as a foreground fetch, or it flashes "updating…" every 3 seconds.
export function isForegroundFetch(query: {
  isFetching: boolean;
  isPlaceholderData: boolean;
  data?: DocumentReadingFacts[];
}): boolean {
  if (query.isPlaceholderData) return true;
  return query.isFetching && !anyBeingRead(query.data);
}

export function isForegroundPageFetch(query: {
  isFetching: boolean;
  isPlaceholderData: boolean;
  data?: { rows: DocumentReadingFacts[] };
}): boolean {
  if (query.isPlaceholderData) return true;
  return query.isFetching && !anyBeingRead(query.data?.rows);
}
