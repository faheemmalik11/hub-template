// Commits manually uploaded incoming invoices. The file bytes are already in Storage: the browser
// uploads straight to the bucket (src/features/file-upload) and hands over the resulting path, so
// nothing large passes through here.
//
// Rows are written with the service-role client for the same reason the outgoing upload does it
// (see outgoing-invoice-upload.functions.ts): `invoices` carries no INSERT policy, so a browser
// client cannot create one, and the invoice row plus its file row belong together. An orphaned
// Storage object with no row is harmless clutter; a row with no file behind it is a ghost invoice
// with nothing to show, so the rows are written after the upload and any partial state is
// disclosed in the thrown error rather than swallowed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import { TABLE } from "@/config/tables";

const FileSchema = z.object({
  invoiceId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  storageBucket: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(1024),
  checksumSha256: z.string().length(64).nullish(),
});

const InputSchema = z.object({
  files: z.array(FileSchema).min(1).max(50),
  /**
   * The bank transaction these files were uploaded from, when the upload started on a transaction
   * rather than on the invoice list.
   *
   * Only recorded here. The link itself is made by a trigger once extraction has filled in the
   * amount (migration 20260911190000), because link_invoice_transaction has nothing to allocate
   * against until then.
   */
  forTransactionId: z.string().uuid().nullish(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; code?: string };
    if (p.message || p.code) return [p.message, p.details, p.code].filter(Boolean).join(" | ");
  }
  return String(e ?? "unknown error");
}

export const createUploadedInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    const actor =
      (context.claims as { email?: string } | undefined)?.email ??
      (context.userId as string) ??
      "hub";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    async function dropOrphan(bucket: string, path: string) {
      try {
        await db.storage.from(bucket).remove([path]);
      } catch {
        // Best effort. A leftover object is clutter; failing the caller over it would be worse.
      }
    }

    const ids: string[] = [];
    for (const f of data.files) {
      const { error: invoiceError } = await db.from(TABLE.documents).insert({
        id: f.invoiceId,
        document_type: "rechnung",
        intake_channel: "upload",
        source: "upload",
        status: "needs_review",
        workflow_status: "received",
        issuer: f.filename,
        uploaded_for_transaction_id: data.forTransactionId ?? null,
      });
      if (invoiceError) {
        await dropOrphan(f.storageBucket, f.storagePath);
        throw new AppError(errorMessage(invoiceError), 500, "DB_ERROR");
      }

      const { error: fileError } = await db.from(TABLE.documentFiles).insert({
        document_id: f.invoiceId,
        // NOT also hung off the transaction, even though invoice_files_owner_check would allow it.
        // "Beleg zu dieser Transaktion" means the document belonging to the PAYMENT itself, which
        // for a Pleo card purchase is the photographed receipt and for a bank transfer is nothing.
        // An invoice is not that; it shows up as a matched invoice, the same way every other
        // matched invoice does.
        //
        // It would also strand the file: unlinking the match sends the invoice back to In Review
        // (H8), and a transaction_id on the file would leave the document sitting on the payment
        // as though it still belonged there.
        role: "original",
        filename: f.filename,
        mime: f.mime,
        size_bytes: f.sizeBytes,
        storage_bucket: f.storageBucket,
        storage_path: f.storagePath,
        checksum_sha256: f.checksumSha256 ?? null,
      });
      if (fileError) {
        throw new AppError(
          `Invoice ${f.invoiceId} was created but its file record failed to save: ${errorMessage(fileError)}`,
          500,
          "DB_ERROR",
        );
      }

      await db.from(TABLE.documentHistory).insert({
        document_id: f.invoiceId,
        type: "change",
        // Persisted audit text stays German. Says where it came from, because an invoice that
        // will attach itself to a payment on its own should say so before it happens.
        text: data.forTransactionId
          ? "Per Upload zu einer Banktransaktion erfasst, KI-Extraktion folgt"
          : "Per Upload erfasst — KI-Extraktion folgt",
        actor,
      });

      ids.push(f.invoiceId);
    }

    await askThePipelineToReadThem(db, actor);
    return ids;
  });

/**
 * Uploading IS the request: nobody should have to upload a document and then press "Run now".
 *
 * One request for the whole batch, and one more only if a batch lands while a run is already
 * going — the partial unique index collapses anything still waiting, so a person adding files
 * one at a time queues a single run rather than one per file.
 *
 * Best effort, exactly like dropOrphan above. The files are already saved and the two-hourly run
 * will read them regardless; failing the upload because we could not ASK to read it sooner would
 * turn a small delay into a lost document.
 */
async function askThePipelineToReadThem(db: Db, actor: string): Promise<void> {
  const { error } = await db
    .from(TABLE.pipelineRunRequests)
    .insert({ channel: "upload", requested_by: actor });
  // 23505: one is already waiting, and it will read these files too.
  // 42P01: the pipeline's own migration has not been applied to this project yet.
  if (error && error.code !== "23505" && error.code !== "42P01") {
    console.warn(`[upload] could not ask for a run: ${errorMessage(error)}`);
  }
}
