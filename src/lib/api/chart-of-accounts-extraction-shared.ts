// Shared between chart-of-accounts-extraction.functions.ts and the KI-Import dialog so the
// client and the extraction call agree on what's acceptable.
//
// PDF/image go through OpenAI as a file (base64 data URI, same as outgoing-invoice extraction).
// CSV/Excel are parsed to plain text CLIENT-SIDE (no OCR needed, the data is already text) and
// sent as a "text" payload instead — the Responses API has no generic "arbitrary text file" input
// type, only input_file (PDF) and input_image.
export const CHART_OF_ACCOUNTS_FILE_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ChartOfAccountsFileMime = (typeof CHART_OF_ACCOUNTS_FILE_MIME)[number];

// ~15 MB of original file bytes, base64-inflated (~4/3).
export const MAX_CHART_OF_ACCOUNTS_UPLOAD_BASE64_CHARS = 20 * 1024 * 1024;

// A chart of accounts is at most a few thousand lines — generous ceiling against a pasted-in
// unrelated document.
export const MAX_CHART_OF_ACCOUNTS_TEXT_CHARS = 300_000;
