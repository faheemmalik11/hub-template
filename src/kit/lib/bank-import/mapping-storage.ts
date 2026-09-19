import type { ColumnMapping } from "./types";

const STORAGE_PREFIX = "hub-kit.bank-import.mapping.";

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

export function loadStoredMapping(headers: string[]): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + fingerprint(headers));
    return raw ? (JSON.parse(raw) as ColumnMapping) : null;
  } catch {
    return null;
  }
}

export function saveMapping(headers: string[], mapping: ColumnMapping): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + fingerprint(headers), JSON.stringify(mapping));
  } catch {
    return;
  }
}
