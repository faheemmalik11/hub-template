import type { ColumnMapping } from "./types";

const STORAGE_PREFIX = "hub.bank-import.mapping.";

/** Non-cryptographic fingerprint of a header row, stable across row/column order. */
function fingerprint(headers: string[]): string {
  const key = [...headers]
    .map((h) => h.trim().toLowerCase())
    .sort()
    .join("|");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/** Recall a previously-confirmed mapping for this exact header set, if any. Best-effort only. */
export function loadStoredMapping(headers: string[]): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + fingerprint(headers));
    return raw ? (JSON.parse(raw) as ColumnMapping) : null;
  } catch {
    return null;
  }
}

/** Remember a confirmed mapping so the next upload from the same bank format skips re-mapping. */
export function saveMapping(headers: string[], mapping: ColumnMapping): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + fingerprint(headers), JSON.stringify(mapping));
  } catch {
    // Best-effort convenience feature — a full localStorage or private-browsing mode must never
    // block the import itself.
  }
}
