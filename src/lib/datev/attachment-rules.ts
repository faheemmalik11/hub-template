/**
 * What DATEV will accept as an attachment, decided in ONE place.
 *
 * Two callers need this answer and they must never disagree:
 *
 *   - `src/lib/api/datev-handover.functions.ts`, at send time, where the answer decides whether a
 *     receipt is attached or reported back as blocked.
 *   - `useDatevHandoverStatus` in `src/lib/data/queries.ts`, before the send, so the screen can say
 *     "5 gehen raus, 2 werden übersprungen" instead of promising 7 and quietly delivering 5.
 *
 * The screen used to have no preflight at all: `blockedInvoices` came back from the server, the UI
 * threw it away, and the only visible number was a ready count that the send did not honour. Adding
 * a second copy of the rule to fix that would have traded a silent gap for a silent disagreement,
 * so both sides import this instead.
 *
 * No `.server` suffix and no imports on purpose — this file is reached from the browser bundle and
 * from the server function.
 */

/** Why a receipt cannot go to DATEV. `null` means it can. */
export type DatevBlockReason = "no-file" | "unsupported" | "too-large";

/**
 * The ceiling on ONE email, in bytes.
 *
 * PER REPOSITORY, because it is the mail provider's limit and not DATEV's: this Hub sends through
 * Microsoft Graph, whose MIME sendMail endpoint caps at 4MB, while the Hubs that send through Gmail
 * take 20MB. Getting this wrong in either direction is a silent failure —
 * too high and the screen promises a receipt the send then refuses, too low and receipts are
 * blocked that would have gone fine.
 */
export const DATEV_MAX_EMAIL_BYTES = 4 * 1024 * 1024;
// Base64 — the MIME transport encoding every attachment goes through — inflates by ~4/3, plus
// ~2.6% more from CRLF wrapping at 76 chars/line, so the raw budget is the ceiling divided by
// ~1.37. Budgeting against raw bytes directly would let a batch's real email exceed the limit,
// which is exactly the kind of failure there is no return channel to catch.
const BASE64_INFLATION = 1.37;
export const DATEV_MAX_RAW_BYTES_PER_BATCH = Math.floor(DATEV_MAX_EMAIL_BYTES / BASE64_INFLATION);

/**
 * The `invoice_files` columns the rule reads. Deliberately NOT `content` — see below.
 *
 * TWO STORES, and a receipt only needs to be in one of them. `docs/FILE_STORAGE.md` describes the
 * cutover: the pipeline used to write the bytes inline into the `content` bytea, and now writes them
 * to Supabase Storage and leaves `content` null. Rows from before the cutover still carry the inline
 * copy and have no `storage_path`. On this Hub's live data 59 of 61 pending receipts are
 * storage-backed and 2 are inline, so a rule that knows only one store is a rule that blocks
 * almost everything.
 */
export interface DatevAttachmentFile {
  mime: string | null;
  filename: string | null;
  /** Set once the bytes live in Supabase Storage. */
  storage_path?: string | null;
  /** Recorded alongside the Storage object; the only way to judge size without fetching bytes. */
  size_bytes?: number | null;
  /**
   * Whether the inline `content` bytea is populated.
   *
   * `undefined` means "not known", which is the honest answer from the browser: the screen cannot
   * select `content` to find out — the column IS the invoice, and fetching it for every pending
   * receipt would download the whole queue's PDFs to render a list. The server passes a real
   * boolean, so it blocks a row with nothing in either store properly instead of failing on it.
   */
  has_inline_content?: boolean;
}

/**
 * The stored mime, repaired from the filename when the pipeline could only say
 * `application/octet-stream`.
 *
 * The actual mime of the stored file is the ground truth for what bytes we have — NOT
 * `intake_channel`. An invoice ingested as `erechnung` can still have a proper PDF in its
 * `original` row (a supplier's own ZUGFeRD PDF), and treating those bytes as raw XML would corrupt
 * the attachment.
 */
export function resolveDatevMime(file: DatevAttachmentFile): string {
  const mime = file.mime ?? "";
  if (mime && mime !== "application/octet-stream") return mime;
  const name = (file.filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".xml")) return "application/xml";
  return mime || "application/octet-stream";
}

/**
 * Whether a receipt's stored original can be attached, by TYPE alone.
 *
 * `null` for the file row means no `original` row exists at all, which is its own blocker: there is
 * nothing to send.
 *
 * XML is accepted here because the send wraps a naked e-invoice XML into a ZUGFeRD-style PDF before
 * attaching it — the type check happens before that conversion, so refusing XML would block exactly
 * the receipts the wrapper exists for.
 *
 * SIZE is judged from `size_bytes` where it is recorded, which is every Storage-backed row. A file
 * bigger than one email's whole budget can never fit in any batch however it is chunked, so it is
 * blocked outright rather than left to produce an oversized email. Where `size_bytes` is absent the
 * check is skipped — the send weighs the real bytes it has just fetched anyway.
 */
export function datevBlockReason(
  file: DatevAttachmentFile | null,
  /** Override where a caller knows a different ceiling than this repo's default. */
  maxRawBytes: number = DATEV_MAX_RAW_BYTES_PER_BATCH,
): DatevBlockReason | null {
  if (!file) return "no-file";

  // Neither store holds the bytes. Only the server can be sure of this (see `has_inline_content`);
  // from the browser the field is undefined and this check stays out of the way.
  const inStorage = !!file.storage_path;
  if (!inStorage && file.has_inline_content === false) return "no-file";

  const mime = resolveDatevMime(file);
  if (mime !== "application/pdf" && mime !== "image/tiff" && mime !== "application/xml") {
    return "unsupported";
  }

  if (typeof file.size_bytes === "number" && file.size_bytes > maxRawBytes) {
    return "too-large";
  }
  return null;
}
