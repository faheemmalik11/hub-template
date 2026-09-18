export const UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

// Where the browser uploads to. `incoming` moved from "belege-files" to "documents" on
// 16.09.2026, so a receipt uploaded here lands beside the ones the pipeline writes instead of in
// a bucket of its own. The insert policy in migration 20260916140000 permits both while the old
// bucket still exists. See docs/TABLE_NAMING_MIGRATION.md.
export const BUCKETS = {
  incoming: "documents",
  outgoing: "outgoing-invoice-files",
} as const;

export type UploadBucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xml"] as const;

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".xml": "application/xml",
};

export function buildStoragePath(parts: {
  scopeId: string;
  recordId: string;
  filename: string;
}): string {
  return `${parts.scopeId}/${parts.recordId}/${sanitizeFilename(parts.filename)}`;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return cleaned || "file";
}

export function isAcceptedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isWithinLimit(size: number): boolean {
  return size <= UPLOAD_LIMIT_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
