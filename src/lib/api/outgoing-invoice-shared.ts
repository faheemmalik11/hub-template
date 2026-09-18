// Shared between outgoing-invoice-extraction.functions.ts and outgoing-invoice-upload.functions.ts
// so the client, the extraction call, and the final write all agree on what's acceptable.
export const OUTGOING_INVOICE_UPLOAD_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type OutgoingInvoiceUploadMime = (typeof OUTGOING_INVOICE_UPLOAD_MIME)[number];

// ~15 MB of original file bytes, base64-inflated (~4/3).
export const MAX_OUTGOING_INVOICE_UPLOAD_BASE64_CHARS = 20 * 1024 * 1024;
